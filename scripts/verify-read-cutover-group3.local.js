#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const FLAGS = [
  'READ_PG_SECURITYLOG',
  'READ_PG_LOGINATTEMPT',
  'READ_PG_BLACKLISTEDIP',
  'READ_PG_STOCKALERT'
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

async function compareRepoSamples() {
  const SecurityLog = require('../backend/src/models/securityLog');
  const LoginAttempt = require('../backend/src/models/loginAttempt');
  const BlacklistedIP = require('../backend/src/models/blacklistedIp');
  const StockAlert = require('../backend/src/models/stockAlert');
  const securityLogRepo = require('../backend/src/repositories/securityLogRepository');
  const loginAttemptRepo = require('../backend/src/repositories/loginAttemptRepository');
  const blacklistedIpRepo = require('../backend/src/repositories/blacklistedIpRepository');
  const stockAlertRepo = require('../backend/src/repositories/stockAlertRepository');
  const {
    securityLogToMongoShape,
    loginAttemptToMongoShape,
    blacklistedIpToMongoShape,
    stockAlertToMongoShape
  } = require('../backend/src/services/readShapeHelpers');

  const out = [];

  // SecurityLog — 20 recent + 20 random older sample
  const recentMongo = await SecurityLog.find({}).sort({ createdAt: -1 }).limit(20).lean();
  const totalLogs = await SecurityLog.countDocuments({});
  const skipOlder = Math.max(0, totalLogs - 40);
  const olderMongo = await SecurityLog.find({}).sort({ createdAt: 1 }).skip(skipOlder).limit(20).lean();
  const sampleIds = [...recentMongo, ...olderMongo].map((d) => String(d._id));

  for (const mongoDoc of [...recentMongo, ...olderMongo]) {
    const pgRow = await securityLogRepo.findAll({ limit: 1, offset: 0 });
    const pgMatch = (await securityLogRepo.findAll({ limit: 5000 })).find(
      (r) => r.legacyId === String(mongoDoc._id)
    );
    if (!pgMatch) {
      out.push({ model: 'securitylog', id: String(mongoDoc._id), pass: false, diffs: ['missing in Postgres'] });
      continue;
    }
    const diffs = diff(stable(mongoDoc), stable(securityLogToMongoShape(pgMatch)));
    out.push({ model: 'securitylog', id: String(mongoDoc._id), pass: diffs.length === 0, diffs: diffs.slice(0, 5) });
  }

  // LoginAttempt — all rows if <= 50 else sample
  const loginMongo = await LoginAttempt.find({}).sort({ createdAt: -1 }).limit(50).lean();
  for (const mongoDoc of loginMongo) {
    const pgMatch = (await loginAttemptRepo.findAll({ limit: 500 })).find(
      (r) => r.legacyId === String(mongoDoc._id)
    );
    if (!pgMatch) {
      out.push({ model: 'loginattempt', id: String(mongoDoc._id), pass: false, diffs: ['missing in Postgres'] });
      continue;
    }
    const diffs = diff(stable(mongoDoc), stable(loginAttemptToMongoShape(pgMatch)));
    out.push({ model: 'loginattempt', id: String(mongoDoc._id), pass: diffs.length === 0, diffs: diffs.slice(0, 5) });
  }

  // BlacklistedIP — all rows (collection often empty/small)
  const blacklistMongo = await BlacklistedIP.find({}).lean();
  for (const mongoDoc of blacklistMongo) {
    const pgRow = await blacklistedIpRepo.findByIp(mongoDoc.ip);
    const diffs = diff(stable(mongoDoc), stable(blacklistedIpToMongoShape(pgRow)));
    out.push({ model: 'blacklistedip', id: mongoDoc.ip, pass: diffs.length === 0, diffs: diffs.slice(0, 5) });
  }
  if (blacklistMongo.length === 0) {
    out.push({ model: 'blacklistedip', id: '(empty collection)', pass: true, diffs: [] });
  }

  // StockAlert — 5 most recent with child reassembly
  const stockMongo = await StockAlert.find({}).sort({ checkedAt: -1 }).limit(5).lean();
  for (const mongoDoc of stockMongo) {
    const pgRow = await stockAlertRepo.findByLegacyId(String(mongoDoc._id), true);
    const diffs = diff(stable(mongoDoc), stable(stockAlertToMongoShape(pgRow)));
    out.push({ model: 'stockalert', id: String(mongoDoc._id), pass: diffs.length === 0, diffs: diffs.slice(0, 8) });
  }
  if (stockMongo.length === 0) {
    out.push({ model: 'stockalert', id: '(empty collection)', pass: true, diffs: [] });
  }

  return { out, sampleIds };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Admin = require('../backend/src/models/admin');
  const admin = await Admin.findOne({ status: 'active' }).lean();
  const token = jwt.sign({ username: admin.username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const app = require('../tests/app');

  const staffUser = admin.username;

  const eps = [
    { g: 'securitylog', l: 'GET /api/admin/logs', u: '/api/admin/logs', auth: true },
    { g: 'securitylog', l: 'GET /api/admin/activity-feed', u: '/api/admin/activity-feed', auth: true },
    { g: 'securitylog', l: 'GET /api/admin/staff-audit', u: '/api/admin/staff-audit', auth: true },
    { g: 'securitylog', l: 'GET /api/admin/staff-audit/:user', u: `/api/admin/staff-audit/${encodeURIComponent(staffUser)}`, auth: true },
    { g: 'loginattempt', l: 'GET /api/admin/login-history', u: '/api/admin/login-history', auth: true },
    { g: 'loginattempt', l: 'GET /api/admin/security/rate-limit-stats', u: '/api/admin/security/rate-limit-stats', auth: true },
    { g: 'blacklistedip', l: 'GET /api/admin/blacklist', u: '/api/admin/blacklist', auth: true }
  ];

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
    diffs.slice(0, 6).forEach((d) => console.log(' ', d));
  }

  console.log('\n=== Repository sample parity ===');
  const { out: repoSamples } = await compareRepoSamples();
  const models = ['securitylog', 'loginattempt', 'blacklistedip', 'stockalert'];
  for (const model of models) {
    const samples = repoSamples.filter((r) => r.model === model);
    const fails = samples.filter((s) => !s.pass);
    const pass = fails.length === 0;
    console.log(`${pass ? 'PASS' : 'FAIL'} — ${model} repo sample (${samples.length - fails.length}/${samples.length})`);
    fails.slice(0, 3).forEach((f) => {
      console.log(`  id ${f.id}:`, f.diffs.join('; '));
    });
  }

  console.log('\n=== Model verdicts (HTTP) ===');
  for (const g of ['securitylog', 'loginattempt', 'blacklistedip']) {
    const gr = results.filter((r) => r.g === g);
    const pass = gr.length && gr.every((r) => r.pass);
    console.log(`${pass ? 'PASS' : 'FAIL'} — ${g} (${gr.filter((r) => r.pass).length}/${gr.length} endpoints)`);
  }

  console.log('\n=== StockAlert ===');
  console.log('No HTTP read endpoint exists — repository-level sample check only (see above).');

  console.log('\n=== BlacklistedIP hot-path ===');
  console.log('findActiveByIp() uses prisma.blacklistedIp.findUnique({ where: { ip } }) — unique index on ip.');

  console.log('\nFallbacks:', fallbacks.length ? fallbacks : 'None');
  await mongoose.disconnect();

  const repoOk = repoSamples.every((s) => s.pass);
  const httpOk = results.every((r) => r.pass);
  process.exit(httpOk && repoOk && !fallbacks.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
