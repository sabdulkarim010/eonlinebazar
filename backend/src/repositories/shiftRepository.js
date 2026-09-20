/********************************************************************
 * Project: EonlineBazar — HRM
 * File: shiftRepository.js
 * Location: backend/src/repositories/shiftRepository.js
 * Description: Prisma repository for Shift + ShiftAssignment dual-write.
 * Stage 2 Step 3, Part 2.5 — 2026-09-20
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

function toShape(record) {
  if (!record) return null;
  const assignedStaff = (record.assignedStaff || []).map((a) => a.staffUsername);
  return {
    ...record,
    _id: record.legacyId || record.id,
    assignedStaff
  };
}

async function syncShiftAssignments(shiftId, staffUsernames) {
  await prisma.shiftAssignment.deleteMany({ where: { shiftId } });

  const usernames = [...new Set((staffUsernames || []).map((u) => String(u || '').trim()).filter(Boolean))];
  if (!usernames.length) return;

  await prisma.shiftAssignment.createMany({
    data: usernames.map((staffUsername) => ({ shiftId, staffUsername })),
    skipDuplicates: true
  });
}

async function upsertShiftInPG(mongoDoc) {
  try {
    if (!mongoDoc || !mongoDoc._id) {
      console.error('[DUAL-WRITE-SHIFT-FAIL] Missing mongoDoc or _id');
      return null;
    }

    const legacyId = String(mongoDoc._id);
    const data = {
      name: String(mongoDoc.name || '').trim(),
      startTime: String(mongoDoc.startTime || '09:00').trim(),
      endTime: String(mongoDoc.endTime || '18:00').trim(),
      gracePeriodMinutes: Number(mongoDoc.gracePeriodMinutes) || 15,
      isDefault: Boolean(mongoDoc.isDefault),
      createdBy: String(mongoDoc.createdBy || '').trim()
    };

    const record = await prisma.shift.upsert({
      where: { legacyId },
      create: { legacyId, ...data },
      update: data
    });

    await syncShiftAssignments(record.id, mongoDoc.assignedStaff);

    const withAssignments = await prisma.shift.findUnique({
      where: { id: record.id },
      include: { assignedStaff: true }
    });

    return toShape(withAssignments);
  } catch (err) {
    console.error('[DUAL-WRITE-SHIFT-FAIL]', err.message, mongoDoc?._id);
    return null;
  }
}

async function getShiftByMongoId(mongoId) {
  try {
    if (!mongoId) return null;

    const record = await prisma.shift.findUnique({
      where: { legacyId: String(mongoId) },
      include: { assignedStaff: true }
    });

    return toShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-SHIFT-FAIL] getByMongoId:', err.message);
    return null;
  }
}

async function listShiftsFromPG(filters = {}) {
  try {
    const where = {};
    if (filters.isDefault !== undefined) {
      where.isDefault = Boolean(filters.isDefault);
    }

    const records = await prisma.shift.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { startTime: 'asc' }],
      include: { assignedStaff: true }
    });

    return records.map(toShape);
  } catch (err) {
    console.error('[DUAL-WRITE-SHIFT-FAIL] list:', err.message);
    return [];
  }
}

async function deleteShiftInPG(mongoId) {
  try {
    if (!mongoId) return false;

    await prisma.shift.delete({ where: { legacyId: String(mongoId) } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return true;
    console.error('[DUAL-WRITE-SHIFT-FAIL] delete:', err.message, mongoId);
    return false;
  }
}

module.exports = {
  upsertShiftInPG,
  getShiftByMongoId,
  listShiftsFromPG,
  deleteShiftInPG
};
