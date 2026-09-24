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
const { withNeonRetry } = require('../config/neonRetry');

function isMongoCastError(err) {
  return err && (err.name === 'CastError' || err.name === 'BSONError');
}

async function safeMongoRead(group, mongoReadFn) {
  try {
    return await mongoReadFn();
  } catch (err) {
    if (isMongoCastError(err)) {
      console.warn(
        `[READ-CUTOVER-FALLBACK] ${group} Mongo CastError suppressed:`,
        err.message
      );
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
    try {
      const attempts = Number(process.env.NEON_READ_ROUTER_ATTEMPTS || 4);
      const baseDelayMs = Number(process.env.NEON_READ_ROUTER_BASE_DELAY_MS || 600);
      return await withNeonRetry(() => postgresReadFn(), { attempts, baseDelayMs });
    } catch (err) {
      console.error(
        `[READ-CUTOVER-FALLBACK] ${group} Postgres read failed, falling back to Mongo:`,
        err.message
      );
      if (err.stack) console.error(err.stack);
      return safeMongoRead(group, mongoReadFn);
    }
  }
  return safeMongoRead(group, mongoReadFn);
}

module.exports = { routedRead };
