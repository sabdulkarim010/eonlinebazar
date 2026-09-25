/********************************************************************
 * Admin wallet balance adjustments and transaction history.
 ********************************************************************/

const User = require('../../models/user');
const {
    creditWallet,
    debitWallet,
    getWalletBalance,
    getWalletTransactions
} = require('../../services/walletService');
const { roundMoney } = require('../../services/deliveryChargeService');

const adjustCustomerWallet = async (req, res) => {
    try {
        const { userId } = req.params;
        const { amount, type, description } = req.body || {};

        if (!amount || !type) {
            return res.status(400).json({
                success: false,
                message: 'Amount and type (credit/debit) required'
            });
        }

        const normalizedType = String(type).trim().toLowerCase();
        if (normalizedType !== 'credit' && normalizedType !== 'debit') {
            return res.status(400).json({
                success: false,
                message: 'Type must be "credit" or "debit"'
            });
        }

        const value = roundMoney(Number(amount));
        if (value <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Amount must be greater than zero'
            });
        }

        const note = String(description || 'Admin adjustment').trim() || 'Admin adjustment';

        if (normalizedType === 'credit') {
            const updated = await creditWallet(userId, value, note);
            if (!updated) {
                return res.status(400).json({
                    success: false,
                    message: 'Could not credit wallet for this customer'
                });
            }
        } else {
            const updated = await debitWallet(userId, value, note);
            if (!updated) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient wallet balance for debit'
                });
            }
        }

        const user = await User.findById(userId).select('walletBalance name email');

        if (!user) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }

        res.json({
            success: true,
            message: `Wallet ${normalizedType === 'credit' ? 'credited' : 'debited'} by ৳${value.toLocaleString()}`,
            newBalance: user.walletBalance,
            userName: user.name
        });
    } catch (err) {
        console.error('adjustCustomerWallet error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

const creditCustomerWallet = async (req, res) => {
    try {
        const userId = req.params.id || req.params.userId;
        const value = roundMoney(Number(req.body?.amount));
        const reason = String(req.body?.reason || req.body?.description || 'Admin wallet credit').trim();

        if (value <= 0) {
            return res.status(400).json({ success: false, message: 'Amount must be greater than zero.' });
        }

        const updated = await creditWallet(userId, value, reason || 'Admin wallet credit');
        if (!updated) {
            return res.status(400).json({ success: false, message: 'Could not credit wallet.' });
        }

        const balance = await getWalletBalance(userId);
        return res.json({
            success: true,
            message: `Wallet credited by ৳${value.toLocaleString()}`,
            data: { balance, credited: value, reason }
        });
    } catch (err) {
        console.error('creditCustomerWallet error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

const getCustomerWalletTransactions = async (req, res) => {
    try {
        const userId = req.params.id || req.params.userId;
        const limit = Math.min(100, Math.max(1, parseInt(req.query?.limit, 10) || 50));
        const payload = await getWalletTransactions(userId, { limit });

        if (!payload) {
            return res.status(404).json({ success: false, message: 'Customer not found.' });
        }

        return res.json({ success: true, data: payload });
    } catch (err) {
        console.error('getCustomerWalletTransactions error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    adjustCustomerWallet,
    creditCustomerWallet,
    getCustomerWalletTransactions
};
