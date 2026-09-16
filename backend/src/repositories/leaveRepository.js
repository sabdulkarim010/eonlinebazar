/********************************************************************
 * Project: EonlineBazar
 * File: leaveRepository.js
 * Location: backend/src/repositories/leaveRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for Leave (Neon/PostgreSQL).
 *   Reimplements applyTotalDays / countLeaveDays from leave.js.
 *   Attendance stamping on approve and SecurityLog writes are OUT OF SCOPE.
 *
 *   NOT YET WIRED INTO THE APP — Stage 2 Step 2, Part 4 (2026-09-13).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');
const { resolveStaffSubject, staffFields } = require('./hrmStaffResolver');

const LEAVE_ALLOWANCES = Object.freeze({
  casual: 12,
  sick: 12,
  annual: 20,
  unpaid: 0
});

const LEAVE_TYPES = ['casual', 'sick', 'annual', 'unpaid'];

// ── countLeaveDays (mirrors leave.js exactly) ─────────────────────────────────
function countLeaveDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return days > 0 ? days : 1;
}

function normaliseLeaveType(type) {
  const map = { CASUAL: 'casual', SICK: 'sick', ANNUAL: 'annual', UNPAID: 'unpaid' };
  return map[type] || (type ? String(type).toLowerCase() : type);
}

function toLeaveTypeEnum(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'sick') return 'SICK';
  if (v === 'annual') return 'ANNUAL';
  if (v === 'unpaid') return 'UNPAID';
  return 'CASUAL';
}

function normaliseStatus(status) {
  if (status === 'PENDING') return 'pending';
  if (status === 'APPROVED') return 'approved';
  if (status === 'REJECTED') return 'rejected';
  return status ? String(status).toLowerCase() : status;
}

function toShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.id,
    staffType: record.staffType === 'EMPLOYEE' ? 'employee' : 'admin',
    leaveType: normaliseLeaveType(record.leaveType),
    status: normaliseStatus(record.status)
  };
}

async function findAll(filters = {}) {
  const where = {};
  if (filters.status !== undefined) {
    where.status = String(filters.status).toUpperCase();
  }
  if (filters.staffOr && Array.isArray(filters.staffOr)) {
    where.OR = filters.staffOr;
  } else if (filters.staffId) {
    where.staffId = String(filters.staffId);
  }
  if (filters.year !== undefined) {
    const y = Number(filters.year);
    where.startDate = {
      gte: new Date(y, 0, 1, 0, 0, 0, 0),
      lte: new Date(y, 11, 31, 23, 59, 59, 999)
    };
  }
  if (filters.leaveType !== undefined) {
    where.leaveType = toLeaveTypeEnum(filters.leaveType);
  }

  const query = {
    where,
    orderBy: { createdAt: 'desc' }
  };

  const limit = Number(filters.limit);
  if (Number.isFinite(limit) && limit > 0) {
    const page = Math.max(1, Number(filters.page) || 1);
    query.skip = (page - 1) * limit;
    query.take = limit;
  }

  const records = await prisma.leave.findMany(query);
  return records.map(toShape);
}

async function count(filters = {}) {
  const where = {};
  if (filters.status !== undefined) {
    where.status = String(filters.status).toUpperCase();
  }
  if (filters.leaveType !== undefined) {
    where.leaveType = toLeaveTypeEnum(filters.leaveType);
  }
  if (filters.staffOr && Array.isArray(filters.staffOr)) {
    where.OR = filters.staffOr;
  } else if (filters.staffId) {
    where.staffId = String(filters.staffId);
  }
  if (filters.year !== undefined) {
    const y = Number(filters.year);
    where.startDate = {
      gte: new Date(y, 0, 1, 0, 0, 0, 0),
      lte: new Date(y, 11, 31, 23, 59, 59, 999)
    };
  }
  return prisma.leave.count({ where });
}

async function countPending() {
  return prisma.leave.count({ where: { status: 'PENDING' } });
}

async function aggregateBalanceByStaff(year) {
  const y = Number(year) || new Date().getFullYear();
  const start = new Date(y, 0, 1, 0, 0, 0, 0);
  const end = new Date(y, 11, 31, 23, 59, 59, 999);

  const leaves = await prisma.leave.findMany({
    where: { startDate: { gte: start, lte: end } },
    select: {
      staffId: true,
      staffUsername: true,
      staffType: true,
      adminId: true,
      employeeId: true,
      leaveType: true,
      status: true,
      totalDays: true
    }
  });

  const byStaff = new Map();
  leaves.forEach((leave) => {
    const key = leave.staffId;
    if (!byStaff.has(key)) {
      byStaff.set(key, {
        staffId: leave.staffId,
        staffUsername: leave.staffUsername || '',
        staffType: leave.staffType,
        adminId: leave.adminId,
        employeeId: leave.employeeId,
        rows: []
      });
    }
    byStaff.get(key).rows.push(leave);
  });

  return [...byStaff.values()];
}

async function findCalendarLeaves(month, year, statuses = ['APPROVED', 'PENDING']) {
  const m = Math.min(Math.max(Number(month) || new Date().getMonth() + 1, 1), 12);
  const y = Number(year) || new Date().getFullYear();
  const monthStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);

  const upperStatuses = statuses.map((s) => String(s).toUpperCase());

  return prisma.leave.findMany({
    where: {
      status: { in: upperStatuses },
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart }
    },
    orderBy: { startDate: 'asc' }
  });
}

async function findById(id) {
  if (!id) return null;
  const record = await prisma.leave.findUnique({ where: { id } });
  return toShape(record);
}

async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.leave.findUnique({
    where: { legacyId: String(legacyId) }
  });
  return toShape(record);
}

async function apply(data) {
  const subject = await resolveStaffSubject(data);
  if (!subject) {
    const err = new Error('Staff member not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const leaveType = String(data.leaveType || '').trim().toLowerCase();
  if (!LEAVE_TYPES.includes(leaveType)) {
    throw new Error(`Leave type must be one of: ${LEAVE_TYPES.join(', ')}.`);
  }

  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('Start and end dates are required.');
  }
  if (endDate < startDate) {
    throw new Error('End date cannot be before the start date.');
  }

  const totalDays = countLeaveDays(startDate, endDate);

  const record = await prisma.leave.create({
    data: {
      ...staffFields(subject),
      staffName: subject.staffName,
      leaveType: toLeaveTypeEnum(leaveType),
      startDate,
      endDate,
      totalDays,
      reason: String(data.reason || '').trim(),
      attachmentUrl: String(data.attachmentUrl || '').trim(),
      status: 'PENDING',
      legacyId: data.legacyId != null ? String(data.legacyId) : null
    }
  });

  return toShape(record);
}

async function approve(id, approvedByUsername) {
  const existing = await prisma.leave.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Leave application not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (existing.status !== 'PENDING') {
    const err = new Error(`This application was already ${normaliseStatus(existing.status)}.`);
    err.code = 'INVALID_STATUS';
    throw err;
  }

  const record = await prisma.leave.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedBy: String(approvedByUsername || '').trim(),
      approvedAt: new Date(),
      rejectionReason: ''
    }
  });

  return toShape(record);
}

async function reject(id, approvedByUsername, rejectionReason) {
  const existing = await prisma.leave.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Leave application not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (existing.status !== 'PENDING') {
    const err = new Error(`This application was already ${normaliseStatus(existing.status)}.`);
    err.code = 'INVALID_STATUS';
    throw err;
  }

  const reason = String(rejectionReason || '').trim();
  if (!reason) throw new Error('A rejection reason is required.');

  const record = await prisma.leave.update({
    where: { id },
    data: {
      status: 'REJECTED',
      rejectionReason: reason,
      approvedBy: String(approvedByUsername || '').trim(),
      approvedAt: new Date()
    }
  });

  return toShape(record);
}

async function getBalance(staffType, staffId, year) {
  const y = Number(year) || new Date().getFullYear();
  const subject = await resolveStaffSubject({ staffType, staffId });
  if (!subject) {
    const err = new Error('Staff member not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const start = new Date(y, 0, 1, 0, 0, 0, 0);
  const end = new Date(y, 11, 31, 23, 59, 59, 999);

  const leaves = await prisma.leave.findMany({
    where: {
      staffId: subject.staffId,
      startDate: { gte: start, lte: end }
    }
  });

  const balances = LEAVE_TYPES.map((type) => ({
    leaveType: type,
    allowed: LEAVE_ALLOWANCES[type] || 0,
    used: 0,
    pending: 0,
    remaining: LEAVE_ALLOWANCES[type] || 0
  }));

  leaves.forEach((leave) => {
    const type = normaliseLeaveType(leave.leaveType);
    const entry = balances.find((b) => b.leaveType === type);
    if (!entry) return;
    if (leave.status === 'APPROVED') {
      entry.used += leave.totalDays;
    } else if (leave.status === 'PENDING') {
      entry.pending += leave.totalDays;
    }
    entry.remaining = Math.max(0, entry.allowed - entry.used);
  });

  return {
    staffId: subject.staffId,
    staffUsername: subject.staffUsername,
    year: y,
    balances,
    allowances: LEAVE_ALLOWANCES
  };
}

module.exports = {
  LEAVE_ALLOWANCES,
  LEAVE_TYPES,
  countLeaveDays,
  findAll,
  count,
  countPending,
  aggregateBalanceByStaff,
  findCalendarLeaves,
  findById,
  findByLegacyId,
  apply,
  approve,
  reject,
  getBalance
};
