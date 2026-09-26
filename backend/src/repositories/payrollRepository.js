/********************************************************************
 * Project: EonlineBazar
 * File: payrollRepository.js
 * Location: backend/src/repositories/payrollRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for Payroll (Neon/PostgreSQL).
 *   Reimplements applyTotals / computeTotalSalary from payroll.js.
 *   PDF pay-slip generation is OUT OF SCOPE.
 *
 *   NOT YET WIRED INTO THE APP — Stage 2 Step 2, Part 4 (2026-09-13).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');
const { resolveStaffSubject, staffFields } = require('./hrmStaffResolver');
const { parseShiftMinutes } = require('./attendanceRepository');

const { computeTotalSalary } = require('../models/payroll');
const { DEFAULT_ATTENDANCE_SETTINGS } = require('../services/attendanceSettingsService');
const {
  countWorkingDays,
  STANDARD_SHIFT_HOURS
} = require('../services/payrollService');

function summarizeAttendance(records) {
  let presentDays = 0;
  let absentDays = 0;
  let lateDays = 0;
  let holidays = 0;
  let overtimeHours = 0;

  records.forEach((row) => {
    const raw = String(row.status || '');
    const status = raw.toLowerCase().replace('_', '-').replace('half-day', 'half-day');
    if (raw === 'PRESENT' || status === 'present' || raw === 'LATE' || status === 'late') {
      presentDays += 1;
    } else if (raw === 'HALF_DAY' || status === 'half-day') {
      presentDays += 0.5;
    } else if (raw === 'ABSENT' || status === 'absent') {
      absentDays += 1;
    } else if (raw === 'HOLIDAY' || status === 'holiday') {
      holidays += 1;
    }

    if (row.isLate) lateDays += 1;

    const start = parseShiftMinutes(row.shiftStart);
    const end = parseShiftMinutes(row.shiftEnd);
    const shiftHours = start !== null && end !== null && end > start
      ? (end - start) / 60
      : STANDARD_SHIFT_HOURS;

    const worked = Number(row.hoursWorked) || 0;
    if (worked > shiftHours) overtimeHours += worked - shiftHours;
  });

  return {
    presentDays: Math.round(presentDays * 10) / 10,
    absentDays,
    lateDays,
    holidays,
    overtimeHours: Math.round(overtimeHours * 100) / 100
  };
}

function normaliseStatus(status) {
  if (status === 'DRAFT') return 'draft';
  if (status === 'APPROVED') return 'approved';
  if (status === 'PAID') return 'paid';
  return status ? String(status).toLowerCase() : status;
}

function toStatusEnum(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'approved') return 'APPROVED';
  if (v === 'paid') return 'PAID';
  return 'DRAFT';
}

function toShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.id,
    staffType: record.staffType === 'EMPLOYEE' ? 'employee' : 'admin',
    status: normaliseStatus(record.status),
    baseSalary: Number(record.baseSalary),
    bonus: Number(record.bonus),
    overtime: Number(record.overtime),
    overtimeRate: Number(record.overtimeRate),
    overtimeAmount: Number(record.overtimeAmount),
    deductions: Number(record.deductions),
    totalSalary: Number(record.totalSalary)
  };
}

async function findAll(filters = {}) {
  const where = {};
  if (filters.month !== undefined) where.month = Number(filters.month);
  if (filters.year !== undefined) where.year = Number(filters.year);
  if (filters.status !== undefined) where.status = toStatusEnum(filters.status);

  if (filters.staffOr && Array.isArray(filters.staffOr)) {
    where.OR = filters.staffOr;
  } else if (filters.staffId) {
    where.staffId = String(filters.staffId);
  }

  const query = {
    where,
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { staffUsername: 'asc' }]
  };

  const limit = Number(filters.limit);
  if (Number.isFinite(limit) && limit > 0) {
    const page = Math.max(1, Number(filters.page) || 1);
    query.skip = (page - 1) * limit;
    query.take = limit;
  }

  const records = await prisma.payroll.findMany(query);
  return records.map(toShape);
}

async function count(filters = {}) {
  const where = {};
  if (filters.month !== undefined) where.month = Number(filters.month);
  if (filters.year !== undefined) where.year = Number(filters.year);
  if (filters.status !== undefined) where.status = toStatusEnum(filters.status);
  if (filters.staffOr && Array.isArray(filters.staffOr)) {
    where.OR = filters.staffOr;
  } else if (filters.staffId) {
    where.staffId = String(filters.staffId);
  }
  return prisma.payroll.count({ where });
}

async function aggregateRollup(filters = {}) {
  const where = {};
  if (filters.month !== undefined) where.month = Number(filters.month);
  if (filters.year !== undefined) where.year = Number(filters.year);
  if (filters.status !== undefined) where.status = toStatusEnum(filters.status);
  if (filters.staffOr && Array.isArray(filters.staffOr)) {
    where.OR = filters.staffOr;
  } else if (filters.staffId) {
    where.staffId = String(filters.staffId);
  }

  const rows = await prisma.payroll.findMany({
    where,
    select: { totalSalary: true, status: true }
  });

  let totalAmount = 0;
  let paidCount = 0;
  let pendingCount = 0;
  rows.forEach((row) => {
    totalAmount += Number(row.totalSalary) || 0;
    if (row.status === 'PAID') paidCount += 1;
    else pendingCount += 1;
  });

  return {
    totalAmount: Math.round(totalAmount * 100) / 100,
    paidCount,
    pendingCount
  };
}

async function findById(id) {
  if (!id) return null;
  const record = await prisma.payroll.findUnique({ where: { id } });
  return toShape(record);
}

async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.payroll.findUnique({
    where: { legacyId: String(legacyId) }
  });
  return toShape(record);
}

async function generate(staffType, staffId, month, year, overrides = {}) {
  const subject = await resolveStaffSubject({ staffType, staffId });
  if (!subject) {
    const err = new Error('Staff member not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const now = new Date();
  const m = Math.min(Math.max(Number(month) || now.getMonth() + 1, 1), 12);
  const y = Number(year) || now.getFullYear();

  const existing = await prisma.payroll.findUnique({
    where: { staffId_year_month: { staffId: subject.staffId, year: y, month: m } }
  });

  if (existing && existing.status !== 'DRAFT') {
    const err = new Error(`Payroll for this month is already ${normaliseStatus(existing.status)}.`);
    err.code = 'NOT_DRAFT';
    throw err;
  }

  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 0, 0, 0, 0);

  const records = await prisma.attendance.findMany({
    where: { staffId: subject.staffId, date: { gte: start, lte: end } }
  });

  const summary = summarizeAttendance(records);
  const weekendDays = DEFAULT_ATTENDANCE_SETTINGS.weekendDays;
  const calendarWorkingDays = countWorkingDays(y, m, weekendDays);

  const workingDays = overrides.workingDays !== undefined
    ? Math.max(0, parseInt(overrides.workingDays, 10) || 0)
    : Math.max(0, calendarWorkingDays - summary.holidays);

  const baseSalary = overrides.baseSalary !== undefined
    ? Math.max(0, Number(overrides.baseSalary) || 0)
    : subject.baseSalary;

  const hourlyRate = workingDays > 0
    ? baseSalary / (workingDays * STANDARD_SHIFT_HOURS)
    : 0;
  const overtimeRate = overrides.overtimeRate !== undefined
    ? Math.max(0, Number(overrides.overtimeRate) || 0)
    : Math.round(hourlyRate * 100) / 100;

  const totalsInput = {
    baseSalary,
    workingDays,
    presentDays: summary.presentDays,
    overtime: overrides.overtime !== undefined
      ? Math.max(0, Number(overrides.overtime) || 0)
      : summary.overtimeHours,
    overtimeRate,
    bonus: Math.max(0, Number(overrides.bonus) || 0),
    deductions: Math.max(0, Number(overrides.deductions) || 0)
  };

  const { overtimeAmount, totalSalary } = computeTotalSalary(totalsInput);

  const data = {
    ...staffFields(subject),
    staffName: subject.staffName,
    month: m,
    year: y,
    baseSalary,
    bonus: totalsInput.bonus,
    overtime: totalsInput.overtime,
    overtimeRate,
    overtimeAmount,
    deductions: totalsInput.deductions,
    totalSalary,
    workingDays,
    presentDays: summary.presentDays,
    absentDays: summary.absentDays,
    lateDays: summary.lateDays,
    status: 'DRAFT',
    paymentMethod: String(overrides.paymentMethod || '').trim(),
    notes: String(overrides.notes || '').trim(),
    createdBy: String(overrides.createdBy || '').trim(),
    legacyId: overrides.legacyId != null ? String(overrides.legacyId) : undefined
  };

  let record;
  if (existing) {
    record = await prisma.payroll.update({ where: { id: existing.id }, data });
  } else {
    record = await prisma.payroll.create({ data });
  }

  return toShape(record);
}

/** Mirror a saved Mongoose payroll document to Postgres (exact computed values). */
async function upsertFromMongo(mongoDoc) {
  const plain = mongoDoc.toObject ? mongoDoc.toObject() : mongoDoc;
  const subject = await resolveStaffSubject({
    staffType: plain.staffType || 'admin',
    staffId: plain.staffId,
    staffUsername: plain.staffUsername
  });
  if (!subject) {
    const err = new Error('Staff member not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const month = Number(plain.month);
  const year = Number(plain.year);
  const existing = await prisma.payroll.findUnique({
    where: { staffId_year_month: { staffId: subject.staffId, year, month } }
  });

  const data = {
    ...staffFields(subject),
    staffName: String(plain.staffName || subject.staffName || '').trim(),
    month,
    year,
    baseSalary: plain.baseSalary ?? 0,
    bonus: plain.bonus ?? 0,
    overtime: plain.overtime ?? 0,
    overtimeRate: plain.overtimeRate ?? 0,
    overtimeAmount: plain.overtimeAmount ?? 0,
    deductions: plain.deductions ?? 0,
    totalSalary: plain.totalSalary ?? 0,
    workingDays: plain.workingDays ?? 0,
    presentDays: plain.presentDays ?? 0,
    absentDays: plain.absentDays ?? 0,
    lateDays: plain.lateDays ?? 0,
    status: toStatusEnum(plain.status || 'draft'),
    paidAt: plain.paidAt ? new Date(plain.paidAt) : null,
    paymentMethod: String(plain.paymentMethod || '').trim(),
    notes: String(plain.notes || '').trim(),
    createdBy: String(plain.createdBy || '').trim(),
    legacyId: mongoDoc._id != null ? String(mongoDoc._id) : null
  };

  let record;
  if (existing) {
    record = await prisma.payroll.update({ where: { id: existing.id }, data });
  } else {
    record = await prisma.payroll.create({ data });
  }

  return toShape(record);
}

async function approve(id) {
  const existing = await prisma.payroll.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Payroll record not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (existing.status !== 'DRAFT') {
    const err = new Error(`Only draft payroll can be approved — this run is already ${normaliseStatus(existing.status)}.`);
    err.code = 'INVALID_STATUS';
    throw err;
  }

  const record = await prisma.payroll.update({
    where: { id },
    data: { status: 'APPROVED' }
  });
  return toShape(record);
}

async function markPaid(id, paymentMethod = '') {
  const existing = await prisma.payroll.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Payroll record not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (existing.status === 'PAID') {
    const err = new Error('This payroll is already marked paid.');
    err.code = 'ALREADY_PAID';
    throw err;
  }
  if (existing.status !== 'APPROVED') {
    const err = new Error('Approve the payroll before marking it paid.');
    err.code = 'NOT_APPROVED';
    throw err;
  }

  const record = await prisma.payroll.update({
    where: { id },
    data: {
      status: 'PAID',
      paidAt: new Date(),
      paymentMethod: String(paymentMethod || existing.paymentMethod || '').trim()
    }
  });
  return toShape(record);
}

async function deleteAllForStaff(staffLegacyId, options = {}) {
  const where = {
    staffId: String(staffLegacyId),
    staffType: String(options.staffType || 'employee').toLowerCase() === 'employee' ? 'EMPLOYEE' : 'ADMIN'
  };
  if (options.draftsOnly) {
    where.status = 'DRAFT';
  }
  const result = await prisma.payroll.deleteMany({ where });
  return result.count || 0;
}

module.exports = {
  computeTotalSalary,
  countWorkingDays,
  summarizeAttendance,
  findAll,
  count,
  aggregateRollup,
  findById,
  findByLegacyId,
  generate,
  upsertFromMongo,
  approve,
  markPaid,
  deleteAllForStaff
};
