/********************************************************************
 * Customer-facing wallet balance and transaction history.
 ********************************************************************/

'use strict';

const {
    getWalletBalance,
    getWalletTransactions
} = require('../services/walletService');

const getCustomerWalletBalance = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const balance = await getWalletBalance(userId);
        return res.json({ success: true, data: { balance } });
    } catch (err) {
        console.error('getCustomerWalletBalance error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

const getCustomerWalletTransactions = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;
        const limit = Math.min(100, Math.max(1, parseInt(req.query?.limit, 10) || 50));
        const payload = await getWalletTransactions(userId, { limit });

        if (!payload) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        return res.json({ success: true, data: payload });
    } catch (err) {
        console.error('getCustomerWalletTransactions error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    getCustomerWalletBalance,
    getCustomerWalletTransactions
};
