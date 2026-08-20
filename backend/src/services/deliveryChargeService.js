/********************************************************************
 * Project: EonlineBazar
 * File: deliveryChargeService.js
 * Location: services/deliveryChargeService.js
 * Description: Shared delivery charge rules for checkout and orders.
 ********************************************************************/

const Settings = require('../models/Settings');
const Setting = require('../models/Setting');
const { resolveFreeShippingThreshold } = require('../utils/announcementSettings');
const {
    normalizeDistrict,
    districtsMatch,
    isValidDistrict,
    resolveDistrictLabel
} = require('../utils/bangladeshDistricts');

const DEFAULT_SETTINGS = {
    shopHomeCity: 'Dhaka',
    deliveryInsideCity: 60,
    deliveryOutsideCity: 120,
    freeShippingMinAmount: 1000
};

const SHIPPING_LOCATION_LABELS = {
    inside: 'Inside City',
    outside: 'Outside City'
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * @param {object} doc - delivery Settings document
 * @param {object} [masterDoc] - master Setting document; when supplied its
 *   freeShippingThreshold wins, since that is the value the Admin Panel's
 *   Master Settings form owns. Both fields are mirrored on every save, so
 *   omitting masterDoc still yields the same number.
 */
const toPublicSettings = (doc, masterDoc = null) => {
    const legacyThreshold = doc?.freeShippingMinAmount ?? DEFAULT_SETTINGS.freeShippingMinAmount;
    const freeShippingThreshold = masterDoc
        ? resolveFreeShippingThreshold(masterDoc, legacyThreshold)
        : legacyThreshold;

    return {
        shopHomeCity: resolveDistrictLabel(doc?.shopHomeCity) || DEFAULT_SETTINGS.shopHomeCity,
        deliveryInsideCity: doc?.deliveryInsideCity ?? DEFAULT_SETTINGS.deliveryInsideCity,
        deliveryOutsideCity: doc?.deliveryOutsideCity ?? DEFAULT_SETTINGS.deliveryOutsideCity,
        freeShippingMinAmount: freeShippingThreshold,
        freeShippingThreshold
    };
};

async function getDeliverySettings() {
    const [deliveryDoc, masterDoc] = await Promise.all([
        Settings.getOrCreate(),
        Setting.getOrCreate()
    ]);
    return toPublicSettings(deliveryDoc, masterDoc);
}

/**
 * Free-shipping progress for a given subtotal — the single place that decides
 * whether shipping is waived, so the badge, the cart hint, and the order
 * totals can never disagree.
 */
function getFreeShippingProgress(settings, subtotal = 0) {
    const threshold = Number(settings?.freeShippingThreshold ?? settings?.freeShippingMinAmount);
    const merchandiseSubtotal = Math.max(0, Number(subtotal) || 0);
    const activeThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : 0;

    if (activeThreshold === 0) {
        return { threshold: 0, subtotal: merchandiseSubtotal, unlocked: true, remaining: 0, progressPercent: 100 };
    }

    const unlocked = merchandiseSubtotal >= activeThreshold;
    return {
        threshold: activeThreshold,
        subtotal: merchandiseSubtotal,
        unlocked,
        remaining: unlocked ? 0 : roundMoney(activeThreshold - merchandiseSubtotal),
        progressPercent: Math.min(100, Math.round((merchandiseSubtotal / activeThreshold) * 100))
    };
}

function parseIncomingLocationType(value) {
    const raw = String(value || 'inside').trim().toLowerCase();
    if (raw === 'outside' || raw === 'outside city') return 'outside';
    return 'inside';
}

function normalizeLocationType(value) {
    return parseIncomingLocationType(value);
}

function toShippingLocationLabel(value) {
    return SHIPPING_LOCATION_LABELS[normalizeLocationType(value)] || SHIPPING_LOCATION_LABELS.inside;
}

function resolveDeliveryZone(settings, customerDistrict) {
    const config = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    return districtsMatch(customerDistrict, config.shopHomeCity) ? 'inside' : 'outside';
}

function computeDeliveryCharge(settings, { customerDistrict, locationType, subtotal = 0 } = {}) {
    const config = {
        ...DEFAULT_SETTINGS,
        ...(settings || {})
    };

    if (getFreeShippingProgress(config, subtotal).unlocked) {
        return 0;
    }

    const zone = customerDistrict
        ? resolveDeliveryZone(config, customerDistrict)
        : normalizeLocationType(locationType);

    return zone === 'outside'
        ? Number(config.deliveryOutsideCity) || 0
        : Number(config.deliveryInsideCity) || 0;
}

function buildLockedOrderTotals({
    itemSubtotal = 0,
    discountAmount = 0,
    deliveryCharge = 0
} = {}) {
    const subTotal = roundMoney(Math.max(0, Number(itemSubtotal) || 0));
    const discount = roundMoney(Math.max(0, Number(discountAmount) || 0));
    const delivery = roundMoney(Math.max(0, Number(deliveryCharge) || 0));
    const merchandisePayable = roundMoney(Math.max(0, subTotal - discount));
    const grandTotal = roundMoney(merchandisePayable + delivery);

    return {
        subTotal,
        discountAmount: discount,
        deliveryCharge: delivery,
        merchandisePayable,
        grandTotal
    };
}

function getOrderFinancials(order = {}) {
    const subTotal = roundMoney(Number(order.subTotal ?? order.subtotal) || 0);
    const discountAmount = roundMoney(Number(order.discountAmount) || 0);
    const deliveryCharge = roundMoney(Number(order.deliveryCharge ?? order.shippingFee) || 0);
    const grandTotal = roundMoney(
        Number(order.grandTotal ?? order.totalAmount)
        || Math.max(0, subTotal - discountAmount + deliveryCharge)
    );
    const shippingDistrict = order.shippingDistrict || '';
    const shippingLocationType = order.shippingLocationType
        || toShippingLocationLabel(order.deliveryLocationType || 'inside');

    return {
        subTotal,
        discountAmount,
        deliveryCharge,
        grandTotal,
        shippingDistrict,
        shippingLocationType
    };
}

module.exports = {
    DEFAULT_SETTINGS,
    SHIPPING_LOCATION_LABELS,
    toPublicSettings,
    getDeliverySettings,
    parseIncomingLocationType,
    normalizeLocationType,
    normalizeDistrict,
    isValidDistrict,
    resolveDistrictLabel,
    resolveDeliveryZone,
    toShippingLocationLabel,
    getFreeShippingProgress,
    computeDeliveryCharge,
    buildLockedOrderTotals,
    getOrderFinancials,
    roundMoney
};
