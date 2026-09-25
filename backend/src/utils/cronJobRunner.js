/********************************************************************
 * Project: EonlineBazar
 * File: cronJobRunner.js
 * Location: backend/src/utils/cronJobRunner.js
 * Description: Shared wrapper for node-cron jobs — Postgres readiness,
 *   structured logging, and visible failure output for background tasks.
 ********************************************************************/

'use strict';

const { ensurePostgresReady } = require('../config/postgresBootstrap');

/**
 * Run a scheduled background job with Postgres bootstrap parity to manual scripts.
 *
 * @param {string} jobName
 * @param {() => Promise<any>} fn
 * @param {{ requirePostgres?: boolean }} [options]
 */
async function runCronJob(jobName, fn, options = {}) {
  const startedAt = new Date().toISOString();
  console.log(`[CRON-START] ${jobName} at ${startedAt}`);

  try {
    if (options.requirePostgres !== false) {
      await ensurePostgresReady();
    }
    const result = await fn();
    console.log(`[CRON-DONE] ${jobName} at ${new Date().toISOString()}`);
    return result;
  } catch (err) {
    console.error(`[CRON-FAIL] ${jobName}: ${err && err.message ? err.message : String(err)}`);
    if (err && err.stack) {
      console.error(err.stack);
    }
    throw err;
  }
}

/**
 * node-cron callback adapter — always returns void; errors are logged here.
 *
 * @param {string} jobName
 * @param {() => Promise<any>} fn
 * @param {{ requirePostgres?: boolean }} [options]
 */
function scheduleCronHandler(jobName, fn, options = {}) {
  return () => {
    runCronJob(jobName, fn, options).catch((err) => {
      console.error(`[CRON-FAIL] ${jobName} (unhandled): ${err && err.message ? err.message : String(err)}`);
    });
  };
}

module.exports = {
  runCronJob,
  scheduleCronHandler
};
