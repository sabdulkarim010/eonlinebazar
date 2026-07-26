/********************************************************************
 * Project: EonlineBazar
 * File: variantHelpers.js
 * Location: utils/variantHelpers.js
 * Description: Normalizes simple vs combination variant products and
 *              provides shared matching helpers (admin, orders, cart).
 ********************************************************************/

/**
 * Extract attribute map from a variant document (new matrix or legacy flat row).
 * @returns {Record<string, string>}
 */
function getVariantAttributes(variant) {
    if (!variant || typeof variant !== 'object') return {};

    if (variant.attributes) {
        if (variant.attributes instanceof Map) {
            return Object.fromEntries(variant.attributes);
        }
        if (Array.isArray(variant.attributes)) {
            const out = {};
            variant.attributes.forEach(entry => {
                if (Array.isArray(entry) && entry.length >= 2) {
                    const key = String(entry[0] || '').trim();
                    const val = String(entry[1] || '').trim();
                    if (key && val) out[key] = val;
                }
            });
            if (Object.keys(out).length) return out;
        }
        if (typeof variant.attributes === 'object') {
            const out = {};
            Object.entries(variant.attributes).forEach(([k, v]) => {
                const key = String(k || '').trim();
                const val = String(v || '').trim();
                if (key && val) out[key] = val;
            });
            return out;
        }
    }

    const attribute = String(variant.attribute || '').trim();
    const value = String(variant.value || '').trim();
    if (attribute && value) return { [attribute]: value };
    return {};
}

/** Stable key for a combination row (sorted attribute pairs). */
function getCombinationKey(attributes) {
    return Object.entries(attributes || {})
        .map(([k, v]) => `${String(k).trim().toLowerCase()}=${String(v).trim().toLowerCase()}`)
        .sort()
        .join('|');
}

/** Shopify-style label: "Size: S | Color: Pink" */
function formatCombinationLabel(attributes) {
    const entries = Object.entries(attributes || {})
        .map(([k, v]) => [String(k || '').trim(), String(v || '').trim()])
        .filter(([k, v]) => k && v);
    if (!entries.length) return '';
    return entries.map(([k, v]) => `${k}: ${v}`).join(' | ');
}

function resolveVariantName(raw, attributes) {
    const explicit = String(raw?.name || raw?.title || '').trim();
    if (explicit) return explicit;
    return formatCombinationLabel(attributes);
}

/** Public variant line id — sku preferred, else combination key. */
function getVariantLineId(variant) {
    const sku = String(variant?.sku || '').trim();
    if (sku) return sku;
    return getCombinationKey(getVariantAttributes(variant));
}

function normalizeVariantInput(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const attributes = { ...getVariantAttributes(raw) };
    const sku = String(raw.sku || '').trim();
    const price = Number(raw.price);
    const buyingPrice = Number(raw.buyingPrice);
    const stock = Number(raw.stock);
    const image = String(raw.image || '').trim();

    if (Object.keys(attributes).length === 0 && !sku) return null;

    const name = resolveVariantName(raw, attributes);

    return {
        name,
        attributes,
        sku,
        price: Number.isFinite(price) ? price : 0,
        buyingPrice: Number.isFinite(buyingPrice) ? buyingPrice : 0,
        stock: Number.isFinite(stock) ? stock : 0,
        image
    };
}

/**
 * Parse variants payload from admin API (JSON string or array).
 * Accepts legacy flat rows and new combination matrix rows.
 */
function parseVariants(raw) {
    if (!raw) return [];

    let list = raw;
    if (typeof raw === 'string') {
        try {
            list = JSON.parse(raw);
        } catch (e) {
            return [];
        }
    }
    if (!Array.isArray(list)) return [];

    const seen = new Set();
    const out = [];

    list.forEach(item => {
        const normalized = normalizeVariantInput(item);
        if (!normalized) return;

        const key = getCombinationKey(normalized.attributes) || normalized.sku.toLowerCase();
        if (key && seen.has(key)) return;
        if (key) seen.add(key);

        out.push(normalized);
    });

    return out;
}

function sumVariantStock(variants) {
    if (!Array.isArray(variants)) return 0;
    return variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
}

/** Minimum positive sell price across variant rows (Shopify "from" price). */
function computeMinVariantPrice(variants, fallback = 0) {
    if (!Array.isArray(variants) || variants.length === 0) {
        return Number(fallback) || 0;
    }
    const prices = variants
        .map(v => Number(v.price))
        .filter(p => Number.isFinite(p) && p > 0);
    if (prices.length === 0) return Number(fallback) || 0;
    return Math.min(...prices);
}

/** Weighted average buying price across variant rows (falls back to simple average). */
function computeAggregateBuyingPrice(variants, fallback = 0) {
    if (!Array.isArray(variants) || variants.length === 0) {
        return Number(fallback) || 0;
    }

    const priced = variants.filter(v => Number(v.buyingPrice) > 0);
    if (priced.length === 0) return Number(fallback) || 0;

    const totalStock = priced.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    if (totalStock > 0) {
        const weighted = priced.reduce(
            (sum, v) => sum + (Number(v.buyingPrice) || 0) * (Number(v.stock) || 0),
            0
        );
        return Math.round((weighted / totalStock) * 100) / 100;
    }

    const simple = priced.reduce((sum, v) => sum + (Number(v.buyingPrice) || 0), 0) / priced.length;
    return Math.round(simple * 100) / 100;
}

/**
 * Apply hasVariants / stockQuantity / stock (total) rules before save.
 */
function applyProductStockFields(productData) {
    const variants = Array.isArray(productData.variants) ? productData.variants : [];
    const hasVariants = Boolean(productData.hasVariants) && variants.length > 0;

    productData.hasVariants = hasVariants;
    productData.variants = hasVariants ? variants : [];

    if (hasVariants) {
        const total = sumVariantStock(variants);
        productData.stock = total;
        productData.stockQuantity = total;
        const aggregateBuying = computeAggregateBuyingPrice(variants, productData.buyingPrice);
        if (aggregateBuying > 0) productData.buyingPrice = aggregateBuying;
        const minPrice = computeMinVariantPrice(variants, productData.price);
        if (minPrice > 0) productData.price = minPrice;
    } else {
        const qty = Number(productData.stockQuantity);
        const fallback = Number(productData.stock);
        const resolved = Number.isFinite(qty) ? qty : (Number.isFinite(fallback) ? fallback : 0);
        productData.stockQuantity = resolved;
        productData.stock = resolved;
    }

    return productData;
}

/** Match cart/order line item to a variant index (-1 if none). */
function findVariantIndex(product, item) {
    if (!product || !Array.isArray(product.variants) || product.variants.length === 0) return -1;

    const norm = (v) => String(v || '').trim().toLowerCase();
    const sku = norm(item?.variantSku || item?.sku);
    const vid = norm(item?.variantId);

    if (sku) {
        const idx = product.variants.findIndex(v => norm(v.sku) && norm(v.sku) === sku);
        if (idx > -1) return idx;
    }

    if (vid) {
        const idx = product.variants.findIndex(v => {
            const lineId = getVariantLineId(v);
            if (norm(lineId) === vid) return true;
            const attrs = getVariantAttributes(v);
            const legacy = `${norm(v.attribute)}::${norm(v.value)}`;
            return legacy === vid || getCombinationKey(attrs) === vid;
        });
        if (idx > -1) return idx;
    }

    const attrRaw = String(item?.variantAttribute || item?.attribute || '').trim();
    const valRaw = String(item?.variantValue || item?.value || '').trim();

    if (attrRaw.includes(':') || attrRaw.includes(',')) {
        const selected = {};
        attrRaw.split(/[,|]/).map(s => s.trim()).filter(Boolean).forEach(pair => {
            const [k, ...rest] = pair.split(':');
            const key = String(k || '').trim();
            const val = rest.join(':').trim();
            if (key && val) selected[key] = val;
        });
        const idx = product.variants.findIndex(v =>
            getCombinationKey(getVariantAttributes(v)) === getCombinationKey(selected)
        );
        if (idx > -1) return idx;
    }

    const attr = norm(attrRaw);
    const val = norm(valRaw);
    if (attr && val) {
        const idx = product.variants.findIndex(v => {
            const attrs = getVariantAttributes(v);
            const keys = Object.keys(attrs);
            if (keys.length === 1) {
                return norm(keys[0]) === attr && norm(attrs[keys[0]]) === val;
            }
            return norm(v.attribute) === attr && norm(v.value) === val;
        });
        if (idx > -1) return idx;
    }

    return -1;
}

function usesCombinationMatrix(product) {
    if (!product || !Array.isArray(product.variants) || product.variants.length === 0) return false;
    if (product.hasVariants === true) return true;
    return product.variants.some(v => Object.keys(getVariantAttributes(v)).length > 1);
}

/** Cartesian product for admin matrix generation. */
function cartesianCombinations(attributeTypes) {
    if (!Array.isArray(attributeTypes) || attributeTypes.length === 0) return [];

    const cleaned = attributeTypes
        .map(t => ({
            name: String(t.name || t.attribute || '').trim(),
            values: [...new Set((t.values || []).map(v => String(v).trim()).filter(Boolean))]
        }))
        .filter(t => t.name && t.values.length > 0);

    if (cleaned.length === 0) return [];

    return cleaned.reduce((acc, type) => {
        if (acc.length === 0) {
            return type.values.map(value => ({ [type.name]: value }));
        }
        const next = [];
        acc.forEach(combo => {
            type.values.forEach(value => {
                next.push({ ...combo, [type.name]: value });
            });
        });
        return next;
    }, []);
}

function applyPrimaryImageToVariants(variants, primaryImage) {
    const primary = String(primaryImage || '').trim();
    if (!primary || !Array.isArray(variants)) return variants;
    return variants.map(v => {
        const img = String(v?.image || '').trim();
        if (!img || img.startsWith('data:')) {
            return { ...v, image: primary };
        }
        return v;
    });
}

module.exports = {
    getVariantAttributes,
    getCombinationKey,
    formatCombinationLabel,
    resolveVariantName,
    getVariantLineId,
    normalizeVariantInput,
    parseVariants,
    sumVariantStock,
    computeMinVariantPrice,
    computeAggregateBuyingPrice,
    applyProductStockFields,
    findVariantIndex,
    usesCombinationMatrix,
    applyPrimaryImageToVariants,
    cartesianCombinations
};
