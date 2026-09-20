/********************************************************************
 * Project: EonlineBazar
 * File: attendanceLockRepository.js
 * Description: Prisma repository for AttendanceLock (Neon/PostgreSQL).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

function toShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.id
  };
}

function formatDateKey(input) {
  const raw = String(input || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const d = input ? new Date(input) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isFutureDateKey(dateKey) {
  const todayKey = formatDateKey(new Date());
  return String(dateKey) > String(todayKey);
}

async function getLockStatus(date) {
  const dateKey = formatDateKey(date);
  if (!dateKey) return null;

  const record = await prisma.attendanceLock.findUnique({ where: { date: dateKey } });
  if (!record) return null;

  return {
    isLocked: true,
    date: record.date,
    lockedAt: record.lockedAt,
    lockedBy: record.lockedBy,
    lockedByName: record.lockedByName
  };
}

async function isDateLocked(date) {
  const status = await getLockStatus(date);
  return Boolean(status?.isLocked);
}

async function lockDate(date, adminId, adminName) {
  const dateKey = formatDateKey(date);
  if (!dateKey) throw new Error('A valid date is required.');
  if (isFutureDateKey(dateKey)) {
    const err = new Error('Future dates cannot be locked.');
    err.code = 'FUTURE_DATE';
    throw err;
  }

  const record = await prisma.attendanceLock.upsert({
    where: { date: dateKey },
    create: {
      date: dateKey,
      lockedBy: String(adminId || ''),
      lockedByName: String(adminName || ''),
      lockedAt: new Date()
    },
    update: {
      lockedBy: String(adminId || ''),
      lockedByName: String(adminName || ''),
      lockedAt: new Date()
    }
  });

  return toShape(record);
}

async function unlockDate(date) {
  const dateKey = formatDateKey(date);
  if (!dateKey) throw new Error('A valid date is required.');

  const existing = await prisma.attendanceLock.findUnique({ where: { date: dateKey } });
  if (!existing) {
    const err = new Error('Date is not locked.');
    err.code = 'NOT_LOCKED';
    throw err;
  }

  await prisma.attendanceLock.delete({ where: { date: dateKey } });
  return { deleted: true, date: dateKey };
}

async function upsertFromMongo(mongoDoc) {
  const plain = mongoDoc.toObject ? mongoDoc.toObject() : mongoDoc;
  const dateKey = String(plain.date || '').trim();
  if (!dateKey) throw new Error('Lock date is required.');

  const record = await prisma.attendanceLock.upsert({
    where: { date: dateKey },
    create: {
      legacyId: mongoDoc._id != null ? String(mongoDoc._id) : null,
      date: dateKey,
      lockedBy: String(plain.lockedBy || ''),
      lockedByName: String(plain.lockedByName || ''),
      lockedAt: plain.lockedAt ? new Date(plain.lockedAt) : new Date()
    },
    update: {
      lockedBy: String(plain.lockedBy || ''),
      lockedByName: String(plain.lockedByName || ''),
      lockedAt: plain.lockedAt ? new Date(plain.lockedAt) : new Date()
    }
  });

  return toShape(record);
}

async function removeByLegacyId(legacyId) {
  const existing = await prisma.attendanceLock.findUnique({
    where: { legacyId: String(legacyId) }
  });
  if (!existing) {
    const err = new Error('Lock record not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await prisma.attendanceLock.delete({ where: { id: existing.id } });
  return { deleted: true, date: existing.date };
}

module.exports = {
  formatDateKey,
  isFutureDateKey,
  getLockStatus,
  isDateLocked,
  lockDate,
  unlockDate,
  upsertFromMongo,
  removeByLegacyId
};
