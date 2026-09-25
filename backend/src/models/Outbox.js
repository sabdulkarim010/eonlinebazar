/********************************************************************
 * Project: EonlineBazar — Transactional Outbox
 * File: Outbox.js
 * Description: Reliable domain event outbox for async dispatch.
 ********************************************************************/

const mongoose = require('mongoose');

const OUTBOX_STATUSES = ['pending', 'processing', 'completed', 'failed'];

const OUTBOX_EVENT_TYPES = [
    'PRODUCT_CREATED',
    'PRODUCT_UPDATED',
    'STOCK_UPDATED',
    'ORDER_PLACED',
    'PO_RECEIVED',
    'VARIANT_MATRIX_APPLIED'
];

const outboxSchema = new mongoose.Schema({
    eventType: {
        type: String,
        enum: OUTBOX_EVENT_TYPES,
        required: true,
        index: true
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    status: {
        type: String,
        enum: OUTBOX_STATUSES,
        default: 'pending',
        index: true
    },
    attempts: {
        type: Number,
        default: 0
    },
    lastError: {
        type: String,
        default: ''
    },
    processedAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

outboxSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.models.Outbox || mongoose.model('Outbox', outboxSchema);
module.exports.OUTBOX_STATUSES = OUTBOX_STATUSES;
module.exports.OUTBOX_EVENT_TYPES = OUTBOX_EVENT_TYPES;
