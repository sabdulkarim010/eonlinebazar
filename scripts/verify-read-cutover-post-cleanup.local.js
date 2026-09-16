#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const FLAGS = ['READ_PG_CATEGORY','READ_PG_BRAND','READ_PG_SUPPLIER','READ_PG_WAREHOUSE','READ_PG_DESIGNATION'];
const fallbacks = [];
const origErr = console.error;
console.error = (...args) => {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  if (msg.includes('[READ-CUTOVER-FALLBACK]')) fallbacks.push(msg);
  origErr.apply(console, args);
};

function setFlags(on) { FLAGS.forEach((k) => { if (on) process.env[k] = 'true'; else delete process.env[k]; }); }

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

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Category = require('../backend/src/models/category');
  const Supplier = require('../backend/src/models/supplier');
  const Warehouse = require('../backend/src/models/warehouse');
  const Admin = require('../backend/src/models/admin');
  const admin = await Admin.findOne({ status: 'active' }).lean();
  const token = jwt.sign({ username: admin.username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const app = require('../tests/app');
  const sampleCat = await Category.findOne({ isActive: true }).lean();
  const sampleWh = await Warehouse.findOne().lean();
  const sampleSup = await Supplier.findOne().lean();

  const eps = [
    { g: 'category', l: 'GET /api/categories', u: '/api/categories' },
    { g: 'category', l: 'GET /api/categories/tree', u: '/api/categories/tree' },
    { g: 'category', l: 'GET /api/categories/navbar', u: '/api/categories/navbar' },
    { g: 'category', l: 'GET /api/categories/homepage', u: '/api/categories/homepage' },
    { g: 'category', l: 'GET /api/categories/admin/all', u: '/api/categories/admin/all', auth: true },
    { g: 'brand', l: 'GET /api/brands', u: '/api/brands' },
    { g: 'supplier', l: 'GET /api/admin/suppliers', u: '/api/admin/suppliers', auth: true },
    { g: 'warehouse', l: 'GET /api/admin/warehouses', u: '/api/admin/warehouses', auth: true },
    { g: 'designation', l: 'GET /api/admin/hrm/designations', u: '/api/admin/hrm/designations', auth: true }
  ];
  if (sampleCat?._id) eps.push({ g: 'category', l: 'GET /api/categories/admin/:id', u: `/api/categories/admin/${sampleCat._id}`, auth: true });
  if (sampleWh?._id) eps.push({ g: 'warehouse', l: 'GET /api/admin/warehouses/:id', u: `/api/admin/warehouses/${sampleWh._id}`, auth: true });
  if (sampleSup?._id) eps.push({ g: 'supplier', l: 'GET /api/admin/suppliers/:id', u: `/api/admin/suppliers/${sampleSup._id}`, auth: true });

  const results = [];
  for (const ep of eps) {
    setFlags(false);
    let m = request(app).get(ep.u); if (ep.auth) m = m.set('Authorization', `Bearer ${token}`);
    const mongo = await m;
    setFlags(true);
    let p = request(app).get(ep.u); if (ep.auth) p = p.set('Authorization', `Bearer ${token}`);
    const pg = await p;
    const diffs = diff(stable(mongo.body), stable(pg.body));
    const pass = mongo.status === pg.status && diffs.length === 0;
    results.push({ ...ep, pass, mongoStatus: mongo.status, pgStatus: pg.status, diffCount: diffs.length, diffs: diffs.slice(0, 10) });
    console.log(`${pass ? 'PASS' : 'FAIL'} — ${ep.l} (${diffs.length} diffs)`);
    diffs.slice(0, 5).forEach((d) => console.log(' ', d));
  }

  const groups = ['category','brand','supplier','warehouse','designation'];
  console.log('\n=== Model verdicts ===');
  for (const g of groups) {
    const gr = results.filter((r) => r.g === g);
    const pass = gr.length && gr.every((r) => r.pass);
    console.log(`${pass ? 'PASS' : 'FAIL'} — ${g} (${gr.filter(r=>r.pass).length}/${gr.length})`);
  }
  console.log('\nFallbacks:', fallbacks.length ? fallbacks : 'None');
  console.log(JSON.stringify({ results, fallbacks }, null, 2));
  await mongoose.disconnect();
  process.exit(results.every((r) => r.pass) && !fallbacks.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
