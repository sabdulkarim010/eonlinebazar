/********************************************************************
 * Project: EonlineBazar
 * File: loginAttemptLogger.js
 * Location: backend/src/utils/loginAttemptLogger.js
 * Description: Shared LoginAttempt write path with Postgres dual-write.
 *   Centralizes all create calls (recordLoginAttempt, geo-fence blocks,
 *   blacklist gate, rate-limit handler) in one place.
 *
 *   Stage 2 Step 3, Part 4 — Security/Audit dual-write (2026-09-14).
 ********************************************************************/

const LoginAttempt = require('../models/loginAttempt');
const { dualWrite } = require('../services/dualWriteService');

function getLoginAttemptRepository() {
  return require('../repositories/loginAttemptRepository');
}

function mapMongoLoginAttemptToPostgresWrite(doc) {
  const plain = doc.toObject ? doc.toObject() : doc;
  return {
    username: plain.username,
    ipAddress: plain.ipAddress,
    location: plain.location,
    os: plain.os,
    browser: plain.browser,
    deviceType: plain.deviceType,
    userAgent: plain.userAgent,
    status: plain.status,
    details: plain.details,
    createdAt: plain.createdAt,
    legacyId: String(doc._id)
  };
}

/**
 * Append a login attempt row (Mongo first, Postgres best-effort).
 * Failures are logged and never propagate to callers.
 */
async function persistLoginAttempt(data) {
  try {
    await dualWrite(
      () => LoginAttempt.create(data),
      async (saved) => {
        await getLoginAttemptRepository().create(mapMongoLoginAttemptToPostgresWrite(saved));
      },
      {
        model: 'LoginAttempt',
        operation: 'create',
        mongoId: (saved) => String(saved._id)
      }
    );
  } catch (err) {
    console.error('Login attempt write failed:', err.message);
  }
}

module.exports = { persistLoginAttempt };
