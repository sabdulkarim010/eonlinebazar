/********************************************************************
 * Pre-checkout order quote — server-authoritative pricing (no writes).
 ********************************************************************/

const mongoose = require('mongoose');
const Product = require('../models/product');
const User = require('../models/user');
const Coupon = require('../models/coupon');
const {
    validateCouponForCart,
    assertCouponActiveAndUnexpired,
    runCouponAutoExpiry
} = require('../controllers/couponController');
const { getApplicationNow, isExpiryReached } = require('../utils/applicationTime');
const { findVariantIndex } = require('../utils/variantHelpers');
const {
    resolveSellingPriceFromSettings,
    resolveAvailableStock,
    buildVariantSnapshot
} = require('../controllers/orderControllerHelpers');
const { loadFlashSaleSettings } = require('../services/flashSaleService');
const {
    getDeliverySettings,
    resolveDistrictLabel,
    resolveDeliveryZone,
    toShippingLocationLabel,
    computeDeliveryCharge,
    buildLockedOrderTotals,
    roundMoney,
    isValidDistrict
} = require('../services/deliveryChargeService');
const { getDeliveryEstimate } = require('../services/deliveryEstimateService');
const { getTaxSettings } = require('../services/settingsReadService');
const { computeOrderTaxSnapshot } = require('../services/taxSettingsService');
const { loadRewardSettings, calculatePointsCashValue } = require('../utils/rewardSettings');

function stripQuoteLine(item = {}) {
    const productId = item.productId || item.id || item._id;
    if (!productId) return null;
    const out = {
        productId,
        quantity: Math.max(1, Number(item.quantity) || 1)
    };
    const variantId = item.variantId != null ? String(item.variantId).trim() : '';
    if (variantId) out.variantId = variantId;
    return out;
}

function resolveShippingDistrict(body = {}) {
    const addr = body.shippingAddress && typeof body.shippingAddress === 'object'
        ? body.shippingAddress
        : {};
    return resolveDistrictLabel(
        addr.district
        || addr.shippingDistrict
        || body.shippingDistrict
        || body.customerDistrict
        || body.district
        || ''
    );
}

async function computeOrderQuote(input = {}) {
    const rawItems = Array.isArray(input.items) ? input.items : [];
    const quoteItems = rawItems.map(stripQuoteLine).filter(Boolean);

    if (quoteItems.length === 0) {
        return {
            ok: false,
            status: 400,
            code: 'EMPTY_CART',
            message: 'Your cart must include at least one item.'
        };
    }

    const userId = input.userId || null;
    const couponCode = String(input.couponCode || input.coupon || '').trim().toUpperCase();
    const shippingDistrict = resolveShippingDistrict(input);
    const deliveryMethod = String(input.deliveryMethod || '').trim().toLowerCase();
    const locationTypeOverride = deliveryMethod === 'outside' || deliveryMethod === 'outside city'
        ? 'outside'
        : (deliveryMethod === 'inside' || deliveryMethod === 'inside city' ? 'inside' : null);

    const itemErrors = [];
    let normalizedItems = [];
    let subtotal = 0;
    const flashSettings = await loadFlashSaleSettings();

    for (const line of quoteItems) {
        const targetId = line.productId;
        const quantity = line.quantity;

        const query = mongoose.Types.ObjectId.isValid(targetId)
            ? { $or: [{ _id: targetId }, { productId: targetId }] }
            : { productId: targetId };

        const prod = await Product.findOne(query).select(
            'price buyingPrice variants name productId category stock stockQuantity hasVariants'
        );

        if (!prod) {
            itemErrors.push({
                productId: targetId,
                variantId: line.variantId || '',
                code: 'NOT_FOUND',
                message: `Product not found: ${targetId}`
            });
            continue;
        }

        const vIdx = findVariantIndex(prod, line);
        const hasVariants = Array.isArray(prod.variants) && prod.variants.length > 0;
        if (hasVariants && vIdx <= -1) {
            itemErrors.push({
                productId: targetId,
                variantId: line.variantId || '',
                code: 'VARIANT_REQUIRED',
                message: `Select a valid variant for "${prod.name}".`
            });
            continue;
        }

        const availableStock = resolveAvailableStock(prod, vIdx);
        if (quantity > availableStock) {
            const variantHint = vIdx > -1 ? buildVariantSnapshot(prod, vIdx).variantLabel : 'default';
            itemErrors.push({
                productId: targetId,
                variantId: line.variantId || '',
                code: 'INSUFFICIENT_STOCK',
                message: `Insufficient stock for "${prod.name}" (${variantHint}). Available: ${availableStock}, requested: ${quantity}.`
            });
            continue;
        }

        const verifiedPrice = resolveSellingPriceFromSettings(prod, line, flashSettings);
        if (!Number.isFinite(verifiedPrice) || verifiedPrice < 0) {
            itemErrors.push({
                productId: targetId,
                variantId: line.variantId || '',
                code: 'PRICE_UNAVAILABLE',
                message: `Unable to verify price for "${prod.name}".`
            });
            continue;
        }

        const normalized = {
            productId: prod.productId || String(prod._id),
            id: prod.productId || String(prod._id),
            name: prod.name,
            price: roundMoney(verifiedPrice),
            quantity,
            variantId: line.variantId || '',
            selected: true
        };

        subtotal += verifiedPrice * quantity;
        normalizedItems.push(normalized);
    }

    if (itemErrors.length > 0) {
        return {
            ok: false,
            status: 400,
            code: 'ITEM_UNAVAILABLE',
            message: itemErrors[0].message,
            itemErrors
        };
    }

    subtotal = roundMoney(subtotal);

    let discountAmount = 0;
    let appliedCouponCode = '';

    if (couponCode) {
        const now = getApplicationNow();
        await runCouponAutoExpiry(now);

        const couponRecord = await Coupon.findOne({ code: couponCode });
        if (!couponRecord) {
            return { ok: false, status: 404, code: 'INVALID_COUPON', message: 'Invalid coupon code.' };
        }

        if (isExpiryReached(couponRecord.expiryDate, now) && couponRecord.status !== 'EXPIRED') {
            couponRecord.status = 'EXPIRED';
            couponRecord.isActive = false;
            await couponRecord.save();
        }

        const eligibility = assertCouponActiveAndUnexpired(couponRecord, now);
        if (!eligibility.ok) {
            return {
                ok: false,
                status: eligibility.status,
                code: 'INVALID_COUPON',
                message: eligibility.message
            };
        }

        const couponResult = await validateCouponForCart({
            code: couponCode,
            subtotal,
            userId,
            paymentMethodCode: input.paymentMethodCode || '',
            cartItems: normalizedItems,
            now
        });

        if (!couponResult.ok) {
            return {
                ok: false,
                status: couponResult.status,
                code: 'INVALID_COUPON',
                message: couponResult.message
            };
        }

        discountAmount = couponResult.breakdown.discountAmount;
        appliedCouponCode = couponResult.breakdown.code;
    }

    let loyaltyDiscount = 0;
    let pointsRedeemed = 0;

    if (userId && (input.applyLoyaltyPoints === true || Number(input.loyaltyPointsToUse) > 0)) {
        const pointsUser = await User.findById(userId).select('loyaltyPoints');
        const availablePoints = Math.max(0, Number(pointsUser?.loyaltyPoints) || 0);
        const requestedPoints = Math.min(
            Math.max(0, Number(input.loyaltyPointsToUse) || availablePoints),
            availablePoints
        );

        if (requestedPoints > 0) {
            const rewardSettings = await loadRewardSettings();
            loyaltyDiscount = roundMoney(calculatePointsCashValue(requestedPoints, rewardSettings));
            if (loyaltyDiscount > 0) {
                pointsRedeemed = requestedPoints;
                discountAmount = roundMoney(discountAmount + loyaltyDiscount);
            }
        }
    }

    const deliverySettings = await getDeliverySettings();
    let deliveryLocationType = shippingDistrict
        ? resolveDeliveryZone(deliverySettings, shippingDistrict)
        : (locationTypeOverride || 'inside');

    if (locationTypeOverride && !shippingDistrict) {
        deliveryLocationType = locationTypeOverride;
    }

    const shippingLocationType = toShippingLocationLabel(deliveryLocationType);
    const deliveryEstimate = getDeliveryEstimate(deliveryLocationType);

    let shippingFee = 0;
    if (shippingDistrict && isValidDistrict(shippingDistrict)) {
        shippingFee = computeDeliveryCharge(deliverySettings, {
            customerDistrict: shippingDistrict,
            subtotal
        });
    } else if (locationTypeOverride && !shippingDistrict) {
        shippingFee = computeDeliveryCharge(deliverySettings, {
            locationType: locationTypeOverride,
            subtotal
        });
    }

    const taxSettings = await getTaxSettings();
    const taxSnapshot = computeOrderTaxSnapshot({
        taxSettings,
        subTotal: subtotal,
        discountAmount,
        lineItems: normalizedItems
    });
    const vatAmount = taxSnapshot.taxAmount;

    const lockedTotals = buildLockedOrderTotals({
        itemSubtotal: subtotal,
        discountAmount,
        deliveryCharge: shippingFee,
        vatAmount
    });

    const wantsWallet = input.applyWallet === true
        || input.useWallet === true
        || input.applyWalletBalance === true;

    let walletApplied = 0;
    if (wantsWallet && userId) {
        const walletUser = await User.findById(userId).select('walletBalance');
        const availableWallet = roundMoney(Number(walletUser?.walletBalance) || 0);
        walletApplied = roundMoney(Math.min(availableWallet, lockedTotals.grandTotal));
    }

    const payableAfterWallet = roundMoney(Math.max(0, lockedTotals.grandTotal - walletApplied));

    const quote = {
        subtotal: lockedTotals.subTotal,
        shippingFee: lockedTotals.deliveryCharge,
        tax: lockedTotals.vatAmount,
        vatAmount: lockedTotals.vatAmount,
        vatPercentage: taxSnapshot.vatRate,
        vatEnabled: taxSnapshot.vatEnabled,
        priceTaxMode: taxSnapshot.priceTaxMode || 'INCLUSIVE',
        taxableAmount: taxSnapshot.taxableAmount,
        discountAmount: lockedTotals.discountAmount,
        merchandisePayable: lockedTotals.merchandisePayable,
        grandTotal: lockedTotals.grandTotal,
        payableTotal: lockedTotals.grandTotal,
        walletApplied,
        payableAfterWallet,
        couponCode: appliedCouponCode,
        loyaltyDiscount,
        loyaltyPointsToUse: pointsRedeemed,
        shippingDistrict: shippingDistrict || '',
        shippingLocationType,
        deliveryLocationType,
        estimatedDelivery: deliveryEstimate?.label || null,
        quoteGeneratedAt: new Date().toISOString()
    };

    return {
        ok: true,
        quote,
        items: normalizedItems
    };
}

module.exports = {
    stripQuoteLine,
    resolveShippingDistrict,
    computeOrderQuote
};
