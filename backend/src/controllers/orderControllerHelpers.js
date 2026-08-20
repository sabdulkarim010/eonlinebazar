/********************************************************************
 * Project: EonlineBazar
 * File: orderControllerHelpers.js
 * Location: backend/src/controllers/orderControllerHelpers.js
 * Description: Shared helpers for order checkout, admin POS, and refunds.
 ********************************************************************/

const mongoose = require('mongoose');
const Product = require('../models/product');
const { notifyAdminOrderPlaced } = require('../services/whatsappService');
const { findVariantIndex, getVariantAttributes, getVariantLineId } = require('../utils/variantHelpers');
const { resolveProductFlashPrice } = require('../services/flashSaleService');
const { roundMoney } = require('../services/deliveryChargeService');

/** Fire-and-forget WhatsApp alert — must never block or fail order placement. */
function dispatchAdminWhatsAppAlertSafely(order) {
    try {
        notifyAdminOrderPlaced(order);
    } catch (err) {
        console.error('[Order] WhatsApp alert scheduling failed (non-blocking):', err.message);
    }
}

/** Verified selling price from catalog — never trust client item.price. */
function resolveSellingPriceFromSettings(product, item, flashSettings) {
    if (!product) return NaN;

    const flashPrice = resolveProductFlashPrice(product, item, flashSettings);
    if (Number.isFinite(flashPrice) && flashPrice >= 0) return flashPrice;

    const vIdx = findVariantIndex(product, item);
    if (vIdx > -1) {
        const variantPrice = Number(product.variants[vIdx].price);
        if (Number.isFinite(variantPrice) && variantPrice >= 0) return variantPrice;
    }

    return Number(product.price);
}

function buildLockedPricingPayload({
    subTotal,
    discountAmount,
    deliveryCharge,
    merchandisePayable,
    grandTotal,
    processingFee = 0,
    walletApplied = 0,
    payableTotal,
    paymentMethod = '',
    shippingDistrict,
    shippingLocationType,
    deliveryLocationType
}) {
    const fee = roundMoney(processingFee);
    const total = roundMoney(payableTotal ?? grandTotal + fee);

    return {
        subTotal: roundMoney(subTotal),
        discountAmount: roundMoney(discountAmount),
        deliveryCharge: roundMoney(deliveryCharge),
        merchandisePayable: roundMoney(merchandisePayable),
        // grandTotal excludes the gateway surcharge so the merchandise + shipping
        // figure stays comparable across payment methods.
        grandTotal: roundMoney(grandTotal),
        processingFee: fee,
        walletApplied: roundMoney(walletApplied),
        totalAmount: total,
        payableTotal: total,
        paymentMethod,
        shippingDistrict,
        shippingLocationType,
        deliveryLocationType
    };
}

function buildVariantSnapshot(product, vIdx) {
    if (!product || vIdx <= -1 || !Array.isArray(product.variants)) return {};

    const variant = product.variants[vIdx];
    const attrs = getVariantAttributes(variant);
    const label = Object.entries(attrs)
        .map(([key, value]) => `${key}: ${value}`)
        .join(' / ');

    return {
        variantId: getVariantLineId(variant),
        variantSku: String(variant.sku || '').trim(),
        variantLabel: label,
        variantAttribute: Object.keys(attrs).join(', '),
        variantValue: Object.values(attrs).join(', ')
    };
}

function resolveAvailableStock(product, vIdx) {
    if (!product) return 0;
    if (vIdx > -1 && Array.isArray(product.variants)) {
        return Math.max(0, Number(product.variants[vIdx].stock) || 0);
    }
    const stockQty = Number(product.stockQuantity);
    if (Number.isFinite(stockQty)) return Math.max(0, stockQty);
    return Math.max(0, Number(product.stock) || 0);
}

async function deductOrderStock(normalizedItems) {
    for (const item of normalizedItems) {
        const targetId = item.id || item.productId || item._id;
        const quantityOrdered = Number(item.quantity) || 1;
        if (!targetId) continue;

        const query = mongoose.Types.ObjectId.isValid(targetId)
            ? { $or: [{ _id: targetId }, { productId: targetId }] }
            : { productId: targetId };

        const product = await Product.findOne(query);
        if (!product) continue;

        const vIdx = findVariantIndex(product, item);
        if (vIdx > -1) {
            const current = Number(product.variants[vIdx].stock) || 0;
            product.variants[vIdx].stock = Math.max(0, current - quantityOrdered);
            product.stock = Math.max(0, (Number(product.stock) || 0) - quantityOrdered);
            product.markModified('variants');
            await product.save();
        } else {
            await Product.updateOne(query, { $inc: { stock: -quantityOrdered, stockQuantity: -quantityOrdered } });
        }
    }
}

function normalizeOrderStatus(status) {
    return String(status || '').trim().toLowerCase();
}

function getOrderRefundAmount(order) {
    const payable = Number(order?.grandTotal ?? order?.totalAmount) || 0;
    const walletUsed = Number(order?.walletApplied) || 0;
    return roundMoney(payable + walletUsed);
}

function getOrderDisplayId(order) {
    if (order.orderId) return order.orderId;
    if (order._id) return String(order._id).slice(-6).toUpperCase();
    return 'N/A';
}

module.exports = {
    dispatchAdminWhatsAppAlertSafely,
    resolveSellingPriceFromSettings,
    buildLockedPricingPayload,
    buildVariantSnapshot,
    resolveAvailableStock,
    deductOrderStock,
    normalizeOrderStatus,
    getOrderRefundAmount,
    getOrderDisplayId
};


