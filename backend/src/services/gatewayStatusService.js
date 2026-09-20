/********************************************************************
 * Project: EonlineBazar
 * File: gatewayStatusService.js
 * Description: Cached gateway health for admin UI (WhatsApp, SMS, email).
 ********************************************************************/

const Settings = require('../models/Settings');
const {
    loadWhatsAppAlertGatewayConfig,
    isGatewayConfigured,
    isUltraMsgReady,
    fetchWithTimeout
} = require('./whatsappService');

const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedStatus = null;
let cacheExpiresAt = 0;

function isSmsConfigured(settings) {
    const key = String(settings?.smsApiKey || process.env.SMS_API_KEY || '').trim();
    const provider = String(settings?.smsProvider || process.env.SMS_PROVIDER || '').trim();
    return Boolean(key && provider);
}

function isEmailConfigured() {
    const user = String(process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim();
    return Boolean(user && pass);
}

async function pingUltraMsg(config) {
    if (!isUltraMsgReady(config)) return null;

    const url = `https://api.ultramsg.com/${config.instanceId}/instance/status?token=${encodeURIComponent(config.apiKey)}`;
    try {
        const res = await fetchWithTimeout(url, { method: 'GET' }, 8000);
        const text = await res.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { raw: text };
        }

        const combined = `${text} ${data.error || ''} ${data.message || ''}`.toLowerCase();
        if (!res.ok || data.error) {
            if (
                combined.includes('suspend')
                || combined.includes('subscription')
                || combined.includes('payment')
                || combined.includes('inactive')
                || combined.includes('expired')
            ) {
                return 'suspended';
            }
            return 'suspended';
        }
        return 'active';
    } catch (err) {
        const msg = String(err.message || '').toLowerCase();
        if (msg.includes('suspend') || msg.includes('subscription') || msg.includes('payment')) {
            return 'suspended';
        }
        return 'suspended';
    }
}

async function resolveWhatsAppStatus(settings) {
    const gatewayConfig = await loadWhatsAppAlertGatewayConfig(settings);

    if (!isGatewayConfigured(gatewayConfig)) {
        return 'not_configured';
    }

    if (gatewayConfig.provider === 'UltraMsg' || isUltraMsgReady(gatewayConfig)) {
        const ping = await pingUltraMsg(gatewayConfig);
        if (ping === 'active') return 'active';
        if (ping === 'suspended') return 'suspended';
    }

    if (isGatewayConfigured(gatewayConfig)) {
        return 'active';
    }

    return 'not_configured';
}

async function getGatewayStatus({ forceRefresh = false } = {}) {
    const now = Date.now();
    if (!forceRefresh && cachedStatus && now < cacheExpiresAt) {
        return cachedStatus;
    }

    const settings = await Settings.getOrCreate();
    const whatsapp = await resolveWhatsAppStatus(settings);

    const status = {
        whatsapp,
        sms: isSmsConfigured(settings) ? 'active' : 'not_configured',
        email: isEmailConfigured() ? 'active' : 'not_configured',
        checkedAt: new Date().toISOString()
    };

    cachedStatus = status;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return status;
}

function clearGatewayStatusCache() {
    cachedStatus = null;
    cacheExpiresAt = 0;
}

module.exports = {
    getGatewayStatus,
    clearGatewayStatusCache
};
