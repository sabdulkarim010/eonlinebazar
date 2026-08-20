/********************************************************************
 * Project: EonlineBazar
 * File: paymentGatewayAdapters.js
 * Location: services/paymentGatewayAdapters.js
 * Author: Abdul Karim Sheikh
 * Description: Live payment gateway adapters for SSLCommerz, Aamarpay,
 * and ShurjoPay. Credentials are read from .env so adding API keys is
 * enough to go live; admin-panel credentials remain as fallbacks.
 ********************************************************************/

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Adapter shape:
 *   endpoints(isSandbox) -> { checkout, validate }
 *   buildRedirect(orderData | { order, credentials, callbacks }) -> Promise<{ success, redirectUrl, sessionKey?, ready, error?, message? }>
 *   verifyIpn({ body, headers, credentials }) -> Promise<{ verified, transactionId, status, amount, gatewayReference, message }>
 */

/** Normalizes the many casings gateways use for a payment outcome. */
function normalizeGatewayStatus(raw) {
    const status = String(raw || '').trim().toLowerCase();

    if (['valid', 'validated', 'success', 'successful', 'paid', 'completed', 'capture', 'captured'].includes(status)) {
        return 'paid';
    }
    if (['pending', 'processing', 'initiated', 'unattempted'].includes(status)) return 'pending';
    if (['failed', 'failure', 'invalid', 'declined', 'error'].includes(status)) return 'failed';
    if (['cancelled', 'canceled', 'expired', 'aborted'].includes(status)) return 'cancelled';
    if (['refunded', 'refund'].includes(status)) return 'refunded';

    return 'pending';
}

/** Constant-time compare so signature checks cannot be timing-probed. */
function safeCompare(a, b) {
    const left = Buffer.from(String(a || ''), 'utf8');
    const right = Buffer.from(String(b || ''), 'utf8');
    if (left.length === 0 || left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function frontendBase() {
    return String(process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || '')
        .trim()
        .replace(/\/+$/, '');
}

function toMoney(value) {
    return (Math.round((Number(value) || 0) * 100) / 100).toFixed(2);
}

function parseJsonSafe(raw) {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function encodeFormFields(fields) {
    return Object.entries(fields)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');
}

/**
 * Minimal HTTP client — form POST, JSON POST, and GET — using Node built-ins.
 */
function httpRequest(urlString, { method = 'GET', headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlString);
        const transport = url.protocol === 'https:' ? https : http;

        const req = transport.request(
            {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: `${url.pathname}${url.search}`,
                method,
                headers
            },
            (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode || 0,
                        body: Buffer.concat(chunks).toString('utf8')
                    });
                });
            }
        );

        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function postForm(urlString, fields) {
    const body = encodeFormFields(fields);
    const { statusCode, body: raw } = await httpRequest(urlString, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body)
        },
        body
    });

    return { statusCode, data: parseJsonSafe(raw) || raw, raw };
}

async function postJson(urlString, payload, extraHeaders = {}) {
    const body = JSON.stringify(payload);
    const { statusCode, body: raw } = await httpRequest(urlString, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Content-Length': Buffer.byteLength(body),
            ...extraHeaders
        },
        body
    });

    return { statusCode, data: parseJsonSafe(raw) || raw, raw };
}

async function getJson(urlString) {
    const { statusCode, body: raw } = await httpRequest(urlString, {
        method: 'GET',
        headers: { Accept: 'application/json' }
    });

    return { statusCode, data: parseJsonSafe(raw) || raw, raw };
}

/** Maps the controller contract into the flat orderData shape adapters expect. */
function normalizeOrderData(input = {}) {
    if (input.orderId || input.amount !== undefined) {
        return {
            orderId: input.orderId,
            amount: Number(input.amount) || 0,
            customerName: input.customerName || '',
            customerEmail: input.customerEmail || '',
            customerPhone: input.customerPhone || '',
            shippingAddress: input.shippingAddress || input.customerAddress || '',
            city: input.city || input.shippingDistrict || 'Dhaka',
            productSummary: input.productSummary || 'Order Items',
            itemCount: input.itemCount || 1
        };
    }

    const order = input.order || {};
    return {
        orderId: order.orderId || order.transactionRef || '',
        amount: Number(order.amount) || 0,
        customerName: order.customerName || '',
        customerEmail: order.customerEmail || '',
        customerPhone: order.customerPhone || '',
        shippingAddress: order.shippingAddress || order.customerAddress || '',
        city: order.city || order.shippingDistrict || 'Dhaka',
        productSummary: order.productSummary || 'Order Items',
        itemCount: order.itemCount || 1
    };
}

function sslcommerzConfig() {
    return {
        storeId: process.env.SSLCOMMERZ_STORE_ID || '',
        storePassword: process.env.SSLCOMMERZ_STORE_PASSWORD || '',
        isLive: process.env.SSLCOMMERZ_IS_LIVE === 'true',
        baseUrl: process.env.SSLCOMMERZ_IS_LIVE === 'true'
            ? 'https://securepay.sslcommerz.com'
            : 'https://sandbox.sslcommerz.com'
    };
}

function aamarpayConfig() {
    return {
        storeId: process.env.AAMARPAY_STORE_ID || '',
        signatureKey: process.env.AAMARPAY_SIGNATURE_KEY || '',
        isLive: process.env.AAMARPAY_IS_LIVE === 'true',
        baseUrl: process.env.AAMARPAY_IS_LIVE === 'true'
            ? 'https://secure.aamarpay.com'
            : 'https://sandbox.aamarpay.com'
    };
}

function shurjopayConfig() {
    const isLive = process.env.SHURJOPAY_IS_LIVE === 'true'
        || (process.env.SHURJOPAY_IS_LIVE !== 'false'
            && !String(process.env.SHURJOPAY_USERNAME || '').toLowerCase().includes('sandbox'));

    return {
        username: process.env.SHURJOPAY_USERNAME || '',
        password: process.env.SHURJOPAY_PASSWORD || '',
        prefix: process.env.SHURJOPAY_PREFIX || 'SP',
        returnUrl: process.env.SHURJOPAY_RETURN_URL || '',
        cancelUrl: process.env.SHURJOPAY_CANCEL_URL || '',
        isLive,
        baseUrl: isLive
            ? 'https://engine.shurjopayment.com/api'
            : 'https://sandbox.shurjopayment.com/api'
    };
}

function envGatewayConfigured(provider) {
    const code = String(provider || '').toLowerCase();
    if (code === 'sslcommerz') {
        const cfg = sslcommerzConfig();
        return Boolean(cfg.storeId && cfg.storePassword);
    }
    if (code === 'aamarpay') {
        const cfg = aamarpayConfig();
        return Boolean(cfg.storeId && cfg.signatureKey);
    }
    if (code === 'shurjopay') {
        const cfg = shurjopayConfig();
        return Boolean(cfg.username && cfg.password && cfg.prefix);
    }
    return false;
}

async function sslcommerzValidatePayment(valId, config = sslcommerzConfig()) {
    if (!valId || !config.storeId || !config.storePassword) {
        return { verified: false, status: 'pending', message: 'Missing val_id or SSLCommerz credentials.' };
    }

    const query = new URLSearchParams({
        val_id: valId,
        store_id: config.storeId,
        store_passwd: config.storePassword,
        format: 'json'
    });

    const { data } = await getJson(`${config.baseUrl}/validator/api/validationserverAPI.php?${query.toString()}`);
    const status = String(data?.status || '').toUpperCase();
    const verified = status === 'VALID' || status === 'VALIDATED';

    return {
        verified,
        transactionId: data?.tran_id || '',
        gatewayReference: data?.bank_tran_id || valId,
        status: verified ? 'paid' : normalizeGatewayStatus(data?.status),
        amount: Number(data?.amount ?? data?.store_amount) || 0,
        message: verified ? 'Payment validated with SSLCommerz.' : (data?.error || data?.failedreason || 'SSLCommerz validation failed.')
    };
}

async function aamarpayValidatePayment(merchantTxnId, config = aamarpayConfig()) {
    if (!merchantTxnId || !config.storeId || !config.signatureKey) {
        return { verified: false, status: 'pending', message: 'Missing transaction id or Aamarpay credentials.' };
    }

    const { data } = await postForm(`${config.baseUrl}/api/v1/trxcheck/request.php`, {
        store_id: config.storeId,
        signature_key: config.signatureKey,
        request_id: merchantTxnId,
        type: 'json'
    });

    const payStatus = String(data?.pay_status || data?.status || '').toLowerCase();
    const verified = payStatus === 'successful' || payStatus === 'success' || payStatus === 'paid';

    return {
        verified,
        transactionId: data?.mer_txnid || merchantTxnId,
        gatewayReference: data?.pg_txnid || '',
        status: verified ? 'paid' : normalizeGatewayStatus(payStatus || data?.status_code),
        amount: Number(data?.amount) || 0,
        message: verified ? 'Payment verified with Aamarpay.' : (data?.reason || data?.message || 'Aamarpay verification failed.')
    };
}

async function shurjopayGetToken(config = shurjopayConfig()) {
    const { data } = await postJson(`${config.baseUrl}/get_token`, {
        username: config.username,
        password: config.password
    });

    if (!data?.token) {
        throw new Error(data?.message || 'ShurjoPay token request failed.');
    }

    return data;
}

async function shurjopayValidatePayment(spOrderId, config = shurjopayConfig()) {
    if (!spOrderId) {
        return { verified: false, status: 'pending', message: 'Missing ShurjoPay order id.' };
    }

    const tokenPayload = await shurjopayGetToken(config);
    const token = tokenPayload.token;
    const tokenType = String(tokenPayload.token_type || 'Bearer');

    const { data } = await postJson(
        `${config.baseUrl}/verification`,
        { order_id: spOrderId },
        { Authorization: `${tokenType} ${token}` }
    );

    const record = Array.isArray(data) ? data[0] : data;
    const spCode = Number(record?.sp_code);
    const txStatus = String(record?.transaction_status || record?.bank_status || '').toLowerCase();
    const verified = spCode === 1000 || txStatus === 'success' || txStatus === 'successful';

    return {
        verified,
        transactionId: record?.customer_order_id || record?.order_id || spOrderId,
        gatewayReference: record?.order_id || spOrderId,
        status: verified ? 'paid' : normalizeGatewayStatus(txStatus || record?.sp_message),
        amount: Number(record?.amount ?? record?.payable_amount) || 0,
        message: verified ? 'Payment verified with ShurjoPay.' : (record?.sp_message || record?.message || 'ShurjoPay verification failed.')
    };
}

const sslcommerzAdapter = {
    id: 'sslcommerz',
    label: 'SSLCommerz',
    endpoints: (isSandbox) => (isSandbox
        ? {
            checkout: 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php',
            validate: 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php'
        }
        : {
            checkout: 'https://securepay.sslcommerz.com/gwprocess/v4/api.php',
            validate: 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php'
        }),

    async buildRedirect(input) {
        try {
            const orderData = normalizeOrderData(input);
            const config = sslcommerzConfig();
            const base = frontendBase();

            if (!config.storeId || !config.storePassword) {
                return {
                    success: false,
                    ready: false,
                    redirectUrl: '',
                    error: 'SSLCommerz credentials are missing. Set SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD in .env.'
                };
            }

            if (!base) {
                return {
                    success: false,
                    ready: false,
                    redirectUrl: '',
                    error: 'FRONTEND_URL is not configured.'
                };
            }

            const { data } = await postForm(`${config.baseUrl}/gwprocess/v4/api.php`, {
                store_id: config.storeId,
                store_passwd: config.storePassword,
                total_amount: toMoney(orderData.amount),
                currency: 'BDT',
                tran_id: orderData.orderId,
                success_url: `${base}/api/payments/ipn/sslcommerz?status=success`,
                fail_url: `${base}/api/payments/ipn/sslcommerz?status=fail`,
                cancel_url: `${base}/api/payments/ipn/sslcommerz?status=cancel`,
                ipn_url: `${base}/api/payments/ipn/sslcommerz`,
                cus_name: orderData.customerName,
                cus_email: orderData.customerEmail || 'customer@eonlinebazar.com',
                cus_phone: orderData.customerPhone,
                cus_add1: orderData.shippingAddress,
                cus_city: orderData.city || 'Dhaka',
                cus_country: 'Bangladesh',
                shipping_method: 'Courier',
                product_name: orderData.productSummary || 'Order Items',
                product_category: 'General',
                product_profile: 'general',
                num_of_item: orderData.itemCount || 1
            });

            if (data?.status === 'SUCCESS' && data?.GatewayPageURL) {
                return {
                    success: true,
                    ready: true,
                    redirectUrl: data.GatewayPageURL,
                    sessionKey: data.sessionkey || ''
                };
            }

            return {
                success: false,
                ready: false,
                redirectUrl: '',
                error: data?.failedreason || 'SSLCommerz session creation failed'
            };
        } catch (error) {
            return {
                success: false,
                ready: false,
                redirectUrl: '',
                error: error.message || 'SSLCommerz session creation failed'
            };
        }
    },

    async verifyIpn({ body, credentials }) {
        const config = sslcommerzConfig();
        const valId = body.val_id || body.valId || '';

        if (valId && config.storeId && config.storePassword) {
            try {
                return await sslcommerzValidatePayment(valId, config);
            } catch (error) {
                return {
                    verified: false,
                    transactionId: body.tran_id || '',
                    gatewayReference: valId,
                    status: 'pending',
                    amount: Number(body.amount ?? body.store_amount) || 0,
                    message: error.message || 'SSLCommerz remote validation failed.'
                };
            }
        }

        const providedSign = body.verify_sign || body.verify_sign_sha2 || '';
        const keyList = String(body.verify_key || '').split(',').filter(Boolean);
        const storePassword = config.storePassword || credentials?.storePassword || '';

        let verified = false;
        if (providedSign && keyList.length && storePassword) {
            const parts = keyList
                .sort()
                .map((key) => `${key}=${body[key] ?? ''}`)
                .concat(`store_passwd=${crypto.createHash('md5').update(storePassword).digest('hex')}`)
                .join('&');
            verified = safeCompare(providedSign, crypto.createHash('md5').update(parts).digest('hex'));
        }

        return {
            verified,
            transactionId: body.tran_id || body.bank_tran_id || '',
            gatewayReference: body.bank_tran_id || body.val_id || '',
            status: normalizeGatewayStatus(body.status),
            amount: Number(body.amount ?? body.store_amount) || 0,
            message: verified ? 'Signature verified.' : 'Signature could not be verified.'
        };
    }
};

const aamarpayAdapter = {
    id: 'aamarpay',
    label: 'Aamarpay',
    endpoints: (isSandbox) => (isSandbox
        ? {
            checkout: 'https://sandbox.aamarpay.com/request.php',
            validate: 'https://sandbox.aamarpay.com/api/v1/trxcheck/request.php'
        }
        : {
            checkout: 'https://secure.aamarpay.com/request.php',
            validate: 'https://secure.aamarpay.com/api/v1/trxcheck/request.php'
        }),

    async buildRedirect(input) {
        try {
            const orderData = normalizeOrderData(input);
            const config = aamarpayConfig();
            const base = frontendBase();

            if (!config.storeId || !config.signatureKey) {
                return {
                    success: false,
                    ready: false,
                    redirectUrl: '',
                    error: 'Aamarpay credentials are missing. Set AAMARPAY_STORE_ID and AAMARPAY_SIGNATURE_KEY in .env.'
                };
            }

            if (!base) {
                return {
                    success: false,
                    ready: false,
                    redirectUrl: '',
                    error: 'FRONTEND_URL is not configured.'
                };
            }

            const { data } = await postForm(`${config.baseUrl}/request.php`, {
                store_id: config.storeId,
                signature_key: config.signatureKey,
                cus_name: orderData.customerName,
                cus_email: orderData.customerEmail || 'customer@eonlinebazar.com',
                cus_phone: orderData.customerPhone,
                cus_add1: orderData.shippingAddress,
                cus_city: orderData.city || 'Dhaka',
                cus_country: 'Bangladesh',
                amount: toMoney(orderData.amount),
                tran_id: orderData.orderId,
                currency: 'BDT',
                success_url: `${base}/api/payments/ipn/aamarpay?status=success`,
                fail_url: `${base}/api/payments/ipn/aamarpay?status=fail`,
                cancel_url: `${base}/api/payments/ipn/aamarpay?status=cancel`,
                desc: 'Order Payment',
                type: 'json'
            });

            const redirectUrl = data?.payment_url || data?.redirect_url || data?.url || '';
            if (redirectUrl || data?.result === 'true' || data?.result === true) {
                if (redirectUrl) {
                    return { success: true, ready: true, redirectUrl };
                }
            }

            return {
                success: false,
                ready: false,
                redirectUrl: '',
                error: data?.message || data?.reason || 'Aamarpay session creation failed'
            };
        } catch (error) {
            return {
                success: false,
                ready: false,
                redirectUrl: '',
                error: error.message || 'Aamarpay session creation failed'
            };
        }
    },

    async verifyIpn({ body, credentials }) {
        const config = aamarpayConfig();
        const merchantTxnId = body.mer_txnid || body.tran_id || body.request_id || '';

        if (merchantTxnId && config.storeId && config.signatureKey) {
            try {
                return await aamarpayValidatePayment(merchantTxnId, config);
            } catch (error) {
                return {
                    verified: false,
                    transactionId: merchantTxnId,
                    gatewayReference: body.pg_txnid || '',
                    status: normalizeGatewayStatus(body.pay_status || body.status),
                    amount: Number(body.amount) || 0,
                    message: error.message || 'Aamarpay remote verification failed.'
                };
            }
        }

        const signatureKey = config.signatureKey || credentials?.apiKey || credentials?.storePassword || '';
        const verified = Boolean(signatureKey) && safeCompare(body.signature_key || '', signatureKey);

        return {
            verified,
            transactionId: body.mer_txnid || body.tran_id || '',
            gatewayReference: body.pg_txnid || '',
            status: normalizeGatewayStatus(body.pay_status || body.status),
            amount: Number(body.amount) || 0,
            message: verified ? 'Signature key matched.' : 'Signature key mismatch.'
        };
    }
};

const shurjopayAdapter = {
    id: 'shurjopay',
    label: 'ShurjoPay',
    endpoints: (isSandbox) => (isSandbox
        ? {
            checkout: 'https://sandbox.shurjopayment.com/api/secret-pay',
            validate: 'https://sandbox.shurjopayment.com/api/verification'
        }
        : {
            checkout: 'https://engine.shurjopayment.com/api/secret-pay',
            validate: 'https://engine.shurjopayment.com/api/verification'
        }),

    async buildRedirect(input) {
        try {
            const orderData = normalizeOrderData(input);
            const config = shurjopayConfig();

            if (!config.username || !config.password || !config.prefix) {
                return {
                    success: false,
                    ready: false,
                    redirectUrl: '',
                    error: 'ShurjoPay credentials are missing. Set SHURJOPAY_USERNAME, SHURJOPAY_PASSWORD, and SHURJOPAY_PREFIX in .env.'
                };
            }

            if (!config.returnUrl || !config.cancelUrl) {
                return {
                    success: false,
                    ready: false,
                    redirectUrl: '',
                    error: 'SHURJOPAY_RETURN_URL and SHURJOPAY_CANCEL_URL must be set in .env.'
                };
            }

            const tokenPayload = await shurjopayGetToken(config);
            const token = tokenPayload.token;
            const tokenType = String(tokenPayload.token_type || 'Bearer');
            const storeId = String(tokenPayload.store_id || '');

            const { data } = await postJson(
                `${config.baseUrl}/secret-pay`,
                {
                    prefix: config.prefix,
                    token,
                    store_id: storeId,
                    order_id: orderData.orderId,
                    amount: Number(orderData.amount) || 0,
                    payable_amount: Number(orderData.amount) || 0,
                    currency: 'BDT',
                    return_url: config.returnUrl,
                    cancel_url: config.cancelUrl,
                    customer_name: orderData.customerName,
                    customer_email: orderData.customerEmail || 'customer@eonlinebazar.com',
                    customer_phone: orderData.customerPhone,
                    customer_address: orderData.shippingAddress,
                    customer_city: orderData.city || 'Dhaka'
                },
                { Authorization: `${tokenType} ${token}` }
            );

            if (data?.checkout_url) {
                return {
                    success: true,
                    ready: true,
                    redirectUrl: data.checkout_url,
                    sessionKey: data.sp_order_id || ''
                };
            }

            return {
                success: false,
                ready: false,
                redirectUrl: '',
                error: data?.message || data?.sp_message || 'ShurjoPay session creation failed'
            };
        } catch (error) {
            return {
                success: false,
                ready: false,
                redirectUrl: '',
                error: error.message || 'ShurjoPay session creation failed'
            };
        }
    },

    async verifyIpn({ body }) {
        const config = shurjopayConfig();
        const spOrderId = body.order_id || body.sp_order_id || body.spay_order_id || '';

        if (spOrderId) {
            try {
                return await shurjopayValidatePayment(spOrderId, config);
            } catch (error) {
                return {
                    verified: false,
                    transactionId: body.customer_order_id || body.merchant_order_id || '',
                    gatewayReference: spOrderId,
                    status: normalizeGatewayStatus(body.transaction_status || body.status),
                    amount: Number(body.amount) || 0,
                    message: error.message || 'ShurjoPay remote verification failed.'
                };
            }
        }

        return {
            verified: false,
            transactionId: body.customer_order_id || body.order_id || '',
            gatewayReference: body.sp_order_id || '',
            status: normalizeGatewayStatus(body.transaction_status || body.status),
            amount: Number(body.amount) || 0,
            message: 'ShurjoPay order id missing — recorded for manual review.'
        };
    }
};

const customAdapter = {
    id: 'custom',
    label: 'Custom gateway',
    endpoints: () => ({ checkout: '', validate: '' }),

    async buildRedirect() {
        return {
            success: false,
            ready: false,
            redirectUrl: '',
            error: 'This gateway has no adapter yet — add one in services/paymentGatewayAdapters.js.'
        };
    },

    async verifyIpn({ body }) {
        return {
            verified: false,
            transactionId: body.tran_id || body.transaction_id || body.orderId || '',
            gatewayReference: body.reference || '',
            status: normalizeGatewayStatus(body.status),
            amount: Number(body.amount) || 0,
            message: 'No signature scheme configured for this provider — recorded for manual review.'
        };
    }
};

const ADAPTERS = Object.freeze({
    sslcommerz: sslcommerzAdapter,
    aamarpay: aamarpayAdapter,
    shurjopay: shurjopayAdapter,
    stripe: { ...customAdapter, id: 'stripe', label: 'Stripe' },
    custom: customAdapter
});

function getGatewayAdapter(provider) {
    return ADAPTERS[String(provider || '').toLowerCase()] || customAdapter;
}

module.exports = {
    getGatewayAdapter,
    normalizeGatewayStatus,
    safeCompare,
    envGatewayConfigured,
    sslcommerzConfig,
    aamarpayConfig,
    shurjopayConfig
};
