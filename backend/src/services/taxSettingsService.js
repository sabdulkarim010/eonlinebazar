/********************************************************************
 * Project: EonlineBazar — Global Tax & VAT engine (Phase 3)
 * File: taxSettingsService.js
 ********************************************************************/

'use strict';

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const DEFAULT_TAX_SETTINGS = Object.freeze({
    enabled: false,
    defaultVatRate: 0,
    pricesIncludeTax: true,
    taxRegistrationNumber: '',
    categoryTaxRules: []
});

function getDefaultTaxSettings() {
    return {
        enabled: DEFAULT_TAX_SETTINGS.enabled,
        defaultVatRate: DEFAULT_TAX_SETTINGS.defaultVatRate,
        pricesIncludeTax: DEFAULT_TAX_SETTINGS.pricesIncludeTax,
        taxRegistrationNumber: DEFAULT_TAX_SETTINGS.taxRegistrationNumber,
        categoryTaxRules: []
    };
}

function normalizeCategoryTaxRules(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((rule) => ({
            categoryId: String(rule?.categoryId || rule?.category || '').trim(),
            vatRate: Number(rule?.vatRate ?? rule?.rate ?? 0),
            ruleName: String(rule?.ruleName || rule?.name || '').trim()
        }))
        .filter((rule) => rule.categoryId);
}

/**
 * Build canonical taxSettings from Settings document (legacy vat* fields + taxSettings object).
 * @param {object} doc
 * @returns {object}
 */
function normalizeTaxSettingsFromDoc(doc = {}) {
    const embedded = doc.taxSettings && typeof doc.taxSettings === 'object'
        ? doc.taxSettings
        : {};

    const legacyRate = Number(doc.vatPercentage ?? doc.vatRate ?? embedded.defaultVatRate ?? 0);
    const enabled = embedded.enabled != null
        ? embedded.enabled === true
        : doc.vatEnabled === true;
    const pricesIncludeTax = embedded.pricesIncludeTax != null
        ? embedded.pricesIncludeTax === true
        : doc.vatInclusive !== false;

    return {
        enabled,
        defaultVatRate: Number.isFinite(legacyRate) ? legacyRate : 0,
        pricesIncludeTax,
        taxRegistrationNumber: String(
            embedded.taxRegistrationNumber
            ?? doc.taxRegistrationNumber
            ?? ''
        ).trim(),
        categoryTaxRules: normalizeCategoryTaxRules(embedded.categoryTaxRules)
    };
}

function syncLegacyVatFieldsFromTaxSettings(settings) {
    const tax = normalizeTaxSettingsFromDoc(settings);
    settings.vatEnabled = tax.enabled;
    settings.vatPercentage = tax.defaultVatRate;
    settings.vatRate = tax.defaultVatRate;
    settings.vatInclusive = tax.pricesIncludeTax;
    settings.taxRegistrationNumber = tax.taxRegistrationNumber;
    settings.taxSettings = {
        ...tax,
        categoryTaxRules: [...tax.categoryTaxRules]
    };
    if (typeof settings.markModified === 'function') {
        settings.markModified('taxSettings');
    }
}

function syncTaxSettingsFromLegacyFields(settings) {
    const current = settings.taxSettings && typeof settings.taxSettings === 'object'
        ? settings.taxSettings
        : {};
    settings.taxSettings = {
        enabled: settings.vatEnabled === true,
        defaultVatRate: Number(settings.vatPercentage ?? settings.vatRate ?? 0) || 0,
        pricesIncludeTax: settings.vatInclusive !== false,
        taxRegistrationNumber: String(settings.taxRegistrationNumber || '').trim(),
        categoryTaxRules: normalizeCategoryTaxRules(current.categoryTaxRules)
    };
    if (typeof settings.markModified === 'function') {
        settings.markModified('taxSettings');
    }
}

function resolveCategoryVatRate(taxSettings, categoryKey) {
    const key = String(categoryKey || '').trim();
    if (!key) return Number(taxSettings.defaultVatRate) || 0;

    const rules = taxSettings.categoryTaxRules || [];
    const match = rules.find(
        (rule) => rule.categoryId === key
            || rule.categoryId.toLowerCase() === key.toLowerCase()
    );
    if (match && Number.isFinite(Number(match.vatRate))) {
        return Number(match.vatRate);
    }
    return Number(taxSettings.defaultVatRate) || 0;
}

function computeLineTaxAmount(lineNet, rate, pricesIncludeTax, enabled) {
    if (!enabled || rate <= 0 || lineNet <= 0) return 0;

    if (pricesIncludeTax) {
        return roundMoney(lineNet * rate / (100 + rate));
    }
    return roundMoney(lineNet * rate / 100);
}

/**
 * Order-level tax snapshot for checkout persistence.
 * @param {{ taxSettings: object, subTotal: number, discountAmount?: number, lineItems?: Array }} params
 */
function computeOrderTaxSnapshot({
    taxSettings: rawTaxSettings,
    subTotal = 0,
    discountAmount = 0,
    lineItems = []
} = {}) {
    const taxSettings = normalizeTaxSettingsFromDoc({ taxSettings: rawTaxSettings, ...rawTaxSettings });
    const sub = roundMoney(Number(subTotal) || 0);
    const discount = roundMoney(Number(discountAmount) || 0);
    const taxableAmount = roundMoney(Math.max(0, sub - discount));
    const priceTaxMode = taxSettings.pricesIncludeTax ? 'INCLUSIVE' : 'EXCLUSIVE';

    if (!taxSettings.enabled || taxableAmount <= 0) {
        return {
            enabled: taxSettings.enabled === true,
            vatEnabled: taxSettings.enabled === true,
            taxableAmount,
            taxAmount: 0,
            vatAmount: 0,
            vatRate: 0,
            vatPercentage: 0,
            priceTaxMode,
            taxRegistrationNumber: taxSettings.taxRegistrationNumber
        };
    }

    let totalTax = 0;
    const lines = Array.isArray(lineItems) ? lineItems : [];

    if (lines.length > 0 && sub > 0) {
        const discountRatio = Math.min(1, Math.max(0, taxableAmount / sub));
        for (const line of lines) {
            const qty = Math.max(1, Number(line.quantity) || 1);
            const unitPrice = Number(line.price) || 0;
            const lineGross = roundMoney(unitPrice * qty);
            const lineNet = roundMoney(lineGross * discountRatio);
            const categoryKey = line.categoryId || line.category || line.productCategory || '';
            const rate = resolveCategoryVatRate(taxSettings, categoryKey);
            totalTax += computeLineTaxAmount(
                lineNet,
                rate,
                taxSettings.pricesIncludeTax,
                taxSettings.enabled
            );
        }
    } else {
        totalTax = computeLineTaxAmount(
            taxableAmount,
            taxSettings.defaultVatRate,
            taxSettings.pricesIncludeTax,
            taxSettings.enabled
        );
    }

    totalTax = roundMoney(totalTax);
    const effectiveRate = taxableAmount > 0
        ? roundMoney((totalTax / taxableAmount) * 100)
        : Number(taxSettings.defaultVatRate) || 0;

    return {
        enabled: true,
        vatEnabled: true,
        taxableAmount,
        taxAmount: totalTax,
        vatAmount: totalTax,
        vatRate: effectiveRate,
        vatPercentage: effectiveRate,
        priceTaxMode,
        taxRegistrationNumber: taxSettings.taxRegistrationNumber
    };
}

/** Backward-compatible additive VAT helper (exclusive mode only). */
function computeVatAmount({ merchandisePayable = 0, vatEnabled = false, vatPercentage = 0, vatInclusive = true } = {}) {
    if (!vatEnabled || vatInclusive) return 0;
    const rate = Number(vatPercentage) || 0;
    if (rate <= 0) return 0;
    const base = Math.max(0, Number(merchandisePayable) || 0);
    return roundMoney(base * rate / 100);
}

module.exports = {
    DEFAULT_TAX_SETTINGS,
    getDefaultTaxSettings,
    normalizeTaxSettingsFromDoc,
    normalizeCategoryTaxRules,
    syncLegacyVatFieldsFromTaxSettings,
    syncTaxSettingsFromLegacyFields,
    resolveCategoryVatRate,
    computeOrderTaxSnapshot,
    computeLineTaxAmount,
    computeVatAmount
};
