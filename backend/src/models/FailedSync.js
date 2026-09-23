/********************************************************************
 * Project: EonlineBazar — Database Migration
 * File: FailedSync.js
 * Description: Tracks Mongo→PostgreSQL dual-write failures for reconciliation.
 ********************************************************************/

const mongoose = require('mongoose');

const failedSyncSchema = new mongoose.Schema({
    entity: { type: String, required: true, trim: true, index: true },
    mongoId: { type: String, required: true, trim: true, index: true },
    operation: { type: String, required: true, trim: true },
    error: { type: String, default: '' },
    payload: { type: String, default: '' },
    retryCount: { type: Number, default: 0, min: 0 },
    resolvedAt: { type: Date, default: null, index: true },
    createdAt: { type: Date, default: Date.now, index: true }
});

failedSyncSchema.index({ resolvedAt: 1, retryCount: 1, createdAt: 1 });

module.exports = mongoose.model('FailedSync', failedSyncSchema);
