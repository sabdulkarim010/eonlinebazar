/********************************************************************
 * Project: EonlineBazar
 * File: rewardSettings.js
 * Location: utils/rewardSettings.js
 * Description: Shared helpers for dynamic cashback, points, and conversion.
 ********************************************************************/

const Setting = require('../models/Setting');

const POINTS_CONVERSION_UNIT = 100;

const DEFAULTS = Object.freeze({
    cashbackPercentage: 1,
    takaToPointsRatio: 100,
    pointsToTakaConversionRate: 10,
    refundUndoWindowHours: 72
});

function normalizeRewardSettings(doc = {}) {
    return {
        cashbackPercentage: Number(doc.cashbackPercentage ?? DEFAULTS.cashbackPercentage),
        takaToPointsRatio: Number(doc.takaToPointsRatio ?? DEFAULTS.takaToPointsRatio),
        pointsToTakaConversionRate: Number(doc.pointsToTakaConversionRate ?? DEFAULTS.pointsToTakaConversionRate),
        refundUndoWindowHours: Number(doc.refundUndoWindowHours ?? DEFAULTS.refundUndoWindowHours),
        pointsConversionUnit: POINTS_CONVERSION_UNIT
    };
}

async function loadRewardSettings() {
    const doc = await Setting.getOrCreate();
    return normalizeRewardSettings(doc);
}

function calculateOrderCashback(grandTotal, settings) {
    const total = Number(grandTotal) || 0;
    const pct = Number(settings?.cashbackPercentage) || 0;
    if (total <= 0 || pct <= 0) return 0;
    return Math.round(total * (pct / 100));
}

function resolveCategoryCashbackRate(categoryDoc, settings) {
    const custom = categoryDoc?.customCashbackPercentage;
    if (custom !== null && custom !== undefined && Number(custom) >= 0) {
        return Number(custom);
    }
    return Number(settings?.cashbackPercentage) || 0;
}

function calculateLineItemCashback(lineTotal, cashbackRate) {
    const total = Number(lineTotal) || 0;
    const pct = Number(cashbackRate) || 0;
    if (total <= 0 || pct <= 0) return 0;
    return total * (pct / 100);
}

/**
 * Sum per-line cashback using category overrides when set, otherwise global rate.
 * @param {Array<{ price: number, quantity?: number, category?: string }>} orderItems
 * @param {Map<string, { customCashbackPercentage?: number|null }>} categoryMap - keyed by category name
 */
function calculateOrderCashbackFromItems(orderItems, categoryMap, settings) {
    if (!Array.isArray(orderItems) || orderItems.length === 0) return 0;

    let sum = 0;
    for (const item of orderItems) {
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const lineTotal = Number(item.price) * quantity;
        const categoryName = item.category || 'General';
        const categoryDoc = categoryMap?.get(categoryName) || null;
        const rate = resolveCategoryCashbackRate(categoryDoc, settings);
        sum += calculateLineItemCashback(lineTotal, rate);
    }

    return Math.round(sum);
}

async function loadCategoryCashbackMap(categoryNames) {
    const Category = require('../models/category');
    const uniqueNames = [...new Set((categoryNames || []).filter(Boolean))];
    if (uniqueNames.length === 0) return new Map();

    const categories = await Category.find({ name: { $in: uniqueNames } })
        .select('name customCashbackPercentage')
        .lean();

    return new Map(categories.map((cat) => [cat.name, cat]));
}

function calculateEarnedPoints(grandTotal, settings) {
    const total = Number(grandTotal) || 0;
    const ratio = Number(settings?.takaToPointsRatio);
    if (total <= 0 || !Number.isFinite(ratio) || ratio <= 0) return 0;
    return Math.floor(total / ratio);
}

function isPointsEarningEnabled(settings) {
    const ratio = Number(settings?.takaToPointsRatio);
    return Number.isFinite(ratio) && ratio > 0;
}

function isGlobalCashbackEnabled(settings) {
    const pct = Number(settings?.cashbackPercentage);
    return Number.isFinite(pct) && pct > 0;
}

/**
 * Credit loyalty points and wallet cashback when an order is marked delivered.
 * Respects master Setting values — 0 ratio/percentage means no credit for that reward type.
 */
async function creditOrderDeliveryRewards(order) {
    const Order = require('../models/order');
    const User = require('../models/user');

    if (!order?.user || order.rewardsCredited) {
        return {
            credited: false,
            earnedPoints: 0,
            cashback: 0,
            reason: order?.rewardsCredited ? 'already_credited' : 'guest_order'
        };
    }

    const rewardSettings = await loadRewardSettings();
    const grandTotal = Number(order.grandTotal ?? order.totalAmount) || 0;
    const earnedPoints = isPointsEarningEnabled(rewardSettings)
        ? calculateEarnedPoints(grandTotal, rewardSettings)
        : 0;

    const orderItems = Array.isArray(order.items) ? order.items : [];
    let cashback = 0;
    if (orderItems.length > 0) {
        const categoryNames = orderItems.map((item) => item.category || 'General');
        const categoryCashbackMap = await loadCategoryCashbackMap(categoryNames);
        cashback = calculateOrderCashbackFromItems(orderItems, categoryCashbackMap, rewardSettings);
    }

    if (earnedPoints <= 0 && cashback <= 0) {
        await Order.findByIdAndUpdate(order._id, {
            $set: {
                rewardsCredited: true,
                rewardsPointsEarned: 0,
                rewardsCashbackAmount: 0
            }
        });
        return { credited: false, earnedPoints: 0, cashback: 0, reason: 'rewards_disabled' };
    }

    const orderLabel = order.orderId
        || (order._id ? String(order._id).slice(-6).toUpperCase() : 'N/A');

    const rewardUpdate = {
        $inc: { loyaltyPoints: earnedPoints, walletBalance: cashback }
    };
    if (cashback > 0) {
        rewardUpdate.$push = {
            walletHistory: {
                $each: [{
                    type: 'cashback',
                    amount: cashback,
                    note: `Cashback for order ${orderLabel}`,
                    date: new Date()
                }],
                $position: 0
            }
        };
    }

    await User.findByIdAndUpdate(order.user, rewardUpdate);
    await Order.findByIdAndUpdate(order._id, {
        $set: {
            rewardsCredited: true,
            rewardsPointsEarned: earnedPoints,
            rewardsCashbackAmount: cashback
        }
    });

    return { credited: true, earnedPoints, cashback };
}

function calculatePointsCashValue(pointsToConvert, settings) {
    const points = Number(pointsToConvert) || 0;
    const rate = Number(settings?.pointsToTakaConversionRate) || 0;
    if (points <= 0 || rate <= 0) return 0;
    return (points / POINTS_CONVERSION_UNIT) * rate;
}

function getConversionRateLabel(settings) {
    const unit = POINTS_CONVERSION_UNIT;
    const rate = Number(settings?.pointsToTakaConversionRate ?? DEFAULTS.pointsToTakaConversionRate);
    return `Conversion Rate: ${unit} Points = ৳${rate.toLocaleString()} Wallet Balance`;
}

function isWithinRefundUndoWindow(refundedAt, refundUndoWindowHours) {
    const hours = Number(refundUndoWindowHours);
    if (!refundedAt || hours <= 0) return false;

    const refunded = new Date(refundedAt);
    if (Number.isNaN(refunded.getTime())) return false;

    const elapsedMs = Date.now() - refunded.getTime();
    return elapsedMs >= 0 && elapsedMs <= hours * 60 * 60 * 1000;
}

module.exports = {
    POINTS_CONVERSION_UNIT,
    DEFAULTS,
    normalizeRewardSettings,
    loadRewardSettings,
    calculateOrderCashback,
    calculateOrderCashbackFromItems,
    resolveCategoryCashbackRate,
    loadCategoryCashbackMap,
    calculateEarnedPoints,
    isPointsEarningEnabled,
    isGlobalCashbackEnabled,
    creditOrderDeliveryRewards,
    calculatePointsCashValue,
    getConversionRateLabel,
    isWithinRefundUndoWindow
};
