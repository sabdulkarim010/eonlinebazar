/********************************************************************
 * Project: EonlineBazar
 * File: PaymentMethod.js
 * Location: models/PaymentMethod.js
 * Author: Abdul Karim Sheikh
 * Description: Dynamic payment method catalog. Every method the store
 * accepts — manual wallets (bKash/Nagad/bank) and automated gateways
 * (SSLCommerz/Aamarpay) — is one document here, so checkout, accounting
 * and IPN routing all read from a single source of truth.
 ********************************************************************/

const mongoose = require('mongoose');
const { encryptSecret, decryptSecret, maskSecret, isEncryptedEnvelope } = require('../utils/cryptoVault');

const PAYMENT_METHOD_TYPES = Object.freeze(['manual', 'automated']);
const FEE_TYPES = Object.freeze(['flat', 'percentage']);

/**
 * Known automated providers. `custom` keeps the door open for a gateway that
 * has no adapter yet — the credentials still store safely and the IPN
 * endpoint still resolves.
 */
const GATEWAY_PROVIDERS = Object.freeze(['sslcommerz', 'aamarpay', 'shurjopay', 'stripe', 'custom']);

const IPN_EVENT_LIMIT = 25;

const apiConfigSchema = new mongoose.Schema({
    storeId: { type: String, default: '', trim: true },
    // Sealed at rest with AES-256-GCM — see utils/cryptoVault.js
    storePassword: { type: String, default: '' },
    apiKey: { type: String, default: '' },
    isSandbox: { type: Boolean, default: true },
    // IPN / callback target handed to the gateway dashboard. Generated from the
    // method code, but overridable for gateways that demand an exact path.
    webhookUrl: { type: String, default: '', trim: true }
}, { _id: false });

const paymentMethodSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Payment method name is required.'],
        trim: true,
        maxlength: 60
    },
    /**
     * Stable machine key (slug of the name at creation time). Orders, IPN URLs
     * and ledger exports reference this, so it never changes on rename.
     */
    code: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        unique: true,
        index: true
    },
    logoUrl: { type: String, default: '', trim: true },
    type: {
        type: String,
        enum: PAYMENT_METHOD_TYPES,
        default: 'manual'
    },
    provider: {
        type: String,
        enum: [...GATEWAY_PROVIDERS, ''],
        default: ''
    },
    // Shown under the option on checkout for manual methods only.
    instructions: { type: String, default: '', trim: true, maxlength: 2000 },
    // Merchant wallet / bank account the customer pays into (manual methods).
    accountNumber: { type: String, default: '', trim: true, maxlength: 80 },
    processingFee: { type: Number, default: 0, min: 0 },
    feeType: {
        type: String,
        enum: FEE_TYPES,
        default: 'percentage'
    },
    sortOrder: { type: Number, default: 0 },
    apiConfig: { type: apiConfigSchema, default: () => ({}) },
    isActive: { type: Boolean, default: true },
    // Short tagline rendered beside the method name on checkout.
    description: { type: String, default: '', trim: true, maxlength: 160 },
    createdByAdmin: { type: String, default: '', trim: true },
    updatedByAdmin: { type: String, default: '', trim: true }
}, { timestamps: true });

// Checkout always reads active methods in display order.
paymentMethodSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

paymentMethodSchema.path('processingFee').validate(function validateFeeCeiling(value) {
    if (this.feeType !== 'percentage') return true;
    return Number(value) <= 100;
}, 'A percentage processing fee cannot exceed 100.');

/** Seal credentials on every write path, including findOneAndUpdate-free saves. */
paymentMethodSchema.pre('save', function sealApiCredentials() {
    if (this.type !== 'automated') {
        // Manual methods must never retain gateway credentials.
        this.apiConfig = {
            storeId: '',
            storePassword: '',
            apiKey: '',
            isSandbox: true,
            webhookUrl: ''
        };
        this.provider = '';
        return;
    }

    if (!this.apiConfig) this.apiConfig = {};

    if (this.isModified('apiConfig.storePassword') && !isEncryptedEnvelope(this.apiConfig.storePassword)) {
        this.apiConfig.storePassword = encryptSecret(this.apiConfig.storePassword);
    }

    if (this.isModified('apiConfig.apiKey') && !isEncryptedEnvelope(this.apiConfig.apiKey)) {
        this.apiConfig.apiKey = encryptSecret(this.apiConfig.apiKey);
    }
});

/**
 * Fee this method adds to an order total.
 * `percentage` is applied to the amount, `flat` is a fixed surcharge.
 */
paymentMethodSchema.methods.computeFee = function computeFee(amount) {
    const base = Math.max(0, Number(amount) || 0);
    const fee = Number(this.processingFee) || 0;
    if (fee <= 0) return 0;

    const raw = this.feeType === 'flat' ? fee : (base * fee) / 100;
    return Math.round(raw * 100) / 100;
};

/** Plaintext gateway credentials — server-side callers only (initiate / IPN verify). */
paymentMethodSchema.methods.getDecryptedApiConfig = function getDecryptedApiConfig() {
    const config = this.apiConfig || {};
    return {
        storeId: config.storeId || '',
        storePassword: decryptSecret(config.storePassword),
        apiKey: decryptSecret(config.apiKey),
        isSandbox: config.isSandbox !== false,
        webhookUrl: config.webhookUrl || ''
    };
};

/**
 * Admin Panel payload. Secrets come back masked with `has*` flags so the edit
 * form can show "configured" without ever shipping the real value to a browser.
 */
paymentMethodSchema.methods.toAdminObject = function toAdminObject() {
    const config = this.apiConfig || {};
    return {
        _id: this._id,
        id: String(this._id),
        name: this.name,
        code: this.code,
        logoUrl: this.logoUrl || '',
        type: this.type,
        provider: this.provider || '',
        instructions: this.instructions || '',
        accountNumber: this.accountNumber || '',
        processingFee: Number(this.processingFee) || 0,
        feeType: this.feeType,
        sortOrder: Number(this.sortOrder) || 0,
        isActive: this.isActive === true,
        description: this.description || '',
        apiConfig: {
            storeId: config.storeId || '',
            storePasswordMasked: maskSecret(config.storePassword),
            apiKeyMasked: maskSecret(config.apiKey),
            hasStorePassword: Boolean(config.storePassword),
            hasApiKey: Boolean(config.apiKey),
            isSandbox: config.isSandbox !== false,
            webhookUrl: config.webhookUrl || ''
        },
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
    };
};

/**
 * Storefront payload. Gateway credentials are omitted entirely; instructions
 * and the merchant account number are only exposed for manual methods, where
 * the customer genuinely needs them to send the money.
 */
paymentMethodSchema.methods.toPublicObject = function toPublicObject() {
    const isManual = this.type === 'manual';
    return {
        id: String(this._id),
        code: this.code,
        name: this.name,
        logoUrl: this.logoUrl || '',
        type: this.type,
        description: this.description || '',
        instructions: isManual ? (this.instructions || '') : '',
        accountNumber: isManual ? (this.accountNumber || '') : '',
        processingFee: Number(this.processingFee) || 0,
        feeType: this.feeType,
        sortOrder: Number(this.sortOrder) || 0,
        isSandbox: this.type === 'automated' ? this.apiConfig?.isSandbox !== false : false
    };
};

/** Active methods in checkout display order. */
paymentMethodSchema.statics.findActiveSorted = function findActiveSorted() {
    return this.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
};

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);
module.exports.PAYMENT_METHOD_TYPES = PAYMENT_METHOD_TYPES;
module.exports.FEE_TYPES = FEE_TYPES;
module.exports.GATEWAY_PROVIDERS = GATEWAY_PROVIDERS;
module.exports.IPN_EVENT_LIMIT = IPN_EVENT_LIMIT;
