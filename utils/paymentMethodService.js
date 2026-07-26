/********************************************************************
 * Project: EonlineBazar
 * File: paymentMethodService.js
 * Location: utils/paymentMethodService.js
 * Author: Abdul Karim Sheikh
 * Description: Single gateway between the PaymentMethod collection and
 * everything that consumes it — checkout rendering, order placement,
 * processing-fee maths, IPN routing and the storefront trust badges.
 ********************************************************************/

const PaymentMethod = require('../models/PaymentMethod');
const Settings = require('../models/Settings');
const { normalizePaymentGateways } = require('./paymentGatewayService');

const IPN_ROUTE_PREFIX = '/api/payments/ipn';
const CACHE_TTL_MS = 15 * 1000;

/** Wallet is a stored balance, not a configurable method — it bypasses the catalog. */
const WALLET_METHOD_CODE = 'wallet';

let cachedPublicPayload = null;
let cacheExpiresAt = 0;

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

/** URL/DB-safe machine key derived from a display name. */
function slugifyMethodName(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}

/**
 * Reserves a unique `code`. Renaming a method never changes its code, so
 * historical orders and gateway dashboards keep resolving.
 */
async function buildUniqueMethodCode(name, { excludeId = null } = {}) {
    const base = slugifyMethodName(name) || 'method';
    let candidate = base;
    let suffix = 2;

    /* eslint-disable no-await-in-loop */
    while (true) {
        const query = { code: candidate };
        if (excludeId) query._id = { $ne: excludeId };
        const clash = await PaymentMethod.exists(query);
        if (!clash) return candidate;
        candidate = `${base}-${suffix}`;
        suffix += 1;
    }
    /* eslint-enable no-await-in-loop */
}

function buildIpnPath(code) {
    return `${IPN_ROUTE_PREFIX}/${code}`;
}

/**
 * Absolute callback URL for a gateway dashboard. Prefers an explicitly
 * configured public origin, then the live request host, then a relative path.
 */
function buildWebhookUrl(code, req = null) {
    const configuredBase = (
        process.env.PUBLIC_BASE_URL
        || process.env.APP_BASE_URL
        || process.env.BASE_URL
        || ''
    ).trim().replace(/\/+$/, '');

    if (configuredBase) return `${configuredBase}${buildIpnPath(code)}`;

    if (req?.headers?.host) {
        const protocol = req.protocol || (req.secure ? 'https' : 'http');
        return `${protocol}://${req.headers.host}${buildIpnPath(code)}`;
    }

    return buildIpnPath(code);
}

/**
 * An automated method is only offered at checkout once its gateway can
 * actually be reached — otherwise a customer would commit to an order and
 * then hit a dead redirect.
 */
function isCheckoutReady(method) {
    if (!method || method.isActive !== true) return false;
    if (method.type !== 'automated') return true;

    const config = method.apiConfig || {};
    return Boolean(config.storeId && (config.storePassword || config.apiKey));
}

function computeProcessingFee(method, amount) {
    if (!method) return 0;
    if (typeof method.computeFee === 'function') return method.computeFee(amount);

    const fee = Number(method.processingFee) || 0;
    if (fee <= 0) return 0;
    const base = Math.max(0, Number(amount) || 0);
    return roundMoney(method.feeType === 'flat' ? fee : (base * fee) / 100);
}

/**
 * Everything the storefront needs, in one payload.
 *
 * `methods` drives the checkout selector and therefore excludes automated
 * gateways with missing credentials. `enabledPaymentMethods` /
 * `paymentGateways` drive the product-page trust badges and keep the legacy
 * shape other pages already read from `window.__STORE_SETTINGS__`.
 */
async function buildPublicPaymentPayload() {
    const documents = await PaymentMethod.findActiveSorted();

    const checkoutMethods = documents
        .filter(isCheckoutReady)
        .map((doc) => doc.toPublicObject());

    const badgeMethods = documents.map((doc) => ({
        id: doc.code,
        name: doc.name,
        logoUrl: doc.logoUrl || ''
    }));

    const paymentGateways = {};
    const activePaymentGateways = {};
    documents.forEach((doc) => {
        paymentGateways[doc.code] = {
            enabled: true,
            name: doc.name,
            logoUrl: doc.logoUrl || ''
        };
        activePaymentGateways[doc.code] = true;
    });

    return {
        methods: checkoutMethods,
        paymentMethods: checkoutMethods,
        enabledPaymentMethods: badgeMethods,
        paymentGateways,
        activePaymentGateways,
        activePaymentMethods: badgeMethods.map((method) => method.id)
    };
}

async function getPublicPaymentPayload({ forceRefresh = false } = {}) {
    const now = Date.now();
    if (!forceRefresh && cachedPublicPayload && now < cacheExpiresAt) {
        return cachedPublicPayload;
    }

    const payload = await buildPublicPaymentPayload();
    cachedPublicPayload = payload;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return payload;
}

function clearPaymentMethodCache() {
    cachedPublicPayload = null;
    cacheExpiresAt = 0;
}

/**
 * Resolves whatever the checkout sent — an ObjectId, a code, or a display
 * name — into a live, orderable method document. Accepting the name keeps
 * older cached storefront bundles working after this release.
 */
async function resolvePaymentMethodForCheckout(identifier) {
    const raw = String(identifier || '').trim();
    if (!raw) return null;

    if (/^[0-9a-fA-F]{24}$/.test(raw)) {
        const byId = await PaymentMethod.findById(raw);
        if (byId && isCheckoutReady(byId)) return byId;
    }

    const byCode = await PaymentMethod.findOne({ code: raw.toLowerCase(), isActive: true });
    if (byCode && isCheckoutReady(byCode)) return byCode;

    const bySlug = await PaymentMethod.findOne({ code: slugifyMethodName(raw), isActive: true });
    if (bySlug && isCheckoutReady(bySlug)) return bySlug;

    const byName = await PaymentMethod.findOne({
        name: new RegExp(`^${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        isActive: true
    });
    if (byName && isCheckoutReady(byName)) return byName;

    return null;
}

/**
 * Denormalized payment facts frozen onto the order. Ledger tooling can be
 * built on this snapshot alone — it survives renames, fee changes, and even
 * deletion of the method itself.
 */
function buildOrderPaymentSnapshot(method, { amount = 0, processingFee = 0 } = {}) {
    if (!method) {
        return {
            methodId: null,
            code: '',
            name: '',
            type: 'manual',
            provider: '',
            accountNumber: '',
            gatewayStoreId: '',
            isSandbox: false,
            processingFee: 0,
            feeType: 'percentage',
            feeRate: 0,
            feeBaseAmount: roundMoney(amount),
            status: 'unpaid',
            transactionId: '',
            settledFromWallet: false,
            ipnHistory: []
        };
    }

    const isAutomated = method.type === 'automated';

    return {
        methodId: method._id,
        code: method.code,
        name: method.name,
        type: method.type,
        provider: method.provider || '',
        // Manual methods are reconciled against the merchant wallet/bank
        // account; automated ones against the gateway store id.
        accountNumber: isAutomated ? '' : (method.accountNumber || ''),
        gatewayStoreId: isAutomated ? (method.apiConfig?.storeId || '') : '',
        isSandbox: isAutomated ? method.apiConfig?.isSandbox !== false : false,
        processingFee: roundMoney(processingFee),
        feeType: method.feeType,
        feeRate: Number(method.processingFee) || 0,
        feeBaseAmount: roundMoney(amount),
        status: 'unpaid',
        transactionId: '',
        settledFromWallet: false,
        ipnHistory: []
    };
}

/** Legacy gateway keys → the catalog document seeded from them. */
const LEGACY_SEED_TEMPLATES = Object.freeze({
    bKash: {
        code: 'bkash',
        name: 'bKash',
        type: 'manual',
        sortOrder: 1,
        description: 'Pay instantly from your bKash wallet',
        accountNumber: '',
        instructions: 'Open the bKash app or dial *247#, choose "Send Money", and send the exact payable amount to our merchant wallet. Keep the Transaction ID (TrxID) — our team verifies every payment within 15-30 minutes.'
    },
    Nagad: {
        code: 'nagad',
        name: 'Nagad',
        type: 'manual',
        sortOrder: 2,
        description: 'Fast and secure Nagad checkout',
        accountNumber: '',
        instructions: 'Open the Nagad app or dial *167#, choose "Send Money", and send the exact payable amount to our merchant wallet. Please pay from your personal Nagad wallet so the payment can be matched to your order.'
    },
    Visa: {
        code: 'visa',
        name: 'VISA',
        type: 'automated',
        provider: 'sslcommerz',
        sortOrder: 3,
        description: 'Pay securely with your Visa card'
    },
    MasterCard: {
        code: 'mastercard',
        name: 'MasterCard',
        type: 'automated',
        provider: 'sslcommerz',
        sortOrder: 4,
        description: 'Pay securely with your MasterCard'
    },
    COD: {
        code: 'cod',
        name: 'Cash on Delivery',
        type: 'manual',
        sortOrder: 6,
        description: 'Pay with cash when the parcel arrives',
        instructions: 'No online payment needed. Check your parcel and pay the total amount in cash to the delivery agent at your doorstep. Standard delivery takes 2-3 working days across Bangladesh.'
    }
});

/** Bank transfer existed only as a hardcoded checkout option — carried over, disabled. */
const BANK_TRANSFER_SEED = Object.freeze({
    code: 'bank-transfer',
    name: 'Bank Transfer',
    type: 'manual',
    sortOrder: 5,
    isActive: false,
    description: 'Direct deposit to our bank account',
    instructions: 'Deposit the payable amount into our bank account and write your mobile number in the deposit reference field so we can match the payment to your order.'
});

/**
 * First-boot migration. Lifts the legacy `Settings.paymentGateways` toggles and
 * uploaded logos into the new collection so an existing store keeps the exact
 * same enabled methods and badges after deploying this release. Runs once —
 * it is a no-op as soon as any method exists.
 */
async function seedDefaultPaymentMethods() {
    const existing = await PaymentMethod.estimatedDocumentCount();
    if (existing > 0) return { seeded: 0 };

    let legacyGateways = {};
    try {
        legacyGateways = normalizePaymentGateways(await Settings.getOrCreate());
    } catch (error) {
        console.error('Payment method seed: legacy settings unreadable, using defaults.', error.message);
    }

    const documents = Object.entries(LEGACY_SEED_TEMPLATES).map(([legacyKey, template]) => {
        const legacy = legacyGateways[legacyKey];
        return {
            ...template,
            name: legacy?.name || template.name,
            logoUrl: legacy?.logoUrl || '',
            isActive: legacy ? legacy.enabled === true : true,
            feeType: 'percentage',
            processingFee: 0,
            apiConfig: template.type === 'automated'
                ? { isSandbox: true, webhookUrl: buildIpnPath(template.code) }
                : {}
        };
    });

    documents.push({ ...BANK_TRANSFER_SEED, feeType: 'percentage', processingFee: 0 });

    await PaymentMethod.create(documents);
    clearPaymentMethodCache();

    console.log(`💳 Payment catalog seeded with ${documents.length} method(s) migrated from legacy settings.`);
    return { seeded: documents.length };
}

module.exports = {
    IPN_ROUTE_PREFIX,
    WALLET_METHOD_CODE,
    slugifyMethodName,
    buildUniqueMethodCode,
    buildIpnPath,
    buildWebhookUrl,
    isCheckoutReady,
    computeProcessingFee,
    getPublicPaymentPayload,
    clearPaymentMethodCache,
    resolvePaymentMethodForCheckout,
    buildOrderPaymentSnapshot,
    seedDefaultPaymentMethods,
    roundMoney
};
