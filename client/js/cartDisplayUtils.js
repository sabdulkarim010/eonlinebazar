/**
 * Shared cart/checkout product display helpers — detail URLs, variant badges, escaping.
 */
(function (global) {
    'use strict';

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function resolveProductId(item, realProduct) {
        return item?.id || realProduct?._id || realProduct?.productId || realProduct?.id || '';
    }

    /** Product detail URL — slug when available, otherwise id-based route used site-wide. */
    function getProductDetailUrl(item, realProduct) {
        const id = resolveProductId(item, realProduct);
        const slug = String(realProduct?.slug || item?.slug || '').trim();
        if (slug) return `/product/${encodeURIComponent(slug)}`;
        if (id) return `/product-details.html?id=${encodeURIComponent(id)}`;
        return '#';
    }

    function parseLabelToAttributes(label) {
        const out = {};
        String(label || '')
            .split(/\||,/)
            .map((part) => part.trim())
            .filter(Boolean)
            .forEach((part) => {
                const idx = part.indexOf(':');
                if (idx === -1) return;
                const key = part.slice(0, idx).trim();
                const val = part.slice(idx + 1).trim();
                if (key && val) out[key] = val;
            });
        return out;
    }

    function normalizeAttributes(raw) {
        if (!raw || typeof raw !== 'object') return {};
        if (raw instanceof Map) {
            const out = {};
            raw.forEach((v, k) => {
                const key = String(k || '').trim();
                const val = String(v || '').trim();
                if (key && val) out[key] = val;
            });
            return out;
        }
        const out = {};
        Object.entries(raw).forEach(([k, v]) => {
            const key = String(k || '').trim();
            const val = String(v || '').trim();
            if (key && val) out[key] = val;
        });
        return out;
    }

    function getCartItemVariantAttributes(item, realProduct) {
        if (item?.selectedVariant?.attributes) {
            const attrs = normalizeAttributes(item.selectedVariant.attributes);
            if (Object.keys(attrs).length) return attrs;
        }

        const VU = global.VariantUtils;
        if (VU && realProduct) {
            const matched = VU.matchVariantInProduct(realProduct, item);
            if (matched) return VU.getVariantAttributes(matched);
        }

        if (item?.variantLabel) {
            const fromLabel = parseLabelToAttributes(item.variantLabel);
            if (Object.keys(fromLabel).length) return fromLabel;
        }

        const attrRaw = String(item?.variantAttribute || '').trim();
        if (attrRaw.includes(':')) return parseLabelToAttributes(attrRaw);

        const attr = attrRaw;
        const val = String(item?.variantValue || '').trim();
        if (attr && val) return { [attr]: val };

        return {};
    }

    function buildVariantBadgesHtml(item, realProduct) {
        const selectedColor = String(item?.selectedColor || '').trim();
        const selectedSize = String(item?.selectedSize || '').trim();

        if (selectedColor || selectedSize) {
            const badges = [];
            if (selectedColor) {
                badges.push(`<span class="cart-variant-badge">Color: ${escapeHtml(selectedColor)}</span>`);
            }
            if (selectedSize) {
                badges.push(`<span class="cart-variant-badge">Size: ${escapeHtml(selectedSize)}</span>`);
            }
            return `<div class="cart-variant-badges">${badges.join('')}</div>`;
        }

        const attrs = getCartItemVariantAttributes(item, realProduct);
        const colorKey = Object.keys(attrs).find((k) => {
            const n = String(k).trim().toLowerCase();
            return n === 'color' || n === 'colour';
        });
        const sizeKey = Object.keys(attrs).find((k) => String(k).trim().toLowerCase() === 'size');

        const badges = [];
        if (colorKey && attrs[colorKey]) {
            badges.push(`<span class="cart-variant-badge">Color: ${escapeHtml(attrs[colorKey])}</span>`);
        }
        if (sizeKey && attrs[sizeKey]) {
            badges.push(`<span class="cart-variant-badge">Size: ${escapeHtml(attrs[sizeKey])}</span>`);
        }

        if (!badges.length) {
            const entries = Object.entries(attrs).filter(([k, v]) => k && v);
            entries.forEach(([key, value]) => {
                badges.push(`<span class="cart-variant-badge">${escapeHtml(key)}: ${escapeHtml(value)}</span>`);
            });
        }

        if (!badges.length) return '';
        return `<div class="cart-variant-badges">${badges.join('')}</div>`;
    }

    global.CartDisplayUtils = {
        escapeHtml,
        getProductDetailUrl,
        getCartItemVariantAttributes,
        buildVariantBadgesHtml
    };
})(typeof window !== 'undefined' ? window : globalThis);
