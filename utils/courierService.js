/********************************************************************
 * Project: EonlineBazar
 * File: courierService.js
 * Location: utils/courierService.js
 * Author: Abdul Karim Sheikh
 * Description: Automated courier booking engine. Credentials are read
 * from MongoDB (Admin Master Settings → Courier Booking) and override
 * .env fallbacks, so API keys or the active provider can be swapped
 * from the panel without touching backend code.
 ********************************************************************/

const Settings = require('../models/Settings');

const REQUEST_TIMEOUT_MS = Number(process.env.COURIER_API_TIMEOUT_MS || 20000);

/**
 * Provider registry. Only `Steadfast` has a live booking transport today —
 * the others are selectable in the panel so the store can record its
 * default provider, and they fail with a clear message instead of a crash.
 */
const COURIER_PROVIDERS = Object.freeze({
    Steadfast: {
        label: 'Steadfast Courier',
        createOrderUrl: process.env.STEADFAST_API_URL || 'https://portal.steadfast.com.bd/api/v1/create_order',
        trackingUrl: 'https://steadfast.com.bd/t/',
        booking: 'steadfast'
    },
    Pathao: {
        label: 'Pathao Courier',
        trackingUrl: 'https://merchant.pathao.com/tracking?consignment_id=',
        booking: null
    },
    RedX: {
        label: 'RedX',
        trackingUrl: 'https://redx.com.bd/track-global-parcel/?trackingId=',
        booking: null
    }
});

const VALID_COURIER_PROVIDERS = Object.freeze(['', ...Object.keys(COURIER_PROVIDERS)]);

const DEFAULT_PROVIDER = 'Steadfast';

/** Mock tracking ID prefixes per provider — used when credentials are absent. */
const MOCK_TRACKING_PREFIXES = Object.freeze({
    Steadfast: 'SF',
    Pathao: 'PT',
    RedX: 'RX'
});

/**
 * Failure codes let callers pick the right HTTP status: everything the admin
 * can fix locally is a 4xx, while upstream courier faults are a 502.
 */
const COURIER_ERROR_CODES = Object.freeze({
    NOT_CONFIGURED: 'COURIER_NOT_CONFIGURED',
    UNSUPPORTED_PROVIDER: 'COURIER_UNSUPPORTED_PROVIDER',
    INVALID_ORDER: 'COURIER_INVALID_ORDER',
    AUTH_FAILED: 'COURIER_AUTH_FAILED',
    API_ERROR: 'COURIER_API_ERROR',
    NETWORK_ERROR: 'COURIER_NETWORK_ERROR',
    SETTINGS_ERROR: 'COURIER_SETTINGS_ERROR'
});

/**
 * Load courier config — Admin Panel (MongoDB) wins over .env.
 * @returns {Promise<{provider: string, apiKey: string, secretKey: string, endpoint: string, isConfigured: boolean}>}
 */
async function loadCourierConfig() {
    const dbSettings = await Settings.getOrCreate();

    const provider = String(
        dbSettings.defaultCourierProvider
        || process.env.COURIER_PROVIDER
        || DEFAULT_PROVIDER
    ).trim();

    const apiKey = String(
        dbSettings.courierApiKey
        || process.env.STEADFAST_API_KEY
        || process.env.COURIER_API_KEY
        || ''
    ).trim();

    const secretKey = String(
        dbSettings.courierSecretKey
        || process.env.STEADFAST_SECRET_KEY
        || process.env.COURIER_SECRET_KEY
        || ''
    ).trim();

    const preset = COURIER_PROVIDERS[provider] || {};

    return {
        provider,
        providerLabel: preset.label || provider || 'Courier',
        apiKey,
        secretKey,
        endpoint: preset.createOrderUrl || '',
        isConfigured: Boolean(apiKey && secretKey)
    };
}

/**
 * Public tracking link for a booked parcel. Returns '' when the provider has
 * no known tracking page, so the UI can fall back to a plain badge.
 */
function buildTrackingUrl(provider, trackingId) {
    const base = COURIER_PROVIDERS[provider]?.trackingUrl;
    const code = String(trackingId || '').trim();
    if (!base || !code) return '';
    return `${base}${encodeURIComponent(code)}`;
}

/**
 * Generate a clean mock tracking ID when no courier credentials are configured.
 * Format: {PREFIX}-PENDING-{5-char alphanumeric}, e.g. SF-PENDING-A3K9Z
 */
function generateMockTrackingId(provider) {
    const prefix = MOCK_TRACKING_PREFIXES[provider] || 'XX';
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let i = 0; i < 5; i += 1) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}-PENDING-${suffix}`;
}

/**
 * Mock booking path — no external API call. Saves a pending tracking ID so
 * admin and customer flows can be tested without live courier credentials.
 */
function bookMockParcel(order, config) {
    const { errors } = validateOrderForBooking(order);
    if (errors.length > 0) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.INVALID_ORDER,
            provider: config.provider,
            reason: `Cannot book this parcel — ${errors.join(', ')}.`
        };
    }

    const trackingId = generateMockTrackingId(config.provider);

    console.log(`[COURIER] Mock mode — generated tracking ${trackingId} for ${config.providerLabel}`);

    return {
        success: true,
        mockMode: true,
        trackingId,
        consignmentId: '',
        courierStatus: 'mock_pending',
        codAmount: resolveCodAmount(order),
        provider: config.provider,
        providerLabel: config.providerLabel,
        trackingUrl: ''
    };
}

/**
 * Steadfast expects a local 11-digit BD mobile number (01XXXXXXXXX), not the
 * 880-prefixed form our SMS gateways use.
 */
function normalizeRecipientPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('880')) return `0${digits.slice(3)}`;
    if (digits.length === 10 && digits.startsWith('1')) return `0${digits}`;
    return digits;
}

/** COD amount is only collected when the customer has not already paid. */
function resolveCodAmount(order) {
    const method = String(order.paymentMethod || 'COD').trim();
    const isCashOnDelivery = /^(cod|cash)/i.test(method) || /cash on delivery/i.test(method);
    if (!isCashOnDelivery) return 0;

    const payable = Number(order.grandTotal ?? order.totalAmount ?? 0);
    return Number.isFinite(payable) && payable > 0 ? Math.round(payable) : 0;
}

/**
 * Guard against parcels the courier would reject anyway. Returning readable
 * reasons lets the admin fix the order instead of seeing a raw API error.
 */
function validateOrderForBooking(order) {
    const errors = [];

    const recipientName = String(order.customerName || '').trim();
    const recipientPhone = normalizeRecipientPhone(order.customerPhone);
    const recipientAddress = String(order.customerAddress || '').trim();

    if (!recipientName) errors.push('customer name is missing');
    if (!/^01\d{9}$/.test(recipientPhone)) errors.push('customer phone must be a valid 11-digit BD mobile number');
    if (!recipientAddress) errors.push('delivery address is missing');

    return { errors, recipientName, recipientPhone, recipientAddress };
}

/** Build the exact JSON body Steadfast's create_order endpoint expects. */
function buildSteadfastPayload(order) {
    const { recipientName, recipientPhone, recipientAddress } = validateOrderForBooking(order);
    const itemDescription = (order.items || [])
        .map((item) => `${item.name} x${item.quantity || 1}`)
        .join(', ');

    const payload = {
        invoice: String(order.orderId || order._id || '').trim(),
        recipient_name: recipientName.slice(0, 100),
        recipient_phone: recipientPhone,
        recipient_address: recipientAddress.slice(0, 250),
        cod_amount: resolveCodAmount(order)
    };

    // Optional Steadfast fields — only sent when we actually have a value.
    if (itemDescription) payload.item_description = itemDescription.slice(0, 250);
    if (order.note) payload.note = String(order.note).trim().slice(0, 250);

    return payload;
}

/** Flatten a Steadfast validation error body into one readable sentence. */
function extractApiErrorMessage(data, fallback) {
    if (!data || typeof data !== 'object') return fallback;

    const fieldErrors = data.errors && typeof data.errors === 'object'
        ? Object.values(data.errors).flat().filter(Boolean)
        : [];

    if (fieldErrors.length > 0) return fieldErrors.join(' ');
    return data.message || data.error || data.raw || fallback;
}

/**
 * POST the parcel to Steadfast. Never throws — every outcome is returned as a
 * result object so callers can respond with a clean message.
 * @returns {Promise<{success: boolean, reason?: string, trackingId?: string, consignmentId?: string, courierStatus?: string, raw?: object}>}
 */
async function bookSteadfastParcel(order, config) {
    const payload = buildSteadfastPayload(order);

    if (!payload.invoice) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.INVALID_ORDER,
            reason: 'Order has no invoice/order ID to send to the courier.'
        };
    }

    let response;
    let responseText = '';

    try {
        response = await fetch(config.endpoint, {
            method: 'POST',
            headers: {
                'Api-Key': config.apiKey,
                'Secret-Key': config.secretKey,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        responseText = await response.text();
    } catch (err) {
        const reason = err.name === 'TimeoutError' || err.name === 'AbortError'
            ? 'Steadfast API did not respond in time. Please try again.'
            : `Could not reach the Steadfast API: ${err.message}`;
        console.error('[COURIER] Steadfast request failed:', err.message);
        return { success: false, code: COURIER_ERROR_CODES.NETWORK_ERROR, reason };
    }

    let data = {};
    try {
        data = responseText ? JSON.parse(responseText) : {};
    } catch {
        data = { raw: responseText.slice(0, 300) };
    }

    if (response.status === 401 || response.status === 403) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.AUTH_FAILED,
            reason: 'Steadfast rejected the credentials. Check the API key and secret key in Master Settings.'
        };
    }

    const consignment = data.consignment || data.data?.consignment || null;
    const apiStatus = Number(data.status ?? response.status);
    const succeeded = response.ok && consignment && (!Number.isFinite(apiStatus) || apiStatus < 400);

    if (!succeeded) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.API_ERROR,
            reason: extractApiErrorMessage(data, `Steadfast API returned HTTP ${response.status}.`)
        };
    }

    const trackingId = String(consignment.tracking_code || consignment.trackingCode || '').trim();
    const consignmentId = String(consignment.consignment_id || consignment.consignmentId || '').trim();

    if (!trackingId && !consignmentId) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.API_ERROR,
            reason: 'Steadfast accepted the parcel but returned no tracking details.'
        };
    }

    return {
        success: true,
        trackingId: trackingId || consignmentId,
        consignmentId,
        courierStatus: String(consignment.status || 'in_review').trim(),
        codAmount: payload.cod_amount,
        raw: consignment
    };
}

/**
 * Book a parcel for an order with the store's configured courier.
 * Never throws; always resolves to a result object.
 * @param {object} order - Mongoose Order document or plain object.
 * @returns {Promise<{success: boolean, reason?: string, provider?: string, trackingId?: string, consignmentId?: string, courierStatus?: string, trackingUrl?: string}>}
 */
async function bookParcelForOrder(order) {
    if (!order) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.INVALID_ORDER,
            reason: 'No order was supplied for courier booking.'
        };
    }

    let config;
    try {
        config = await loadCourierConfig();
    } catch (err) {
        console.error('[COURIER] Failed to load courier settings:', err.message);
        return {
            success: false,
            code: COURIER_ERROR_CODES.SETTINGS_ERROR,
            reason: 'Could not read courier settings from the database.'
        };
    }

    // No credentials → mock mode: generate a pending tracking ID locally.
    if (!config.isConfigured) {
        return bookMockParcel(order, config);
    }

    const transport = COURIER_PROVIDERS[config.provider]?.booking;
    if (transport !== 'steadfast') {
        return {
            success: false,
            code: COURIER_ERROR_CODES.UNSUPPORTED_PROVIDER,
            provider: config.provider,
            reason: `Automated booking is not available for ${config.providerLabel} yet. Switch the default provider to Steadfast in Master Settings.`
        };
    }

    const { errors } = validateOrderForBooking(order);
    if (errors.length > 0) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.INVALID_ORDER,
            provider: config.provider,
            reason: `Cannot book this parcel — ${errors.join(', ')}.`
        };
    }

    const result = await bookSteadfastParcel(order, config);
    if (!result.success) {
        return { ...result, provider: config.provider };
    }

    console.log(`SUCCESS: Parcel booked with ${config.providerLabel} — tracking ${result.trackingId}`);

    return {
        ...result,
        provider: config.provider,
        providerLabel: config.providerLabel,
        trackingUrl: buildTrackingUrl(config.provider, result.trackingId)
    };
}

module.exports = {
    COURIER_PROVIDERS,
    VALID_COURIER_PROVIDERS,
    COURIER_ERROR_CODES,
    MOCK_TRACKING_PREFIXES,
    DEFAULT_PROVIDER,
    loadCourierConfig,
    buildTrackingUrl,
    generateMockTrackingId,
    normalizeRecipientPhone,
    resolveCodAmount,
    validateOrderForBooking,
    buildSteadfastPayload,
    bookMockParcel,
    bookSteadfastParcel,
    bookParcelForOrder
};
