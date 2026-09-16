#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 5 — Marketing/Support read-cutover verification (local, not committed).
 * Compares Mongo vs Postgres HTTP responses with flags in process env only.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const FLAGS = [
  'READ_PG_NEWSLETTER',
  'READ_PG_EMAILCAMPAIGN',
  'READ_PG_CONTACTMESSAGE',
  'READ_PG_REVIEW'
];

const fallbacks = [];
const origErr = console.error;
console.error = (...args) => {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  if (msg.includes('[READ-CUTOVER-FALLBACK]')) fallbacks.push(msg);
  origErr.apply(console, args);
};

function setFlags(on) {
  FLAGS.forEach((k) => {
    if (on) process.env[k] = 'true';
    else delete process.env[k];
  });
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
      if (!(k in a)) out.push(`${np}: missing in Mongo`);
      else if (!(k in b)) out.push(`${np}: extra in Postgres`);
      else out.push(...diff(a[k], b[k], np));
    });
    return out;
  }
  if (a !== b) out.push(`${p || 'root'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
  return out;
}

async function compareEndpoint(app, token, label, path, { auth = true } = {}) {
  setFlags(false);
  delete require.cache[require.resolve('../backend/src/config/readCutoverFlags')];
  const mongoReq = request(app).get(path);
  if (auth && token) mongoReq.set('Authorization', `Bearer ${token}`);
  const mongoRes = await mongoReq;

  setFlags(true);
  delete require.cache[require.resolve('../backend/src/config/readCutoverFlags')];
  const pgReq = request(app).get(path);
  if (auth && token) pgReq.set('Authorization', `Bearer ${token}`);
  const pgRes = await pgReq;
  setFlags(false);

  const diffs = diff(stable(mongoRes.body), stable(pgRes.body));
  const pass = mongoRes.status === pgRes.status && diffs.length === 0;
  return { label, pass, status: mongoRes.status, diffs: diffs.slice(0, 15), skipped: false };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const prisma = require('../backend/src/config/prismaClient');
  const Admin = require('../backend/src/models/admin');
  const Review = require('../backend/src/models/review');
  const ContactMessage = require('../backend/src/models/ContactMessage');
  const Newsletter = require('../backend/src/models/newsletter');
  const EmailCampaign = require('../backend/src/models/emailCampaign');

  const admin = await Admin.findOne({ status: 'active' }).lean();
  if (!admin) throw new Error('No active admin account for JWT auth');
  const token = jwt.sign({ username: admin.username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const app = require('../tests/app');
  const results = [];

  const newsletterCount = await Newsletter.countDocuments({});
  if (newsletterCount > 0) {
    results.push(await compareEndpoint(app, token, 'Newsletter subscribers list', '/api/admin/newsletter/subscribers?limit=5'));
  } else {
    results.push({ label: 'Newsletter subscribers list', pass: false, skipped: true, reason: 'No newsletter subscribers in Mongo' });
  }

  const campaignCount = await EmailCampaign.countDocuments({});
  if (campaignCount > 0) {
    results.push(await compareEndpoint(app, token, 'Email campaign list', '/api/admin/newsletter/campaigns'));
  } else {
    results.push({ label: 'Email campaign list', pass: false, skipped: true, reason: 'No email campaigns in Mongo' });
  }

  const contactCount = await ContactMessage.countDocuments({});
  if (contactCount > 0) {
    results.push(await compareEndpoint(app, token, 'Contact messages inbox', '/api/admin/messages'));
    results.push(await compareEndpoint(app, token, 'Ticket stats', '/api/admin/tickets/stats'));
  } else {
    results.push({ label: 'Contact messages inbox', pass: false, skipped: true, reason: 'No contact messages in Mongo' });
    results.push({ label: 'Ticket stats', pass: false, skipped: true, reason: 'No contact messages in Mongo' });
  }

  const reviewSample = await Review.findOne({ isHidden: { $ne: true } }).lean();
  if (reviewSample) {
    results.push(await compareEndpoint(
      app,
      token,
      'Public reviews by product',
      `/api/reviews/${encodeURIComponent(reviewSample.productId)}`,
      { auth: false }
    ));
    results.push(await compareEndpoint(app, token, 'Admin review list', '/api/admin/reviews?limit=5'));
  } else {
    results.push({ label: 'Public reviews by product', pass: false, skipped: true, reason: 'No reviews in Mongo' });
    results.push({ label: 'Admin review list', pass: false, skipped: true, reason: 'No reviews in Mongo' });
  }

  const pgReviewStats = await prisma.review.groupBy({
    by: ['userId'],
    _count: { _all: true }
  });
  const nullUserReviews = await prisma.review.count({ where: { userId: null } });
  const totalPgReviews = await prisma.review.count();

  console.log('\n=== Review null-userId evidence (Postgres) ===');
  console.log(`Total Review rows: ${totalPgReviews}`);
  console.log(`Reviews with null userId: ${nullUserReviews}`);
  pgReviewStats.forEach((row) => {
    console.log(`  userId=${row.userId || 'NULL'} count=${row._count._all}`);
  });

  if (reviewSample) {
    const pgRow = await prisma.review.findFirst({ where: { legacyId: String(reviewSample._id) } });
    if (pgRow) {
      console.log(`Sample review legacyId=${reviewSample._id} PG userId=${pgRow.userId || 'NULL'} Mongo userId=${reviewSample.userId}`);
    }
  }

  console.log('\n=== Stage 4 Step 5 — Marketing/Support verification ===');
  results.forEach((r) => {
    if (r.skipped) {
      console.log(`SKIP  ${r.label} — ${r.reason}`);
    } else if (r.pass) {
      console.log(`PASS  ${r.label} (${r.status})`);
    } else {
      console.log(`FAIL  ${r.label} (${r.status})`);
      r.diffs.forEach((d) => console.log(`      ${d}`));
    }
  });

  const exercised = results.filter((r) => !r.skipped);
  const allPass = exercised.length > 0 && exercised.every((r) => r.pass) && fallbacks.length === 0;
  console.log(`\nFallbacks: ${fallbacks.length}`);
  console.log(`Overall: ${allPass ? 'PASS' : exercised.length === 0 ? 'SKIP (no data)' : 'FAIL'}`);

  await mongoose.disconnect();
  process.exit(allPass ? 0 : exercised.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
