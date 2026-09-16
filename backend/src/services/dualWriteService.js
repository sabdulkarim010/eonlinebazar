/********************************************************************
 * Project: EonlineBazar
 * File: dualWriteService.js
 * Location: backend/src/services/dualWriteService.js
 * Author: Abdul Karim Sheikh
 * Description: Reusable dual-write helper for MongoDB → PostgreSQL migration.
 *   MongoDB writes run first and remain authoritative; PostgreSQL failures are
 *   logged for reconciliation and never propagate to API callers.
 *
 *   Stage 2 Step 3, Part 1 — Category pilot (2026-09-14).
 ********************************************************************/

'use strict';

const { reloadRootEnv, assertPooledDatabaseUrl } = require('../config/postgresBootstrap');

/**
 * Execute a MongoDB write, then attempt a best-effort PostgreSQL mirror write.
 *
 * @param {() => Promise<any>} mongoWriteFn - Primary write (must succeed for the operation to succeed).
 * @param {(mongoResult: any) => Promise<void>} postgresWriteFn - Secondary write (failures are swallowed).
 * @param {{ model?: string, operation?: string, source?: string, mongoId?: string|((mongoResult: any) => string|undefined) }} [context]
 * @returns {Promise<any>} The MongoDB write result, unchanged from pre-dual-write behavior.
 */
async function dualWrite(mongoWriteFn, postgresWriteFn, context = {}) {
  const result = await mongoWriteFn();

  try {
    reloadRootEnv();
    assertPooledDatabaseUrl();
    await postgresWriteFn(result);
  } catch (error) {
    const mongoId = resolveMongoId(context, result);

    const reconciliationEntry = {
      timestamp: new Date().toISOString(),
      model: context.model || 'unknown',
      operation: context.operation || 'unknown',
      source: context.source || 'unknown',
      mongoId: mongoId || null,
      error: error && error.message ? error.message : String(error),
      stack: error && error.stack ? String(error.stack).split('\n').slice(0, 4).join(' | ') : undefined
    };

    console.error('[DUAL-WRITE-FAILURE]', reconciliationEntry);
  }

  return result;
}

function resolveMongoId(context, result) {
  if (context.mongoId !== undefined && context.mongoId !== null) {
    if (typeof context.mongoId === 'function') {
      return context.mongoId(result);
    }
    return String(context.mongoId);
  }

  if (result && (result._id || result.id)) {
    return String(result._id || result.id);
  }

  return undefined;
}

module.exports = {
  dualWrite
};
