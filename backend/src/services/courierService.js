/********************************************************************
 * Project: EonlineBazar
 * File: courierService.js
 * Location: services/courierService.js
 * Author: Abdul Karim Sheikh
 * Description: Automated courier booking engine. Credentials are read
 * from MongoDB (Admin Master Settings → Courier Booking) and override
 * .env fallbacks for Steadfast; Pathao and RedX read dedicated .env
 * keys. The active provider can be swapped from the panel without
 * touching backend code.
 ********************************************************************/

const Settings = require('../models/Settings');

const REQUEST_TIMEOUT_MS = Number(process.env.COURIER_API_TIMEOUT_MS || 20000);

/** In-memory Pathao OAuth token cache (tokens last ~1 hour). */
let pathaoTokenCache = { accessToken: '', expiresAt: 0 };

/**
 * Provider registry — slugs are lowercase: steadfast, pathao, redx.
 */
const COURIER_PROVIDERS = Object.freeze({
    steadfast: {
        label: 'Steadfast Courier',
        createOrderUrl: process.env.STEADFAST_API_URL || 'https://portal.steadfast.com.bd/api/v1/create_order',
        trackingUrl: 'https://steadfast.com.bd/t/',
        booking: 'steadfast'
    },
    pathao: {
        label: 'Pathao Courier',
        trackingUrl: 'https://merchant.pathao.com/tracking?consignment_id=',
        booking: 'pathao'
    },
    redx: {
        label: 'RedX',
        trackingUrl: 'https://redx.com.bd/track-global-parcel/?trackingId=',
        booking: 'redx'
    }
});

/** Legacy PascalCase values from older settings are accepted and normalized. */
const LEGACY_PROVIDER_ALIASES = Object.freeze({
    Steadfast: 'steadfast',
    Pathao: 'pathao',
    RedX: 'redx',
    redX: 'redx'
});

const VALID_COURIER_PROVIDERS = Object.freeze([
    '',
    ...Object.keys(COURIER_PROVIDERS),
    ...Object.keys(LEGACY_PROVIDER_ALIASES)
]);

const DEFAULT_PROVIDER = 'steadfast';

/** Mock tracking ID prefixes per provider — used when credentials are absent. */
const MOCK_TRACKING_PREFIXES = Object.freeze({
    steadfast: 'SF',
    pathao: 'PT',
    redx: 'RX'
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
 * Normalize provider slug — accepts legacy PascalCase from MongoDB settings.
 * @param {string} value
 * @returns {string}
 */
function normalizeCourierSlug(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return LEGACY_PROVIDER_ALIASES[raw] || raw.toLowerCase();
}

function isTruthyEnvFlag(value) {
    return String(value || '').trim().toLowerCase() === 'true';
}

function getPathaoBaseUrl() {
    return isTruthyEnvFlag(process.env.PATHAO_IS_LIVE)
        ? 'https://api-hermes.pathao.com'
        : 'https://hermes.pathao.com';
}

function getRedxParcelUrl() {
    return isTruthyEnvFlag(process.env.REDX_IS_LIVE)
        ? 'https://openapi.redx.com.bd/v1.0.0-beta/parcel'
        : 'https://sandbox.redx.com.bd/v1.0.0-beta/parcel';
}

function getPathaoCredentials() {
    return {
        clientId: String(process.env.PATHAO_CLIENT_ID || '').trim(),
        clientSecret: String(process.env.PATHAO_CLIENT_SECRET || '').trim(),
        username: String(process.env.PATHAO_USERNAME || '').trim(),
        password: String(process.env.PATHAO_PASSWORD || '').trim(),
        storeId: String(process.env.PATHAO_STORE_ID || '').trim()
    };
}

function isPathaoConfigured() {
    const creds = getPathaoCredentials();
    return Boolean(
        creds.clientId
        && creds.clientSecret
        && creds.username
        && creds.password
        && creds.storeId
    );
}

function isRedxConfigured() {
    return Boolean(String(process.env.REDX_API_TOKEN || '').trim());
}

function isSteadfastConfigured(apiKey, secretKey) {
    return Boolean(String(apiKey || '').trim() && String(secretKey || '').trim());
}

/**
 * Load courier config — Admin Panel (MongoDB) wins over .env for Steadfast.
 * Pathao and RedX credentials are read from dedicated .env keys only.
 * @param {string} [overrideProvider] - Optional slug override for per-order dispatch.
 * @returns {Promise<{provider: string, providerLabel: string, apiKey: string, secretKey: string, endpoint: string, isConfigured: boolean}>}
 */
async function loadCourierConfig(overrideProvider) {
    const dbSettings = await Settings.getOrCreate();

    const provider = normalizeCourierSlug(
        overrideProvider
        || dbSettings.defaultCourierProvider
        || process.env.COURIER_PROVIDER
        || DEFAULT_PROVIDER
    ) || DEFAULT_PROVIDER;

    const preset = COURIER_PROVIDERS[provider] || COURIER_PROVIDERS.steadfast;

    const apiKey = String(
        dbSettings.courierApiKey
        || process.env.STEADFAST_API_KEY
        || process.env.COURIER_API_KEY
        || ''
    ).trim();

    const secretKey = String(
        dbSettings.courierSecretKey
        || process.env.STEADFAST_API_SECRET
        || process.env.STEADFAST_SECRET_KEY
        || process.env.COURIER_SECRET_KEY
        || ''
    ).trim();

    let isConfigured = false;
    if (provider === 'steadfast') {
        isConfigured = isSteadfastConfigured(apiKey, secretKey);
    } else if (provider === 'pathao') {
        isConfigured = isPathaoConfigured();
    } else if (provider === 'redx') {
        isConfigured = isRedxConfigured();
    }

    return {
        provider,
        providerLabel: preset.label || provider || 'Courier',
        apiKey,
        secretKey,
        endpoint: preset.createOrderUrl || '',
        isConfigured
    };
}

/**
 * Public tracking link for a booked parcel. Returns '' when the provider has
 * no known tracking page, so the UI can fall back to a plain badge.
 */
function buildTrackingUrl(provider, trackingId) {
    const slug = normalizeCourierSlug(provider);
    const base = COURIER_PROVIDERS[slug]?.trackingUrl;
    const code = String(trackingId || '').trim();
    if (!base || !code) return '';
    return `${base}${encodeURIComponent(code)}`;
}

/**
 * Generate a clean mock tracking ID when no courier credentials are configured.
 * Format: {PREFIX}-PENDING-{5-char alphanumeric}, e.g. SF-PENDING-A3K9Z
 */
function generateMockTrackingId(provider) {
    const slug = normalizeCourierSlug(provider);
    const prefix = MOCK_TRACKING_PREFIXES[slug] || 'XX';
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

/** Shared order snapshot for Pathao / RedX payloads. */
function buildOrderDataForCourier(order) {
    const { recipientName, recipientPhone, recipientAddress } = validateOrderForBooking(order);
    const itemCount = (order.items || []).reduce(
        (sum, item) => sum + (Number(item.quantity) || 1),
        0
    );
    const productSummary = (order.items || [])
        .map((item) => `${item.name} x${item.quantity || 1}`)
        .join(', ');

    return {
        orderId: String(order.orderId || order._id || '').trim(),
        customerName: recipientName,
        customerPhone: recipientPhone,
        shippingAddress: recipientAddress,
        shippingDistrict: String(order.shippingDistrict || 'Dhaka').trim(),
        codAmount: resolveCodAmount(order),
        grandTotal: Number(order.grandTotal ?? order.totalAmount ?? 0),
        note: String(order.note || '').trim(),
        itemCount: itemCount || 1,
        productSummary: productSummary || 'Order Items'
    };
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

/** Flatten a courier validation error body into one readable sentence. */
function extractApiErrorMessage(data, fallback) {
    if (!data || typeof data !== 'object') return fallback;

    const fieldErrors = data.errors && typeof data.errors === 'object'
        ? Object.values(data.errors).flat().filter(Boolean)
        : [];

    if (fieldErrors.length > 0) return fieldErrors.join(' ');
    return data.message || data.error || data.raw || fallback;
}

/**
 * Fetch (or reuse cached) Pathao OAuth2 access token.
 * @returns {Promise<{success: boolean, accessToken?: string, reason?: string, code?: string}>}
 */
async function getPathaoAccessToken() {
    const creds = getPathaoCredentials();
    if (!creds.clientId || !creds.clientSecret || !creds.username || !creds.password) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.NOT_CONFIGURED,
            reason: 'Pathao credentials not configured'
        };
    }

    const now = Date.now();
    if (pathaoTokenCache.accessToken && pathaoTokenCache.expiresAt > now + 60_000) {
        return { success: true, accessToken: pathaoTokenCache.accessToken };
    }

    const baseUrl = getPathaoBaseUrl();
    let response;
    let responseText = '';

    try {
        response = await fetch(`${baseUrl}/aladdin/api/v1/issue-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                client_id: creds.clientId,
                client_secret: creds.clientSecret,
                username: creds.username,
                password: creds.password,
                grant_type: 'password'
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        responseText = await response.text();
    } catch (err) {
        const reason = err.name === 'TimeoutError' || err.name === 'AbortError'
            ? 'Pathao token API did not respond in time. Please try again.'
            : `Could not reach the Pathao token API: ${err.message}`;
        console.error('[COURIER] Pathao token request failed:', err.message);
        return { success: false, code: COURIER_ERROR_CODES.NETWORK_ERROR, reason };
    }

    let data = {};
    try {
        data = responseText ? JSON.parse(responseText) : {};
    } catch {
        data = { raw: responseText.slice(0, 300) };
    }

    if (response.status === 401 || response.status === 403) {
        pathaoTokenCache = { accessToken: '', expiresAt: 0 };
        return {
            success: false,
            code: COURIER_ERROR_CODES.AUTH_FAILED,
            reason: 'Pathao rejected the credentials. Check PATHAO_CLIENT_ID, PATHAO_CLIENT_SECRET, PATHAO_USERNAME, and PATHAO_PASSWORD.'
        };
    }

    const accessToken = String(data.access_token || '').trim();
    if (!response.ok || !accessToken) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.API_ERROR,
            reason: extractApiErrorMessage(data, `Pathao token API returned HTTP ${response.status}.`)
        };
    }

    const expiresInSec = Number(data.expires_in);
    const ttlMs = Number.isFinite(expiresInSec) && expiresInSec > 0
        ? expiresInSec * 1000
        : 60 * 60 * 1000;

    pathaoTokenCache = {
        accessToken,
        expiresAt: Date.now() + ttlMs
    };

    return { success: true, accessToken };
}

/**
 * POST the parcel to Steadfast. Never throws — every outcome is returned as a
 * result object so callers can respond with a clean message.
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

    const trackingCode = String(consignment.tracking_code || consignment.trackingCode || '').trim();
    const consignmentId = String(consignment.consignment_id || consignment.consignmentId || '').trim();

    if (!trackingCode && !consignmentId) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.API_ERROR,
            reason: 'Steadfast accepted the parcel but returned no tracking details.'
        };
    }

    return {
        success: true,
        trackingId: trackingCode || consignmentId,
        trackingCode,
        consignmentId,
        courierStatus: String(consignment.status || 'in_review').trim(),
        codAmount: payload.cod_amount,
        provider: 'steadfast',
        raw: consignment
    };
}

/**
 * POST the parcel to Pathao (OAuth2 + create order). Never throws.
 */
async function bookPathaoParcel(order) {
    const creds = getPathaoCredentials();
    if (!creds.clientId || !creds.clientSecret || !creds.username || !creds.password) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.NOT_CONFIGURED,
            provider: 'pathao',
            reason: 'Pathao credentials not configured'
        };
    }

    if (!creds.storeId) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.NOT_CONFIGURED,
            provider: 'pathao',
            reason: 'Pathao store ID not configured (PATHAO_STORE_ID).'
        };
    }

    const orderData = buildOrderDataForCourier(order);
    if (!orderData.orderId) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.INVALID_ORDER,
            provider: 'pathao',
            reason: 'Order has no invoice/order ID to send to Pathao.'
        };
    }

    const tokenResult = await getPathaoAccessToken();
    if (!tokenResult.success) {
        return { ...tokenResult, provider: 'pathao' };
    }

    const payload = {
        store_id: Number(creds.storeId) || creds.storeId,
        merchant_order_id: orderData.orderId,
        recipient_name: orderData.customerName.slice(0, 100),
        recipient_phone: orderData.customerPhone,
        recipient_address: orderData.shippingAddress.slice(0, 250),
        recipient_city: 1,
        recipient_zone: 1,
        delivery_type: 48,
        item_type: 2,
        special_instruction: orderData.note || '',
        item_quantity: orderData.itemCount || 1,
        item_weight: 0.5,
        amount_to_collect: orderData.codAmount || 0,
        item_description: orderData.productSummary || 'Order Items'
    };

    const baseUrl = getPathaoBaseUrl();
    let response;
    let responseText = '';

    try {
        response = await fetch(`${baseUrl}/aladdin/api/v1/orders`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${tokenResult.accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        responseText = await response.text();
    } catch (err) {
        const reason = err.name === 'TimeoutError' || err.name === 'AbortError'
            ? 'Pathao API did not respond in time. Please try again.'
            : `Could not reach the Pathao API: ${err.message}`;
        console.error('[COURIER] Pathao order request failed:', err.message);
        return { success: false, code: COURIER_ERROR_CODES.NETWORK_ERROR, provider: 'pathao', reason };
    }

    let data = {};
    try {
        data = responseText ? JSON.parse(responseText) : {};
    } catch {
        data = { raw: responseText.slice(0, 300) };
    }

    if (response.status === 401 || response.status === 403) {
        pathaoTokenCache = { accessToken: '', expiresAt: 0 };
        return {
            success: false,
            code: COURIER_ERROR_CODES.AUTH_FAILED,
            provider: 'pathao',
            reason: 'Pathao rejected the access token. Check your Pathao credentials.'
        };
    }

    const consignment = data.consignment || data.data?.consignment || null;
    if (!response.ok || !consignment) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.API_ERROR,
            provider: 'pathao',
            reason: extractApiErrorMessage(data, `Pathao API returned HTTP ${response.status}.`)
        };
    }

    const consignmentId = String(consignment.consignment_id || consignment.consignmentId || '').trim();
    const trackingCode = String(consignment.tracking_code || consignment.trackingCode || '').trim();

    if (!consignmentId && !trackingCode) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.API_ERROR,
            provider: 'pathao',
            reason: 'Pathao accepted the parcel but returned no tracking details.'
        };
    }

    return {
        success: true,
        trackingId: consignmentId || trackingCode,
        trackingCode: trackingCode || consignmentId,
        consignmentId,
        courierStatus: String(consignment.status || 'pending').trim(),
        codAmount: payload.amount_to_collect,
        provider: 'pathao',
        raw: consignment
    };
}

/**
 * POST the parcel to RedX. Never throws.
 */
async function bookRedxParcel(order) {
    const apiToken = String(process.env.REDX_API_TOKEN || '').trim();
    if (!apiToken) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.NOT_CONFIGURED,
            provider: 'redx',
            reason: 'RedX credentials not configured'
        };
    }

    const orderData = buildOrderDataForCourier(order);
    if (!orderData.orderId) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.INVALID_ORDER,
            provider: 'redx',
            reason: 'Order has no invoice/order ID to send to RedX.'
        };
    }

    const payload = {
        customer_name: orderData.customerName.slice(0, 100),
        customer_phone: orderData.customerPhone,
        delivery_area: orderData.shippingDistrict || 'Dhaka',
        delivery_area_id: 1,
        customer_address: orderData.shippingAddress.slice(0, 250),
        merchant_invoice_id: orderData.orderId,
        cash_collection_amount: orderData.codAmount || 0,
        parcel_weight: 500,
        instruction: orderData.note || '',
        value: orderData.grandTotal || 0
    };

    let response;
    let responseText = '';

    try {
        response = await fetch(getRedxParcelUrl(), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        responseText = await response.text();
    } catch (err) {
        const reason = err.name === 'TimeoutError' || err.name === 'AbortError'
            ? 'RedX API did not respond in time. Please try again.'
            : `Could not reach the RedX API: ${err.message}`;
        console.error('[COURIER] RedX request failed:', err.message);
        return { success: false, code: COURIER_ERROR_CODES.NETWORK_ERROR, provider: 'redx', reason };
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
            provider: 'redx',
            reason: 'RedX rejected the API token. Check REDX_API_TOKEN in your environment.'
        };
    }

    const trackingId = String(
        data.tracking_id
        || data.trackingId
        || data.data?.tracking_id
        || data.data?.trackingId
        || ''
    ).trim();

    if (!response.ok || !trackingId) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.API_ERROR,
            provider: 'redx',
            reason: extractApiErrorMessage(data, `RedX API returned HTTP ${response.status}.`)
        };
    }

    return {
        success: true,
        trackingId,
        consignmentId: trackingId,
        courierStatus: String(data.status || 'pending').trim(),
        codAmount: payload.cash_collection_amount,
        provider: 'redx',
        raw: data
    };
}

/**
 * Book a parcel for an order with the store's configured courier.
 * Never throws; always resolves to a result object.
 * @param {object} order - Mongoose Order document or plain object.
 * @param {{ courier?: string }} [options] - Optional provider slug override.
 */
async function bookParcelForOrder(order, options = {}) {
    if (!order) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.INVALID_ORDER,
            reason: 'No order was supplied for courier booking.'
        };
    }

    let config;
    try {
        config = await loadCourierConfig(options.courier);
    } catch (err) {
        console.error('[COURIER] Failed to load courier settings:', err.message);
        return {
            success: false,
            code: COURIER_ERROR_CODES.SETTINGS_ERROR,
            reason: 'Could not read courier settings from the database.'
        };
    }

    const transport = COURIER_PROVIDERS[config.provider]?.booking;
    if (!transport) {
        return {
            success: false,
            code: COURIER_ERROR_CODES.UNSUPPORTED_PROVIDER,
            provider: config.provider,
            reason: `Automated booking is not available for ${config.providerLabel}.`
        };
    }

    // No credentials → mock mode: generate a pending tracking ID locally.
    if (!config.isConfigured) {
        return bookMockParcel(order, config);
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

    let result;
    if (transport === 'steadfast') {
        result = await bookSteadfastParcel(order, config);
    } else if (transport === 'pathao') {
        result = await bookPathaoParcel(order);
    } else if (transport === 'redx') {
        result = await bookRedxParcel(order);
    } else {
        return {
            success: false,
            code: COURIER_ERROR_CODES.UNSUPPORTED_PROVIDER,
            provider: config.provider,
            reason: `Automated booking is not available for ${config.providerLabel}.`
        };
    }

    if (!result.success) {
        return { ...result, provider: result.provider || config.provider };
    }

    console.log(`SUCCESS: Parcel booked with ${config.providerLabel} — tracking ${result.trackingId}`);

    return {
        ...result,
        provider: result.provider || config.provider,
        providerLabel: config.providerLabel,
        trackingUrl: buildTrackingUrl(config.provider, result.trackingCode || result.trackingId)
    };
}

module.exports = {
    COURIER_PROVIDERS,
    VALID_COURIER_PROVIDERS,
    COURIER_ERROR_CODES,
    MOCK_TRACKING_PREFIXES,
    DEFAULT_PROVIDER,
    normalizeCourierSlug,
    loadCourierConfig,
    buildTrackingUrl,
    generateMockTrackingId,
    normalizeRecipientPhone,
    resolveCodAmount,
    validateOrderForBooking,
    buildOrderDataForCourier,
    buildSteadfastPayload,
    bookMockParcel,
    bookSteadfastParcel,
    bookPathaoParcel,
    bookRedxParcel,
    bookParcelForOrder
};
