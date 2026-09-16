#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 4 — HRM read-cutover verification (local, not committed).
 * Compares Mongo vs Postgres HTTP responses with flags in process env only.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const FLAGS = [
  'READ_PG_EMPLOYEE',
  'READ_PG_ATTENDANCE',
  'READ_PG_PAYROLL',
  'READ_PG_LEAVE'
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

async function compareEndpoint(app, token, label, path) {
  setFlags(false);
  delete require.cache[require.resolve('../backend/src/config/readCutoverFlags')];
  const mongoRes = await request(app).get(path).set('Authorization', `Bearer ${token}`);
  setFlags(true);
  delete require.cache[require.resolve('../backend/src/config/readCutoverFlags')];
  const pgRes = await request(app).get(path).set('Authorization', `Bearer ${token}`);
  setFlags(false);

  const diffs = diff(stable(mongoRes.body), stable(pgRes.body));
  const pass = mongoRes.status === pgRes.status && diffs.length === 0;
  return { label, pass, status: mongoRes.status, diffs: diffs.slice(0, 15) };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const Attendance = require('../backend/src/models/attendance');
  const Payroll = require('../backend/src/models/payroll');
  const Leave = require('../backend/src/models/leave');
  const Admin = require('../backend/src/models/admin');

  const adminSample = await Attendance.findOne({ staffType: 'admin' }).lean();
  const employeeSample = await Attendance.findOne({ staffType: 'employee' }).lean();
  const adminPayroll = await Payroll.findOne({ staffType: 'admin' }).lean();
  const employeePayroll = await Payroll.findOne({ staffType: 'employee' }).lean();
  const adminLeave = await Leave.findOne({ staffType: 'admin' }).lean();
  const employeeLeave = await Leave.findOne({ staffType: 'employee' }).lean();

  const admin = await Admin.findOne({ status: 'active' }).lean();
  if (!admin) throw new Error('No active admin account for JWT auth');
  const token = jwt.sign({ username: admin.username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const app = require('../tests/app');

  const results = [];

  results.push(await compareEndpoint(app, token, 'Employee list', '/api/admin/hrm/employees?limit=5'));
  results.push(await compareEndpoint(app, token, 'Employee stats', '/api/admin/hrm/employees/stats'));

  const employee = await require('../backend/src/models/employee').findOne({ status: 'active' }).lean();
  if (employee) {
    results.push(await compareEndpoint(
      app,
      token,
      'Employee detail',
      `/api/admin/hrm/employees/${employee._id}`
    ));
    results.push(await compareEndpoint(
      app,
      token,
      'Employee profile composite',
      `/api/admin/hrm/employees/${employee._id}/profile`
    ));
  }

  results.push(await compareEndpoint(app, token, 'Attendance list', '/api/admin/hrm/attendance?limit=5'));
  results.push(await compareEndpoint(app, token, 'Attendance summary', '/api/admin/hrm/attendance/summary'));

  if (adminSample) {
    results.push(await compareEndpoint(
      app,
      token,
      'Attendance summary (admin staff)',
      `/api/admin/hrm/attendance/summary?staff=${encodeURIComponent(adminSample.staffUsername || adminSample.staffId)}`
    ));
  }
  if (employeeSample) {
    results.push(await compareEndpoint(
      app,
      token,
      'Attendance summary (employee staff)',
      `/api/admin/hrm/attendance/summary?staff=${encodeURIComponent(`employee:${employeeSample.staffId}`)}`
    ));
  }

  results.push(await compareEndpoint(app, token, 'Payroll list', '/api/admin/hrm/payroll?limit=5'));

  if (adminPayroll) {
    results.push(await compareEndpoint(
      app,
      token,
      'Payroll list (admin staff filter)',
      `/api/admin/hrm/payroll?staff=${encodeURIComponent(adminPayroll.staffUsername || adminPayroll.staffId)}&limit=5`
    ));
  }
  if (employeePayroll) {
    results.push(await compareEndpoint(
      app,
      token,
      'Payroll list (employee staff filter)',
      `/api/admin/hrm/payroll?staff=${encodeURIComponent(`employee:${employeePayroll.staffId}`)}&limit=5`
    ));
  }

  results.push(await compareEndpoint(app, token, 'Leave list', '/api/admin/hrm/leaves?limit=5'));
  results.push(await compareEndpoint(app, token, 'Leave balance', '/api/admin/hrm/leaves/balance'));
  results.push(await compareEndpoint(app, token, 'Leave calendar', '/api/admin/hrm/leaves/calendar'));

  if (adminLeave) {
    results.push(await compareEndpoint(
      app,
      token,
      'Leave list (admin staff filter)',
      `/api/admin/hrm/leaves?staff=${encodeURIComponent(adminLeave.staffUsername || adminLeave.staffId)}&limit=5`
    ));
    results.push(await compareEndpoint(
      app,
      token,
      'Leave balance (admin staff filter)',
      `/api/admin/hrm/leaves/balance?staff=${encodeURIComponent(adminLeave.staffUsername || adminLeave.staffId)}`
    ));
  }
  if (employeeLeave) {
    results.push(await compareEndpoint(
      app,
      token,
      'Leave list (employee staff filter)',
      `/api/admin/hrm/leaves?staff=${encodeURIComponent(`employee:${employeeLeave.staffId}`)}&limit=5`
    ));
  }

  console.log('\n=== Stage 4 Step 4 — HRM Read Cutover Verification ===\n');
  console.log(`Polymorphic samples: admin attendance=${!!adminSample} employee attendance=${!!employeeSample}`);
  console.log(`Polymorphic payroll: admin=${!!adminPayroll} employee=${!!employeePayroll}`);
  console.log(`Polymorphic leave: admin=${!!adminLeave} employee=${!!employeeLeave}`);
  console.log(`Fallback entries: ${fallbacks.length}`);

  results.forEach((r) => {
    console.log(`\n[${r.pass ? 'PASS' : 'FAIL'}] ${r.label} (HTTP ${r.status})`);
    if (!r.pass && r.diffs.length) {
      r.diffs.forEach((d) => console.log(`  - ${d}`));
    }
  });

  console.log('\n=== Model verdicts ===');
  const groups = {
    employee: ['Employee list', 'Employee stats', 'Employee detail', 'Employee profile composite'],
    attendance: ['Attendance list', 'Attendance summary', 'Attendance summary (admin staff)', 'Attendance summary (employee staff)'],
    payroll: ['Payroll list', 'Payroll list (admin staff filter)', 'Payroll list (employee staff filter)'],
    leave: ['Leave list', 'Leave balance', 'Leave calendar', 'Leave list (admin staff filter)', 'Leave balance (admin staff filter)', 'Leave list (employee staff filter)']
  };
  Object.entries(groups).forEach(([model, labels]) => {
    const gr = results.filter((r) => labels.includes(r.label));
    const ran = gr.length;
    const passed = gr.filter((r) => r.pass).length;
    const pass = ran > 0 && gr.every((r) => r.pass);
    console.log(`${pass ? 'PASS' : ran === 0 ? 'SKIP' : 'FAIL'} — ${model} (${passed}/${ran} endpoints)`);
  });

  const allPass = results.every((r) => r.pass) && fallbacks.length === 0;
  console.log(`\nOverall: ${allPass ? 'PASS' : 'FAIL'}\n`);
  await mongoose.disconnect().catch(() => {});
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
