/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: readRouter.js
 * Location: backend/src/services/readRouter.js
 * Description: Routes read operations to MongoDB or PostgreSQL based on
 *   read-cutover feature flags. When Postgres is enabled but fails, falls
 *   back to Mongo automatically so callers never see a broken read path.
 ********************************************************************/

'use strict';

const { isPgReadEnabled } = require('../config/readCutoverFlags');
const {
  withNeonRetry,
  isNeonTimeoutError,
  logPgFallback
} = require('../config/neonRetry');
const {
  shouldBypassPg,
  recordPgSuccess,
  recordPgTimeout,
  recordPgNonTimeoutFailure
} = require('../config/pgCircuitBreaker');

function isMongoCastError(err) {
  return err && (err.name === 'CastError' || err.name === 'BSONError');
}

async function safeMongoRead(group, mongoReadFn) {
  try {
    return await mongoReadFn();
  } catch (err) {
    if (isMongoCastError(err)) {
      console.warn(`[PG-FALLBACK] ${group} mongo cast suppressed -> served via Mongo`);
      return null;
    }
    throw err;
  }
}

/**
 * Execute a read from Postgres when the group flag is ON, otherwise Mongo.
 * On Postgres failure, log and fall back to Mongo (never throw to caller).
 *
 * @param {string} group - cutover group key (category, brand, …)
 * @param {() => Promise<any>} mongoReadFn
 * @param {() => Promise<any>} postgresReadFn
 * @returns {Promise<any>}
 */
async function routedRead(group, mongoReadFn, postgresReadFn) {
  if (isPgReadEnabled(group)) {
    if (shouldBypassPg()) {
      console.warn(`[PG-FALLBACK] ${group} circuit open -> served via Mongo`);
      return safeMongoRead(group, mongoReadFn);
    }

    try {
      const attempts = Number(process.env.NEON_READ_ROUTER_ATTEMPTS || 1);
      const baseDelayMs = Number(process.env.NEON_READ_ROUTER_BASE_DELAY_MS || 0);
      const result = await withNeonRetry(() => postgresReadFn(), { attempts, baseDelayMs });
      recordPgSuccess();
      return result;
    } catch (err) {
      if (isNeonTimeoutError(err)) {
        recordPgTimeout();
      } else {
        recordPgNonTimeoutFailure();
      }
      logPgFallback(group, err);
      return safeMongoRead(group, mongoReadFn);
    }
  }
  return safeMongoRead(group, mongoReadFn);
}

module.exports = { routedRead };
