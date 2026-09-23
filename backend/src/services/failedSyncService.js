/********************************************************************
 * Project: EonlineBazar — Database Migration
 * File: failedSyncService.js
 * Description: Record and retry Mongo→PostgreSQL dual-write failures.
 ********************************************************************/

'use strict';

const FailedSync = require('../models/FailedSync');

const MAX_RETRIES = 3;

/**
 * Persist a dual-write failure for later reconciliation.
 * @param {{ entity: string, mongoId?: string, operation?: string, error?: string, payload?: string }} entry
 */
async function recordFailedSync(entry) {
    if (!entry || !entry.entity) return;

    try {
        await FailedSync.create({
            entity: String(entry.entity),
            mongoId: entry.mongoId ? String(entry.mongoId) : '',
            operation: entry.operation ? String(entry.operation) : 'unknown',
            error: entry.error ? String(entry.error).slice(0, 2000) : '',
            payload: entry.payload ? String(entry.payload).slice(0, 50000) : '',
            retryCount: 0
        });
    } catch (trackErr) {
        console.error('[DUAL-WRITE] Could not track failure:', trackErr.message || trackErr);
    }
}

async function listUnresolvedFailures(limit = 100) {
    return FailedSync.find({ resolvedAt: null })
        .sort({ createdAt: -1 })
        .limit(Math.min(Math.max(Number(limit) || 100, 1), 500))
        .lean();
}

async function retryEmployeeSync(record) {
    const Employee = require('../models/employee');
    const { mirrorEmployeeSaveToPostgres } = require('../utils/hrmDualWriteHelpers');

    const doc = await Employee.findById(record.mongoId);
    if (!doc) {
        return { ok: false, reason: 'mongo_doc_missing' };
    }

    await mirrorEmployeeSaveToPostgres(doc);
    return { ok: true };
}

const RETRY_HANDLERS = {
    Employee: retryEmployeeSync,
    employee: retryEmployeeSync
};

async function retryFailedSyncRecord(record) {
    const handler = RETRY_HANDLERS[record.entity];
    if (!handler) {
        return { ok: false, reason: 'no_handler' };
    }
    return handler(record);
}

/**
 * On startup, retry unresolved failures (up to MAX_RETRIES each).
 */
async function reconcileFailedSyncs() {
    const pending = await FailedSync.find({
        resolvedAt: null,
        retryCount: { $lt: MAX_RETRIES }
    })
        .sort({ createdAt: 1 })
        .limit(50)
        .lean();

    if (!pending.length) return { attempted: 0, resolved: 0 };

    let resolved = 0;

    for (const record of pending) {
        try {
            const result = await retryFailedSyncRecord(record);
            if (result.ok) {
                await FailedSync.findByIdAndUpdate(record._id, { resolvedAt: new Date() });
                resolved += 1;
                console.log('[RECONCILE] Fixed:', record.entity, record.mongoId);
            } else {
                await FailedSync.findByIdAndUpdate(record._id, { $inc: { retryCount: 1 } });
            }
        } catch (err) {
            await FailedSync.findByIdAndUpdate(record._id, {
                $inc: { retryCount: 1 },
                $set: { error: err.message || String(err) }
            });
            console.error('[RECONCILE] Retry failed:', record.entity, record.mongoId, err.message || err);
        }
    }

    return { attempted: pending.length, resolved };
}

module.exports = {
    recordFailedSync,
    listUnresolvedFailures,
    reconcileFailedSyncs,
    MAX_RETRIES
};
