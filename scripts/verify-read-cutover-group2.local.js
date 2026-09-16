#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const FLAGS = [
  'READ_PG_PAGECONTENT',
  'READ_PG_NAVBARLINK',
  'READ_PG_FOOTERSETTINGS',
  'READ_PG_BANNER',
  'READ_PG_SETTINGS'
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

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const PageContent = require('../backend/src/models/PageContent');
  const Admin = require('../backend/src/models/admin');
  const admin = await Admin.findOne({ status: 'active' }).lean();
  const token = jwt.sign({ username: admin.username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const app = require('../tests/app');
  const samplePage = await PageContent.findOne({ isPublished: { $ne: false } }).lean();

  const eps = [
    { g: 'pagecontent', l: 'GET /api/admin/pages', u: '/api/admin/pages', auth: true },
    { g: 'navbarlink', l: 'GET /api/navbar-links', u: '/api/navbar-links' },
    { g: 'navbarlink', l: 'GET /api/navbar-links/admin', u: '/api/navbar-links/admin', auth: true },
    { g: 'footersettings', l: 'GET /api/admin/footer-settings', u: '/api/admin/footer-settings', auth: true },
    { g: 'footersettings', l: 'GET /api/store/footer-settings', u: '/api/store/footer-settings' },
    { g: 'footersettings', l: 'GET /api/admin/footer-settings/payment-badges', u: '/api/admin/footer-settings/payment-badges', auth: true },
    { g: 'banner', l: 'GET /api/store/banners', u: '/api/store/banners' },
    { g: 'banner', l: 'GET /api/admin/banners', u: '/api/admin/banners', auth: true },
    { g: 'settings', l: 'GET /api/admin/settings', u: '/api/admin/settings', auth: true },
    { g: 'settings', l: 'GET /api/admin/all-settings', u: '/api/admin/all-settings', auth: true },
    { g: 'settings', l: 'GET /api/admin/master-settings', u: '/api/admin/master-settings', auth: true },
    { g: 'settings', l: 'GET /api/store/delivery-settings', u: '/api/store/delivery-settings' },
    { g: 'settings', l: 'GET /api/store/cache-settings', u: '/api/store/cache-settings' }
  ];

  if (samplePage?.slug) {
    eps.push(
      { g: 'pagecontent', l: 'GET /api/admin/pages/:slug', u: `/api/admin/pages/${samplePage.slug}`, auth: true },
      { g: 'pagecontent', l: 'GET /api/store/pages/:slug', u: `/api/store/pages/${samplePage.slug}` },
      { g: 'pagecontent', l: 'GET /api/pages/:slug', u: `/api/pages/${samplePage.slug}` }
    );
  }

  const results = [];
  for (const ep of eps) {
    setFlags(false);
    let m = request(app).get(ep.u);
    if (ep.auth) m = m.set('Authorization', `Bearer ${token}`);
    const mongo = await m;
    setFlags(true);
    let p = request(app).get(ep.u);
    if (ep.auth) p = p.set('Authorization', `Bearer ${token}`);
    const pg = await p;
    const diffs = diff(stable(mongo.body), stable(pg.body));
    const pass = mongo.status === pg.status && diffs.length === 0;
    results.push({ ...ep, pass, mongoStatus: mongo.status, pgStatus: pg.status, diffCount: diffs.length, diffs: diffs.slice(0, 15) });
    console.log(`${pass ? 'PASS' : 'FAIL'} — ${ep.l} (${diffs.length} diffs)`);
    diffs.slice(0, 8).forEach((d) => console.log(' ', d));
  }

  const groups = ['pagecontent', 'navbarlink', 'footersettings', 'banner', 'settings'];
  console.log('\n=== Model verdicts ===');
  for (const g of groups) {
    const gr = results.filter((r) => r.g === g);
    const pass = gr.length && gr.every((r) => r.pass);
    console.log(`${pass ? 'PASS' : 'FAIL'} — ${g} (${gr.filter((r) => r.pass).length}/${gr.length})`);
  }
  console.log('\nFallbacks:', fallbacks.length ? fallbacks : 'None');
  await mongoose.disconnect();
  process.exit(results.every((r) => r.pass) && !fallbacks.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
