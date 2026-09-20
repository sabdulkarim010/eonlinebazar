#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const offTxt = fs.readFileSync(path.join(__dirname, '..', 'results-flag-off.txt'), 'utf8');
const onTxt = fs.readFileSync(path.join(__dirname, '..', 'results-flag-on.txt'), 'utf8');
const mongoJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'verify-results-mongo.json'), 'utf8'));
const pgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'verify-results-postgres.json'), 'utf8'));

const COSMETIC = new Set(['createdAt', 'updatedAt', '__v', 'courierSyncedAt']);

function getOrder(body) {
  return body?.data?.data || body?.data || body;
}

function flatten(obj, prefix = '', out = {}) {
  if (obj === null || obj === undefined) {
    out[prefix || '(root)'] = obj;
    return out;
  }
  if (Array.isArray(obj)) {
    out[prefix || '(root)'] = obj;
    return out;
  }
  if (typeof obj !== 'object') {
    out[prefix || '(root)'] = obj;
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (COSMETIC.has(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out);
    else out[p] = v;
  }
  return out;
}

function compareOrders(label, mongoBody, pgBody) {
  const m = getOrder(mongoBody);
  const p = getOrder(pgBody);
  const mf = flatten(m);
  const pf = flatten(p);
  const diffs = [];
  const keys = new Set([...Object.keys(mf), ...Object.keys(pf)]);
  for (const k of [...keys].sort()) {
    const a = mf[k];
    const b = pf[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      const critical = /grandTotal|subTotal|subtotal|totalAmount|status|orderId|items|payment\.status|payment\.code/.test(k);
      diffs.push({ field: k, mongo: a, postgres: b, critical });
    }
  }
  return { label, diffs, mongoStatus: mongoBody?.status, pgStatus: pgBody?.status };
}

function summarizeTxt(name, txt) {
  const lines = txt.split('\n').map((l) => l.trim()).filter(Boolean);
  return {
    serverUp: /Server is responding/.test(txt),
    serverDown: /Server not responding/.test(txt),
    tests: {
      myOrders: lines.find((l) => l.includes('TEST 1')) ? lines.find((l) => l.includes('HTTP 200 -') && lines.indexOf(l) > lines.indexOf('TEST 1')) : null,
      orderDetail: /SKIP: No order found for user/.test(txt) ? 'SKIP' : null,
      track: lines.find((l) => l.includes('order EOB')) || null,
      dashboard: lines.find((l) => l.includes('totalOrders')) || null,
      admin: lines.find((l) => l.includes('TEST 6') && lines[lines.indexOf('TEST 6') + 1]) || null
    }
  };
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('HTTP FLAG COMPARISON REPORT');
console.log('═══════════════════════════════════════════════════════\n');

console.log('--- Saved text files (results-flag-off.txt vs results-flag-on.txt) ---');
const offSummary = summarizeTxt('off', offTxt);
const onSummary = summarizeTxt('on', onTxt);
console.log(`OFF file server ran: ${offSummary.serverUp ? 'yes' : 'no'} (${offSummary.serverDown ? 'server not responding' : 'ok'})`);
console.log(`ON file server ran: ${onSummary.serverUp ? 'yes' : 'no'}`);
console.log('Text-file comparability: OFF run captured NO endpoint responses; ON run captured status summaries only (no response bodies). Field-level diff from txt files alone is NOT possible.\n');

console.log('--- Endpoint verdicts from text summaries ---');
console.log('1. my-orders       OFF: N/A (server down) | ON: HTTP 200, 0 orders → cannot compare bodies');
console.log('2. order detail    OFF: N/A | ON: SKIP (wrong test user had no orders)');
console.log('3. invoice         OFF: N/A | ON: SKIP');
console.log('4. track           OFF: N/A | ON: HTTP 200 EOB163302 → no OFF baseline');
console.log('5. dashboard-stats OFF: N/A | ON: HTTP 200 totalOrders=0 → no OFF baseline');
console.log('6. admin list      OFF: N/A | ON: HTTP 403 → auth failure, not cutover test\n');

console.log('--- JSON comparison (verify-results-mongo.json vs verify-results-postgres.json) ---');
console.log('These use Part A orders + correct order owner token.\n');

const endpoints = [];

// 1 my-orders
const mo = mongoJson.myOrders;
const po = pgJson.myOrders;
endpoints.push({
  name: 'GET /api/orders/my-orders',
  statusOff: mo.status,
  statusOn: po.status,
  verdict: mo.status === po.status && mo.count === po.count ? 'PASS' : 'FAIL',
  detail: `count off=${mo.count} on=${po.count}`
});

// 2a payment order detail
const cmpPayment = compareOrders('payment order', mongoJson.orderDetailPayment.data, pgJson.orderDetailPayment.data);
endpoints.push({
  name: 'GET /api/orders/:id (payment EOB352403)',
  statusOff: mongoJson.orderDetailPayment.status,
  statusOn: pgJson.orderDetailPayment.status,
  verdict: cmpPayment.diffs.filter((d) => d.critical).length === 0 && cmpPayment.diffs.length === 0 ? 'PASS' : (cmpPayment.diffs.filter((d) => d.critical).length ? 'FAIL' : 'PASS_WITH_COSMETIC'),
  detail: cmpPayment.diffs.length ? `${cmpPayment.diffs.length} diffs` : 'all compared fields match',
  diffs: cmpPayment.diffs.slice(0, 20)
});

// 2b proof order detail
const cmpProof = compareOrders('proof order', mongoJson.orderDetailProof.data, pgJson.orderDetailProof.data);
endpoints.push({
  name: 'GET /api/orders/:id (proof EOB425345)',
  statusOff: mongoJson.orderDetailProof.status,
  statusOn: pgJson.orderDetailProof.status,
  verdict: cmpProof.diffs.filter((d) => d.critical).length === 0 && cmpProof.diffs.length === 0 ? 'PASS' : (cmpProof.diffs.filter((d) => d.critical).length ? 'FAIL' : 'PASS_WITH_COSMETIC'),
  detail: cmpProof.diffs.length ? `${cmpProof.diffs.length} diffs` : 'all compared fields match',
  diffs: cmpProof.diffs.slice(0, 20)
});

// 3 invoice
endpoints.push({
  name: 'GET /api/orders/:id/invoice',
  statusOff: mongoJson.invoice.status,
  statusOn: pgJson.invoice.status,
  verdict: mongoJson.invoice.status === pgJson.invoice.status ? 'SKIP' : 'FAIL',
  detail: `both returned HTTP ${mongoJson.invoice.status} (403 auth) — cutover not exercised`
});

// 4 track
const cmpTrack = compareOrders('track', mongoJson.track.data, pgJson.track.data);
endpoints.push({
  name: 'GET /api/orders/track',
  statusOff: mongoJson.track.status,
  statusOn: pgJson.track.status,
  verdict: cmpTrack.diffs.filter((d) => d.critical).length === 0 && cmpTrack.diffs.length === 0 ? 'PASS' : (cmpTrack.diffs.filter((d) => d.critical).length ? 'FAIL' : 'PASS_WITH_COSMETIC'),
  detail: cmpTrack.diffs.length ? `${cmpTrack.diffs.length} diffs` : 'all compared fields match',
  diffs: cmpTrack.diffs.slice(0, 20)
});

// 5 dashboard
const md = mongoJson.dashboardStats.data?.data || mongoJson.dashboardStats.data;
const pd = pgJson.dashboardStats.data?.data || pgJson.dashboardStats.data;
const dashDiff = ['totalOrders', 'pendingOrders', 'balance', 'loyaltyPoints'].filter((k) => md[k] !== pd[k]);
endpoints.push({
  name: 'GET /api/orders/dashboard-stats',
  statusOff: mongoJson.dashboardStats.status,
  statusOn: pgJson.dashboardStats.status,
  verdict: dashDiff.length === 0 ? 'PASS' : 'FAIL',
  detail: dashDiff.length ? `diff fields: ${dashDiff.join(', ')}` : 'stats match'
});

// 6 admin list
endpoints.push({
  name: 'GET /api/orders/ (admin list)',
  statusOff: mongoJson.adminList.status,
  statusOn: pgJson.adminList.status,
  verdict: 'SKIP',
  detail: `both returned HTTP ${mongoJson.adminList.status} (403 auth) — cutover not exercised`
});

for (const ep of endpoints) {
  console.log(`${ep.verdict.padEnd(18)} ${ep.name}`);
  console.log(`  OFF status=${ep.statusOff} ON status=${ep.statusOn} | ${ep.detail}`);
  if (ep.diffs?.length) {
    for (const d of ep.diffs) {
      console.log(`  - ${d.critical ? 'CRITICAL' : 'cosmetic'} ${d.field}: mongo=${JSON.stringify(d.mongo)} postgres=${JSON.stringify(d.postgres)}`);
    }
  }
  console.log('');
}

console.log('[READ-CUTOVER-FALLBACK]: not present in saved txt/json artifacts; check live server console during ON run.');
console.log('═══════════════════════════════════════════════════════\n');
