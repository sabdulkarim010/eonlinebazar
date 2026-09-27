/********************************************************************
 * Project: EonlineBazar — Settings integration credentials
 * File: settingsIntegrationSecrets.js
 * Description: Encrypt at rest, mask on read, skip masked placeholders on write.
 ********************************************************************/

'use strict';

const { encryptSecret, decryptSecret } = require('./cryptoVault');
const { maskSecretKey, isMaskedSecretPlaceholder } = require('./secretMasking');

const INTEGRATION_SECRET_FIELDS = Object.freeze([
    'smsApiKey',
    'courierApiKey',
    'courierSecretKey',
    'whatsAppAlertApiKey'
]);

const ENVELOPE_PREFIX = 'enc:';

function resolveIntegrationSecret(stored) {
    const raw = String(stored || '').trim();
    if (!raw) return '';
    if (raw.startsWith(ENVELOPE_PREFIX)) {
        try {
            return decryptSecret(raw.slice(ENVELOPE_PREFIX.length)) || '';
        } catch {
            return '';
        }
    }
    return raw;
}

function encryptIntegrationSecret(plainText) {
    const value = String(plainText || '').trim();
    if (!value) return '';
    if (value.startsWith(ENVELOPE_PREFIX)) return value;
    return `${ENVELOPE_PREFIX}${encryptSecret(value)}`;
}

/**
 * Apply masked secret fields to a settings payload for API responses.
 * @param {object} payload
 * @returns {object}
 */
function maskIntegrationSecretsInPayload(payload = {}) {
    const out = { ...payload };
    for (const field of INTEGRATION_SECRET_FIELDS) {
        if (out[field] === undefined) continue;
        const plain = resolveIntegrationSecret(out[field]);
        out[field] = plain ? maskSecretKey(plain) : '';
    }
    return out;
}

/**
 * Update one integration secret on a settings document.
 * @returns {{ updated: boolean, critical?: boolean }}
 */
function applyIntegrationSecretUpdate(settings, field, rawIncoming) {
    if (!INTEGRATION_SECRET_FIELDS.includes(field)) {
        throw new Error(`Unknown integration secret field: ${field}`);
    }

    const incoming = String(rawIncoming ?? '').trim();

    if (!incoming) {
        settings[field] = '';
        return { updated: true, critical: true };
    }

    if (isMaskedSecretPlaceholder(incoming)) {
        return { updated: false };
    }

    settings[field] = encryptIntegrationSecret(incoming);
    return { updated: true, critical: true };
}

function bodyTouchesIntegrationCredentials(body = {}) {
    return INTEGRATION_SECRET_FIELDS.some((field) => body[field] !== undefined);
}

module.exports = {
    INTEGRATION_SECRET_FIELDS,
    resolveIntegrationSecret,
    encryptIntegrationSecret,
    maskIntegrationSecretsInPayload,
    applyIntegrationSecretUpdate,
    bodyTouchesIntegrationCredentials,
    isMaskedSecretPlaceholder
};
