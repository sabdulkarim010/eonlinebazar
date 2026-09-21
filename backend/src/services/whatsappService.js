/********************************************************************
 * Project: EonlineBazar
 * File: whatsappService.js
 * Description: WhatsApp notifications via Baileys (self-hosted, free).
 * Order alerts, broadcasts, and public support number settings.
 ********************************************************************/

const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const Settings = require('../models/Settings');
const { normalizePhoneNumber } = require('./smsService');

const AUTH_DIR = path.join(__dirname, '../../../.wa-auth');
const VALID_ALERT_PROVIDERS = ['Baileys', 'CallMeBot', 'UltraMsg', 'Green API', 'Generic', 'Webhook', ''];

const DEFAULT_PUBLIC_WHATSAPP = String(
    process.env.PUBLIC_SUPPORT_WHATSAPP
    || process.env.WHATSAPP_PUBLIC_NUMBER
    || '8801521377735'
).replace(/\D/g, '');

const HTTP_TIMEOUT_MS = Number(process.env.WHATSAPP_ALERT_TIMEOUT_MS) || 15000;
const CACHE_TTL_MS = 15 * 1000;
const MAX_PENDING_ALERTS = 100;

let cachedPublicSettings = null;
let publicCacheExpiresAt = 0;
let waSocket = null;
let waStatus = 'disconnected';
let currentQR = null;
let qrDataURL = null;
let connectedPhoneHint = null;
let initInFlight = null;
let waEnabledFlag = process.env.WA_ENABLED === 'true';

const pendingWhatsAppAlerts = [];

function setWhatsAppEnabledFlag(enabled) {
    waEnabledFlag = enabled === true;
}

function isWhatsAppEnabled() {
    return waEnabledFlag === true || process.env.WA_ENABLED === 'true';
}

function normalizeWhatsAppNumber(phone) {
    return normalizePhoneNumber(phone);
}

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
    const { fetchSettingsDocumentSafe } = require('./settingsReadService');
    const doc = await fetchSettingsDocumentSafe();
    const source = doc || {};
    return {
        publicSupportWhatsApp: sanitizeWhatsAppInput(
            source.publicSupportWhatsApp || DEFAULT_PUBLIC_WHATSAPP
        ),
        privateAdminAlertWhatsApp: sanitizeWhatsAppInput(source.privateAdminAlertWhatsApp),
        enableWhatsAppOrderAlerts: source.enableWhatsAppOrderAlerts === true
    };
}

async function loadWhatsAppAlertGatewayConfig(dbSettings = null) {
    const settings = dbSettings || await loadWhatsAppSettingsFromDb();
    return {
        provider: 'Baileys',
        connected: waStatus === 'connected',
        adminPhone: settings.privateAdminAlertWhatsApp
    };
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

async function initWhatsApp() {
    if (!isWhatsAppEnabled()) {
        waStatus = 'disconnected';
        return { status: waStatus };
    }

    if (initInFlight) return initInFlight;

    initInFlight = (async () => {
        try {
            if (!fs.existsSync(AUTH_DIR)) {
                fs.mkdirSync(AUTH_DIR, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
            const { version } = await fetchLatestBaileysVersion();

            if (waSocket) {
                try {
                    waSocket.ev.removeAllListeners('connection.update');
                    waSocket.ev.removeAllListeners('creds.update');
                } catch {
                    /* ignore */
                }
            }

            waSocket = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: true,
                logger: pino({ level: 'silent' }),
                browser: ['EonlineBazar', 'Chrome', '1.0.0']
            });

            waSocket.ev.on('creds.update', saveCreds);

            waSocket.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    waStatus = 'qr_pending';
                    currentQR = qr;
                    qrDataURL = await QRCode.toDataURL(qr);
                    console.log('[WHATSAPP] QR code ready — scan in admin panel');
                }

                if (connection === 'open') {
                    waStatus = 'connected';
                    currentQR = null;
                    qrDataURL = null;

                    const me = waSocket?.user?.id || '';
                    const digits = String(me).replace(/\D/g, '');
                    if (digits.length >= 3) {
                        const masked = '•'.repeat(Math.max(6, digits.length - 3));
                        connectedPhoneHint = `+${masked}${digits.slice(-3)}`;
                    } else {
                        connectedPhoneHint = null;
                    }

                    console.log('[WHATSAPP] Connected ✅');
                }

                if (connection === 'close') {
                    const code = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = code !== DisconnectReason.loggedOut;

                    waStatus = 'disconnected';
                    connectedPhoneHint = null;
                    console.log('[WHATSAPP] Disconnected:', code);

                    if (shouldReconnect && isWhatsAppEnabled()) {
                        console.log('[WHATSAPP] Reconnecting in 5s...');
                        setTimeout(() => {
                            initWhatsApp().catch((err) => {
                                console.error('[WHATSAPP] Reconnect failed:', err.message);
                            });
                        }, 5000);
                    } else if (code === DisconnectReason.loggedOut) {
                        console.log('[WHATSAPP] Logged out — clear auth to reconnect');
                        try {
                            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                        } catch {
                            /* ignore */
                        }
                    }
                }
            });

            return { status: waStatus };
        } catch (err) {
            waStatus = 'disconnected';
            console.error('[WHATSAPP] Init failed:', err.message);
            throw err;
        } finally {
            initInFlight = null;
        }
    })();

    return initInFlight;
}

async function sendWhatsAppMessage(phone, message) {
    if (!isWhatsAppEnabled()) {
        console.warn('[WHATSAPP] Disabled — message not sent');
        console.warn(`  To: ${phone}`);
        console.warn(`  Message: ${message}`);
        return { success: false, reason: 'disabled' };
    }

    if (waStatus !== 'connected' || !waSocket) {
        console.warn('[WHATSAPP] Not connected — message not sent');
        console.warn(`  To: ${phone}`);
        console.warn(`  Message: ${message}`);
        return { success: false, reason: waStatus || 'disconnected' };
    }

    try {
        const jid = `${sanitizeWhatsAppInput(phone)}@s.whatsapp.net`;
        await waSocket.sendMessage(jid, { text: String(message || '') });
        console.log(`[WHATSAPP] Sent to ${phone}`);
        return { success: true };
    } catch (err) {
        console.error('[WHATSAPP] Send failed:', err.message);
        return { success: false, error: err.message };
    }
}

function getWhatsAppStatus() {
    return {
        status: waStatus,
        hasQR: Boolean(qrDataURL),
        qrDataURL: qrDataURL || null,
        phoneHint: connectedPhoneHint || null
    };
}

async function disconnectWhatsApp() {
    if (waSocket) {
        try {
            await waSocket.logout();
        } catch (err) {
            console.warn('[WHATSAPP] Logout error:', err.message);
        }
        waSocket = null;
    }
    waStatus = 'disconnected';
    currentQR = null;
    qrDataURL = null;
    connectedPhoneHint = null;

    try {
        if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
    } catch {
        /* ignore */
    }
}

async function sendAdminAlertViaGateway({ to, body }) {
    if (!isWhatsAppEnabled()) {
        return { delivered: false, provider: 'none', reason: 'WhatsApp disabled' };
    }

    const result = await sendWhatsAppMessage(to, body);
    if (result.success) {
        return { delivered: true, provider: 'Baileys' };
    }

    return {
        delivered: false,
        provider: 'Baileys',
        reason: result.reason || result.error || 'Not connected'
    };
}

async function sendAdminOrderAlert(order) {
    const orderId = order?.orderId || order?._id || 'unknown';

    try {
        console.log(`[WhatsApp] ▶ Background alert job started for order #${orderId}`);

        if (!order) {
            return { delivered: false, reason: 'No order payload' };
        }

        let config;
        try {
            config = await loadWhatsAppSettingsFromDb();
        } catch (err) {
            console.error('[WhatsApp] ✗ Failed to load settings:', err.message);
            return { delivered: false, reason: 'Could not load WhatsApp settings' };
        }

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
        const result = await sendAdminAlertViaGateway({ to: adminPhone, body });

        if (result.delivered) {
            markPendingAlertDelivered(orderId);
            console.log(`[WhatsApp] ✓ Background alert delivered via ${result.provider} → ${adminPhone}`);
            return { ...result, waMeUrl, fallbackQueued: false };
        }

        console.warn(`[WhatsApp] ⚠ Delivery failed for #${orderId}: ${result.reason}`);

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

    console.log(`[WhatsApp] Scheduling background dispatch for order #${orderId}`);

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

async function sendAdminCustomAlert(body) {
    try {
        const config = await loadWhatsAppSettingsFromDb();
        const adminPhone = sanitizeWhatsAppInput(config.privateAdminAlertWhatsApp);

        if (!adminPhone) {
            return { delivered: false, reason: 'Private admin WhatsApp number not configured' };
        }

        const result = await sendAdminAlertViaGateway({
            to: adminPhone,
            body: String(body || '').trim()
        });

        if (!result.delivered) {
            logWhatsAppToConsole({
                to: adminPhone,
                body,
                context: 'ADMIN CUSTOM ALERT (not delivered)',
                extra: result.reason || ''
            });
        }

        return result;
    } catch (err) {
        console.error('[WhatsApp] Custom admin alert error:', err.message);
        return { delivered: false, reason: err.message };
    }
}

function isGatewayConfigured() {
    return isWhatsAppEnabled() && waStatus === 'connected';
}

async function sendBroadcast(recipients, templateMessage) {
    try {
        const body = String(templateMessage || '').trim();
        if (!body) {
            return { success: false, sent: 0, failed: 0, total: 0, skipped: 0, reason: 'Empty broadcast message' };
        }

        const numbers = [...new Set(
            (Array.isArray(recipients) ? recipients : [])
                .map((entry) => {
                    if (entry && typeof entry === 'object') {
                        return sanitizeWhatsAppInput(entry.phone || entry.mobile || entry.to || '');
                    }
                    return sanitizeWhatsAppInput(entry);
                })
                .filter(Boolean)
        )];

        if (numbers.length === 0) {
            return { success: false, sent: 0, failed: 0, total: 0, skipped: 0, reason: 'No valid recipient numbers' };
        }

        if (!isGatewayConfigured()) {
            return {
                success: false,
                sent: 0,
                failed: 0,
                total: numbers.length,
                skipped: numbers.length,
                reason: 'WhatsApp gateway unavailable'
            };
        }

        let sent = 0;
        let failed = 0;

        for (const to of numbers) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const result = await sendAdminAlertViaGateway({ to, body });
                if (result.delivered) sent += 1;
                else failed += 1;
            } catch (err) {
                console.error('[WHATSAPP] Broadcast send error:', err.message);
                failed += 1;
            }
            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => setTimeout(resolve, 350));
        }

        console.log(`[WhatsApp] Broadcast complete — ${sent} sent, ${failed} failed of ${numbers.length}`);
        return {
            success: sent > 0,
            sent,
            failed,
            total: numbers.length,
            skipped: 0,
            reason: sent === 0 ? 'WhatsApp gateway unavailable' : undefined
        };
    } catch (err) {
        console.error('[WHATSAPP] Broadcast error:', err.message);
        return {
            success: false,
            sent: 0,
            failed: 0,
            total: 0,
            skipped: 0,
            reason: 'WhatsApp gateway unavailable'
        };
    }
}

if (isWhatsAppEnabled()) {
    initWhatsApp().catch((err) => {
        console.error('[WHATSAPP] Init failed:', err.message);
    });
}

module.exports = {
    VALID_ALERT_PROVIDERS,
    DEFAULT_PUBLIC_WHATSAPP,
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
    sendAdminCustomAlert,
    sendBroadcast,
    notifyAdminOrderPlaced,
    dispatchWhatsAppNotification,
    getPendingWhatsAppAlerts,
    dismissPendingWhatsAppAlert,
    queuePendingWhatsAppAlert,
    isGatewayConfigured,
    initWhatsApp,
    sendWhatsAppMessage,
    getWhatsAppStatus,
    disconnectWhatsApp,
    isWhatsAppEnabled,
    setWhatsAppEnabledFlag
};
