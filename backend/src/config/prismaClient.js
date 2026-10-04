/********************************************************************
 * Project: EonlineBazar
 * File: prismaClient.js
 * Location: backend/src/config/prismaClient.js
 * Author: Abdul Karim Sheikh
 * Description: Singleton Prisma client — PostgreSQL TCP via @prisma/adapter-pg.
 *   - Runtime: DATABASE_URL_POOLED || DATABASE_URL (Neon pooler preferred)
 *   - DATABASE_URL (direct) remains for Prisma CLI migrations (prisma.config.js).
 *   - neonRetry.js wraps queries with transient network retries.
 *   - Parallel to db.js (Mongoose/MongoDB) — do NOT modify db.js.
 *
 * Stage 2 Step 2, Part 1 — created 2026-09-13.
 ********************************************************************/

'use strict';

const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '..', '..', '..', '.env')
});

const { PrismaPg } = require('@prisma/adapter-pg');
const { withNeonQueryRetries } = require('./neonRetry');
const { normalizeNeonConnectionString } = require('./postgresBootstrap');

const { PrismaClient } = require('../../../generated/prisma/client.mts');

const globalForPrisma = globalThis;

function resolveConnectionString() {
  return normalizeNeonConnectionString(
    String(process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || '').trim()
  );
}

function createPrismaClient() {
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error(
      '[prismaClient] DATABASE_URL_POOLED (or DATABASE_URL) is not set. ' +
      'Add the Neon pooler URL to .env as DATABASE_URL_POOLED. ' +
      'DATABASE_URL (direct endpoint) may be used as a fallback for CI/tests.'
    );
  }

  // Prisma 7 requires a driver adapter for PostgreSQL (native TCP via `pg`).
  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({
    adapter,
    log: ['error', 'warn']
  });

  return withNeonQueryRetries(client);
}

const prisma = globalForPrisma.__eonlinebazarPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__eonlinebazarPrisma = prisma;
}

function getPrisma() {
  return prisma;
}

module.exports = prisma;
module.exports.getPrisma = getPrisma;
