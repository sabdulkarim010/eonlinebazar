/**
 * Client-side variant helpers (simple vs combination matrix products).
 */
(function (global) {
    function getVariantAttributes(variant) {
        if (!variant || typeof variant !== 'object') return {};

        if (variant.attributes instanceof Map) {
            const out = {};
            variant.attributes.forEach((v, k) => {
                const key = String(k || '').trim();
                const val = String(v || '').trim();
                if (key && val) out[key] = val;
            });
            return out;
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

        if (variant.attributes && typeof variant.attributes === 'object') {
            const out = {};
            Object.entries(variant.attributes).forEach(([k, v]) => {
                const key = String(k || '').trim();
                const val = String(v || '').trim();
                if (key && val) out[key] = val;
            });
            return out;
        }

        const attribute = String(variant.attribute || '').trim();
        const value = String(variant.value || '').trim();
        if (attribute && value) return { [attribute]: value };
        return {};
    }

    function formatCombinationLabel(attributes) {
        const entries = Object.entries(attributes || {})
            .map(([k, v]) => [String(k || '').trim(), String(v || '').trim()])
            .filter(([k, v]) => k && v);
        if (!entries.length) return '';
        return entries.map(([k, v]) => `${k}: ${v}`).join(' | ');
    }

    function resolveVariantLabel(variant) {
        const explicit = String(variant?.name || variant?.title || '').trim();
        if (explicit) return explicit;
        return formatCombinationLabel(getVariantAttributes(variant));
    }

    function getCombinationKey(attributes) {
        return Object.entries(attributes || {})
            .map(([k, v]) => `${String(k).trim().toLowerCase()}=${String(v).trim().toLowerCase()}`)
            .sort()
            .join('|');
    }

    function getVariantLineId(variant) {
        const sku = String(variant?.sku || '').trim();
        if (sku) return sku;
        return getCombinationKey(getVariantAttributes(variant));
    }

    function usesCombinationMatrix(product) {
        if (!product || !Array.isArray(product.variants) || product.variants.length === 0) return false;
        if (product.hasVariants === true) return true;
        return product.variants.some(v => Object.keys(getVariantAttributes(v)).length > 1);
    }

    function extractAttributeGroups(variants) {
        const order = [];
        const map = {};

        (variants || []).forEach(v => {
            Object.entries(getVariantAttributes(v)).forEach(([name, value]) => {
                if (!map[name]) {
                    map[name] = new Set();
                    order.push(name);
                }
                map[name].add(value);
            });
        });

        return order.map(name => ({ name, values: [...map[name]] }));
    }

    function findVariantBySelection(variants, selectedAttrs) {
        const selected = selectedAttrs || {};
        const keys = Object.keys(selected).filter(k => selected[k]);
        if (!keys.length) return null;

        return (variants || []).find(v => {
            const attrs = getVariantAttributes(v);
            return keys.every(k => attrs[k] === selected[k]);
        }) || null;
    }

    /** All variant rows matching the current partial or full attribute selection. */
    function findMatchingVariants(variants, selectedAttrs) {
        const selected = selectedAttrs || {};
        const keys = Object.keys(selected).filter(k => selected[k]);
        if (!keys.length) return variants || [];

        return (variants || []).filter(v => {
            const attrs = getVariantAttributes(v);
            return keys.every(k => attrs[k] === selected[k]);
        });
    }

    /**
     * Matrix pill state for a candidate value given other selected attributes.
     * @returns {'in-stock'|'oos'|'unavailable'}
     */
    function getOptionState(variants, selectedAttrs, attrName, value) {
        const trial = { ...(selectedAttrs || {}), [attrName]: value };
        const matching = findMatchingVariants(variants, trial);
        if (matching.length === 0) return 'unavailable';
        if (matching.some(v => (Number(v.stock) || 0) > 0)) return 'in-stock';
        return 'oos';
    }

    function isValueAvailable(variants, selectedAttrs, attrName, value) {
        return getOptionState(variants, selectedAttrs, attrName, value) !== 'unavailable';
    }

    function buildVariantCartMeta(variant) {
        if (!variant) return null;
        const attributes = getVariantAttributes(variant);
        const variantId = getVariantLineId(variant);
        const variantLabel = resolveVariantLabel(variant);
        return {
            variantId,
            variantLabel,
            variantAttribute: variantLabel,
            variantValue: Object.values(attributes).join(', '),
            variantSku: String(variant.sku || '').trim(),
            selectedVariant: {
                attributes,
                sku: String(variant.sku || '').trim(),
                price: Number(variant.price) || 0,
                stock: Number(variant.stock) || 0,
                image: String(variant.image || '').trim(),
                variantId,
                name: variantLabel
            }
        };
    }

    function matchVariantInProduct(product, item) {
        if (!product || !Array.isArray(product.variants)) return null;
        const norm = (v) => String(v || '').trim().toLowerCase();
        const sku = norm(item?.variantSku || item?.sku);
        const vid = norm(item?.variantId);

        if (sku) {
            const bySku = product.variants.find(v => norm(v.sku) === sku);
            if (bySku) return bySku;
        }

        if (vid) {
            const byId = product.variants.find(v => norm(getVariantLineId(v)) === vid);
            if (byId) return byId;
        }

        const attrRaw = String(item?.variantAttribute || '').trim();
        if (attrRaw.includes(':')) {
            const selected = {};
            attrRaw.split(',').map(s => s.trim()).filter(Boolean).forEach(pair => {
                const idx = pair.indexOf(':');
                if (idx === -1) return;
                const key = pair.slice(0, idx).trim();
                const val = pair.slice(idx + 1).trim();
                if (key && val) selected[key] = val;
            });
            return findVariantBySelection(product.variants, selected);
        }

        const attr = String(item?.variantAttribute || item?.attribute || '').trim();
        const val = String(item?.variantValue || item?.value || '').trim();
        if (attr && val) {
            return product.variants.find(v => {
                const attrs = getVariantAttributes(v);
                const keys = Object.keys(attrs);
                if (keys.length === 1) return keys[0] === attr && attrs[keys[0]] === val;
                return v.attribute === attr && v.value === val;
            }) || null;
        }

        return null;
    }

    global.VariantUtils = {
        getVariantAttributes,
        getCombinationKey,
        formatCombinationLabel,
        resolveVariantLabel,
        getVariantLineId,
        usesCombinationMatrix,
        extractAttributeGroups,
        findVariantBySelection,
        findMatchingVariants,
        getOptionState,
        isValueAvailable,
        matchVariantInProduct,
        buildVariantCartMeta
    };
})(typeof window !== 'undefined' ? window : globalThis);




