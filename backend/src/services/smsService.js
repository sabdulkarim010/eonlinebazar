/********************************************************************
 * Project: EonlineBazar
 * File: smsService.js
 * Location: services/smsService.js
 * Description: Customer SMS notification engine — order confirmation,
 * status updates, and verification OTP. Gateway credentials are read
 * from MongoDB (Admin Master Settings → SMS Notifications) and override
 * .env fallbacks so providers can be swapped without code changes.
 ********************************************************************/

const Setting = require('../models/Setting');
const Settings = require('../models/Settings');

const STORE_PUBLIC_URL = String(process.env.STORE_PUBLIC_URL || '').replace(/\/$/, '');

const SMS_GATEWAY_PRESETS = Object.freeze({
    'Greenweb BD': {
        url: 'http://api.greenweb.com.bd/api.php',
        method: 'get'
    },
    'BulkSMS BD': {
        url: 'https://bulksmsbd.net/api/smsapi',
        method: 'get'
    },
    'AlphaSMS': {
        url: 'https://api.sms.net.bd/sendsms',
        method: 'post'
    },
    'Generic API': {
        url: process.env.SMS_API_URL || '',
        method: String(process.env.SMS_API_METHOD || 'post').toLowerCase()
    }
});

const TEMPLATES = Object.freeze({
    orderConfirmation:
        'Dear {name}, your order #{orderId} of BDT {amount} at EonlineBazar has been placed successfully! Track order: {link}',
    statusUpdate:
        'Dear {name}, your order #{orderId} status has been updated to: {status}.',
    otpVerification:
        'Your EonlineBazar verification code is {otp}.'
});

/** Replace `{token}` placeholders in a template string. */
function fillTemplate(template, vars = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_, key) => {
        const value = vars[key];
        return value === undefined || value === null ? '' : String(value);
    });
}

/** Normalize BD mobile numbers to digits with country code when possible. */
function normalizePhoneNumber(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('880')) return digits;
    if (digits.startsWith('0') && digits.length === 11) return `88${digits}`;
    if (digits.length === 10 && digits.startsWith('1')) return `880${digits}`;
    return digits;
}

function buildOrderTrackLink(orderId, phone) {
    const query = `orderId=${encodeURIComponent(orderId || '')}&phone=${encodeURIComponent(phone || '')}`;
    if (STORE_PUBLIC_URL) {
        return `${STORE_PUBLIC_URL}/order-track.html?${query}`;
    }
    return `/order-track.html?${query}`;
}

function logSmsToConsole({ to, body, context = 'CUSTOMER SMS' }) {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log(`║          📱  ${context.padEnd(47)}║`);
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  To:      ${String(to || 'N/A').padEnd(51)}║`);
    console.log(`║  Message: ${String(body || '').slice(0, 51).padEnd(51)}║`);
    if (String(body || '').length > 51) {
        console.log(`║           ${String(body).slice(51, 102).padEnd(51)}║`);
    }
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\n');
}

/**
 * Load SMS gateway config — Admin Panel (MongoDB) wins over .env.
 * @returns {Promise<{provider: string, apiKey: string, senderId: string, url: string, method: string}>}
 */
async function loadSmsGatewayConfig() {
    const dbSettings = await Settings.getOrCreate();
    const provider = String(
        dbSettings.smsGatewayProvider
        || process.env.SMS_GATEWAY_PROVIDER
        || ''
    ).trim();

    const apiKey = String(
        dbSettings.smsApiKey
        || process.env.SMS_API_KEY
        || ''
    ).trim();

    const senderId = String(
        dbSettings.smsSenderId
        || process.env.SMS_SENDER_ID
        || 'EOBAZAR'
    ).trim();

    const preset = SMS_GATEWAY_PRESETS[provider];
    const url = preset?.url || process.env.SMS_API_URL || '';
    const method = preset?.method || String(process.env.SMS_API_METHOD || 'post').toLowerCase();

    return { provider, apiKey, senderId, url, method };
}

function buildGatewayPayload({ provider, apiKey, senderId, to, body }) {
    switch (provider) {
        case 'Greenweb BD':
            return { token: apiKey, to, message: body };
        case 'BulkSMS BD':
            return { api_key: apiKey, senderid: senderId, number: to, message: body };
        case 'AlphaSMS':
            return { api_key: apiKey, senderid: senderId, contact: to, msg: body };
        default:
            return {
                token: apiKey,
                api_key: apiKey,
                sender: senderId,
                senderid: senderId,
                to,
                number: to,
                contact: to,
                message: body,
                msg: body
            };
    }
}

async function sendViaConfiguredGateway(config, { to, body }) {
    const { provider, apiKey, senderId, url, method } = config;

    if (!apiKey) {
        throw new Error('SMS API key is not configured in Master Settings.');
    }

    if (!url) {
        throw new Error(`SMS gateway URL is missing for provider "${provider || 'Generic API'}".`);
    }

    const payload = buildGatewayPayload({ provider, apiKey, senderId, to, body });

    if (method === 'get') {
        const requestUrl = new URL(url);
        Object.entries(payload).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                requestUrl.searchParams.set(key, String(value));
            }
        });

        const res = await fetch(requestUrl.toString(), { method: 'GET' });
        const text = await res.text();
        if (!res.ok) {
            throw new Error(text || 'SMS gateway error');
        }
        return { delivered: true, id: text.slice(0, 120) };
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
    });

    const responseText = await res.text();
    let data = {};
    try {
        data = responseText ? JSON.parse(responseText) : {};
    } catch {
        data = { raw: responseText };
    }

    if (!res.ok) {
        throw new Error(data.message || data.error || data.raw || 'SMS gateway error');
    }

    return { delivered: true, id: data.id || data.message_id || data.msgid || null };
}

/**
 * Low-level SMS transport. Never throws — failures are logged and returned.
 * @returns {Promise<{delivered: boolean, provider: string, reason?: string}>}
 */
async function sendSms({ to, body, context = 'CUSTOMER SMS' }) {
    const normalizedTo = normalizePhoneNumber(to);

    if (!normalizedTo) {
        logSmsToConsole({ to, body, context });
        return { delivered: false, provider: 'none', reason: 'Missing recipient phone number' };
    }

    const messageBody = String(body || '').trim();
    if (!messageBody) {
        return { delivered: false, provider: 'none', reason: 'Empty SMS body' };
    }

    try {
        const config = await loadSmsGatewayConfig();

        if (!config.apiKey) {
            logSmsToConsole({ to: normalizedTo, body: messageBody, context });
            return {
                delivered: false,
                provider: config.provider || 'console',
                reason: 'SMS API key not configured — set it in Master Settings → SMS Notifications'
            };
        }

        await sendViaConfiguredGateway(config, { to: normalizedTo, body: messageBody });
        console.log(`SUCCESS: SMS sent via ${config.provider || 'gateway'} to ${normalizedTo}`);
        return { delivered: true, provider: config.provider || 'gateway' };
    } catch (err) {
        console.error(`[SMS] ${context} send failed:`, err.message);
        logSmsToConsole({ to: normalizedTo, body: messageBody, context });
        return { delivered: false, provider: 'gateway', reason: err.message };
    }
}

async function isCustomerSmsEnabled() {
    try {
        const settings = await Setting.getOrCreate();
        return settings.enableSmsNotifications === true;
    } catch (err) {
        console.error('[SMS] Failed to read enableSmsNotifications:', err.message);
        return false;
    }
}

function formatOrderConfirmationMessage({ name, orderId, amount, phone }) {
    return fillTemplate(TEMPLATES.orderConfirmation, {
        name: name || 'Customer',
        orderId: orderId || '',
        amount: Number(amount || 0).toLocaleString('en-US'),
        link: buildOrderTrackLink(orderId, phone)
    });
}

function formatOrderStatusUpdateMessage({ name, orderId, status }) {
    return fillTemplate(TEMPLATES.statusUpdate, {
        name: name || 'Customer',
        orderId: orderId || '',
        status: status || 'Updated'
    });
}

function formatVerificationOtpMessage({ otp }) {
    return fillTemplate(TEMPLATES.otpVerification, { otp: otp || '' });
}

async function sendOrderConfirmationSms(order) {
    if (!order) return { delivered: false, reason: 'No order payload' };
    if (!(await isCustomerSmsEnabled())) {
        return { delivered: false, reason: 'SMS notifications disabled in Master Settings' };
    }

    const body = formatOrderConfirmationMessage({
        name: order.customerName,
        orderId: order.orderId,
        amount: order.grandTotal ?? order.totalAmount,
        phone: order.customerPhone
    });

    return sendSms({
        to: order.customerPhone,
        body,
        context: 'ORDER CONFIRMATION'
    });
}

async function sendOrderStatusUpdateSms(order, status) {
    if (!order) return { delivered: false, reason: 'No order payload' };
    if (!(await isCustomerSmsEnabled())) {
        return { delivered: false, reason: 'SMS notifications disabled in Master Settings' };
    }

    const body = formatOrderStatusUpdateMessage({
        name: order.customerName,
        orderId: order.orderId,
        status
    });

    return sendSms({
        to: order.customerPhone,
        body,
        context: 'ORDER STATUS UPDATE'
    });
}

async function sendVerificationOtpSms({ to, otp, respectSettings = true }) {
    if (respectSettings && !(await isCustomerSmsEnabled())) {
        return { delivered: false, reason: 'SMS notifications disabled in Master Settings' };
    }

    const body = formatVerificationOtpMessage({ otp });
    return sendSms({ to, body, context: 'VERIFICATION OTP' });
}

function dispatchSmsNotification(task) {
    setImmediate(() => {
        Promise.resolve()
            .then(task)
            .catch((err) => {
                console.error('[SMS] Async notification error:', err.message);
            });
    });
}

function notifyOrderPlaced(order) {
    dispatchSmsNotification(() => sendOrderConfirmationSms(order));
}

function notifyOrderStatusUpdated(order, status) {
    dispatchSmsNotification(() => sendOrderStatusUpdateSms(order, status));
}

module.exports = {
    TEMPLATES,
    SMS_GATEWAY_PRESETS,
    fillTemplate,
    normalizePhoneNumber,
    buildOrderTrackLink,
    loadSmsGatewayConfig,
    sendSms,
    isCustomerSmsEnabled,
    formatOrderConfirmationMessage,
    formatOrderStatusUpdateMessage,
    formatVerificationOtpMessage,
    sendOrderConfirmationSms,
    sendOrderStatusUpdateSms,
    sendVerificationOtpSms,
    notifyOrderPlaced,
    notifyOrderStatusUpdated,
    dispatchSmsNotification
};
