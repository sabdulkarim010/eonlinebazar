/********************************************************************
 * Project: EonlineBazar
 * File: attendanceRepository.js
 * Location: backend/src/repositories/attendanceRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for Attendance (Neon/PostgreSQL).
 *   Reimplements computeHoursWorked pre-save hook and polymorphic staff
 *   resolution (staffId/staffType + adminId/employeeId).
 *
 *   NOT YET WIRED INTO THE APP — Stage 2 Step 2, Part 4 (2026-09-13).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');
const {
  resolveStaffSubject,
  staffFields,
  parseStaffSelector
} = require('./hrmStaffResolver');

// ── computeHoursWorked (mirrors attendance.js pre-save exactly) ───────────────
function computeHoursWorked(clockIn, clockOut, existingHoursWorked = 0) {
  if (clockIn && clockOut) {
    const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
    return ms > 0 ? Math.round((ms / 3600000) * 100) / 100 : 0;
  }
  if (clockIn && !clockOut) {
    return 0;
  }
  return existingHoursWorked;
}

function normalizeDate(input) {
  const d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseShiftMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function normaliseStatus(status) {
  const map = {
    PRESENT: 'present',
    ABSENT: 'absent',
    LATE: 'late',
    HALF_DAY: 'half-day',
    HOLIDAY: 'holiday'
  };
  return map[status] || (status ? String(status).toLowerCase() : status);
}

function toStatusEnum(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'present') return 'PRESENT';
  if (v === 'late') return 'LATE';
  if (v === 'half-day') return 'HALF_DAY';
  if (v === 'holiday') return 'HOLIDAY';
  return 'ABSENT';
}

function normaliseShift(shift) {
  const map = { MORNING: 'morning', EVENING: 'evening', NIGHT: 'night', CUSTOM: 'custom' };
  return map[shift] || (shift ? String(shift).toLowerCase() : shift);
}

function toShiftEnum(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'evening') return 'EVENING';
  if (v === 'night') return 'NIGHT';
  if (v === 'custom') return 'CUSTOM';
  return 'MORNING';
}

function toShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.id,
    staffType: record.staffType === 'EMPLOYEE' ? 'employee' : 'admin',
    status: normaliseStatus(record.status),
    shift: normaliseShift(record.shift),
    hoursWorked: record.hoursWorked != null ? Number(record.hoursWorked) : 0,
    gpsLocation: record.gpsLat != null && record.gpsLng != null
      ? { lat: Number(record.gpsLat), lng: Number(record.gpsLng) }
      : null
  };
}

// ── findAll ──────────────────────────────────────────────────────────────────
async function findAll(filters = {}) {
  const where = {};

  if (filters.staffId) where.staffId = String(filters.staffId);
  if (filters.status !== undefined) where.status = toStatusEnum(filters.status);

  if (filters.from || filters.to) {
    where.date = {};
    if (filters.from) where.date.gte = normalizeDate(filters.from);
    if (filters.to) where.date.lte = normalizeDate(filters.to);
  } else if (filters.date) {
    const d = normalizeDate(filters.date);
    if (d) where.date = d;
  }

  const query = {
    where,
    orderBy: [{ date: 'desc' }, { staffUsername: 'asc' }]
  };

  const limit = Number(filters.limit);
  if (Number.isFinite(limit) && limit > 0) {
    const page = Math.max(1, Number(filters.page) || 1);
    query.skip = (page - 1) * limit;
    query.take = limit;
  }

  const records = await prisma.attendance.findMany(query);
  return records.map(toShape);
}

async function findById(id) {
  if (!id) return null;
  const record = await prisma.attendance.findUnique({ where: { id } });
  return toShape(record);
}

// ── markAttendance ───────────────────────────────────────────────────────────
async function markAttendance(data) {
  const subject = await resolveStaffSubject(data);
  if (!subject) {
    const err = new Error('Staff member not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const date = normalizeDate(data.date);
  if (!date) throw new Error('A valid date is required.');

  const status = String(data.status || '').trim().toLowerCase();
  const valid = ['present', 'absent', 'late', 'half-day', 'holiday'];
  if (!valid.includes(status)) {
    throw new Error(`Status must be one of: ${valid.join(', ')}.`);
  }

  const existing = await prisma.attendance.findFirst({
    where: { staffId: subject.staffId, date }
  });

  const fields = {
    ...staffFields(subject),
    date,
    status: toStatusEnum(status),
    shift: toShiftEnum(data.shift || 'morning'),
    shiftStart: String(data.shiftStart || '09:00').trim(),
    shiftEnd: String(data.shiftEnd || '18:00').trim(),
    notes: String(data.notes || '').trim(),
    markedBy: String(data.markedBy || 'admin').trim()
  };

  if (status === 'late') {
    fields.isLate = true;
    fields.lateMinutes = Number(data.lateMinutes) || 0;
  } else if (status !== 'present') {
    fields.isLate = false;
    fields.lateMinutes = 0;
  }

  let record;
  if (existing) {
    record = await prisma.attendance.update({
      where: { id: existing.id },
      data: fields
    });
  } else {
    record = await prisma.attendance.create({ data: fields });
  }

  return toShape(record);
}

// ── clockIn ──────────────────────────────────────────────────────────────────
async function clockIn(staffType, staffId, gpsLocation = {}, dateInput) {
  const subject = await resolveStaffSubject({ staffType, staffId });
  if (!subject) {
    const err = new Error('Staff member not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const date = normalizeDate(dateInput || new Date());
  const now = new Date();

  let record = await prisma.attendance.findFirst({
    where: { staffId: subject.staffId, date }
  });

  if (record?.clockIn) {
    const err = new Error('Already clocked in for today.');
    err.code = 'ALREADY_CLOCKED_IN';
    err.record = toShape(record);
    throw err;
  }

  const data = {
    ...staffFields(subject),
    date,
    clockIn: now,
    shiftStart: '09:00',
    shiftEnd: '18:00',
    status: 'PRESENT',
    markedBy: 'self',
    hoursWorked: 0
  };

  const lat = Number(gpsLocation.lat);
  const lng = Number(gpsLocation.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    data.gpsLat = lat;
    data.gpsLng = lng;
  }

  if (record) {
    record = await prisma.attendance.update({ where: { id: record.id }, data });
  } else {
    record = await prisma.attendance.create({ data });
  }

  return toShape(record);
}

// ── clockOut ─────────────────────────────────────────────────────────────────
async function clockOut(staffType, staffId, dateInput) {
  const subject = await resolveStaffSubject({ staffType, staffId });
  if (!subject) {
    const err = new Error('Staff member not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const date = normalizeDate(dateInput || new Date());
  const record = await prisma.attendance.findFirst({
    where: { staffId: subject.staffId, date }
  });

  if (!record || !record.clockIn) {
    const err = new Error('No clock-in found for today.');
    err.code = 'NO_CLOCK_IN';
    throw err;
  }
  if (record.clockOut) {
    const err = new Error('Already clocked out for today.');
    err.code = 'ALREADY_CLOCKED_OUT';
    err.record = toShape(record);
    throw err;
  }

  const clockOut = new Date();
  const hoursWorked = computeHoursWorked(record.clockIn, clockOut, Number(record.hoursWorked));

  let status = record.status;
  const startMinutes = parseShiftMinutes(record.shiftStart);
  const endMinutes = parseShiftMinutes(record.shiftEnd);
  if (startMinutes !== null && endMinutes !== null && endMinutes > startMinutes) {
    const shiftHours = (endMinutes - startMinutes) / 60;
    const workedMs = clockOut.getTime() - new Date(record.clockIn).getTime();
    if (workedMs / 3600000 < shiftHours / 2) {
      status = 'HALF_DAY';
    }
  }

  const updated = await prisma.attendance.update({
    where: { id: record.id },
    data: { clockOut, hoursWorked, status }
  });

  return toShape(updated);
}

// ── getSummary ───────────────────────────────────────────────────────────────
async function getSummary(staffType, staffId, month, year) {
  const now = new Date();
  const m = Math.min(Math.max(Number(month) || now.getMonth() + 1, 1), 12);
  const y = Number(year) || now.getFullYear();

  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 0, 0, 0, 0);

  const where = {
    date: { gte: start, lte: end }
  };

  if (staffType && staffId) {
    const subject = await resolveStaffSubject({ staffType, staffId });
    where.staffId = subject ? subject.staffId : '__no_match__';
  }

  const records = await prisma.attendance.findMany({ where });

  let present = 0;
  let absent = 0;
  let late = 0;
  let halfDay = 0;
  let holiday = 0;
  let totalHours = 0;

  records.forEach((row) => {
    const status = normaliseStatus(row.status);
    if (status === 'present') present += 1;
    else if (status === 'absent') absent += 1;
    else if (status === 'half-day') halfDay += 1;
    else if (status === 'holiday') holiday += 1;
    if (row.isLate) late += 1;
    totalHours += Number(row.hoursWorked) || 0;
  });

  return {
    present,
    absent,
    late,
    halfDay,
    holiday,
    totalHours: Math.round(totalHours * 100) / 100,
    recorded: records.length,
    period: { month: m, year: y }
  };
}

module.exports = {
  computeHoursWorked,
  normalizeDate,
  parseShiftMinutes,
  findAll,
  findById,
  markAttendance,
  clockIn,
  clockOut,
  getSummary,
  parseStaffSelector
};
