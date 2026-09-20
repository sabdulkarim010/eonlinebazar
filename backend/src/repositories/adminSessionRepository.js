/********************************************************************
 * Project: EonlineBazar
 * File: adminSessionRepository.js
 * Location: backend/src/repositories/adminSessionRepository.js
 * Description: Prisma repository for AdminSession dual-write.
 * Stage 2 Step 3, Part 2.5 — 2026-09-20
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

function toAdminSessionStatusEnum(value) {
  return String(value || 'active').toLowerCase() === 'revoked' ? 'REVOKED' : 'ACTIVE';
}

function fromAdminSessionStatusEnum(value) {
  return String(value || 'ACTIVE').toLowerCase();
}

async function resolveAdminIdByUsername(username) {
  if (!username) return null;
  const row = await prisma.admin.findUnique({ where: { username: String(username) } });
  return row?.id || null;
}

function toShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.legacyId || record.id,
    status: fromAdminSessionStatusEnum(record.status)
  };
}

async function upsertAdminSessionInPG(mongoDoc) {
  try {
    if (!mongoDoc || !mongoDoc._id) {
      console.error('[DUAL-WRITE-ADMINSESSION-FAIL] Missing mongoDoc or _id');
      return null;
    }

    const legacyId = String(mongoDoc._id);
    const adminUsername = String(mongoDoc.adminUsername || '').trim();
    const adminId = await resolveAdminIdByUsername(adminUsername);

    const data = {
      sessionId: String(mongoDoc.sessionId || ''),
      adminUsername,
      adminId,
      ipAddress: String(mongoDoc.ipAddress || 'Unknown'),
      location: String(mongoDoc.location || 'Unknown Location'),
      os: String(mongoDoc.os || 'Unknown OS'),
      browser: String(mongoDoc.browser || 'Unknown Browser'),
      deviceType: String(mongoDoc.deviceType || 'Desktop'),
      device: String(mongoDoc.device || 'Unknown Device'),
      userAgent: String(mongoDoc.userAgent || ''),
      status: toAdminSessionStatusEnum(mongoDoc.status),
      lastActive: mongoDoc.lastActive ? new Date(mongoDoc.lastActive) : new Date()
    };

    if (!data.sessionId) {
      console.error('[DUAL-WRITE-ADMINSESSION-FAIL] Missing sessionId', legacyId);
      return null;
    }

    const record = await prisma.adminSession.upsert({
      where: { legacyId },
      create: { legacyId, ...data },
      update: data
    });

    return toShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-ADMINSESSION-FAIL]', err.message, mongoDoc?._id);
    return null;
  }
}

async function getAdminSessionByToken(token) {
  try {
    if (!token) return null;

    const record = await prisma.adminSession.findUnique({
      where: { sessionId: String(token) }
    });

    return toShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-ADMINSESSION-FAIL] getByToken:', err.message);
    return null;
  }
}

async function deleteAdminSessionInPG(mongoId) {
  try {
    if (!mongoId) return false;

    await prisma.adminSession.delete({ where: { legacyId: String(mongoId) } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return true;
    console.error('[DUAL-WRITE-ADMINSESSION-FAIL] delete:', err.message, mongoId);
    return false;
  }
}

async function deleteAdminSessionBySessionIdInPG(sessionId) {
  try {
    if (!sessionId) return false;

    await prisma.adminSession.delete({ where: { sessionId: String(sessionId) } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return true;
    console.error('[DUAL-WRITE-ADMINSESSION-FAIL] deleteBySessionId:', err.message, sessionId);
    return false;
  }
}

async function deleteAdminSessionsExceptSessionIdInPG(adminUsername, keepSessionId) {
  try {
    if (!adminUsername || !keepSessionId) return 0;

    const result = await prisma.adminSession.deleteMany({
      where: {
        adminUsername: String(adminUsername),
        sessionId: { not: String(keepSessionId) }
      }
    });
    return result.count;
  } catch (err) {
    console.error('[DUAL-WRITE-ADMINSESSION-FAIL] deleteExceptSessionId:', err.message);
    return 0;
  }
}

async function deleteAdminSessionsByUsernameInPG(adminUsername) {
  try {
    if (!adminUsername) return 0;

    const result = await prisma.adminSession.deleteMany({
      where: { adminUsername: String(adminUsername) }
    });
    return result.count;
  } catch (err) {
    console.error('[DUAL-WRITE-ADMINSESSION-FAIL] deleteByUsername:', err.message);
    return 0;
  }
}

/** Schema has no expiresAt — treat stale lastActive as expired. */
async function deleteExpiredAdminSessionsFromPG(beforeDate = new Date()) {
  try {
    const result = await prisma.adminSession.deleteMany({
      where: { lastActive: { lt: beforeDate } }
    });
    return result.count;
  } catch (err) {
    console.error('[DUAL-WRITE-ADMINSESSION-FAIL] deleteExpired:', err.message);
    return 0;
  }
}

module.exports = {
  upsertAdminSessionInPG,
  getAdminSessionByToken,
  deleteAdminSessionInPG,
  deleteAdminSessionBySessionIdInPG,
  deleteAdminSessionsByUsernameInPG,
  deleteAdminSessionsExceptSessionIdInPG,
  deleteExpiredAdminSessionsFromPG
};
