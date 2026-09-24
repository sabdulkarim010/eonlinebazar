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

const HEARTBEAT_MIN_INTERVAL_MS = Number(process.env.ADMIN_SESSION_PG_HEARTBEAT_MS || 60_000);
const lastHeartbeatBySessionId = new Map();

function shouldSkipHeartbeat(sessionId) {
  const key = String(sessionId || '').trim();
  if (!key) return false;
  const now = Date.now();
  const last = lastHeartbeatBySessionId.get(key) || 0;
  if (now - last < HEARTBEAT_MIN_INTERVAL_MS) return true;
  lastHeartbeatBySessionId.set(key, now);
  return false;
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
    const msg = err?.message || String(err);
    console.error('[DUAL-WRITE-ADMINSESSION-FAIL]', msg, mongoDoc?._id);
    return null;
  }
}

/**
 * Non-blocking PG mirror — never delays auth or request handlers.
 * Heartbeats are throttled (default 60s) to avoid Neon HTTP timeout storms.
 */
function mirrorAdminSessionBestEffort(mongoDoc, context = 'sync') {
  if (!mongoDoc) return;

  const isHeartbeat = context === 'heartbeat';
  if (isHeartbeat && shouldSkipHeartbeat(mongoDoc.sessionId)) {
    return;
  }

  void upsertAdminSessionInPG(mongoDoc).catch((err) => {
    const msg = err?.message || String(err);
    console.error(`[DUAL-WRITE-ADMINSESSION-FAIL] ${context}:`, msg, mongoDoc?._id);
  });
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
  mirrorAdminSessionBestEffort,
  getAdminSessionByToken,
  deleteAdminSessionInPG,
  deleteAdminSessionBySessionIdInPG,
  deleteAdminSessionsByUsernameInPG,
  deleteAdminSessionsExceptSessionIdInPG,
  deleteExpiredAdminSessionsFromPG
};
