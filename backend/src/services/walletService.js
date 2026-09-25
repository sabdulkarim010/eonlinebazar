/********************************************************************
 * Wallet ledger helpers — atomic debit/credit with transaction history.
 ********************************************************************/

const User = require('../models/user');
const { roundMoney } = require('./deliveryChargeService');
const { resolveEffectiveCashbackRate } = require('./loyaltyTierService');
const { dualWrite } = require('./dualWriteService');
const { fetchWalletBalance } = require('./userReadService');
const { routedRead } = require('./readRouter');
const { mapWalletTransactionsToMongo } = require('./readShapeHelpers');

function getUserRepository() {
    return require('../repositories/userRepository');
}

function mirrorWallet(updated) {
    if (!updated) return Promise.resolve();
    return require('../repositories/userRepository').mirrorWalletFromMongo(updated);
}

function normalizeWalletType(type) {
    return String(type || '').trim().toUpperCase();
}

function buildWalletHistoryEntry({ type, amount, note, referenceOrder = '' }) {
    return {
        type: normalizeWalletType(type),
        amount: roundMoney(amount),
        note: String(note || '').trim(),
        referenceOrder: String(referenceOrder || '').trim(),
        date: new Date()
    };
}

/**
 * Atomically deduct wallet balance after an order is persisted.
 * Returns the updated user doc, or null when balance is insufficient.
 */
async function deductWalletForOrder(userId, amount, orderId, note = 'Used for Order placement') {
    const debitAmount = roundMoney(amount);
    if (!userId || debitAmount <= 0) return null;

    return dualWrite(
        () => User.findOneAndUpdate(
            { _id: userId, walletBalance: { $gte: debitAmount } },
            {
                $inc: { walletBalance: -debitAmount },
                $push: {
                    walletHistory: {
                        $each: [buildWalletHistoryEntry({
                            type: 'DEBIT',
                            amount: debitAmount,
                            referenceOrder: orderId,
                            note
                        })],
                        $position: 0
                    }
                }
            },
            { returnDocument: 'after' }
        ).select('walletBalance walletHistory'),
        async (updated) => { await mirrorWallet(updated); },
        { model: 'WalletTransaction', operation: 'debit', mongoId: String(userId) }
    );
}

/**
 * Atomically credit wallet balance (returns, manual adjustments, etc.).
 */
async function creditWalletForUser(userId, amount, orderId, note = 'Refund for returned items') {
    const creditAmount = roundMoney(amount);
    if (!userId || creditAmount <= 0) return null;

    return dualWrite(
        () => User.findOneAndUpdate(
            { _id: userId },
            {
                $inc: { walletBalance: creditAmount },
                $push: {
                    walletHistory: {
                        $each: [buildWalletHistoryEntry({
                            type: 'CREDIT',
                            amount: creditAmount,
                            referenceOrder: orderId,
                            note
                        })],
                        $position: 0
                    }
                }
            },
            { returnDocument: 'after' }
        ).select('walletBalance walletHistory'),
        async (updated) => { await mirrorWallet(updated); },
        { model: 'WalletTransaction', operation: 'credit', mongoId: String(userId) }
    );
}

/**
 * Reverse a prior wallet credit (refund undo). Fails if balance is too low.
 */
async function reverseWalletCredit(userId, amount, note = 'Reversal: Refund cancelled by Admin') {
    const debitAmount = roundMoney(amount);
    if (!userId || debitAmount <= 0) return null;

    return dualWrite(
        () => User.findOneAndUpdate(
            { _id: userId, walletBalance: { $gte: debitAmount } },
            {
                $inc: { walletBalance: -debitAmount },
                $push: {
                    walletHistory: {
                        $each: [buildWalletHistoryEntry({
                            type: 'DEBIT',
                            amount: debitAmount,
                            note
                        })],
                        $position: 0
                    }
                }
            },
            { returnDocument: 'after' }
        ).select('walletBalance walletHistory'),
        async (updated) => { await mirrorWallet(updated); },
        { model: 'WalletTransaction', operation: 'reverse-credit', mongoId: String(userId) }
    );
}

/**
 * Admin manual debit — same atomic guard as order debit, generic note.
 */
async function debitWalletForAdmin(userId, amount, note = 'Admin adjustment') {
    return deductWalletForOrder(userId, amount, '', note);
}

/**
 * Tier-aware cashback % for order delivery rewards.
 * Uses loyalty tier rate when enabled; otherwise the default from master settings.
 */
async function resolveOrderCashbackRate(userId, rewardSettings) {
    return resolveEffectiveCashbackRate(userId, rewardSettings);
}

async function getWalletBalance(userId) {
    if (!userId) return 0;
    return fetchWalletBalance(userId);
}

async function getWalletTransactions(userId, { limit = 50 } = {}) {
    if (!userId) return null;

    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const balance = await getWalletBalance(userId);

    const transactions = await routedRead(
        'wallet',
        async () => {
            const user = await User.findById(userId).select('walletHistory');
            if (!user) return null;
            return (user.walletHistory || [])
                .slice(0, safeLimit)
                .map((row) => (row && typeof row.toObject === 'function' ? row.toObject() : { ...row }));
        },
        async () => {
            const pgUserId = await getUserRepository().resolvePostgresUserId(userId);
            if (!pgUserId) return null;
            const rows = await getUserRepository().listWalletTransactions(pgUserId);
            return mapWalletTransactionsToMongo(rows).slice(0, safeLimit);
        }
    );

    if (transactions === null) return null;

    return {
        balance,
        transactions
    };
}

async function creditWallet(userId, amount, reason = 'Wallet credit', referenceOrder = '') {
    return creditWalletForUser(userId, amount, referenceOrder, reason);
}

async function debitWallet(userId, amount, reason = 'Wallet debit') {
    return debitWalletForAdmin(userId, amount, reason);
}

module.exports = {
    buildWalletHistoryEntry,
    deductWalletForOrder,
    debitWalletForAdmin,
    creditWalletForUser,
    reverseWalletCredit,
    normalizeWalletType,
    resolveOrderCashbackRate,
    getWalletBalance,
    getWalletTransactions,
    creditWallet,
    debitWallet
};
