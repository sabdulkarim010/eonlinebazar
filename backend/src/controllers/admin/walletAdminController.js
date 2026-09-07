/********************************************************************
 * Admin wallet balance adjustments (manual credit / debit).
 ********************************************************************/

const User = require('../../models/user');
const {
    creditWalletForUser,
    debitWalletForAdmin
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
            const updated = await creditWalletForUser(userId, value, '', note);
            if (!updated) {
                return res.status(400).json({
                    success: false,
                    message: 'Could not credit wallet for this customer'
                });
            }
        } else {
            const updated = await debitWalletForAdmin(userId, value, note);
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

module.exports = {
    adjustCustomerWallet
};
