/********************************************************************
 * Wallet ledger helpers — atomic debit/credit with transaction history.
 ********************************************************************/

const User = require('../models/user');
const { roundMoney } = require('./deliveryChargeService');

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

    return User.findOneAndUpdate(
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
        { new: true }
    ).select('walletBalance walletHistory');
}

/**
 * Atomically credit wallet balance (returns, manual adjustments, etc.).
 */
async function creditWalletForUser(userId, amount, orderId, note = 'Refund for returned items') {
    const creditAmount = roundMoney(amount);
    if (!userId || creditAmount <= 0) return null;

    return User.findOneAndUpdate(
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
        { new: true }
    ).select('walletBalance walletHistory');
}

/**
 * Reverse a prior wallet credit (refund undo). Fails if balance is too low.
 */
async function reverseWalletCredit(userId, amount, note = 'Reversal: Refund cancelled by Admin') {
    const debitAmount = roundMoney(amount);
    if (!userId || debitAmount <= 0) return null;

    return User.findOneAndUpdate(
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
        { new: true }
    ).select('walletBalance walletHistory');
}

module.exports = {
    buildWalletHistoryEntry,
    deductWalletForOrder,
    creditWalletForUser,
    reverseWalletCredit,
    normalizeWalletType
};
