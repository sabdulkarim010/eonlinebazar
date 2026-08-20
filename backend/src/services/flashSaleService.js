/********************************************************************
 * Flash Sale engine — active window, featured products, effective pricing.
 ********************************************************************/


const Setting = require('../models/Setting');
const { getApplicationNow } = require('../utils/applicationTime');
const { roundMoney } = require('./deliveryChargeService');

const DEFAULT_FLASH_SALE = {
    flashSaleEnabled: false,
    flashSaleTitle: 'Flash Sale',
    flashSaleEndDate: null,
    flashSaleDiscountPercent: 0,
    flashSaleProductIds: []
};

function normalizeFlashSaleSettings(doc = {}) {
    const endDate = doc.flashSaleEndDate ? new Date(doc.flashSaleEndDate) : null;
    return {
        flashSaleEnabled: doc.flashSaleEnabled === true,
        flashSaleTitle: String(doc.flashSaleTitle || DEFAULT_FLASH_SALE.flashSaleTitle).trim() || DEFAULT_FLASH_SALE.flashSaleTitle,
        flashSaleEndDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
        flashSaleDiscountPercent: Math.min(100, Math.max(0, Number(doc.flashSaleDiscountPercent) || 0)),
        flashSaleProductIds: Array.isArray(doc.flashSaleProductIds)
            ? doc.flashSaleProductIds.map((id) => String(id).trim()).filter(Boolean)
            : []
    };
}

async function loadFlashSaleSettings() {
    const settings = await Setting.getOrCreate();
    return normalizeFlashSaleSettings(settings.toObject());
}

function isFlashSaleActive(settings, now = getApplicationNow()) {
    if (!settings?.flashSaleEnabled) return false;
    if (!settings.flashSaleEndDate) return false;
    const end = new Date(settings.flashSaleEndDate);
    if (Number.isNaN(end.getTime())) return false;
    return end.getTime() > now.getTime() && settings.flashSaleDiscountPercent > 0;
}

function productMatchesFlashSale(product, settings) {
    if (!product || !settings?.flashSaleProductIds?.length) return false;

    const candidates = new Set(
        [product._id, product.id, product.productId]
            .filter(Boolean)
            .map((value) => String(value))
    );

    return settings.flashSaleProductIds.some((id) => candidates.has(String(id)));
}

function computeFlashSalePrice(originalPrice, discountPercent) {
    const base = Math.max(0, Number(originalPrice) || 0);
    const pct = Math.min(100, Math.max(0, Number(discountPercent) || 0));
    if (pct <= 0 || base <= 0) return base;
    return roundMoney(base * (1 - pct / 100));
}

function applyFlashSaleToProduct(product, settings, now = getApplicationNow()) {
    if (!product) return product;

    const plain = typeof product.toObject === 'function' ? product.toObject() : { ...product };
    const active = isFlashSaleActive(settings, now);
    const eligible = active && productMatchesFlashSale(plain, settings);

    plain.originalPrice = Number(plain.price) || 0;
    plain.flashSaleActive = eligible;
    plain.flashSaleDiscountPercent = eligible ? settings.flashSaleDiscountPercent : 0;

    if (eligible) {
        plain.price = computeFlashSalePrice(plain.originalPrice, settings.flashSaleDiscountPercent);
    }

    if (Array.isArray(plain.variants) && plain.variants.length > 0) {
        plain.variants = plain.variants.map((variant) => {
            const variantCopy = { ...variant };
            const variantOriginal = Number(variantCopy.price ?? plain.originalPrice) || plain.originalPrice;
            variantCopy.originalPrice = variantOriginal;
            if (eligible) {
                variantCopy.price = computeFlashSalePrice(variantOriginal, settings.flashSaleDiscountPercent);
                variantCopy.flashSaleActive = true;
            }
            return variantCopy;
        });
    }

    return plain;
}

function applyFlashSaleToProducts(products, settings, now = getApplicationNow()) {
    const list = Array.isArray(products) ? products : [];
    if (!isFlashSaleActive(settings, now)) {
        return list.map((product) => {
            const plain = typeof product.toObject === 'function' ? product.toObject() : { ...product };
            plain.flashSaleActive = false;
            return plain;
        });
    }
    return list.map((product) => applyFlashSaleToProduct(product, settings, now));
}

function resolveFlashSaleEndDate(dateValue, timeValue) {
    if (!dateValue) return null;
    const timePart = String(timeValue || '23:59').trim() || '23:59';
    const composed = new Date(`${dateValue}T${timePart}`);
    if (Number.isNaN(composed.getTime())) return null;
    return composed;
}

function parseFlashSaleProductIds(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.map((id) => String(id).trim()).filter(Boolean);
    }
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.map((id) => String(id).trim()).filter(Boolean);
            }
        } catch (_) {
            return raw.split(',').map((id) => String(id).trim()).filter(Boolean);
        }
    }
    return [];
}

function resolveProductFlashPrice(product, item = {}, settings, now = getApplicationNow()) {
    if (!product || !isFlashSaleActive(settings, now) || !productMatchesFlashSale(product, settings)) {
        return null;
    }

    const vIdx = findVariantIndexForFlash(product, item);
    if (vIdx > -1 && Array.isArray(product.variants)) {
        const variantOriginal = Number(product.variants[vIdx].price ?? product.price);
        if (Number.isFinite(variantOriginal) && variantOriginal >= 0) {
            return computeFlashSalePrice(variantOriginal, settings.flashSaleDiscountPercent);
        }
    }

    const base = Number(product.price);
    if (!Number.isFinite(base) || base < 0) return null;
    return computeFlashSalePrice(base, settings.flashSaleDiscountPercent);
}

function findVariantIndexForFlash(product, item) {
    const { findVariantIndex } = require('../utils/variantHelpers');
    return findVariantIndex(product, item);
}

function toPublicFlashSalePayload(settings, now = getApplicationNow()) {
    const normalized = normalizeFlashSaleSettings(settings);
    const active = isFlashSaleActive(normalized, now);
    return {
        ...normalized,
        isActive: active,
        endsAt: normalized.flashSaleEndDate ? normalized.flashSaleEndDate.toISOString() : null,
        serverNow: now.toISOString()
    };
}

module.exports = {
    DEFAULT_FLASH_SALE,
    normalizeFlashSaleSettings,
    loadFlashSaleSettings,
    isFlashSaleActive,
    productMatchesFlashSale,
    computeFlashSalePrice,
    applyFlashSaleToProduct,
    applyFlashSaleToProducts,
    resolveFlashSaleEndDate,
    parseFlashSaleProductIds,
    resolveProductFlashPrice,
    toPublicFlashSalePayload
};
