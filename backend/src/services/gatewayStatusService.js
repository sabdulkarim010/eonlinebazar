/********************************************************************
 * Project: EonlineBazar
 * File: gatewayStatusService.js
 * Description: Cached gateway health for admin UI (WhatsApp, SMS, email).
 ********************************************************************/

const { fetchSettingsDocumentSafe } = require('./settingsReadService');
const { getEmailProviderStatus } = require('./emailService');
const { getWhatsAppStatus, isWhatsAppEnabled } = require('./whatsappService');

const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedStatus = null;
let cacheExpiresAt = 0;

function isSmsConfigured(settings) {
    const key = String(settings?.smsApiKey || process.env.SMS_API_KEY || '').trim();
    const provider = String(settings?.smsProvider || settings?.smsGatewayProvider || process.env.SMS_PROVIDER || '').trim();
    return Boolean(key && provider);
}

const DEFAULT_GATEWAY_STATUS = Object.freeze({
    email: { provider: 'none', configured: false },
    whatsapp: { provider: 'baileys', status: 'disconnected', enabled: false },
    sms: { provider: 'none', configured: false },
    checkedAt: null
});

async function loadSettingsForGateway() {
    const doc = await fetchSettingsDocumentSafe();
    return doc || {};
}

async function getGatewayStatus({ forceRefresh = false } = {}) {
    const now = Date.now();
    if (!forceRefresh && cachedStatus && now < cacheExpiresAt) {
        return cachedStatus;
    }

    try {
        const settings = await loadSettingsForGateway();
        const email = getEmailProviderStatus();
        const wa = getWhatsAppStatus();

        const status = {
            email,
            whatsapp: {
                provider: 'baileys',
                status: wa.status || 'disconnected',
                enabled: isWhatsAppEnabled()
            },
            sms: {
                provider: settings?.smsGatewayProvider || process.env.SMS_PROVIDER || 'none',
                configured: isSmsConfigured(settings)
            },
            checkedAt: new Date().toISOString()
        };

        cachedStatus = status;
        cacheExpiresAt = now + CACHE_TTL_MS;
        return status;
    } catch (error) {
        console.error('[gatewayStatus] getGatewayStatus failed:', error.message);
        return {
            ...DEFAULT_GATEWAY_STATUS,
            checkedAt: new Date().toISOString()
        };
    }
}

function clearGatewayStatusCache() {
    cachedStatus = null;
    cacheExpiresAt = 0;
}

module.exports = {
    getGatewayStatus,
    clearGatewayStatusCache,
    DEFAULT_GATEWAY_STATUS
};
