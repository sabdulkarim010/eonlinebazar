/********************************************************************
 * Project: EonlineBazar
 * File: loyaltyLedgerService.js
 * Description: Atomic loyalty point mutations with immutable ledger logging.
 ********************************************************************/

'use strict';

const User = require('../models/user');
const { LoyaltyLedger } = require('../models/loyaltyLedger');
const { dualWrite } = require('./dualWriteService');

const DEFAULT_EXPIRY_DAYS = Number(process.env.LOYALTY_POINT_EXPIRY_DAYS) || 365;

function getLedgerRepository() {
    return require('../repositories/loyaltyLedgerRepository');
}

function normalizePoints(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
}

function resolveExpiryDate(expiresAt) {
    if (expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())) return expiresAt;
    if (DEFAULT_EXPIRY_DAYS <= 0) return null;
    const d = new Date();
    d.setDate(d.getDate() + DEFAULT_EXPIRY_DAYS);
    return d;
}

async function appendLedgerEntry({
    userId,
    points,
    type,
    referenceId = null,
    description = '',
    balanceAfter,
    expiresAt = null
}) {
    const entry = {
        userId,
        points: normalizePoints(points),
        type,
        referenceId: referenceId ? String(referenceId) : null,
        description: String(description || '').slice(0, 500),
        balanceAfter: Math.max(0, Number(balanceAfter) || 0),
        expiresAt: type === 'earned' ? resolveExpiryDate(expiresAt) : null,
        createdAt: new Date()
    };

    return dualWrite(
        () => LoyaltyLedger.create(entry),
        async (saved) => {
            await getLedgerRepository().createFromMongo(saved);
        },
        {
            model: 'LoyaltyLedger',
            operation: 'append',
            mongoId: (saved) => String(saved._id)
        }
    );
}

/**
 * Credit points atomically and log ledger entry.
 */
async function creditLoyaltyPoints(userId, points, {
    type = 'earned',
    referenceId = null,
    description = '',
    expiresAt = null
} = {}) {
    const amount = normalizePoints(points);
    if (!userId || amount <= 0) return null;

    const updated = await User.findOneAndUpdate(
        { _id: userId },
        { $inc: { loyaltyPoints: amount } },
        { returnDocument: 'after' }
    ).select('loyaltyPoints');

    if (!updated) return null;

    await appendLedgerEntry({
        userId,
        points: amount,
        type,
        referenceId,
        description,
        balanceAfter: updated.loyaltyPoints,
        expiresAt: type === 'earned' ? expiresAt : null
    });

    return updated;
}

/**
 * Debit points atomically (floor guard) and log ledger entry.
 */
async function debitLoyaltyPoints(userId, points, {
    type = 'redeemed',
    referenceId = null,
    description = ''
} = {}) {
    const amount = normalizePoints(points);
    if (!userId || amount <= 0) return null;

    const updated = await User.findOneAndUpdate(
        { _id: userId, loyaltyPoints: { $gte: amount } },
        { $inc: { loyaltyPoints: -amount } },
        { returnDocument: 'after' }
    ).select('loyaltyPoints');

    if (!updated) {
        console.warn('[LOYALTY-DEBIT] Insufficient points for atomic debit', {
            userId: String(userId),
            requested: amount,
            type
        });
        return null;
    }

    await appendLedgerEntry({
        userId,
        points: amount,
        type,
        referenceId,
        description,
        balanceAfter: updated.loyaltyPoints
    });

    return updated;
}

/**
 * Admin or system adjustment (+/-) with ledger type `adjusted`.
 */
async function adjustLoyaltyPoints(userId, delta, {
    referenceId = null,
    description = 'Manual loyalty adjustment'
} = {}) {
    const change = Math.trunc(Number(delta) || 0);
    if (!userId || change === 0) return null;

    if (change > 0) {
        return creditLoyaltyPoints(userId, change, {
            type: 'adjusted',
            referenceId,
            description,
            expiresAt: null
        });
    }

    return debitLoyaltyPoints(userId, Math.abs(change), {
        type: 'adjusted',
        referenceId,
        description
    });
}

async function fetchLoyaltyHistory(userId, { page = 1, limit = 20 } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (safePage - 1) * safeLimit;

    const [entries, total, user] = await Promise.all([
        LoyaltyLedger.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(safeLimit)
            .lean(),
        LoyaltyLedger.countDocuments({ userId }),
        User.findById(userId).select('loyaltyPoints').lean()
    ]);

    return {
        data: entries,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            totalPages: Math.ceil(total / safeLimit) || 1
        },
        currentBalance: Number(user?.loyaltyPoints) || 0
    };
}

module.exports = {
    DEFAULT_EXPIRY_DAYS,
    appendLedgerEntry,
    creditLoyaltyPoints,
    debitLoyaltyPoints,
    adjustLoyaltyPoints,
    fetchLoyaltyHistory
};
