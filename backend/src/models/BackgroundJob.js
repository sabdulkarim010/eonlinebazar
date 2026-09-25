/********************************************************************
 * Project: EonlineBazar — Async Background Jobs
 * File: BackgroundJob.js
 * Description: Job status tracking for BullMQ / inline queue workers.
 ********************************************************************/

const mongoose = require('mongoose');

const JOB_STATUSES = ['pending', 'processing', 'completed', 'failed'];
const JOB_TYPES = [
    'BULK_PRODUCT_IMPORT',
    'BULK_STOCK_SYNC',
    'PRODUCT_EXPORT_CSV',
    'PRODUCT_EXPORT_XLSX'
];

const backgroundJobSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: JOB_TYPES,
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: JOB_STATUSES,
        default: 'pending',
        index: true
    },
    progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    result: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    resultUrl: {
        type: String,
        default: ''
    },
    errorMessage: {
        type: String,
        default: ''
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        default: null
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.models.BackgroundJob
    || mongoose.model('BackgroundJob', backgroundJobSchema);
module.exports.JOB_STATUSES = JOB_STATUSES;
module.exports.JOB_TYPES = JOB_TYPES;
