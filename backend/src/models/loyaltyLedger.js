/********************************************************************
 * Project: EonlineBazar
 * File: loyaltyLedger.js
 * Description: Immutable loyalty point transaction ledger.
 ********************************************************************/

const mongoose = require('mongoose');

const LEDGER_TYPES = [
    'earned',
    'redeemed',
    'expired',
    'adjusted',
    'cancelled_restored'
];

const loyaltyLedgerSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    points: {
        type: Number,
        required: true,
        min: 0
    },
    type: {
        type: String,
        enum: LEDGER_TYPES,
        required: true,
        index: true
    },
    referenceId: {
        type: String,
        default: null,
        index: true
    },
    description: {
        type: String,
        default: ''
    },
    balanceAfter: {
        type: Number,
        required: true,
        min: 0
    },
    /** Set on earned entries — used by expiry cron (FIFO batch tracking). */
    expiresAt: {
        type: Date,
        default: null,
        index: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

loyaltyLedgerSchema.index({ userId: 1, createdAt: -1 });

module.exports = {
    LoyaltyLedger: mongoose.models.LoyaltyLedger || mongoose.model('LoyaltyLedger', loyaltyLedgerSchema),
    LEDGER_TYPES
};
