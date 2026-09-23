/********************************************************************
 * Project: EonlineBazar
 * File: prismaClient.js
 * Location: backend/src/config/prismaClient.js
 * Author: Abdul Karim Sheikh
 * Description: Singleton Prisma client using the Neon HTTP driver adapter.
 *   - Uses DATABASE_URL_POOLED (the Neon pooler endpoint) for runtime queries.
 *   - DATABASE_URL (direct endpoint) is reserved for the Prisma CLI only.
 *   - Do NOT connect this into server.js until Stage 2 dual-write is wired.
 *   - Parallel to db.js (Mongoose/MongoDB) — do NOT modify db.js.
 *
 * Stage 2 Step 2, Part 1 — created 2026-09-13.
 ********************************************************************/

'use strict';

const path = require('path');

// Always load repo-root .env (same path as server.js) — cwd-relative dotenv breaks
// when the process is started from backend/ or when crons run in a long-lived server.
require('dotenv').config({
  path: path.join(__dirname, '..', '..', '..', '.env')
});

const { PrismaNeonHttp } = require('@prisma/adapter-neon');

// The generated client emits .mts files — Node 22.18+ loads them directly via
// native TypeScript type-stripping + require(esm). See DATABASE_MIGRATION_AUDIT.md
// Stage 2 Step 1b for the full explanation of why this works without a build step.
const { PrismaClient } = require('../../../generated/prisma/client.mts');

// ── Singleton ────────────────────────────────────────────────────────────────
// Node's module cache already ensures one instance per process, matching the
// same implicit singleton pattern used by db.js (Mongoose). A global guard is
// added on top for environments (e.g. bundlers or hot-reload) where the module
// factory can be re-executed within the same process.
const _globalRef = global;

function createPrismaClient() {
  const connectionString = String(
    process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL || ''
  ).trim();
  if (!connectionString) {
    throw new Error(
      '[prismaClient] DATABASE_URL_POOLED (or DATABASE_URL) is not set. ' +
      'Add the Neon pooler URL to .env as DATABASE_URL_POOLED. ' +
      'DATABASE_URL (direct endpoint) may be used as a fallback for CI/tests.'
    );
  }

  // PrismaNeonHttp takes the pooled connection string directly; it calls
  // neon() internally. Do NOT pass a pre-built neon() function — the
  // adapter factory signature is (connectionString, options?).
  const adapter = new PrismaNeonHttp(connectionString);

  return new PrismaClient({ adapter });
}

const prisma = _globalRef.__eonlinebazarPrisma ?? createPrismaClient();

// In non-production environments attach to global so that a module re-evaluation
// (e.g. nodemon restart of an adjacent require chain) reuses the same instance.
if (process.env.NODE_ENV !== 'production') {
  _globalRef.__eonlinebazarPrisma = prisma;
}

module.exports = prisma;
