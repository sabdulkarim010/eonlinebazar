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
  normalizeAttendanceDate,
  formatAttendanceDateKey,
  getPlatformDayBounds
} = require('../utils/attendanceDate');
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
  return normalizeAttendanceDate(input);
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
    HOLIDAY: 'holiday',
    LEAVE: 'leave'
  };
  return map[status] || (status ? String(status).toLowerCase() : status);
}

function toStatusEnum(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'present') return 'PRESENT';
  if (v === 'late') return 'LATE';
  if (v === 'half-day') return 'HALF_DAY';
  if (v === 'holiday') return 'HOLIDAY';
  if (v === 'leave') return 'LEAVE';
  return 'ABSENT';
}

function formatDateKey(input) {
  return formatAttendanceDateKey(input);
}

function combineDateAndTime(dateNormalized, timeStr) {
  if (!timeStr || !dateNormalized) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr).trim());
  if (!match) return null;

  let d;
  const rawDate = dateNormalized instanceof Date
    ? null
    : String(dateNormalized).trim();
  if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    const [y, mo, day] = rawDate.split('-').map(Number);
    d = new Date(y, mo - 1, day);
  } else {
    d = new Date(dateNormalized);
  }
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return d;
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

  if (filters.staffOr && Array.isArray(filters.staffOr)) {
    where.OR = filters.staffOr;
  } else if (filters.staffId) {
    where.staffId = String(filters.staffId);
  }
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

async function count(filters = {}) {
  const where = {};

  if (filters.staffId) {
    if (filters.staffOr && Array.isArray(filters.staffOr)) {
      where.OR = filters.staffOr;
    } else {
      where.staffId = String(filters.staffId);
    }
  }
  if (filters.status !== undefined) where.status = toStatusEnum(filters.status);

  if (filters.from || filters.to) {
    where.date = {};
    if (filters.from) where.date.gte = normalizeDate(filters.from);
    if (filters.to) where.date.lte = normalizeDate(filters.to);
  } else if (filters.date) {
    const d = normalizeDate(filters.date);
    if (d) where.date = d;
  }

  return prisma.attendance.count({ where });
}

async function countTodayStats() {
  const { start, end, startKey } = getPlatformDayBounds(new Date());
  const dayWhere = { date: { gte: start, lt: end } };
  const [present, absent, late] = await Promise.all([
    prisma.attendance.count({
      where: { ...dayWhere, status: { in: ['PRESENT', 'HALF_DAY'] } }
    }),
    prisma.attendance.count({
      where: { ...dayWhere, status: 'ABSENT' }
    }),
    prisma.attendance.count({
      where: { ...dayWhere, isLate: true }
    })
  ]);
  return { present, absent, late, dateKey: startKey };
}

async function aggregateMonthlySummary(month, year, staffOr = null) {
  const now = new Date();
  const m = Math.min(Math.max(Number(month) || now.getMonth() + 1, 1), 12);
  const y = Number(year) || now.getFullYear();
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 0, 0, 0, 0);

  const where = { date: { gte: start, lte: end } };
  if (staffOr) {
    where.OR = staffOr;
  } else if (staffOr === false) {
    where.staffId = '__no_match__';
  }

  const records = await prisma.attendance.findMany({
    where,
    select: {
      staffId: true,
      staffUsername: true,
      staffType: true,
      adminId: true,
      employeeId: true,
      status: true,
      isLate: true,
      hoursWorked: true
    }
  });

  const grouped = new Map();
  records.forEach((row) => {
    const key = `${row.staffId}::${row.staffUsername || ''}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        staffId: row.staffId,
        staffUsername: row.staffUsername || '',
        staffType: row.staffType,
        adminId: row.adminId,
        employeeId: row.employeeId,
        present: 0,
        absent: 0,
        late: 0,
        halfDay: 0,
        holiday: 0,
        totalHours: 0,
        recorded: 0
      });
    }
    const entry = grouped.get(key);
    const status = normaliseStatus(row.status);
    if (status === 'present') entry.present += 1;
    else if (status === 'absent') entry.absent += 1;
    else if (status === 'half-day') entry.halfDay += 1;
    else if (status === 'holiday') entry.holiday += 1;
    if (row.isLate) entry.late += 1;
    entry.totalHours += Number(row.hoursWorked) || 0;
    entry.recorded += 1;
  });

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      totalHours: Math.round(row.totalHours * 100) / 100
    }))
    .sort((a, b) => (a.staffUsername || '').localeCompare(b.staffUsername || ''));
}

async function findById(id) {
  if (!id) return null;
  const record = await prisma.attendance.findUnique({ where: { id } });
  return toShape(record);
}

async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.attendance.findUnique({
    where: { legacyId: String(legacyId) }
  });
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
  const valid = ['present', 'absent', 'late', 'half-day', 'holiday', 'leave'];
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
    markedBy: String(data.markedBy || 'admin').trim(),
    modifiedBy: String(data.modifiedBy || data.markedBy || 'admin').trim(),
    modifiedAt: data.modifiedAt ? new Date(data.modifiedAt) : new Date(),
    isManualEntry: Boolean(data.isManualEntry)
  };

  if (data.clockIn !== undefined) {
    fields.clockIn = data.clockIn ? new Date(data.clockIn) : null;
  }
  if (data.clockOut !== undefined) {
    fields.clockOut = data.clockOut ? new Date(data.clockOut) : null;
  }
  if (fields.clockIn && fields.clockOut) {
    fields.hoursWorked = computeHoursWorked(fields.clockIn, fields.clockOut);
  }

  if (status === 'late') {
    fields.isLate = true;
    fields.lateMinutes = Number(data.lateMinutes) || 0;
  } else if (status !== 'present') {
    fields.isLate = false;
    fields.lateMinutes = 0;
  }

  if (data.legacyId != null) {
    fields.legacyId = String(data.legacyId);
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
async function clockIn(staffType, staffId, gpsLocation = {}, dateInput, options = {}) {
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

  if (options.legacyId != null) {
    data.legacyId = String(options.legacyId);
  }

  if (record) {
    record = await prisma.attendance.update({ where: { id: record.id }, data });
  } else {
    record = await prisma.attendance.create({ data });
  }

  return toShape(record);
}

// ── clockOut ─────────────────────────────────────────────────────────────────
async function clockOut(staffType, staffId, dateInput, options = {}) {
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

  const updateFields = { clockOut, hoursWorked, status };
  if (options.legacyId != null) {
    updateFields.legacyId = String(options.legacyId);
  }

  const updated = await prisma.attendance.update({
    where: { id: record.id },
    data: updateFields
  });

  return toShape(updated);
}

/** Mirror a saved Mongoose attendance document to Postgres (exact field copy). */
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

  const date = normalizeDate(plain.date);
  if (!date) throw new Error('A valid date is required.');

  const existing = await prisma.attendance.findFirst({
    where: { staffId: subject.staffId, date }
  });

  const data = {
    ...staffFields(subject),
    date,
    clockIn: plain.clockIn ? new Date(plain.clockIn) : null,
    clockOut: plain.clockOut ? new Date(plain.clockOut) : null,
    hoursWorked: plain.hoursWorked != null ? Number(plain.hoursWorked) : 0,
    status: toStatusEnum(plain.status || 'absent'),
    isLate: plain.isLate === true,
    lateMinutes: Number(plain.lateMinutes) || 0,
    shift: toShiftEnum(plain.shift || 'morning'),
    shiftStart: String(plain.shiftStart || '09:00').trim(),
    shiftEnd: String(plain.shiftEnd || '18:00').trim(),
    notes: String(plain.notes || '').trim(),
    markedBy: String(plain.markedBy || 'self').trim(),
    modifiedBy: String(plain.modifiedBy || '').trim(),
    modifiedAt: plain.modifiedAt ? new Date(plain.modifiedAt) : null,
    isManualEntry: plain.isManualEntry === true,
    legacyId: mongoDoc._id != null ? String(mongoDoc._id) : null
  };

  const gps = plain.gpsLocation || {};
  const lat = Number(gps.lat);
  const lng = Number(gps.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    data.gpsLat = lat;
    data.gpsLng = lng;
  }

  let record;
  if (existing) {
    record = await prisma.attendance.update({ where: { id: existing.id }, data });
  } else {
    record = await prisma.attendance.create({ data });
  }

  return toShape(record);
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

async function getDailySheet(dateInput, department = '', page = 1, limit = 10) {
  const date = normalizeDate(dateInput);
  const dateKey = formatDateKey(date);
  if (!date) throw new Error('A valid date is required.');

  const employeeWhere = { status: 'ACTIVE' };
  const dept = String(department || '').trim();
  if (dept && dept.toLowerCase() !== 'all') {
    employeeWhere.department = dept;
  }

  const { getSuperAdminLinkedEmployeeLegacyIds } = require('../utils/superAdminEmployee');
  const excludeLegacyIds = await getSuperAdminLinkedEmployeeLegacyIds();
  if (excludeLegacyIds.length) {
    // legacyId notIn alone drops NULL legacyId rows (SQL three-valued logic).
    employeeWhere.AND = [
      {
        OR: [
          { legacyId: null },
          { legacyId: { notIn: excludeLegacyIds } }
        ]
      },
      { id: { notIn: excludeLegacyIds } }
    ];
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const total = await prisma.employee.count({ where: employeeWhere });
  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    orderBy: { fullName: 'asc' },
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
    select: {
      id: true,
      legacyId: true,
      employeeId: true,
      fullName: true,
      photo: true,
      designation: true,
      department: true
    }
  });

  const attendanceRows = employees.length
    ? await prisma.attendance.findMany({
      where: {
        date,
        OR: [
          { employeeId: { in: employees.map((e) => e.id) } },
          { staffId: { in: employees.map((e) => e.legacyId || e.id) } }
        ]
      }
    })
    : [];

  const byEmployeeId = new Map();
  attendanceRows.forEach((row) => {
    if (row.employeeId) byEmployeeId.set(row.employeeId, row);
    else if (row.staffId) {
      const match = employees.find((e) => e.legacyId === row.staffId || e.id === row.staffId);
      if (match) byEmployeeId.set(match.id, row);
    }
  });

  return {
    date: dateKey,
    employees: employees.map((employee) => {
      const row = byEmployeeId.get(employee.id);
      return {
        employeeId: employee.legacyId || employee.id,
        empId: employee.employeeId,
        name: employee.fullName,
        photo: employee.photo || '',
        designation: employee.designation || '',
        department: employee.department || '',
        attendance: row
          ? {
            status: normaliseStatus(row.status),
            checkIn: row.clockIn,
            checkOut: row.clockOut,
            note: row.notes || ''
          }
          : null
      };
    }),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit))
  };
}

async function bulkMarkAttendance({
  date,
  employeeIds = [],
  status,
  markedBy = 'admin',
  modifiedBy = '',
  isManualEntry = false
}) {
  let success = 0;
  let failed = 0;

  for (const employeeId of employeeIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await markAttendance({
        staffType: 'employee',
        staffId: employeeId,
        date,
        status,
        markedBy,
        modifiedBy: modifiedBy || markedBy,
        isManualEntry
      });
      success += 1;
    } catch {
      failed += 1;
    }
  }

  return { success, failed };
}

async function deleteByStaffAndDate(staffId, dateInput) {
  const date = normalizeDate(dateInput);
  if (!date) {
    const err = new Error('A valid date is required.');
    err.code = 'BAD_DATE';
    throw err;
  }

  const existing = await prisma.attendance.findFirst({
    where: { staffId: String(staffId), date }
  });
  if (!existing) {
    const err = new Error('Attendance record not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  await prisma.attendance.delete({ where: { id: existing.id } });
  return existing;
}

async function listManualEntries(limit = 30) {
  const records = await prisma.attendance.findMany({
    where: { isManualEntry: true },
    orderBy: { modifiedAt: 'desc' },
    take: Math.min(Math.max(Number(limit) || 30, 1), 100),
    include: {
      employee: {
        select: { fullName: true, employeeId: true }
      }
    }
  });

  return records.map((row) => ({
    date: formatDateKey(row.date),
    employeeName: row.employee?.fullName || row.staffUsername || '—',
    empId: row.employee?.employeeId || '',
    status: normaliseStatus(row.status),
    checkIn: row.clockIn,
    checkOut: row.clockOut,
    note: row.notes || '',
    modifiedBy: row.modifiedBy || row.markedBy || '—',
    modifiedAt: row.modifiedAt || row.updatedAt
  }));
}

module.exports = {
  computeHoursWorked,
  normalizeDate,
  formatDateKey,
  combineDateAndTime,
  parseShiftMinutes,
  findAll,
  count,
  countTodayStats,
  aggregateMonthlySummary,
  findById,
  findByLegacyId,
  markAttendance,
  bulkMarkAttendance,
  getDailySheet,
  listManualEntries,
  clockIn,
  clockOut,
  upsertFromMongo,
  deleteByStaffAndDate,
  getSummary,
  parseStaffSelector
};
