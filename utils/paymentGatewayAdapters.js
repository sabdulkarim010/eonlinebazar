/********************************************************************
 * Project: EonlineBazar
 * File: paymentGatewayAdapters.js
 * Location: utils/paymentGatewayAdapters.js
 * Author: Abdul Karim Sheikh
 * Description: Adapter contract for automated gateways. Each adapter owns
 * the two provider-specific pieces — building the hosted-checkout redirect
 * and validating an IPN callback — so wiring a real gateway means filling
 * in one adapter, never touching checkout or order code.
 ********************************************************************/

const crypto = require('crypto');

/**
 * Adapter shape:
 *   endpoints(isSandbox) -> { checkout, validate }
 *   buildRedirect({ order, credentials, callbacks }) -> { ready, redirectUrl, payload, message }
 *   verifyIpn({ body, headers, credentials }) -> { verified, transactionId, status, amount, message }
 *
 * `ready: false` means the adapter has no live HTTP call implemented yet — the
 * credentials, fee maths, order snapshot and IPN route are all in place, so the
 * only remaining work is the provider request itself.
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

    buildRedirect({ order, credentials, callbacks }) {
        return {
            ready: false,
            redirectUrl: '',
            message: 'SSLCommerz session creation is not wired yet.',
            payload: {
                store_id: credentials.storeId,
                store_passwd: credentials.storePassword,
                total_amount: order.amount,
                currency: 'BDT',
                tran_id: order.transactionRef,
                success_url: callbacks.success,
                fail_url: callbacks.fail,
                cancel_url: callbacks.cancel,
                ipn_url: callbacks.ipn,
                cus_name: order.customerName,
                cus_phone: order.customerPhone,
                shipping_method: 'Courier',
                product_category: 'ecommerce',
                product_profile: 'general'
            }
        };
    },

    verifyIpn({ body, credentials }) {
        // SSLCommerz signs each IPN with an MD5 of the ordered key list in
        // `verify_sign_sha2`/`verify_sign` plus the store password hash.
        const providedSign = body.verify_sign || body.verify_sign_sha2 || '';
        const keyList = String(body.verify_key || '').split(',').filter(Boolean);

        let verified = false;
        if (providedSign && keyList.length && credentials.storePassword) {
            const parts = keyList
                .sort()
                .map((key) => `${key}=${body[key] ?? ''}`)
                .concat(`store_passwd=${crypto.createHash('md5').update(credentials.storePassword).digest('hex')}`)
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
            checkout: 'https://sandbox.aamarpay.com/jsonpost.php',
            validate: 'https://sandbox.aamarpay.com/api/v1/trxcheck/request.php'
        }
        : {
            checkout: 'https://secure.aamarpay.com/jsonpost.php',
            validate: 'https://secure.aamarpay.com/api/v1/trxcheck/request.php'
        }),

    buildRedirect({ order, credentials, callbacks }) {
        return {
            ready: false,
            redirectUrl: '',
            message: 'Aamarpay session creation is not wired yet.',
            payload: {
                store_id: credentials.storeId,
                signature_key: credentials.apiKey || credentials.storePassword,
                amount: order.amount,
                currency: 'BDT',
                tran_id: order.transactionRef,
                success_url: callbacks.success,
                fail_url: callbacks.fail,
                cancel_url: callbacks.cancel,
                cus_name: order.customerName,
                cus_phone: order.customerPhone,
                desc: `Order ${order.orderId}`,
                type: 'json'
            }
        };
    },

    verifyIpn({ body, credentials }) {
        // Aamarpay echoes the signature key back on every callback.
        const signatureKey = credentials.apiKey || credentials.storePassword;
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

/**
 * Fallback adapter. Keeps unknown / in-house gateways functional end to end:
 * the IPN is recorded and the order is annotated, but never auto-marked paid
 * without a verifiable signature.
 */
const customAdapter = {
    id: 'custom',
    label: 'Custom gateway',
    endpoints: () => ({ checkout: '', validate: '' }),

    buildRedirect() {
        return {
            ready: false,
            redirectUrl: '',
            message: 'This gateway has no adapter yet — add one in utils/paymentGatewayAdapters.js.',
            payload: {}
        };
    },

    verifyIpn({ body }) {
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
    shurjopay: { ...customAdapter, id: 'shurjopay', label: 'ShurjoPay' },
    stripe: { ...customAdapter, id: 'stripe', label: 'Stripe' },
    custom: customAdapter
});

function getGatewayAdapter(provider) {
    return ADAPTERS[String(provider || '').toLowerCase()] || customAdapter;
}

module.exports = {
    getGatewayAdapter,
    normalizeGatewayStatus,
    safeCompare
};
