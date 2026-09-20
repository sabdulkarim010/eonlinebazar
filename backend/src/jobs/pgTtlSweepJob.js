/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 2
 * File: pgTtlSweepJob.js
 * Location: backend/src/jobs/pgTtlSweepJob.js
 * Description: Daily PostgreSQL TTL sweep — login attempts (30d),
 *   expired IP bans, stale user/admin sessions.
 * Stage 2 Step 3, Part 2.6 — 2026-09-20
 ********************************************************************/

const cron = require('node-cron');
const { scheduleCronHandler } = require('../utils/cronJobRunner');
const { deleteExpiredLoginAttemptsFromPG } = require('../repositories/loginAttemptRepository');
const { deleteExpiredBlacklistedIpsFromPG } = require('../repositories/blacklistedIpRepository');
const { deleteExpiredUserSessionsFromPG } = require('../repositories/userSessionRepository');
const { deleteExpiredAdminSessionsFromPG } = require('../repositories/adminSessionRepository');

// Every day at 02:00 AM server time
const DEFAULT_CRON = '0 2 * * *';

async function runPgTtlSweep() {
  try {
    console.log('[PG-TTL-SWEEP] Starting daily TTL sweep...');

    const loginAttemptsDeleted = await deleteExpiredLoginAttemptsFromPG();
    console.log(`[PG-TTL-SWEEP] Deleted ${loginAttemptsDeleted} expired login attempts`);

    const blacklistedIpsDeleted = await deleteExpiredBlacklistedIpsFromPG();
    console.log(`[PG-TTL-SWEEP] Deleted ${blacklistedIpsDeleted} expired blacklisted IPs`);

    const userSessionsDeleted = await deleteExpiredUserSessionsFromPG();
    console.log(`[PG-TTL-SWEEP] Deleted ${userSessionsDeleted} expired user sessions`);

    const adminSessionsDeleted = await deleteExpiredAdminSessionsFromPG();
    console.log(`[PG-TTL-SWEEP] Deleted ${adminSessionsDeleted} expired admin sessions`);

    const totalDeleted = loginAttemptsDeleted + blacklistedIpsDeleted
      + userSessionsDeleted + adminSessionsDeleted;

    console.log(`[PG-TTL-SWEEP] Complete — total deleted: ${totalDeleted}`);

    return {
      loginAttemptsDeleted,
      blacklistedIpsDeleted,
      userSessionsDeleted,
      adminSessionsDeleted,
      totalDeleted
    };
  } catch (err) {
    console.error('[PG-TTL-SWEEP] Fatal error:', err.message);
    return {
      loginAttemptsDeleted: 0,
      blacklistedIpsDeleted: 0,
      userSessionsDeleted: 0,
      adminSessionsDeleted: 0,
      totalDeleted: 0,
      error: err.message
    };
  }
}

let cronTask = null;

function startPgTtlSweepCron() {
  if (process.env.PG_TTL_SWEEP_ENABLED === 'false') {
    console.log('[PG-TTL-SWEEP] Cron disabled (PG_TTL_SWEEP_ENABLED=false)');
    return;
  }

  const schedule = String(process.env.PG_TTL_SWEEP_CRON || DEFAULT_CRON).trim() || DEFAULT_CRON;
  const expression = cron.validate(schedule) ? schedule : DEFAULT_CRON;

  if (!cron.validate(schedule)) {
    console.warn(`[PG-TTL-SWEEP] Invalid cron "${schedule}" — using default ${DEFAULT_CRON}`);
  }

  if (cronTask) {
    cronTask.stop();
  }

  cronTask = cron.schedule(
    expression,
    scheduleCronHandler('PgTtlSweep.runPgTtlSweep', runPgTtlSweep)
  );

  console.log(`[PG-TTL-SWEEP] Cron scheduled: "${expression}"`);
}

module.exports = {
  runPgTtlSweep,
  startPgTtlSweepCron
};
