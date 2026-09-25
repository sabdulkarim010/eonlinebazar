/********************************************************************
 * Multi-stage abandoned cart recovery sequence.
 ********************************************************************/

'use strict';

const Cart = require('../models/cart');
const Coupon = require('../models/coupon');
const { sendAbandonedCartEmail } = require('./mailer');
const { sendSms, isCustomerSmsEnabled } = require('./smsService');
const { sendWhatsAppMessage } = require('./whatsappService');
const { buildCartRecoveryUrl } = require('./cartRestoreService');

const HOUR_MS = 60 * 60 * 1000;
const STAGE_THRESHOLDS_MS = {
    1: 1 * HOUR_MS,
    2: 24 * HOUR_MS,
    3: 48 * HOUR_MS
};
const MAX_CARTS_PER_RUN = 200;
const RECOVERY_COUPON_DAYS = 7;

function resolveCustomerPhone(user) {
    return String(user?.phone || user?.mobile || '').trim();
}

function resolveCustomerName(user) {
    if (!user || typeof user !== 'object') return '';
    const fromParts = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return fromParts || String(user.name || '').trim();
}

function buildRestoreUrl(cartId) {
    return buildCartRecoveryUrl(cartId).restoreUrl;
}

function buildStage1Sms(name, restoreUrl) {
    return `[EonlineBazar] Hi ${name || 'there'}! Items are still in your cart. Restore in one tap: ${restoreUrl}`;
}

function buildStage3Sms(name, restoreUrl) {
    return `[EonlineBazar] Last chance ${name || 'there'}! Your saved cart expires soon: ${restoreUrl}`;
}

async function generateRecoveryCouponCode(userId) {
    const suffix = String(userId || '').slice(-6).toUpperCase();
    const stamp = Date.now().toString().slice(-5);
    return `ACART5-${suffix}-${stamp}`;
}

async function createRecoveryCoupon(userId) {
    const code = await generateRecoveryCouponCode(userId);
    const expiryDate = new Date(Date.now() + RECOVERY_COUPON_DAYS * 24 * HOUR_MS);

    await Coupon.create({
        code,
        discountType: 'percentage',
        discountValue: 5,
        minOrderAmount: 0,
        maxDiscountAmount: null,
        expiryDate,
        status: 'ACTIVE',
        usageLimit: 1,
        perUserLimit: 1,
        usedBy: []
    });

    return code;
}

async function dispatchStage1(cart, user) {
    const restoreUrl = buildRestoreUrl(cart._id);
    const customerName = resolveCustomerName(user);
    const phone = resolveCustomerPhone(user);
    let delivered = false;

    if (phone && await isCustomerSmsEnabled()) {
        const smsResult = await sendSms({
            to: phone,
            body: buildStage1Sms(customerName, restoreUrl),
            context: 'ABANDONED CART STAGE 1'
        });
        delivered = delivered || !!smsResult?.delivered;
    }

    if (phone) {
        const waResult = await sendWhatsAppMessage(phone, buildStage1Sms(customerName, restoreUrl));
        delivered = delivered || !!waResult?.success;
    }

    return { delivered, restoreUrl };
}

async function dispatchStage2(cart, user, couponCode) {
    const restoreUrl = buildRestoreUrl(cart._id);
    const email = String(user.email || '').trim();
    const customerName = resolveCustomerName(user);
    let delivered = false;

    if (email) {
        const emailResult = await sendAbandonedCartEmail({
            to: email,
            customerName,
            items: cart.items,
            cartUrl: `${restoreUrl}&coupon=${encodeURIComponent(couponCode)}`
        });
        delivered = !!emailResult?.delivered;
    }

    return { delivered, couponCode, restoreUrl };
}

async function dispatchStage3(cart, user) {
    const restoreUrl = buildRestoreUrl(cart._id);
    const customerName = resolveCustomerName(user);
    const phone = resolveCustomerPhone(user);
    const email = String(user.email || '').trim();
    let delivered = false;

    const finalBody = buildStage3Sms(customerName, restoreUrl);

    if (phone && await isCustomerSmsEnabled()) {
        const smsResult = await sendSms({
            to: phone,
            body: finalBody,
            context: 'ABANDONED CART STAGE 3'
        });
        delivered = delivered || !!smsResult?.delivered;
    }

    if (email) {
        const emailResult = await sendAbandonedCartEmail({
            to: email,
            customerName,
            items: cart.items,
            cartUrl: restoreUrl
        });
        delivered = delivered || !!emailResult?.delivered;
    }

    return { delivered, restoreUrl };
}

function resolveNextStage(cart, now = Date.now()) {
    const stage = Number(cart.recoveryStage) || 0;
    const idleMs = now - new Date(cart.lastActivityAt || cart.updatedAt || now).getTime();

    if (stage === 0 && idleMs >= STAGE_THRESHOLDS_MS[1]) return 1;
    if (stage === 1 && idleMs >= STAGE_THRESHOLDS_MS[2]) return 2;
    if (stage === 2 && idleMs >= STAGE_THRESHOLDS_MS[3]) return 3;
    return null;
}

async function advanceCartRecoveryStage(cart, user, targetStage) {
    const now = new Date();
    const update = { recoveryStage: targetStage };

    if (targetStage === 1) {
        await dispatchStage1(cart, user);
        update.recoveryStage1At = now;
    } else if (targetStage === 2) {
        const couponCode = cart.recoveryCouponCode || await createRecoveryCoupon(user._id);
        await dispatchStage2(cart, user, couponCode);
        update.recoveryStage2At = now;
        update.recoveryCouponCode = couponCode;
        update.abandonedNotifiedAt = now;
    } else if (targetStage === 3) {
        await dispatchStage3(cart, user);
        update.recoveryStage3At = now;
    }

    await Cart.updateOne({ _id: cart._id }, { $set: update });
    return update;
}

async function processMultiStageAbandonedCarts() {
    try {
        const carts = await Cart.find({ 'items.0': { $exists: true } })
            .populate('userId', 'firstName lastName name email phone mobile isDeleted')
            .limit(MAX_CARTS_PER_RUN)
            .lean(false);

        let processed = 0;
        let stage1 = 0;
        let stage2 = 0;
        let stage3 = 0;

        for (const cart of carts) {
            const user = cart.userId && typeof cart.userId === 'object' ? cart.userId : null;
            if (!user || user.isDeleted) continue;
            if (!Array.isArray(cart.items) || cart.items.length === 0) continue;

            const nextStage = resolveNextStage(cart);
            if (!nextStage) continue;

            await advanceCartRecoveryStage(cart, user, nextStage);
            processed += 1;
            if (nextStage === 1) stage1 += 1;
            if (nextStage === 2) stage2 += 1;
            if (nextStage === 3) stage3 += 1;
        }

        return {
            processed,
            stage1,
            stage2,
            stage3,
            candidates: carts.length
        };
    } catch (err) {
        console.error('[AbandonedCart] Multi-stage job failed:', err.message);
        return { processed: 0, error: err.message };
    }
}

module.exports = {
    STAGE_THRESHOLDS_MS,
    HOUR_MS,
    resolveNextStage,
    advanceCartRecoveryStage,
    processMultiStageAbandonedCarts,
    createRecoveryCoupon
};
