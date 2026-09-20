#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 7 Part B — Full HTTP verification for Order read-cutover.
 * Exercises all 6 controller endpoints via supertest, toggling READ_PG_ORDER
 * in-process (same pattern as verify-read-cutover-group6.local.js).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const TEST_ORDER_PAYMENT = '6a6687538476921364dd1223';
const TEST_ORDER_PROOF = '6a64dce0add63607ba4535d1';

const fallbacks = [];
const origErr = console.error;
console.error = (...args) => {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  if (msg.includes('[READ-CUTOVER-FALLBACK]')) fallbacks.push(msg);
  origErr.apply(console, args);
};

function setOrderFlag(on) {
  if (on) process.env.READ_PG_ORDER = 'true';
  else delete process.env.READ_PG_ORDER;
}

function stable(v) {
  if (v === undefined) return '__UNDEFINED__';
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(stable);
  if (typeof v === 'object') {
    const o = {};
    Object.keys(v).sort().forEach((k) => { o[k] = stable(v[k]); });
    return o;
  }
  return v;
}

function diff(a, b, p = '') {
  const out = [];
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${p}: len ${a.length} vs ${b.length}`);
    for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(...diff(a[i], b[i], `${p}[${i}]`));
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    [...keys].sort().forEach((k) => {
      const np = p ? `${p}.${k}` : k;
      if (['updatedAt', 'createdAt', '__v', 'courierSyncedAt'].includes(k)) return;
      if (!(k in a)) out.push(`${np}: missing in Mongo`);
      else if (!(k in b)) out.push(`${np}: extra in Postgres`);
      else out.push(...diff(a[k], b[k], np));
    });
    return out;
  }
  if (a !== b) out.push(`${p || 'root'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
  return out;
}

function stripOrderItemCosmetic(item) {
  if (!item || typeof item !== 'object') return item;
  const copy = { ...item };
  delete copy.product;
  return copy;
}

function stableOrderBody(body) {
  if (!body || typeof body !== 'object') return body;
  if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    const data = { ...body.data };
    if (Array.isArray(data.items)) {
      data.items = data.items.map(stripOrderItemCosmetic);
    }
    return { ...body, data };
  }
  if (Array.isArray(body.data)) {
    return {
      ...body,
      data: body.data.map((row) => {
        const copy = { ...row };
        if (Array.isArray(copy.items)) copy.items = copy.items.map(stripOrderItemCosmetic);
        return copy;
      })
    };
  }
  const copy = { ...body };
  if (Array.isArray(copy.items)) copy.items = copy.items.map(stripOrderItemCosmetic);
  return copy;
}

function stableDashboardBody(body) {
  if (!body || typeof body !== 'object') return body;
  const copy = { ...body };
  if (Array.isArray(copy.recentOrders)) {
    copy.recentOrders = copy.recentOrders.map((o) => stableOrderBody(o));
  }
  if (copy.data && Array.isArray(copy.data.recentOrders)) {
    copy.data = {
      ...copy.data,
      recentOrders: copy.data.recentOrders.map((o) => stableOrderBody(o))
    };
  }
  return copy;
}

async function compareJsonEndpoint(app, token, label, path, { auth = true, transformBody } = {}) {
  setOrderFlag(false);
  const mongoReq = request(app).get(path);
  if (auth && token) mongoReq.set('Authorization', `Bearer ${token}`);
  const mongoRes = await mongoReq;

  setOrderFlag(true);
  const pgReq = request(app).get(path);
  if (auth && token) pgReq.set('Authorization', `Bearer ${token}`);
  const pgRes = await pgReq;
  setOrderFlag(false);

  const mongoBody = transformBody ? transformBody(mongoRes.body) : mongoRes.body;
  const pgBody = transformBody ? transformBody(pgRes.body) : pgRes.body;
  const diffs = diff(stable(mongoBody), stable(pgBody));
  const pass = mongoRes.status === pgRes.status && diffs.length === 0;

  return {
    label,
    pass,
    status: mongoRes.status,
    pgStatus: pgRes.status,
    diffs: diffs.slice(0, 20),
    skipped: false
  };
}

async function compareInvoiceEndpoint(app, token, orderId) {
  setOrderFlag(false);
  const mongoRes = await request(app)
    .get(`/api/orders/${orderId}/invoice`)
    .set('Authorization', `Bearer ${token}`);

  setOrderFlag(true);
  const pgRes = await request(app)
    .get(`/api/orders/${orderId}/invoice`)
    .set('Authorization', `Bearer ${token}`);
  setOrderFlag(false);

  const pass = mongoRes.status === pgRes.status
    && mongoRes.status === 200
    && (mongoRes.headers['content-type'] || '').includes('pdf')
    && (pgRes.headers['content-type'] || '').includes('pdf')
    && Buffer.byteLength(mongoRes.body) > 100
    && Buffer.byteLength(pgRes.body) > 100;

  return {
    label: 'GET /api/orders/:id/invoice',
    pass,
    status: mongoRes.status,
    pgStatus: pgRes.status,
    diffs: pass ? [] : [`invoice: status ${mongoRes.status}/${pgRes.status}, mongoPdf=${(mongoRes.headers['content-type'] || '').includes('pdf')}, pgPdf=${(pgRes.headers['content-type'] || '').includes('pdf')}`],
    skipped: false
  };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  const Order = require('../backend/src/models/order');
  const Admin = require('../backend/src/models/admin');
  const app = require('../tests/app');

  const paymentOrder = await Order.findById(TEST_ORDER_PAYMENT).lean();
  const proofOrder = await Order.findById(TEST_ORDER_PROOF).lean();
  if (!paymentOrder || !proofOrder) {
    throw new Error('Part A test orders not found in Mongo');
  }

  const testUserId = paymentOrder.user.toString();
  const userToken = jwt.sign({ id: testUserId }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const trackableOrder = await Order.findOne({
    orderId: { $exists: true, $ne: '' },
    customerPhone: { $exists: true, $ne: '' }
  }).lean();

  const admin = await Admin.findOne({ role: 'superadmin', status: 'active' }).lean()
    || await Admin.findOne({ status: 'active' }).lean();
  if (!admin) throw new Error('No active admin found for admin list test');

  const adminToken = jwt.sign(
    { username: admin.username, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const results = [];

  results.push(await compareJsonEndpoint(
    app,
    userToken,
    'GET /api/orders/my-orders',
    '/api/orders/my-orders?limit=10',
    { transformBody: stableOrderBody }
  ));

  results.push(await compareJsonEndpoint(
    app,
    userToken,
    'GET /api/orders/:id (payment EOB352403)',
    `/api/orders/${TEST_ORDER_PAYMENT}`,
    { transformBody: stableOrderBody }
  ));

  results.push(await compareJsonEndpoint(
    app,
    userToken,
    'GET /api/orders/:id (proof EOB425345)',
    `/api/orders/${TEST_ORDER_PROOF}`,
    { transformBody: stableOrderBody }
  ));

  results.push(await compareInvoiceEndpoint(app, userToken, TEST_ORDER_PAYMENT));

  if (trackableOrder) {
    results.push(await compareJsonEndpoint(
      app,
      null,
      'GET /api/orders/track',
      `/api/orders/track?orderId=${encodeURIComponent(trackableOrder.orderId)}&phone=${encodeURIComponent(trackableOrder.customerPhone)}`,
      { auth: false, transformBody: stableOrderBody }
    ));
  } else {
    results.push({ label: 'GET /api/orders/track', pass: false, skipped: true, reason: 'No trackable order' });
  }

  results.push(await compareJsonEndpoint(
    app,
    userToken,
    'GET /api/orders/dashboard-stats',
    '/api/orders/dashboard-stats',
    { transformBody: stableDashboardBody }
  ));

  results.push(await compareJsonEndpoint(
    app,
    adminToken,
    'GET /api/orders/ (admin list)',
    '/api/orders/?limit=25',
    { transformBody: stableOrderBody }
  ));

  const summary = {
    overall: results.every((r) => r.skipped || r.pass) ? 'PASS' : 'FAIL',
    fallbacks: fallbacks.length,
    results
  };

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('ORDER READ-CUTOVER — HTTP ENDPOINT VERIFICATION');
  console.log('═══════════════════════════════════════════════════════\n');
  for (const r of results) {
    if (r.skipped) {
      console.log(`SKIP  ${r.label} — ${r.reason}`);
    } else {
      console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.label} (HTTP ${r.status}/${r.pgStatus})`);
      if (!r.pass && r.diffs?.length) {
        r.diffs.forEach((d) => console.log(`  - ${d}`));
      }
    }
  }
  console.log('\nFallbacks:', fallbacks.length);
  console.log('Overall:', summary.overall);
  console.log('═══════════════════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(summary.overall === 'PASS' ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
