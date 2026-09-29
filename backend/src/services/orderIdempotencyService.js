/********************************************************************
 * Checkout idempotency — X-Idempotency-Key replay for POST /api/orders
 ********************************************************************/

const Order = require('../models/order');
const { buildLockedPricingPayload } = require('../controllers/orderControllerHelpers');
const { roundMoney } = require('./deliveryChargeService');

const MAX_KEY_LENGTH = 128;

function normalizeIdempotencyKey(raw) {
    const key = String(raw || '').trim();
    if (!key || key.length > MAX_KEY_LENGTH) return '';
    return key;
}

function buildReplayPayload(order) {
    const doc = order && typeof order.toObject === 'function' ? order.toObject() : order;
    if (!doc) return null;

    const subTotal = roundMoney(Number(doc.subTotal ?? doc.subtotal) || 0);
    const discountAmount = roundMoney(Number(doc.discountAmount) || 0);
    const deliveryCharge = roundMoney(Number(doc.deliveryCharge ?? doc.shippingFee) || 0);
    const vatAmount = roundMoney(Number(doc.vatAmount ?? doc.taxAmount) || 0);
    const grandTotal = roundMoney(Number(doc.grandTotal ?? doc.totalAmount) || 0);
    const walletApplied = roundMoney(Number(doc.walletApplied) || 0);
    const processingFee = roundMoney(Number(doc.processingFee) || 0);
    const merchandisePayable = roundMoney(Math.max(0, subTotal - discountAmount));

    const lockedPricing = buildLockedPricingPayload({
        subTotal,
        discountAmount,
        deliveryCharge,
        vatAmount,
        merchandisePayable,
        grandTotal,
        processingFee,
        walletApplied,
        payableTotal: grandTotal,
        paymentMethod: doc.paymentMethod || '',
        shippingDistrict: doc.shippingDistrict || '',
        shippingLocationType: doc.shippingLocationType || '',
        deliveryLocationType: doc.deliveryLocationType || 'inside'
    });

    return {
        success: true,
        message: 'Order placed successfully! ধন্যবাদ আব্দুল করিম ভাই।',
        idempotentReplay: true,
        data: doc,
        lockedPricing: {
            ...lockedPricing,
            walletApplied,
            grandTotal,
            totalAmount: grandTotal,
            merchandisePayable,
            paymentMethod: doc.paymentMethod || ''
        }
    };
}

async function findOrderByIdempotencyKey(idempotencyKey) {
    const key = normalizeIdempotencyKey(idempotencyKey);
    if (!key) return null;
    return Order.findOne({ checkoutIdempotencyKey: key }).lean();
}

async function tryReplayIdempotentOrder(idempotencyKey, res) {
    const existing = await findOrderByIdempotencyKey(idempotencyKey);
    if (!existing) return false;

    const payload = buildReplayPayload(existing);
    if (!payload) return false;

    res.status(200).json(payload);
    return true;
}

function attachIdempotencyKeyToOrder(orderDoc, idempotencyKey) {
    const key = normalizeIdempotencyKey(idempotencyKey);
    if (!key || !orderDoc) return;
    orderDoc.checkoutIdempotencyKey = key;
}

function isDuplicateKeyError(err) {
    return err && (err.code === 11000 || err.code === '11000');
}

module.exports = {
    normalizeIdempotencyKey,
    buildReplayPayload,
    findOrderByIdempotencyKey,
    tryReplayIdempotentOrder,
    attachIdempotencyKeyToOrder,
    isDuplicateKeyError
};
