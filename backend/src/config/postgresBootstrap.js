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

function reloadRootEnv() {
  require('dotenv').config({ path: ROOT_ENV_PATH });
}

function assertPooledDatabaseUrl() {
  const url = process.env.DATABASE_URL_POOLED;
  if (!url || !String(url).trim()) {
    throw new Error(
      '[postgresBootstrap] DATABASE_URL_POOLED is not set. ' +
      'Add the Neon pooler URL to .env — cron dual-write cannot mirror to Postgres without it.'
    );
  }
  return String(url).trim();
}

/**
 * Reload .env, validate DATABASE_URL_POOLED, and ping Postgres.
 * Call before registering cron jobs and at the start of each cron run.
 */
async function ensurePostgresReady() {
  reloadRootEnv();
  assertPooledDatabaseUrl();

  const prisma = require('./prismaClient');
  await prisma.$queryRawUnsafe('SELECT 1');
  return prisma;
}

module.exports = {
  ensurePostgresReady,
  reloadRootEnv,
  assertPooledDatabaseUrl,
  ROOT_ENV_PATH
};
