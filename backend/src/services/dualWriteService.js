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
const { recordFailedSync } = require('./failedSyncService');

function shouldAwaitPostgresMirror() {
    if (process.env.NODE_ENV === 'test') return true;
    if (String(process.env.DUAL_WRITE_SYNC || '') === '1') return true;
    if (String(process.env.REPOSITORY_TEST || '') === '1') return true;
    return false;
}

async function mirrorPostgresWrite(postgresWriteFn, result, context) {
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

        void recordFailedSync({
            entity: reconciliationEntry.model,
            mongoId: reconciliationEntry.mongoId,
            operation: reconciliationEntry.operation,
            error: reconciliationEntry.error,
            payload: buildFailurePayload(context, result)
        }).catch((trackErr) => {
            console.error('[DUAL-WRITE] Could not track failure:', trackErr.message || trackErr);
        });
    }
}

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

    const runMirror = () => mirrorPostgresWrite(postgresWriteFn, result, context);

    if (shouldAwaitPostgresMirror()) {
        await runMirror();
    } else {
        setImmediate(() => {
            void runMirror();
        });
    }

    return result;
}

function buildFailurePayload(context, result) {
    if (context.payload !== undefined && context.payload !== null) {
        try {
            return typeof context.payload === 'string'
                ? context.payload
                : JSON.stringify(context.payload);
        } catch (_) {
            return String(context.payload);
        }
    }

    if (!result) return '';

    try {
        const plain = typeof result.toObject === 'function' ? result.toObject() : result;
        return JSON.stringify(plain);
    } catch (_) {
        return '';
    }
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
    dualWrite,
    shouldAwaitPostgresMirror
};
