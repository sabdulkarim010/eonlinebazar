/********************************************************************
 * Project: EonlineBazar
 * File: deliveryChargeService.js
 * Location: utils/deliveryChargeService.js
 * Description: Shared delivery charge rules for checkout and orders.
 ********************************************************************/

const Settings = require('../models/Settings');
const {
    normalizeDistrict,
    districtsMatch,
    isValidDistrict,
    resolveDistrictLabel
} = require('./bangladeshDistricts');

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

const toPublicSettings = (doc) => ({
    shopHomeCity: resolveDistrictLabel(doc?.shopHomeCity) || DEFAULT_SETTINGS.shopHomeCity,
    deliveryInsideCity: doc?.deliveryInsideCity ?? DEFAULT_SETTINGS.deliveryInsideCity,
    deliveryOutsideCity: doc?.deliveryOutsideCity ?? DEFAULT_SETTINGS.deliveryOutsideCity,
    freeShippingMinAmount: doc?.freeShippingMinAmount ?? DEFAULT_SETTINGS.freeShippingMinAmount
});

async function getDeliverySettings() {
    const settings = await Settings.getOrCreate();
    return toPublicSettings(settings);
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

    const merchandiseSubtotal = Math.max(0, Number(subtotal) || 0);
    const threshold = Number(config.freeShippingMinAmount);

    if (threshold === 0 || merchandiseSubtotal >= threshold) {
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
    computeDeliveryCharge,
    buildLockedOrderTotals,
    getOrderFinancials,
    roundMoney
};
