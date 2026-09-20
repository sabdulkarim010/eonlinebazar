/********************************************************************
 * Project: EonlineBazar
 * File: userSessionRepository.js
 * Location: backend/src/repositories/userSessionRepository.js
 * Description: Prisma repository for UserSession dual-write.
 * Stage 2 Step 3, Part 2.5 — 2026-09-20
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveUserId(mongoRef) {
  if (mongoRef == null || mongoRef === '') return null;
  const ref = String(mongoRef);

  let row = await prisma.user.findUnique({ where: { legacyId: ref } });
  if (row) return row.id;

  if (UUID_PATTERN.test(ref)) {
    row = await prisma.user.findUnique({ where: { id: ref } });
    if (row) return row.id;
  }

  return null;
}

function toShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.legacyId || record.id,
    userId: record.user?.legacyId || record.userId
  };
}

async function upsertUserSessionInPG(mongoDoc) {
  try {
    if (!mongoDoc || !mongoDoc._id) {
      console.error('[DUAL-WRITE-USERSESSION-FAIL] Missing mongoDoc or _id');
      return null;
    }

    const userId = await resolveUserId(mongoDoc.userId);
    if (!userId) {
      console.error('[DUAL-WRITE-USERSESSION-FAIL] User not found in PG', mongoDoc.userId);
      return null;
    }

    const legacyId = String(mongoDoc._id);
    const data = {
      sessionId: String(mongoDoc.sessionId || ''),
      userId,
      userAgent: String(mongoDoc.userAgent || ''),
      device: String(mongoDoc.device || 'Unknown Device'),
      browser: String(mongoDoc.browser || 'Unknown Browser'),
      ipAddress: String(mongoDoc.ipAddress || ''),
      location: String(mongoDoc.location || 'Unknown Location'),
      createdAt: mongoDoc.createdAt ? new Date(mongoDoc.createdAt) : new Date(),
      lastActiveAt: mongoDoc.lastActiveAt ? new Date(mongoDoc.lastActiveAt) : new Date()
    };

    if (!data.sessionId) {
      console.error('[DUAL-WRITE-USERSESSION-FAIL] Missing sessionId', legacyId);
      return null;
    }

    const record = await prisma.userSession.upsert({
      where: { legacyId },
      create: { legacyId, ...data },
      update: data
    });

    return toShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-USERSESSION-FAIL]', err.message, mongoDoc?._id);
    return null;
  }
}

async function getUserSessionByToken(token) {
  try {
    if (!token) return null;

    const record = await prisma.userSession.findUnique({
      where: { sessionId: String(token) }
    });

    return toShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-USERSESSION-FAIL] getByToken:', err.message);
    return null;
  }
}

async function deleteUserSessionInPG(mongoId) {
  try {
    if (!mongoId) return false;

    await prisma.userSession.delete({ where: { legacyId: String(mongoId) } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return true;
    console.error('[DUAL-WRITE-USERSESSION-FAIL] delete:', err.message, mongoId);
    return false;
  }
}

async function deleteUserSessionBySessionIdInPG(sessionId) {
  try {
    if (!sessionId) return false;

    await prisma.userSession.delete({ where: { sessionId: String(sessionId) } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return true;
    console.error('[DUAL-WRITE-USERSESSION-FAIL] deleteBySessionId:', err.message, sessionId);
    return false;
  }
}

async function deleteUserSessionsExceptSessionIdInPG(userMongoId, keepSessionId) {
  try {
    const userId = await resolveUserId(userMongoId);
    if (!userId || !keepSessionId) return 0;

    const result = await prisma.userSession.deleteMany({
      where: {
        userId,
        sessionId: { not: String(keepSessionId) }
      }
    });
    return result.count;
  } catch (err) {
    console.error('[DUAL-WRITE-USERSESSION-FAIL] deleteExceptSessionId:', err.message);
    return 0;
  }
}

async function deleteUserSessionsByUserIdInPG(userMongoId) {
  try {
    const userId = await resolveUserId(userMongoId);
    if (!userId) return 0;

    const result = await prisma.userSession.deleteMany({ where: { userId } });
    return result.count;
  } catch (err) {
    console.error('[DUAL-WRITE-USERSESSION-FAIL] deleteByUserId:', err.message);
    return 0;
  }
}

/** Schema has no expiresAt — treat stale lastActiveAt as expired. */
async function deleteExpiredUserSessionsFromPG(beforeDate = new Date()) {
  try {
    const result = await prisma.userSession.deleteMany({
      where: { lastActiveAt: { lt: beforeDate } }
    });
    return result.count;
  } catch (err) {
    console.error('[DUAL-WRITE-USERSESSION-FAIL] deleteExpired:', err.message);
    return 0;
  }
}

module.exports = {
  upsertUserSessionInPG,
  getUserSessionByToken,
  deleteUserSessionInPG,
  deleteUserSessionBySessionIdInPG,
  deleteUserSessionsByUserIdInPG,
  deleteUserSessionsExceptSessionIdInPG,
  deleteExpiredUserSessionsFromPG
};
