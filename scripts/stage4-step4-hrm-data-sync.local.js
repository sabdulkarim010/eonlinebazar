#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 4 — Postgres-only HRM data sync (local run, not committed).
 * Mongo read-only. Syncs employee timestamps, linkedAdminId, mongoVersion,
 * document uploadedAt, and missing attendance rows.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const prisma = require('../backend/src/config/prismaClient');
const { upsertFromMongo } = require('../backend/src/repositories/attendanceRepository');
const { resolvePostgresAdminId } = require('../backend/src/utils/hrmDualWriteHelpers');
const {
  create: createAdmin,
  mapMongoDocToWriteInput
} = require('../backend/src/repositories/adminRepository');

function toDate(value) {
  if (value == null) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toGenderEnum(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'male') return 'MALE';
  if (v === 'female') return 'FEMALE';
  if (v === 'other') return 'OTHER';
  return null;
}

function toBloodGroupEnum(value) {
  const map = {
    'A+': 'A_POSITIVE',
    'A-': 'A_NEGATIVE',
    'B+': 'B_POSITIVE',
    'B-': 'B_NEGATIVE',
    'O+': 'O_POSITIVE',
    'O-': 'O_NEGATIVE',
    'AB+': 'AB_POSITIVE',
    'AB-': 'AB_NEGATIVE'
  };
  return map[String(value || '').trim()] || null;
}

function toMaritalStatusEnum(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'single') return 'SINGLE';
  if (v === 'married') return 'MARRIED';
  if (v === 'divorced') return 'DIVORCED';
  if (v === 'widowed') return 'WIDOWED';
  return null;
}

async function syncEmployees(Employee) {
  const mongoRows = await Employee.find().lean();
  const changes = {
    timestamps: [],
    linkedAdmin: [],
    mongoVersion: [],
    documents: [],
    unchanged: 0
  };

  for (const m of mongoRows) {
    const legacyId = String(m._id);
    const pg = await prisma.employee.findUnique({ where: { legacyId } });
    if (!pg) throw new Error(`Employee PG row missing for legacyId ${legacyId} (${m.employeeId})`);

    const data = {};
    const mongoCreated = toDate(m.createdAt);
    const mongoUpdated = toDate(m.updatedAt);
    if (mongoCreated && pg.createdAt?.getTime() !== mongoCreated.getTime()) {
      data.createdAt = mongoCreated;
    }
    if (mongoUpdated && pg.updatedAt?.getTime() !== mongoUpdated.getTime()) {
      data.updatedAt = mongoUpdated;
    }

    const mongoVersion = Number.isFinite(Number(m.__v)) ? Number(m.__v) : 0;
    if (pg.mongoVersion !== mongoVersion) {
      data.mongoVersion = mongoVersion;
    }

    let pgAdminId = null;
    if (m.linkedAdminId) {
      pgAdminId = await resolvePostgresAdminId(m.linkedAdminId);
      if (!pgAdminId) {
        throw new Error(`Admin PG row missing for linkedAdminId ${m.linkedAdminId} (employee ${m.employeeId})`);
      }
    }
    if (pg.linkedAdminId !== pgAdminId) {
      data.linkedAdminId = pgAdminId;
    }

    const gender = toGenderEnum(m.gender);
    if (pg.gender !== gender) data.gender = gender;

    const bloodGroup = toBloodGroupEnum(m.bloodGroup);
    if (pg.bloodGroup !== bloodGroup) data.bloodGroup = bloodGroup;

    const maritalStatus = toMaritalStatusEnum(m.maritalStatus);
    if (pg.maritalStatus !== maritalStatus) data.maritalStatus = maritalStatus;

    const shift = String(m.shift || '').trim();
    if (pg.shift !== shift) data.shift = shift;

    if (Object.keys(data).length) {
      if (!data.updatedAt && mongoUpdated) data.updatedAt = mongoUpdated;
      await prisma.employee.update({ where: { id: pg.id }, data });
      if (data.createdAt || data.updatedAt) {
        changes.timestamps.push({ employeeId: m.employeeId, legacyId, ...data });
      }
      if (data.linkedAdminId !== undefined) {
        changes.linkedAdmin.push({ employeeId: m.employeeId, legacyId, linkedAdminId: data.linkedAdminId });
      }
      if (data.mongoVersion !== undefined) {
        changes.mongoVersion.push({ employeeId: m.employeeId, legacyId, mongoVersion: data.mongoVersion });
      }
    } else {
      changes.unchanged += 1;
    }

    const mongoDocs = m.documents || [];
    for (const doc of mongoDocs) {
      const docLegacyId = doc._id != null ? String(doc._id) : null;
      if (!docLegacyId) continue;

      const pgDoc = await prisma.employeeDocument.findUnique({ where: { legacyId: docLegacyId } });
      if (!pgDoc) continue;

      const uploadedAt = toDate(doc.uploadedAt);
      if (uploadedAt && pgDoc.uploadedAt?.getTime() !== uploadedAt.getTime()) {
        await prisma.employeeDocument.update({
          where: { id: pgDoc.id },
          data: { uploadedAt }
        });
        changes.documents.push({ employeeId: m.employeeId, docLegacyId, uploadedAt: uploadedAt.toISOString() });
      }
    }
  }

  return { total: mongoRows.length, ...changes };
}

async function ensureAdminFromMongo(Admin, mongoStaffId, staffUsername) {
  const legacyId = String(mongoStaffId || '').trim();
  if (!legacyId) return null;

  const existing = await prisma.admin.findFirst({
    where: {
      OR: [
        { legacyId },
        ...(staffUsername ? [{ username: String(staffUsername).trim().toLowerCase() }] : [])
      ]
    }
  });
  if (existing) return existing;

  const mongoAdmin = await Admin.findById(legacyId);
  if (!mongoAdmin) return null;

  const plain = mongoAdmin.toObject ? mongoAdmin.toObject() : mongoAdmin;
  const created = await createAdmin({
    ...mapMongoDocToWriteInput(mongoAdmin, { includeSecrets: true }),
    password: plain.password,
    createdAt: toDate(plain.createdAt),
    updatedAt: toDate(plain.updatedAt)
  });

  return prisma.admin.findUnique({ where: { id: created.id } });
}

function toStatusEnum(status) {
  const map = {
    present: 'PRESENT',
    absent: 'ABSENT',
    late: 'LATE',
    'half-day': 'HALF_DAY',
    holiday: 'HOLIDAY'
  };
  return map[String(status || '').toLowerCase()] || 'ABSENT';
}

function toShiftEnum(shift) {
  const map = { morning: 'MORNING', evening: 'EVENING', night: 'NIGHT' };
  return map[String(shift || '').toLowerCase()] || 'MORNING';
}

function normalizeDate(input) {
  const d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Insert attendance when staff FK cannot be resolved (orphan Mongo staffId). */
async function upsertOrphanAttendanceFromMongo(m) {
  const legacyId = String(m._id);
  const existing = await prisma.attendance.findUnique({ where: { legacyId } });
  if (existing) return existing;

  const date = normalizeDate(m.date);
  if (!date) throw new Error(`Invalid date for attendance ${legacyId}`);

  const gps = m.gpsLocation || {};
  const lat = Number(gps.lat);
  const lng = Number(gps.lng);
  const data = {
    legacyId,
    staffId: String(m.staffId),
    staffType: String(m.staffType || 'admin').toLowerCase() === 'employee' ? 'EMPLOYEE' : 'ADMIN',
    staffUsername: String(m.staffUsername || '').trim(),
    adminId: null,
    employeeId: null,
    date,
    clockIn: m.clockIn ? new Date(m.clockIn) : null,
    clockOut: m.clockOut ? new Date(m.clockOut) : null,
    hoursWorked: m.hoursWorked != null ? Number(m.hoursWorked) : 0,
    status: toStatusEnum(m.status || 'absent'),
    isLate: m.isLate === true,
    lateMinutes: Number(m.lateMinutes) || 0,
    shift: toShiftEnum(m.shift || 'morning'),
    shiftStart: String(m.shiftStart || '09:00').trim(),
    shiftEnd: String(m.shiftEnd || '18:00').trim(),
    notes: String(m.notes || '').trim(),
    markedBy: String(m.markedBy || 'self').trim(),
    createdAt: toDate(m.createdAt),
    updatedAt: toDate(m.updatedAt)
  };
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    data.gpsLat = lat;
    data.gpsLng = lng;
  }

  return prisma.attendance.create({ data });
}

async function syncMissingAttendance(Attendance, Admin) {
  const mongoRows = await Attendance.find().sort({ date: 1 }).lean();
  const synced = [];
  const skipped = [];
  const failed = [];

  for (const m of mongoRows) {
    const legacyId = String(m._id);
    const existing = await prisma.attendance.findUnique({ where: { legacyId } });
    if (existing) {
      skipped.push(legacyId);
      continue;
    }

    try {
      if ((m.staffType || 'admin') === 'admin') {
        await ensureAdminFromMongo(Admin, m.staffId, m.staffUsername);
      }
      await upsertFromMongo(m);
      synced.push({
        legacyId,
        staffUsername: m.staffUsername,
        staffType: m.staffType,
        date: toDate(m.date)?.toISOString()
      });
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        await upsertOrphanAttendanceFromMongo(m);
        synced.push({
          legacyId,
          staffUsername: m.staffUsername,
          staffType: m.staffType,
          date: toDate(m.date)?.toISOString(),
          orphanStaff: true
        });
        continue;
      }
      failed.push({
        legacyId,
        staffUsername: m.staffUsername,
        staffType: m.staffType,
        staffId: m.staffId,
        date: toDate(m.date)?.toISOString(),
        error: err.message,
        code: err.code
      });
    }
  }

  if (failed.length) {
    throw new Error(`Attendance sync failed for ${failed.length} row(s): ${JSON.stringify(failed, null, 2)}`);
  }

  return { mongoTotal: mongoRows.length, synced: synced.length, syncedRows: synced, skippedExisting: skipped.length };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const Employee = require('../backend/src/models/employee');
  const Attendance = require('../backend/src/models/attendance');
  const Admin = require('../backend/src/models/admin');

  console.log('=== Stage 4 Step 4 — HRM Postgres Data Sync ===\n');

  const employeeResult = await syncEmployees(Employee);
  console.log('Employee sync:', JSON.stringify(employeeResult, null, 2));

  const attendanceResult = await syncMissingAttendance(Attendance, Admin);
  console.log('\nAttendance sync:', JSON.stringify(attendanceResult, null, 2));

  await mongoose.disconnect();
  await prisma.$disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
