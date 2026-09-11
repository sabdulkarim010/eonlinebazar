/********************************************************************
 * Project: EonlineBazar — CRM Loyalty Tiers
 * File: loyaltyTierService.js
 * Description: Silver / Gold / Platinum tier calculation, upgrades,
 * and tier-aware cashback rate resolution.
 ********************************************************************/

const User = require('../models/user');
const Order = require('../models/order');
const Setting = require('../models/Setting');
const { sendSms, isCustomerSmsEnabled } = require('./smsService');
const { sendTierUpgradeEmail } = require('./mailer');

const TIER_RANK = Object.freeze({
    none: 0,
    silver: 1,
    gold: 2,
    platinum: 3
});

const TIER_LABELS = Object.freeze({
    none: 'Member',
    silver: 'Silver Member',
    gold: 'Gold Member',
    platinum: 'Platinum Member'
});

function normalizeTierSettings(doc = {}) {
    return {
        enableTieredLoyalty: doc.enableTieredLoyalty === true,
        silverThreshold: Number(doc.silverThreshold ?? 5000),
        goldThreshold: Number(doc.goldThreshold ?? 15000),
        platinumThreshold: Number(doc.platinumThreshold ?? 50000),
        silverCashback: Number(doc.silverCashback ?? 1.5),
        goldCashback: Number(doc.goldCashback ?? 2.5),
        platinumCashback: Number(doc.platinumCashback ?? 4.0),
        cashbackPercentage: Number(doc.cashbackPercentage ?? 1)
    };
}

async function loadTierSettings() {
    const doc = await Setting.getOrCreate();
    return normalizeTierSettings(doc);
}

function calculateTier(lifetimeSpend, settings) {
    const cfg = normalizeTierSettings(settings);
    const spend = Math.max(0, Number(lifetimeSpend) || 0);

    if (!cfg.enableTieredLoyalty) {
        return { tier: 'none', cashbackRate: cfg.cashbackPercentage };
    }

    if (spend >= cfg.platinumThreshold) {
        return { tier: 'platinum', cashbackRate: cfg.platinumCashback };
    }
    if (spend >= cfg.goldThreshold) {
        return { tier: 'gold', cashbackRate: cfg.goldCashback };
    }
    if (spend >= cfg.silverThreshold) {
        return { tier: 'silver', cashbackRate: cfg.silverCashback };
    }

    return { tier: 'none', cashbackRate: cfg.cashbackPercentage };
}

async function sumDeliveredLifetimeSpend(userId) {
    if (!userId) return 0;

    const rows = await Order.aggregate([
        {
            $match: {
                user: userId,
                $or: [
                    { status: 'Delivered' },
                    { isDelivered: true }
                ]
            }
        },
        {
            $group: {
                _id: null,
                total: {
                    $sum: {
                        $add: [
                            { $ifNull: ['$grandTotal', 0] },
                            { $ifNull: ['$walletApplied', 0] }
                        ]
                    }
                }
            }
        }
    ]);

    return Math.round(Number(rows[0]?.total) || 0);
}

function isTierUpgrade(oldTier, newTier) {
    return (TIER_RANK[newTier] || 0) > (TIER_RANK[oldTier] || 0);
}

function resolveCustomerName(user = {}) {
    const fromParts = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return fromParts || String(user.name || '').trim() || 'Valued Customer';
}

function resolveCustomerPhone(user = {}) {
    return String(user.phone || user.mobile || '').trim();
}

async function sendTierUpgradeNotification(user, newTier) {
    const tierLabel = TIER_LABELS[newTier] || TIER_LABELS.none;
    const customerName = resolveCustomerName(user);
    const message = `Congratulations! You've been upgraded to ${tierLabel}!`;

    const email = String(user.email || '').trim();
    if (email) {
        sendTierUpgradeEmail({
            to: email,
            customerName,
            tierLabel,
            message
        }).catch((err) => {
            console.warn('[LoyaltyTier] Upgrade email failed:', err.message);
        });
    }

    const phone = resolveCustomerPhone(user);
    if (phone && (await isCustomerSmsEnabled())) {
        sendSms({
            to: phone,
            body: `[EonlineBazar] ${message}`,
            context: 'LOYALTY TIER UPGRADE'
        }).catch((err) => {
            console.warn('[LoyaltyTier] Upgrade SMS failed:', err.message);
        });
    }
}

/**
 * Recalculate tier for one user. Sends email/SMS when tier rank increases.
 */
async function upgradeTierIfNeeded(userId) {
    const user = await User.findById(userId).select(
        'loyaltyTier tierUpgradedAt lifetimeSpend tierCashbackRate firstName lastName name email phone mobile isDeleted'
    );
    if (!user || user.isDeleted) {
        return { changed: false, oldTier: 'none', newTier: 'none', reason: 'user_not_found' };
    }

    const settings = await loadTierSettings();
    const lifetimeSpend = await sumDeliveredLifetimeSpend(userId);
    const { tier: newTier, cashbackRate } = calculateTier(lifetimeSpend, settings);
    const oldTier = user.loyaltyTier || 'none';
    const changed = oldTier !== newTier
        || Number(user.lifetimeSpend) !== lifetimeSpend
        || Number(user.tierCashbackRate) !== cashbackRate;

    if (changed) {
        user.loyaltyTier = newTier;
        user.lifetimeSpend = lifetimeSpend;
        user.tierCashbackRate = cashbackRate;
        if (oldTier !== newTier) {
            user.tierUpgradedAt = new Date();
        }
        await user.save();
    }

    if (isTierUpgrade(oldTier, newTier)) {
        await sendTierUpgradeNotification(user, newTier);
    }

    return { changed, oldTier, newTier, lifetimeSpend, cashbackRate };
}

/**
 * Return cached tier cashback rate, or recalculate from settings when stale.
 */
async function getTierCashbackRate(userId) {
    const [user, settings] = await Promise.all([
        User.findById(userId).select('loyaltyTier tierCashbackRate lifetimeSpend isDeleted').lean(),
        loadTierSettings()
    ]);

    if (!user || user.isDeleted) {
        return Number(settings.cashbackPercentage) || 0;
    }

    if (!settings.enableTieredLoyalty) {
        return Number(settings.cashbackPercentage) || 0;
    }

    const tier = user.loyaltyTier || 'none';
    if (tier === 'none') {
        return Number(settings.cashbackPercentage) || 0;
    }

    const cached = Number(user.tierCashbackRate);
    if (Number.isFinite(cached) && cached > 0) {
        return cached;
    }

    const { cashbackRate } = calculateTier(user.lifetimeSpend, settings);
    return cashbackRate;
}

/**
 * Resolve the effective global cashback % for an order (before category overrides).
 */
async function resolveEffectiveCashbackRate(userId, baseSettings) {
    const settings = normalizeTierSettings(baseSettings || await loadTierSettings());

    if (!userId || !settings.enableTieredLoyalty) {
        return Number(settings.cashbackPercentage) || 0;
    }

    return getTierCashbackRate(userId);
}

module.exports = {
    TIER_RANK,
    TIER_LABELS,
    normalizeTierSettings,
    loadTierSettings,
    calculateTier,
    sumDeliveredLifetimeSpend,
    upgradeTierIfNeeded,
    getTierCashbackRate,
    resolveEffectiveCashbackRate
};
