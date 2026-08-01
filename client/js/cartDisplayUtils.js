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

    function findCatalogProduct(item, catalog) {
        const targetId = String(item?.id || item?.productId || '').trim();
        if (!targetId || !Array.isArray(catalog)) return null;
        return catalog.find((p) =>
            String(p._id) === targetId ||
            String(p.productId) === targetId ||
            String(p.id) === targetId
        ) || null;
    }

    function isStoredPlaceholder(value) {
        const PT = global.ProductThumbnail;
        if (PT && typeof PT.isPlaceholderImage === 'function') {
            return PT.isPlaceholderImage(value);
        }
        const v = String(value || '').trim().toLowerCase();
        return v.includes('placeholder-product');
    }

    function resolveCartLineImageUrl(item, catalogProduct) {
        const PT = global.ProductThumbnail;
        if (PT) {
            const merged = PT.mergeMediaSources(item, catalogProduct);
            const picked = PT.pickCartLineImage(merged) || PT.pickImageFromItem(merged) || '';
            if (picked) {
                return PT.toDisplayImageUrl
                    ? (PT.toDisplayImageUrl(picked) || picked)
                    : (PT.resolveProductImagePath(picked) || picked);
            }
        }

        const fallbackCandidates = [
            item?.selectedImage,
            item?.variantImage,
            item?.image,
            item?.products,
            item?.productImage,
            item?.imageUrl,
            item?.photo,
            item?.selectedVariant && item.selectedVariant.image,
            ...(Array.isArray(item?.images) ? item.images : []),
            catalogProduct && catalogProduct.image,
            catalogProduct && Array.isArray(catalogProduct.images) ? catalogProduct.images[0] : ''
        ];

        for (const candidate of fallbackCandidates) {
            const raw = String(candidate || '').trim();
            if (!raw || isStoredPlaceholder(raw)) continue;
            if (PT && PT.resolveProductImagePath) {
                const resolved = PT.resolveProductImagePath(raw);
                if (resolved && !isStoredPlaceholder(resolved)) {
                    return PT.toDisplayImageUrl
                        ? (PT.toDisplayImageUrl(resolved) || resolved)
                        : resolved;
                }
            }
            if (raw.startsWith('http') || raw.startsWith('/') || raw.startsWith('data:')) {
                return raw;
            }
        }

        return '';
    }

    /** Normalize legacy/localStorage cart rows to a consistent image + metadata shape. */
    function normalizeCartItem(item, catalogProduct) {
        const catalog = catalogProduct || null;
        const id = item?.productId || item?.id || '';
        const displayImage = resolveCartLineImageUrl(item, catalog);
        const PT = global.ProductThumbnail;
        let emoji = String(item?.emojiIcon || item?.icon || item?.emoji || '').trim();
        if (!emoji && PT && catalog) {
            emoji = PT.pickEmojiFromItem(PT.mergeMediaSources(item, catalog)) || '';
        }
        if (!emoji && catalog) {
            emoji = String(catalog.emojiIcon || catalog.icon || catalog.emoji || '').trim();
        }

        return {
            id,
            productId: id,
            name: item?.name || catalog?.name || '',
            price: Number(item?.price) || 0,
            image: displayImage,
            products: displayImage,
            selectedImage: displayImage,
            variantImage: displayImage,
            images: item?.images || catalog?.images || [],
            icon: emoji,
            emoji,
            emojiIcon: emoji,
            quantity: Math.max(1, Number(item?.quantity) || 1),
            selected: item?.selected !== false,
            variantId: item?.variantId || '',
            variantLabel: item?.variantLabel || '',
            variantAttribute: item?.variantAttribute || '',
            variantValue: item?.variantValue || '',
            variantSku: item?.variantSku || '',
            selectedColor: item?.selectedColor || '',
            selectedSize: item?.selectedSize || '',
            selectedVariant: item?.selectedVariant || null
        };
    }

    function normalizeCartArray(items, catalog) {
        const list = Array.isArray(items) ? items : [];
        const catalogList = Array.isArray(catalog) ? catalog : [];
        return list.map((item) => normalizeCartItem(item, findCatalogProduct(item, catalogList)));
    }

    function cartItemNeedsMigration(item) {
        if (!item || typeof item !== 'object') return false;
        const rawImage = String(item.image || item.products || item.selectedImage || item.variantImage || '').trim();
        const hasRealImage = Boolean(rawImage) && !isStoredPlaceholder(rawImage);
        const keysSynced = item.image != null && item.products != null && item.selectedImage != null && item.variantImage != null;
        const hasEmojiFields = item.icon != null || item.emoji != null || item.emojiIcon != null;
        const hasImagesArray = Array.isArray(item.images);
        return isStoredPlaceholder(rawImage) || !keysSynced || !hasImagesArray || (!hasRealImage && !hasEmojiFields);
    }

    /** Read guest cart from localStorage, migrate legacy rows, persist when changed. */
    function getNormalizedGuestCart(catalog) {
        let raw = [];
        try {
            raw = JSON.parse(localStorage.getItem('cart') || '[]');
            if (!Array.isArray(raw)) raw = [];
        } catch (_) {
            localStorage.removeItem('cart');
            return [];
        }

        if (raw.length === 0) return [];

        const normalized = normalizeCartArray(raw, catalog);
        const needsPersist = normalized.some((item, index) => cartItemNeedsMigration(raw[index]));
        if (needsPersist) {
            localStorage.setItem('cart', JSON.stringify(normalized));
        }
        return normalized;
    }

    function persistGuestCart(items) {
        const normalized = normalizeCartArray(items, global.globalProductCatalog || []);
        localStorage.setItem('cart', JSON.stringify(normalized));
        return normalized;
    }

    global.CartDisplayUtils = {
        escapeHtml,
        getProductDetailUrl,
        getCartItemVariantAttributes,
        buildVariantBadgesHtml,
        findCatalogProduct,
        resolveCartLineImageUrl,
        normalizeCartItem,
        normalizeCartArray,
        getNormalizedGuestCart,
        persistGuestCart
    };
})(typeof window !== 'undefined' ? window : globalThis);
