/********************************************************************
 * Project: EonlineBazar
 * File: whatsappService.js
 * Location: utils/whatsappService.js
 * Description: Background WhatsApp admin order alerts — runs entirely
 * on the server after checkout, independent of the admin panel session.
 * Supports UltraMsg, Green API, CallMeBot, generic HTTP POST, and a
 * direct webhook fallback to privateAdminAlertWhatsApp.
 ********************************************************************/

const Settings = require('../models/Settings');
const { normalizePhoneNumber } = require('./smsService');

const DEFAULT_PUBLIC_WHATSAPP = String(
    process.env.PUBLIC_SUPPORT_WHATSAPP
    || process.env.WHATSAPP_PUBLIC_NUMBER
    || '8801521377735'
).replace(/\D/g, '');

const VALID_ALERT_PROVIDERS = ['CallMeBot', 'UltraMsg', 'Green API', 'Generic', 'Webhook', ''];

const HTTP_TIMEOUT_MS = Number(process.env.WHATSAPP_ALERT_TIMEOUT_MS) || 15000;
const CACHE_TTL_MS = 15 * 1000;
const MAX_PENDING_ALERTS = 100;

let cachedPublicSettings = null;
let publicCacheExpiresAt = 0;

/** In-memory fallback queue when every driver fails (admin badge / wa.me link). */
const pendingWhatsAppAlerts = [];

function normalizeWhatsAppNumber(phone) {
    return normalizePhoneNumber(phone);
}

/**
 * Strip leading '+', spaces, dashes — normalize to digits (8801XXXXXXXXX).
 */
function sanitizeWhatsAppInput(value) {
    const digits = String(value || '')
        .replace(/^\++/, '')
        .replace(/[\s\-().]/g, '')
        .replace(/\D/g, '');

    if (!digits) return '';

    if (digits.startsWith('880') && digits.length === 13) return digits;
    if (digits.startsWith('88') && digits.length === 12) return digits;
    if (digits.startsWith('0') && digits.length === 11) return `88${digits}`;
    if (digits.length === 10 && digits.startsWith('1')) return `880${digits}`;

    return digits.length >= 10 ? digits : '';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = HTTP_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(`WhatsApp gateway timed out after ${timeoutMs}ms`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function logWhatsAppToConsole({ to, body, context = 'ADMIN WHATSAPP ALERT', extra = '' }) {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log(`║          💬  ${context.padEnd(47)}║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  To:      ${String(to || 'N/A').padEnd(51)}║`);
    console.log(`║  Message: ${String(body || '').slice(0, 51).padEnd(51)}║`);
    if (String(body || '').length > 51) {
        console.log(`║           ${String(body).slice(51, 102).padEnd(51)}║`);
    }
    if (extra) {
        console.log(`║  Note:    ${String(extra).slice(0, 51).padEnd(51)}║`);
    }
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\n');
}

function clearWhatsAppSettingsCache() {
    cachedPublicSettings = null;
    publicCacheExpiresAt = 0;
}

async function loadWhatsAppSettingsFromDb() {
    const doc = await Settings.getOrCreate();
    return {
        publicSupportWhatsApp: sanitizeWhatsAppInput(
            doc.publicSupportWhatsApp || DEFAULT_PUBLIC_WHATSAPP
        ),
        privateAdminAlertWhatsApp: sanitizeWhatsAppInput(doc.privateAdminAlertWhatsApp),
        enableWhatsAppOrderAlerts: doc.enableWhatsAppOrderAlerts === true,
        whatsAppAlertProvider: String(doc.whatsAppAlertProvider || '').trim(),
        whatsAppAlertApiKey: String(doc.whatsAppAlertApiKey || '').trim(),
        whatsAppAlertInstanceId: String(doc.whatsAppAlertInstanceId || '').trim(),
        whatsAppAlertWebhookUrl: String(doc.whatsAppAlertWebhookUrl || '').trim()
    };
}

async function loadWhatsAppAlertGatewayConfig(dbSettings = null) {
    const settings = dbSettings || await loadWhatsAppSettingsFromDb();

    const provider = String(
        settings.whatsAppAlertProvider
        || process.env.WHATSAPP_ALERT_PROVIDER
        || ''
    ).trim();

    const apiKey = String(
        settings.whatsAppAlertApiKey
        || process.env.WHATSAPP_ALERT_API_KEY
        || process.env.WHATSAPP_API_KEY
        || ''
    ).trim();

    const instanceId = String(
        settings.whatsAppAlertInstanceId
        || process.env.WHATSAPP_ALERT_INSTANCE_ID
        || process.env.WHATSAPP_INSTANCE_ID
        || ''
    ).trim();

    const genericUrl = String(process.env.WHATSAPP_ALERT_API_URL || '').trim();

    const webhookUrl = String(
        settings.whatsAppAlertWebhookUrl
        || process.env.WHATSAPP_ALERT_WEBHOOK_URL
        || ''
    ).trim();

    return { provider, apiKey, instanceId, genericUrl, webhookUrl };
}

async function getPublicWhatsAppSettings({ forceRefresh = false } = {}) {
    const now = Date.now();
    if (!forceRefresh && cachedPublicSettings && now < publicCacheExpiresAt) {
        return cachedPublicSettings;
    }

    const settings = await loadWhatsAppSettingsFromDb();
    cachedPublicSettings = {
        publicSupportWhatsApp: settings.publicSupportWhatsApp || DEFAULT_PUBLIC_WHATSAPP
    };
    publicCacheExpiresAt = now + CACHE_TTL_MS;
    return cachedPublicSettings;
}

function buildCustomerChatUrl(phone, storeName = 'EonlineBazar') {
    const normalized = sanitizeWhatsAppInput(phone) || DEFAULT_PUBLIC_WHATSAPP;
    const text = encodeURIComponent(`Hello ${storeName}, I need some help!`);
    return `https://wa.me/${normalized}?text=${text}`;
}

function buildAdminWaMeAlertUrl(adminPhone, body) {
    const normalized = sanitizeWhatsAppInput(adminPhone);
    if (!normalized) return '';
    return `https://wa.me/${normalized}?text=${encodeURIComponent(body)}`;
}

function formatOrderItemsList(items = []) {
    if (!Array.isArray(items) || items.length === 0) {
        return '  - (no items listed)';
    }

    return items
        .map((item) => {
            const name = String(item?.name || 'Item').trim();
            const qty = Math.max(1, Number(item?.quantity) || 1);
            const variant = String(item?.variantLabel || '').trim();
            return variant
                ? `  - ${name} (${variant}) x${qty}`
                : `  - ${name} x${qty}`;
        })
        .join('\n');
}

function formatAdminOrderAlertMessage(order) {
    const orderId = order?.orderId || order?._id || 'N/A';
    const customerName = String(order?.customerName || 'Customer').trim();
    const rawPhone = order?.customerPhone || 'N/A';
    const customerPhone = sanitizeWhatsAppInput(rawPhone) || String(rawPhone).trim();
    const address = String(order?.customerAddress || 'Not provided').trim();
    const amount = Number(order?.grandTotal ?? order?.totalAmount ?? 0).toLocaleString('en-US');
    const payment = String(order?.paymentMethod || 'COD').trim();
    const itemsBlock = formatOrderItemsList(order?.items);

    const lines = [
        '📦 *New Order Alert - EOnlineBazar*',
        '',
        `• Order ID: #${orderId}`,
        `• Customer: ${customerName} (${customerPhone})`,
        `• Address: ${address}`,
        `• Total: ৳${amount}`,
        `• Payment: ${payment}`,
        '• Items:',
        itemsBlock
    ];

    if (order?.orderSource === 'manual') {
        lines.push('', '_Manual POS / phone entry_');
    }

    return lines.join('\n');
}

function queuePendingWhatsAppAlert({ orderId, adminPhone, body, waMeUrl, reason, delivered = false }) {
    const alert = {
        id: `${orderId}-${Date.now()}`,
        orderId,
        adminPhone,
        body,
        waMeUrl,
        reason: reason || '',
        delivered,
        createdAt: new Date().toISOString()
    };

    pendingWhatsAppAlerts.unshift(alert);
    while (pendingWhatsAppAlerts.length > MAX_PENDING_ALERTS) {
        pendingWhatsAppAlerts.pop();
    }

    return alert;
}

function getPendingWhatsAppAlerts({ undeliveredOnly = true } = {}) {
    if (!undeliveredOnly) return [...pendingWhatsAppAlerts];
    return pendingWhatsAppAlerts.filter((alert) => !alert.delivered);
}

function dismissPendingWhatsAppAlert(alertId) {
    const index = pendingWhatsAppAlerts.findIndex((alert) => alert.id === alertId);
    if (index === -1) return false;
    pendingWhatsAppAlerts.splice(index, 1);
    return true;
}

function markPendingAlertDelivered(orderId) {
    pendingWhatsAppAlerts.forEach((alert) => {
        if (alert.orderId === orderId) alert.delivered = true;
    });
}

function isUltraMsgReady(config) {
    return Boolean(config?.apiKey && config?.instanceId);
}

function isGreenApiReady(config) {
    return Boolean(config?.apiKey && config?.instanceId);
}

function isCallMeBotReady(config) {
    return Boolean(config?.apiKey);
}

function isGenericReady(config) {
    return Boolean(config?.genericUrl);
}

function isWebhookReady(config) {
    return Boolean(config?.webhookUrl);
}

/**
 * Pick the primary API driver. UltraMsg / Green API take precedence when
 * their credentials are saved in Master Settings.
 */
function resolvePrimaryDriver(config) {
    const provider = config.provider;

    if (provider === 'UltraMsg' && isUltraMsgReady(config)) return 'UltraMsg';
    if (provider === 'Green API' && isGreenApiReady(config)) return 'Green API';
    if (provider === 'CallMeBot' && isCallMeBotReady(config)) return 'CallMeBot';
    if (provider === 'Generic' && isGenericReady(config)) return 'Generic';

    if (!provider) {
        if (isUltraMsgReady(config)) return 'UltraMsg';
        if (isGreenApiReady(config)) return 'Green API';
        if (isCallMeBotReady(config)) return 'CallMeBot';
        if (isGenericReady(config)) return 'Generic';
    }

    return null;
}

async function sendViaCallMeBot({ to, body, apiKey }) {
    const requestUrl = new URL('https://api.callmebot.com/whatsapp.php');
    requestUrl.searchParams.set('phone', to);
    requestUrl.searchParams.set('text', body);
    requestUrl.searchParams.set('apikey', apiKey);

    console.log(`[WhatsApp] POST (CallMeBot) → ${to}`);

    const res = await fetchWithTimeout(requestUrl.toString(), { method: 'GET' });
    const responseText = await res.text();

    if (!res.ok) {
        throw new Error(responseText || `CallMeBot HTTP ${res.status}`);
    }

    const lower = responseText.toLowerCase();
    if (lower.includes('error') || lower.includes('invalid') || lower.includes('failed')) {
        throw new Error(responseText.trim() || 'CallMeBot rejected the request');
    }

    return { delivered: true, provider: 'CallMeBot', id: responseText.slice(0, 120) };
}

async function sendViaUltraMsg({ to, body, apiKey, instanceId }) {
    const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
    console.log(`[WhatsApp] POST (UltraMsg) → ${to} · instance ${instanceId}`);

    const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: apiKey, to, body })
    });

    const responseText = await res.text();
    let data = {};
    try {
        data = responseText ? JSON.parse(responseText) : {};
    } catch {
        data = { raw: responseText };
    }

    if (!res.ok || data.error) {
        throw new Error(data.error || data.message || data.raw || `UltraMsg HTTP ${res.status}`);
    }

    return { delivered: true, provider: 'UltraMsg', id: data.id || data.message_id || null };
}

async function sendViaGreenApi({ to, body, apiKey, instanceId }) {
    const chatId = `${sanitizeWhatsAppInput(to)}@c.us`;
    const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${apiKey}`;
    console.log(`[WhatsApp] POST (Green API) → ${chatId}`);

    const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: body })
    });

    const responseText = await res.text();
    let data = {};
    try {
        data = responseText ? JSON.parse(responseText) : {};
    } catch {
        data = { raw: responseText };
    }

    if (!res.ok || data.error) {
        throw new Error(data.error || data.message || data.raw || `Green API HTTP ${res.status}`);
    }

    return { delivered: true, provider: 'Green API', id: data.idMessage || null };
}

async function sendViaGenericGateway({ to, body, apiKey, genericUrl }) {
    const url = genericUrl
        .replace(/\{phone\}/g, encodeURIComponent(to))
        .replace(/\{message\}/g, encodeURIComponent(body))
        .replace(/\{apikey\}/g, encodeURIComponent(apiKey))
        .replace(/\{to\}/g, encodeURIComponent(to))
        .replace(/\{text\}/g, encodeURIComponent(body));

    console.log(`[WhatsApp] POST (Generic) → ${to}`);

    const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            phone: to,
            to,
            recipient: to,
            message: body,
            text: body,
            apikey: apiKey
        })
    });

    const responseText = await res.text();

    if (!res.ok) {
        throw new Error(responseText || `Generic gateway HTTP ${res.status}`);
    }

    return { delivered: true, provider: 'Generic', id: responseText.slice(0, 120) };
}

/**
 * Lightweight direct HTTP webhook — fires instantly when UltraMsg / Green API
 * are not configured. Expects any provider that accepts JSON POST.
 */
async function sendViaDirectWebhook({ to, body, webhookUrl }) {
    console.log(`[WhatsApp] POST (Direct webhook) → ${to}`);

    const payload = {
        to,
        phone: to,
        recipient: to,
        number: to,
        message: body,
        text: body,
        source: 'eonlinebazar-order-alert'
    };

    const res = await fetchWithTimeout(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'EonlineBazar-WhatsApp-Alert/1.0'
        },
        body: JSON.stringify(payload)
    });

    const responseText = await res.text();

    if (!res.ok) {
        throw new Error(responseText || `Webhook HTTP ${res.status}`);
    }

    return { delivered: true, provider: 'Webhook', id: responseText.slice(0, 120) };
}

async function executeDriver(driver, { to, body, config }) {
    switch (driver) {
        case 'UltraMsg':
            return sendViaUltraMsg({
                to,
                body,
                apiKey: config.apiKey,
                instanceId: config.instanceId
            });
        case 'Green API':
            return sendViaGreenApi({
                to,
                body,
                apiKey: config.apiKey,
                instanceId: config.instanceId
            });
        case 'CallMeBot':
            return sendViaCallMeBot({ to, body, apiKey: config.apiKey });
        case 'Generic':
            return sendViaGenericGateway({
                to,
                body,
                apiKey: config.apiKey,
                genericUrl: config.genericUrl
            });
        case 'Webhook':
            return sendViaDirectWebhook({
                to,
                body,
                webhookUrl: config.webhookUrl
            });
        default:
            throw new Error(`Unknown WhatsApp driver: ${driver}`);
    }
}

/**
 * Background delivery chain:
 *   1) UltraMsg / Green API / configured primary driver
 *   2) Direct HTTP webhook fallback (Master Settings or .env)
 *   3) CallMeBot if only an API key is present
 */
async function sendAdminAlertViaGateway({ to, body, gatewayConfig }) {
    const config = gatewayConfig || await loadWhatsAppAlertGatewayConfig();
    const primary = resolvePrimaryDriver(config);
    let lastReason = 'No WhatsApp gateway configured';

    if (primary) {
        try {
            const result = await executeDriver(primary, { to, body, config });
            if (result.delivered) return result;
            lastReason = result.reason || `${primary} did not deliver`;
        } catch (err) {
            lastReason = err.message;
            console.warn(`[WhatsApp] Primary driver "${primary}" failed:`, err.message);
        }
    }

    if (isWebhookReady(config) && primary !== 'Webhook') {
        try {
            return await executeDriver('Webhook', { to, body, config });
        } catch (err) {
            lastReason = err.message;
            console.warn('[WhatsApp] Direct webhook fallback failed:', err.message);
        }
    }

    if (!primary && isCallMeBotReady(config)) {
        try {
            return await executeDriver('CallMeBot', { to, body, config });
        } catch (err) {
            lastReason = err.message;
            console.warn('[WhatsApp] CallMeBot fallback failed:', err.message);
        }
    }

    return {
        delivered: false,
        provider: primary || 'none',
        reason: lastReason
    };
}

async function sendAdminOrderAlert(order) {
    const orderId = order?.orderId || order?._id || 'unknown';

    try {
        console.log(`[WhatsApp] ▶ Background alert job started for order #${orderId}`);

        if (!order) {
            console.warn('[WhatsApp] ✗ Aborted — empty order payload');
            return { delivered: false, reason: 'No order payload' };
        }

        let config;
        try {
            config = await loadWhatsAppSettingsFromDb();
        } catch (err) {
            console.error('[WhatsApp] ✗ Failed to load settings from MongoDB:', err.message);
            return { delivered: false, reason: 'Could not load WhatsApp settings' };
        }

        console.log('[WhatsApp] Settings snapshot:', {
            enableWhatsAppOrderAlerts: config.enableWhatsAppOrderAlerts,
            privateAdminAlertWhatsApp: config.privateAdminAlertWhatsApp
                ? `…${config.privateAdminAlertWhatsApp.slice(-4)}`
                : '(not set)',
            provider: config.whatsAppAlertProvider || '(auto-detect)',
            hasWebhook: Boolean(config.whatsAppAlertWebhookUrl || process.env.WHATSAPP_ALERT_WEBHOOK_URL)
        });

        if (!config.enableWhatsAppOrderAlerts) {
            console.warn('[WhatsApp] ✗ Skipped — enableWhatsAppOrderAlerts is false');
            return { delivered: false, reason: 'WhatsApp order alerts disabled in Master Settings' };
        }

        const adminPhone = sanitizeWhatsAppInput(config.privateAdminAlertWhatsApp);
        if (!adminPhone) {
            console.warn('[WhatsApp] ✗ Skipped — privateAdminAlertWhatsApp is empty or invalid');
            return { delivered: false, reason: 'Private admin WhatsApp number not configured' };
        }

        const body = formatAdminOrderAlertMessage(order);
        const waMeUrl = buildAdminWaMeAlertUrl(adminPhone, body);
        const gatewayConfig = await loadWhatsAppAlertGatewayConfig(config);

        const result = await sendAdminAlertViaGateway({
            to: adminPhone,
            body,
            gatewayConfig
        });

        if (result.delivered) {
            markPendingAlertDelivered(orderId);
            console.log(`[WhatsApp] ✓ Background alert delivered via ${result.provider} → ${adminPhone}`);
            return { ...result, waMeUrl, fallbackQueued: false };
        }

        console.warn(`[WhatsApp] ⚠ All drivers failed for #${orderId}: ${result.reason}`);

        const pending = queuePendingWhatsAppAlert({
            orderId,
            adminPhone,
            body,
            waMeUrl,
            reason: result.reason,
            delivered: false
        });

        logWhatsAppToConsole({
            to: adminPhone,
            body,
            context: 'ADMIN ORDER ALERT (queued — wa.me fallback)',
            extra: waMeUrl
        });

        return {
            delivered: false,
            reason: result.reason,
            waMeUrl,
            fallbackQueued: true,
            pendingAlertId: pending.id
        };
    } catch (err) {
        console.error(`[WhatsApp] ✗ Unexpected background job error for #${orderId}:`, err.message);
        return { delivered: false, reason: err.message };
    }
}

function dispatchWhatsAppNotification(task) {
    setImmediate(() => {
        Promise.resolve()
            .then(task)
            .catch((err) => {
                console.error('[WhatsApp] Async background job error:', err.message);
            });
    });
}

function notifyAdminOrderPlaced(order) {
    const payload = order && typeof order.toObject === 'function' ? order.toObject() : order;
    const orderId = payload?.orderId || payload?._id || 'unknown';

    console.log(`[WhatsApp] Scheduling background POST dispatch for order #${orderId}`);

    dispatchWhatsAppNotification(async () => {
        const result = await sendAdminOrderAlert(payload);
        console.log(`[WhatsApp] Background job finished for #${orderId}:`, JSON.stringify({
            delivered: result.delivered,
            provider: result.provider || null,
            reason: result.reason || null,
            fallbackQueued: result.fallbackQueued || false
        }));
        return result;
    });
}

function isGatewayConfigured(config) {
    return Boolean(
        resolvePrimaryDriver(config)
        || isWebhookReady(config)
        || isCallMeBotReady(config)
    );
}

module.exports = {
    DEFAULT_PUBLIC_WHATSAPP,
    VALID_ALERT_PROVIDERS,
    HTTP_TIMEOUT_MS,
    normalizeWhatsAppNumber,
    sanitizeWhatsAppInput,
    clearWhatsAppSettingsCache,
    getPublicWhatsAppSettings,
    buildCustomerChatUrl,
    buildAdminWaMeAlertUrl,
    formatAdminOrderAlertMessage,
    formatOrderItemsList,
    loadWhatsAppAlertGatewayConfig,
    sendAdminOrderAlert,
    notifyAdminOrderPlaced,
    dispatchWhatsAppNotification,
    getPendingWhatsAppAlerts,
    dismissPendingWhatsAppAlert,
    queuePendingWhatsAppAlert,
    isGatewayConfigured,
    fetchWithTimeout
};
