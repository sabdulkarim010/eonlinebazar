/********************************************************************
 * Project: EonlineBazar
 * File: paymentGatewayService.js
 * Location: utils/paymentGatewayService.js
 * Author: Abdul Karim Sheikh
 * Description: Reader for the retired payment settings that used to live on
 * the `Settings` singleton as a fixed five-gateway toggle map. Payment
 * methods are now their own collection (models/PaymentMethod.js); this file
 * exists solely so the one-time migration in utils/paymentMethodService.js
 * can carry the old toggles and uploaded logos forward.
 ********************************************************************/

const LEGACY_GATEWAY_IDS = Object.freeze(['bKash', 'Nagad', 'Visa', 'MasterCard', 'COD']);

const DEFAULT_GATEWAY_NAMES = Object.freeze({
    bKash: 'bKash',
    Nagad: 'Nagad',
    Visa: 'VISA',
    MasterCard: 'MasterCard',
    COD: 'Cash on Delivery'
});

function isEnabledValue(value) {
    if (value === true || value === 1) return true;
    if (value === undefined || value === null || value === '') return false;

    const str = String(value).trim().toLowerCase();
    return str === 'true' || str === 'on' || str === '1' || str === 'yes';
}

function plainObject(source) {
    if (!source) return null;
    const raw = typeof source.toObject === 'function' ? source.toObject() : source;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
}

/**
 * Normalizes the legacy `paymentGateways` map, falling back to the even older
 * `activePaymentGateways` boolean map, then to "enabled by default".
 */
function normalizePaymentGateways(settingsDoc = {}) {
    const gateways = plainObject(settingsDoc.paymentGateways);
    const legacyToggles = plainObject(settingsDoc.activePaymentGateways) || {};
    const result = {};

    LEGACY_GATEWAY_IDS.forEach((id) => {
        const entry = gateways ? gateways[id] : null;
        const enabled = entry && entry.enabled !== undefined
            ? isEnabledValue(entry.enabled)
            : (legacyToggles[id] !== undefined ? isEnabledValue(legacyToggles[id]) : true);

        result[id] = {
            enabled,
            name: String(entry?.name || DEFAULT_GATEWAY_NAMES[id]).trim() || DEFAULT_GATEWAY_NAMES[id],
            logoUrl: String(entry?.logoUrl || '').trim()
        };
    });

    return result;
}

module.exports = {
    LEGACY_GATEWAY_IDS,
    DEFAULT_GATEWAY_NAMES,
    normalizePaymentGateways
};
