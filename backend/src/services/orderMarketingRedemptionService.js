/********************************************************************
 * Project: EonlineBazar
 * File: orderMarketingRedemptionService.js
 * Description: Atomic loyalty debits and marketing redemption restore on cancel.
 ********************************************************************/

const Coupon = require('../models/coupon');
const { releaseCouponRedemption } = require('../controllers/couponController');
const {
    debitLoyaltyPoints,
    creditLoyaltyPoints
} = require('./loyaltyLedgerService');

/**
 * Atomically deduct loyalty points (floor guard — returns null when insufficient).
 */
async function deductLoyaltyPointsAtomic(userId, points, meta = {}) {
    return debitLoyaltyPoints(userId, points, {
        type: 'redeemed',
        referenceId: meta.referenceId || meta.orderId || null,
        description: meta.description || 'Points redeemed at checkout'
    });
}

/**
 * Restore loyalty points after a failed checkout or cancelled order.
 */
async function restoreLoyaltyPointsAtomic(userId, points, meta = {}) {
    return creditLoyaltyPoints(userId, points, {
        type: meta.type || 'cancelled_restored',
        referenceId: meta.referenceId || meta.orderId || null,
        description: meta.description || 'Points restored',
        expiresAt: null
    });
}

/**
 * Roll back coupon + loyalty reservations when checkout fails after reservation.
 */
async function rollbackCheckoutMarketingReservations({ couponDocId, userId, pointsRedeemed, orderId }) {
    if (couponDocId) {
        try {
            await releaseCouponRedemption(couponDocId, userId);
        } catch (err) {
            console.error('[CHECKOUT-ROLLBACK] Coupon release failed:', err.message);
        }
    }
    if (pointsRedeemed > 0 && userId) {
        try {
            await restoreLoyaltyPointsAtomic(userId, pointsRedeemed, {
                type: 'cancelled_restored',
                orderId,
                description: 'Checkout rollback — points restored'
            });
        } catch (err) {
            console.error('[CHECKOUT-ROLLBACK] Loyalty points restore failed:', err.message);
        }
    }
}

/**
 * Restore loyalty points and coupon slot when an order transitions to cancelled.
 * Call only when moving from a non-cancelled status to cancelled.
 */
async function restoreOrderMarketingRedemptions(order) {
    if (!order) return { pointsRestored: 0, couponReleased: false };

    const userId = order.user || order.userId;
    const pointsRedeemed = Math.max(0, Number(order.pointsRedeemed) || 0);
    const orderRef = order.orderId || String(order._id);
    let pointsRestored = 0;
    let couponReleased = false;

    if (pointsRedeemed > 0 && userId) {
        const restored = await restoreLoyaltyPointsAtomic(userId, pointsRedeemed, {
            type: 'cancelled_restored',
            orderId: orderRef,
            description: `Order ${orderRef} cancelled — points restored`
        });
        if (restored) {
            pointsRestored = pointsRedeemed;
            console.info('[ORDER-CANCEL] Restored loyalty points', {
                userId: String(userId),
                points: pointsRedeemed,
                orderId: orderRef
            });
        }
    }

    const couponCode = String(order.couponCode || '').trim().toUpperCase();
    if (couponCode) {
        const coupon = await Coupon.findOne({ code: couponCode }).select('_id');
        if (coupon) {
            const released = await releaseCouponRedemption(coupon._id, userId || null);
            couponReleased = Boolean(released);
            if (couponReleased) {
                console.info('[ORDER-CANCEL] Released coupon redemption', {
                    couponCode,
                    userId: userId ? String(userId) : 'guest',
                    orderId: orderRef
                });
            }
        }
    }

    return { pointsRestored, couponReleased };
}

function isCancelledStatus(status) {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized === 'cancelled' || normalized === 'canceled';
}

module.exports = {
    deductLoyaltyPointsAtomic,
    restoreLoyaltyPointsAtomic,
    rollbackCheckoutMarketingReservations,
    restoreOrderMarketingRedemptions,
    isCancelledStatus
};
