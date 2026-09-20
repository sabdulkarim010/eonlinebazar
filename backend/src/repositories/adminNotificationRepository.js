/********************************************************************
 * Project: EonlineBazar
 * File: adminNotificationRepository.js
 * Location: backend/src/repositories/adminNotificationRepository.js
 * Description: Prisma repository for AdminNotification dual-write.
 * Stage 2 Step 3, Part 2.5 — 2026-09-20
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toNotificationTypeEnum(value) {
  const map = {
    order: 'ORDER',
    stock: 'STOCK',
    leave: 'LEAVE',
    payroll: 'PAYROLL',
    security: 'SECURITY',
    system: 'SYSTEM'
  };
  return map[String(value || 'system').toLowerCase()] || 'SYSTEM';
}

function fromNotificationTypeEnum(value) {
  return String(value || 'SYSTEM').toLowerCase();
}

async function resolveAdminId(recipientId) {
  if (!recipientId || recipientId === 'all') return null;
  const ref = String(recipientId);

  let row = await prisma.admin.findUnique({ where: { legacyId: ref } });
  if (row) return row.id;

  if (UUID_PATTERN.test(ref)) {
    row = await prisma.admin.findUnique({ where: { id: ref } });
    if (row) return row.id;
  }

  return null;
}

function toShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.legacyId || record.id,
    type: fromNotificationTypeEnum(record.type)
  };
}

async function upsertAdminNotificationInPG(mongoDoc) {
  try {
    if (!mongoDoc || !mongoDoc._id) {
      console.error('[DUAL-WRITE-ADMINNOTIFICATION-FAIL] Missing mongoDoc or _id');
      return null;
    }

    const legacyId = String(mongoDoc._id);
    const recipientId = String(mongoDoc.recipientId || '');
    const adminId = await resolveAdminId(recipientId);

    const data = {
      recipientId,
      adminId,
      type: toNotificationTypeEnum(mongoDoc.type),
      title: String(mongoDoc.title || '').trim(),
      message: String(mongoDoc.message || '').trim(),
      link: String(mongoDoc.link || '').trim(),
      isRead: Boolean(mongoDoc.isRead),
      createdAt: mongoDoc.createdAt ? new Date(mongoDoc.createdAt) : new Date()
    };

    const record = await prisma.adminNotification.upsert({
      where: { legacyId },
      create: { legacyId, ...data },
      update: data
    });

    return toShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-ADMINNOTIFICATION-FAIL]', err.message, mongoDoc?._id);
    return null;
  }
}

async function listAdminNotificationsFromPG(filters = {}) {
  try {
    const where = {};

    if (filters.recipientId) {
      where.recipientId = { in: [String(filters.recipientId), 'all'] };
    }

    if (filters.isRead !== undefined) {
      where.isRead = Boolean(filters.isRead);
    }

    const records = await prisma.adminNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    return records.map(toShape);
  } catch (err) {
    console.error('[DUAL-WRITE-ADMINNOTIFICATION-FAIL] list:', err.message);
    return [];
  }
}

async function markAdminNotificationReadInPG(mongoId) {
  try {
    if (!mongoId) return null;

    await prisma.adminNotification.update({
      where: { legacyId: String(mongoId) },
      data: { isRead: true }
    });

    const record = await prisma.adminNotification.findUnique({
      where: { legacyId: String(mongoId) }
    });

    return toShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-ADMINNOTIFICATION-FAIL] markRead:', err.message, mongoId);
    return null;
  }
}

async function markAllAdminNotificationsReadInPG(recipientId) {
  try {
    if (!recipientId) return 0;

    const result = await prisma.adminNotification.updateMany({
      where: {
        recipientId: { in: [String(recipientId), 'all'] },
        isRead: false
      },
      data: { isRead: true }
    });

    return result.count;
  } catch (err) {
    console.error('[DUAL-WRITE-ADMINNOTIFICATION-FAIL] markAllRead:', err.message);
    return 0;
  }
}

async function deleteAdminNotificationInPG(mongoId) {
  try {
    if (!mongoId) return false;

    await prisma.adminNotification.delete({ where: { legacyId: String(mongoId) } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return true;
    console.error('[DUAL-WRITE-ADMINNOTIFICATION-FAIL] delete:', err.message, mongoId);
    return false;
  }
}

module.exports = {
  upsertAdminNotificationInPG,
  listAdminNotificationsFromPG,
  markAdminNotificationReadInPG,
  markAllAdminNotificationsReadInPG,
  deleteAdminNotificationInPG
};
