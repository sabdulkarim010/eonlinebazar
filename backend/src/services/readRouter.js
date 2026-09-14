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
      return await postgresReadFn();
    } catch (err) {
      console.error(
        `[READ-CUTOVER-FALLBACK] ${group} Postgres read failed, falling back to Mongo:`,
        err.message
      );
      return mongoReadFn();
    }
  }
  return mongoReadFn();
}

module.exports = { routedRead };
