/********************************************************************
 * Project: EonlineBazar — Transactional Outbox
 * File: outboxService.js
 * Description: Persist domain events reliably and dispatch to consumers.
 ********************************************************************/

'use strict';

const Outbox = require('../models/Outbox');
const { emitToAdmins } = require('./socketService');

const MAX_DISPATCH_BATCH = Number(process.env.OUTBOX_DISPATCH_BATCH || 25);
const MAX_ATTEMPTS = Number(process.env.OUTBOX_MAX_ATTEMPTS || 5);

const eventHandlers = {
    PRODUCT_CREATED: async (payload) => {
        emitToAdmins('catalog_product_created', payload);
    },
    PRODUCT_UPDATED: async (payload) => {
        emitToAdmins('catalog_product_updated', payload);
    },
    STOCK_UPDATED: async (payload) => {
        emitToAdmins('inventory_stock_updated', payload);
    },
    ORDER_PLACED: async (payload) => {
        emitToAdmins('order_placed', payload);
    },
    PO_RECEIVED: async (payload) => {
        emitToAdmins('po_received', payload);
    },
    VARIANT_MATRIX_APPLIED: async (payload) => {
        emitToAdmins('pim_variant_matrix_applied', payload);
    }
};

/**
 * Record an outbox row. When a Mongo session is supplied, write participates
 * in the caller transaction; otherwise best-effort immediate persist.
 */
async function recordOutboxEvent(eventType, payload = {}, options = {}) {
    const normalizedType = String(eventType || '').trim().toUpperCase();
    const doc = {
        eventType: normalizedType,
        payload: payload || {},
        status: 'pending',
        attempts: 0
    };

    if (options.session) {
        const [created] = await Outbox.create([doc], { session: options.session });
        return created;
    }

    return Outbox.create(doc);
}

async function dispatchOutboxEntry(entry) {
    const handler = eventHandlers[entry.eventType];
    if (typeof handler === 'function') {
        await handler(entry.payload || {});
    }
}

async function markOutboxProcessing(entry) {
    entry.status = 'processing';
    entry.attempts = (Number(entry.attempts) || 0) + 1;
    await entry.save();
}

async function markOutboxCompleted(entry) {
    entry.status = 'completed';
    entry.processedAt = new Date();
    entry.lastError = '';
    await entry.save();
}

async function markOutboxFailed(entry, error) {
    entry.status = (entry.attempts >= MAX_ATTEMPTS) ? 'failed' : 'pending';
    entry.lastError = String(error?.message || error || 'Unknown error').slice(0, 500);
    await entry.save();
}

async function dispatchPendingOutboxEvents(limit = MAX_DISPATCH_BATCH) {
    const pending = await Outbox.find({ status: 'pending' })
        .sort({ createdAt: 1 })
        .limit(Math.max(1, Number(limit) || MAX_DISPATCH_BATCH));

    const summary = { processed: 0, failed: 0, skipped: 0 };

    for (const entry of pending) {
        try {
            await markOutboxProcessing(entry);
            await dispatchOutboxEntry(entry);
            await markOutboxCompleted(entry);
            summary.processed += 1;
        } catch (err) {
            await markOutboxFailed(entry, err);
            summary.failed += 1;
        }
    }

    return summary;
}

async function listOutboxEvents(filters = {}) {
    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.eventType) query.eventType = String(filters.eventType).toUpperCase();

    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    return Outbox.find(query).sort({ createdAt: -1 }).limit(limit).lean();
}

/**
 * Execute domain work and record outbox event in one Mongo transaction when supported.
 */
function shouldFallbackFromTransaction(err) {
    const message = String(err?.message || err || '');
    return /transaction|replica set|retryable writes/i.test(message);
}

async function withOutboxTransaction(eventType, payload, workFn) {
    const session = await Outbox.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await workFn(session);
            await recordOutboxEvent(eventType, payload, { session });
        });
        return result;
    } catch (err) {
        // Fallback for environments without transaction support (in-memory MongoDB).
        if (shouldFallbackFromTransaction(err)) {
            const result = await workFn(null);
            await recordOutboxEvent(eventType, payload);
            return result;
        }
        throw err;
    } finally {
        session.endSession();
    }
}

module.exports = {
    recordOutboxEvent,
    dispatchPendingOutboxEvents,
    listOutboxEvents,
    withOutboxTransaction,
    eventHandlers
};
