/********************************************************************
 * Project: EonlineBazar
 * File: postgresBootstrap.js
 * Location: backend/src/config/postgresBootstrap.js
 * Description: Ensures Postgres (Neon) is reachable before cron dual-writes.
 *   Reloads root .env so long-running server processes match script behaviour.
 ********************************************************************/

'use strict';

const path = require('path');

const ROOT_ENV_PATH = path.join(__dirname, '..', '..', '..', '.env');

const DEFAULT_WARMUP_ATTEMPTS = 3;
const DEFAULT_WARMUP_DELAY_MS = 2000;

function reloadRootEnv() {
  require('dotenv').config({ path: ROOT_ENV_PATH });
}

/**
 * Ensure Neon-compatible SSL query params on pooled/direct URLs.
 */
function normalizeNeonConnectionString(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (!parsed.searchParams.has('sslmode')) {
      parsed.searchParams.set('sslmode', 'require');
    }
    return parsed.toString();
  } catch {
    if (/sslmode=/i.test(trimmed)) return trimmed;
    const sep = trimmed.includes('?') ? '&' : '?';
    return `${trimmed}${sep}sslmode=require`;
  }
}

function assertPooledDatabaseUrl() {
  const url = process.env.DATABASE_URL_POOLED;
  if (!url || !String(url).trim()) {
    throw new Error(
      '[postgresBootstrap] DATABASE_URL_POOLED is not set. ' +
      'Add the Neon pooler URL to .env — cron dual-write cannot mirror to Postgres without it.'
    );
  }
  const normalized = normalizeNeonConnectionString(String(url).trim());
  process.env.DATABASE_URL_POOLED = normalized;
  if (process.env.DATABASE_URL) {
    process.env.DATABASE_URL = normalizeNeonConnectionString(process.env.DATABASE_URL);
  }
  return normalized;
}

/**
 * Reload .env, validate DATABASE_URL_POOLED, warm Neon, optionally reconcile dual-write failures.
 * Call before registering cron jobs and at the start of each cron run.
 */
async function ensurePostgresReady(options = {}) {
  reloadRootEnv();
  assertPooledDatabaseUrl();
  const prisma = await warmNeonConnection({
    attempts: options.attempts ?? DEFAULT_WARMUP_ATTEMPTS,
    baseDelayMs: options.baseDelayMs ?? DEFAULT_WARMUP_DELAY_MS
  });

  let reconcile = { attempted: 0, resolved: 0 };
  const shouldReconcile = options.reconcileDualWrite === true && process.env.NODE_ENV !== 'test';
  if (shouldReconcile) {
    const { reconcileFailedSyncs } = require('../services/failedSyncService');
    reconcile = await reconcileFailedSyncs();
  }

  return { prisma, reconcile };
}

/**
 * Ping Postgres with retries — warms Neon compute after idle/cold start.
 */
async function warmNeonConnection(options = {}) {
  reloadRootEnv();
  assertPooledDatabaseUrl();

  const prisma = require('./prismaClient');
  const { withNeonRetry, logPgFallback } = require('./neonRetry');
  const attempts = Number(
    options.attempts ?? process.env.NEON_WARMUP_ATTEMPTS ?? DEFAULT_WARMUP_ATTEMPTS
  );
  const baseDelayMs = Number(
    options.baseDelayMs ?? process.env.NEON_WARMUP_BASE_DELAY_MS ?? DEFAULT_WARMUP_DELAY_MS
  );

  try {
    await withNeonRetry(() => prisma.$queryRawUnsafe('SELECT 1'), { attempts, baseDelayMs });
  } catch (err) {
    logPgFallback('postgresBootstrap', err, 'warm ping skipped');
    throw err;
  }
  return prisma;
}

module.exports = {
  ensurePostgresReady,
  warmNeonConnection,
  reloadRootEnv,
  assertPooledDatabaseUrl,
  normalizeNeonConnectionString,
  ROOT_ENV_PATH,
  DEFAULT_WARMUP_ATTEMPTS,
  DEFAULT_WARMUP_DELAY_MS
};
