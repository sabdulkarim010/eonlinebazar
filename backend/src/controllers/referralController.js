/********************************************************************
 * Project: EonlineBazar — CRM Automation
 * File: referralController.js
 * Location: controllers/referralController.js
 * Description: Customer referral program. Exposes the signed-in user's
 * referral code / link / stats, and credits a referrer's wallet the first
 * time someone they invited completes an order (processReferralReward is
 * invoked from orderCheckoutController after the order is confirmed).
 ********************************************************************/

const User = require('../models/user');
const Settings = require('../models/Settings');
const { creditWalletForUser } = require('../services/walletService');

function getStorePublicUrl() {
    return String(
        process.env.STORE_PUBLIC_URL
        || process.env.FRONTEND_URL
        || process.env.PUBLIC_BASE_URL
        || ''
    ).replace(/\/$/, '');
}

function buildReferralLink(referralCode) {
    const base = getStorePublicUrl();
    const path = `/register.html?referralCode=${encodeURIComponent(referralCode)}`;
    return base ? `${base}${path}` : path;
}

/**
 * GET /api/customer/referral
 * Returns the signed-in customer's referral code, share link, and stats.
 */
const getReferralInfo = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }

        const user = await User.findById(userId).select('referralCode referralEarnings');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // Legacy accounts created before the referral program have no code yet —
        // saving triggers the model's pre-save hook to generate one.
        if (!user.referralCode) {
            await user.save();
        }

        const totalReferrals = await User.countDocuments({ referredBy: userId });

        return res.json({
            success: true,
            data: {
                referralCode: user.referralCode,
                referralLink: buildReferralLink(user.referralCode),
                totalReferrals,
                totalEarned: Number(user.referralEarnings) || 0
            }
        });
    } catch (error) {
        console.error('Get Referral Info Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load referral information.' });
    }
};

/**
 * Credit the referrer's wallet after a referred customer completes their first
 * order. Safe to call unconditionally — it no-ops when the customer was not
 * referred or when rewards are disabled (referralRewardAmount = 0). The caller
 * (orderCheckoutController) only invokes this on the referred user's first
 * order, which keeps the reward one-time per referral.
 *
 * @param {string} referredUserId  The customer who just placed their first order.
 * @returns {Promise<{rewarded: boolean, amount?: number, reason?: string}>}
 */
const processReferralReward = async (referredUserId) => {
    try {
        if (!referredUserId) return { rewarded: false, reason: 'No user id' };

        const referredUser = await User.findById(referredUserId)
            .select('referredBy firstName lastName');
        if (!referredUser || !referredUser.referredBy) {
            return { rewarded: false, reason: 'User was not referred' };
        }

        const settings = await Settings.getOrCreate();
        const rewardAmount = Number(settings.referralRewardAmount) || 0;
        if (rewardAmount <= 0) {
            return { rewarded: false, reason: 'Referral rewards disabled' };
        }

        const friendName = [referredUser.firstName, referredUser.lastName]
            .filter(Boolean).join(' ').trim() || 'a friend';
        const note = `Referral reward — ${friendName} completed their first order`;

        const updated = await creditWalletForUser(
            referredUser.referredBy,
            rewardAmount,
            '',
            note
        );

        if (!updated) {
            return { rewarded: false, reason: 'Referrer wallet credit failed' };
        }

        await User.updateOne(
            { _id: referredUser.referredBy },
            { $inc: { referralEarnings: rewardAmount } }
        );

        console.log(`[Referral] Credited ৳${rewardAmount} to referrer ${referredUser.referredBy} for ${friendName}`);
        return { rewarded: true, amount: rewardAmount };
    } catch (error) {
        console.error('Process Referral Reward Error:', error.message);
        return { rewarded: false, reason: error.message };
    }
};

module.exports = {
    getReferralInfo,
    processReferralReward,
    buildReferralLink
};
