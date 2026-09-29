/**
 * Shared cart/checkout product display helpers — detail URLs, variant badges, escaping.
 */
(function (global) {
    'use strict';

    function escapeHtml(str) {
        if (global.EOBSanitizer && typeof global.EOBSanitizer.escapeHtml === 'function') {
            return global.EOBSanitizer.escapeHtml(str);
        }
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeUrlForAttr(url) {
        if (global.EOBSanitizer && typeof global.EOBSanitizer.escapeUrlForAttr === 'function') {
            return global.EOBSanitizer.escapeUrlForAttr(url);
        }
        return String(url == null ? '' : url).replace(/"/g, '&quot;');
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

    function extractItemProductId(item) {
        const pid = item?.id || item?.productId;
        if (pid && typeof pid === 'object' && pid._id) {
            return String(pid._id);
        }
        return String(pid || '').trim();
    }

    function findCatalogProduct(item, catalog) {
        const targetId = extractItemProductId(item);
        if (!targetId || !Array.isArray(catalog)) return null;
        return catalog.find((p) =>
            String(p._id) === targetId ||
            String(p.productId) === targetId ||
            String(p.id) === targetId
        ) || null;
    }

    const CART_IMAGE_PLACEHOLDER = '/images/placeholder-product.svg';
    const CART_IMAGE_FALLBACK = '/images/placeholder-product.svg';

    function getAbsoluteAssetUrl(path) {
        const PT = global.ProductThumbnail;
        if (PT && typeof PT.getAbsoluteAssetUrl === 'function') {
            return PT.getAbsoluteAssetUrl(path);
        }
        if (!path) return '';
        let normalized = String(path).trim();
        if (!normalized) return '';
        if (/^https:\/\//i.test(normalized)) return normalized;
        if (normalized.startsWith('http://')) {
            return normalized.replace(/^http:\/\//i, 'https://');
        }
        const assetPath = normalized.startsWith('/')
            ? normalized
            : `/${normalized.replace(/^\/+/, '')}`;
        if (typeof global.location !== 'undefined' && global.location.origin) {
            return global.location.origin + assetPath;
        }
        return assetPath;
    }

    function getCartImagePlaceholderUrl() {
        const PT = global.ProductThumbnail;
        if (PT && typeof PT.getCartImagePlaceholderUrl === 'function') {
            return PT.getCartImagePlaceholderUrl();
        }
        return getAbsoluteAssetUrl(CART_IMAGE_PLACEHOLDER);
    }

    function looksLikeEmojiOrIcon(value) {
        if (!value) return false;
        const v = String(value).trim();
        const PT = global.ProductThumbnail;
        if (PT && typeof PT.isValidProductImagePath === 'function' && PT.isValidProductImagePath(v)) {
            return false;
        }
        return v.length <= 8 && !/[\\/.]/.test(v);
    }

    function isInvalidImageValue(raw) {
        if (raw == null) return true;
        const v = String(raw).trim();
        if (!v || v === 'null' || v === 'undefined') return true;
        if (v.includes('undefined') || v.includes('via.placeholder.com')) return true;
        if (looksLikeEmojiOrIcon(v)) return true;
        if (isStoredPlaceholder(v)) return true;
        if (global.EOBUrlUtils && global.EOBUrlUtils.isUnsafeAssetPath(v)) return true;
        const PT = global.ProductThumbnail;
        if (PT && typeof PT.isUnsafeAssetPath === 'function' && PT.isUnsafeAssetPath(v)) return true;
        if (/^https?:\/\//i.test(v)) {
            try {
                const u = new URL(v);
                if (!u.hostname || u.hostname.length < 2 || /^[&?#/]+$/.test(u.hostname)) return true;
            } catch (_) {
                return true;
            }
        }
        return false;
    }

    function safeImg(img, fallback) {
        const fb = fallback || CART_IMAGE_PLACEHOLDER;
        if (isInvalidImageValue(img)) return fb;
        return String(img).trim();
    }

    function isStoredPlaceholder(value) {
        const PT = global.ProductThumbnail;
        if (PT && typeof PT.isPlaceholderImage === 'function') {
            return PT.isPlaceholderImage(value);
        }
        const v = String(value || '').trim().toLowerCase();
        return v.includes('placeholder-product') || v.endsWith('/images/placeholder.jpg') ||
            v.endsWith('/images/placeholder-product.svg');
    }

    function normalizeSecureImageUrl(url) {
        const PT = global.ProductThumbnail;
        if (PT && typeof PT.normalizeSecureImageUrl === 'function') {
            return PT.normalizeSecureImageUrl(url);
        }
        if (!url) return '';
        let normalized = String(url).trim();
        if (!normalized) return '';
        if (looksLikeEmojiOrIcon(normalized) || isStoredPlaceholder(normalized)) return '';
        if (normalized.startsWith('http://')) {
            normalized = normalized.replace(/^http:\/\//i, 'https://');
        }
        if (/^https:\/\//i.test(normalized) || normalized.startsWith('data:')) {
            return normalized;
        }
        const lower = normalized.toLowerCase();
        if (normalized.startsWith('/') || lower.startsWith('uploads/')) {
            return getAbsoluteAssetUrl(normalized);
        }
        return normalized;
    }

    /** Unified image URL for guest localStorage rows and authenticated API cart items. */
    function resolveCartItemImageUrl(item, catalogProduct) {
        const PT = global.ProductThumbnail;
        const catalog = catalogProduct || findCatalogProduct(item, global.globalProductCatalog || []);
        if (PT && typeof PT.resolveCartItemImageUrl === 'function') {
            return PT.resolveCartItemImageUrl(item, catalog);
        }
        const resolved = resolveCartLineImageUrl(item, catalog);
        if (resolved) return resolved;
        return getCartImagePlaceholderUrl();
    }

    function parseCartApiResponse(payload) {
        if (Array.isArray(payload)) return payload;
        if (payload && Array.isArray(payload.data)) return payload.data;
        if (payload && Array.isArray(payload.cart)) return payload.cart;
        return [];
    }

    function getPopulatedProductIdRef(item) {
        const pid = item?.productId;
        if (pid && typeof pid === 'object' && pid._id) return pid;
        return null;
    }

    function resolveCartLineImageUrl(item, catalogProduct) {
        const PT = global.ProductThumbnail;
        const catalog = catalogProduct || findCatalogProduct(item, global.globalProductCatalog || []);
        if (PT && typeof PT.resolveCartLineImageUrl === 'function') {
            return PT.resolveCartLineImageUrl(item, catalog);
        }

        const populatedRef = getPopulatedProductIdRef(item);
        const product = item?.product || populatedRef || catalog || null;
        const candidates = [
            item?.image,
            populatedRef?.image,
            ...(Array.isArray(populatedRef?.images) ? populatedRef.images : []),
            populatedRef?.thumbnail,
            item?.product?.image,
            ...(Array.isArray(item?.product?.images) ? item.product.images : []),
            item?.product?.thumbnail,
            item?.variantImage,
            item?.selectedImage,
            item?.products,
            ...(Array.isArray(item?.images) ? item.images : []),
            product?.image,
            ...(Array.isArray(product?.images) ? product.images : []),
            product?.thumbnail
        ];

        for (const candidate of candidates) {
            const raw = String(candidate || '').trim();
            if (!raw || isInvalidImageValue(raw) || isStoredPlaceholder(raw)) continue;
            if (PT && typeof PT.shouldSkipForeignAbsoluteUrl === 'function' && PT.shouldSkipForeignAbsoluteUrl(raw)) {
                continue;
            }
            const secured = normalizeSecureImageUrl(raw);
            if (secured && !isStoredPlaceholder(secured)) return secured;
        }

        if (Array.isArray(item?.images)) {
            for (const img of item.images) {
                const raw = String(img || '').trim();
                if (!raw || isInvalidImageValue(raw) || isStoredPlaceholder(raw)) continue;
                if (PT && typeof PT.shouldSkipForeignAbsoluteUrl === 'function' && PT.shouldSkipForeignAbsoluteUrl(raw)) {
                    continue;
                }
                const secured = normalizeSecureImageUrl(raw);
                if (secured && !isStoredPlaceholder(secured)) return secured;
            }
        }

        return '';
    }

    function resolveLinePriceFromCatalog(item, catalogProduct) {
        if (!catalogProduct) return Number(item?.price) || 0;
        const VU = global.VariantUtils;
        if (VU && typeof VU.matchVariantInProduct === 'function') {
            const matched = VU.matchVariantInProduct(catalogProduct, item);
            if (matched && matched.price != null && Number(matched.price) >= 0) {
                return Number(matched.price);
            }
        }
        const base = Number(catalogProduct.price);
        return Number.isFinite(base) ? base : Number(item?.price) || 0;
    }

    /** POST /api/cart/add — identifiers, qty, variant/options only (no client pricing). */
    function buildCartAddPayload(input) {
        const src = input && typeof input === 'object' ? input : {};
        const productId = String(src.productId || src.id || '').trim();
        const quantity = Math.max(1, Number(src.quantity) || 1);
        const payload = { productId, quantity };

        [
            'variantId', 'variantLabel', 'variantAttribute', 'variantValue', 'variantSku',
            'selectedColor', 'selectedSize', 'selectedVariant',
            'image', 'selectedImage', 'variantImage', 'images'
        ].forEach((key) => {
            if (src[key] !== undefined && src[key] !== null && src[key] !== '') {
                payload[key] = src[key];
            }
        });

        return payload;
    }

    /** Sum unit quantities across cart lines (badge counter). */
    function computeTotalCartQuantity(items, options) {
        const opts = options || {};
        const list = Array.isArray(items) ? items : [];
        const source = opts.selectedOnly
            ? list.filter((item) => item.selected !== false)
            : list;
        return source.reduce(
            (total, item) => total + Math.max(0, Number(item.quantity) || 0),
            0
        );
    }

    function resolveCartBadgeCount(payload, itemsFallback) {
        if (payload && typeof payload.badgeCount === 'number') {
            return Math.max(0, payload.badgeCount);
        }
        if (Array.isArray(itemsFallback)) {
            return computeTotalCartQuantity(itemsFallback);
        }
        return 0;
    }

    function applyCartBadgeCount(count) {
        const safe = Math.max(0, Number(count) || 0);
        const label = String(safe);
        const selectors = [
            '#cartCountBadge',
            '#nav-cart-count',
            '#cartDrawerCount',
            '#navDrawerCartCount',
            '.cart-count',
            '.cart-count-badge'
        ];
        const seen = new Set();
        selectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((el) => {
                if (seen.has(el)) return;
                seen.add(el);
                el.textContent = label;
                if (safe <= 0) {
                    el.style.display = 'none';
                    el.setAttribute('hidden', 'hidden');
                    el.setAttribute('aria-hidden', 'true');
                } else {
                    el.style.display = '';
                    el.removeAttribute('hidden');
                    el.setAttribute('aria-hidden', 'false');
                }
            });
        });
        return safe;
    }

    const CART_CROSS_TAB_CHANNEL = 'eob_cart_sync';
    let cartCrossTabChannel = null;
    let suppressCartCrossTabBroadcast = false;

    function getCartCrossTabChannel() {
        if (cartCrossTabChannel !== null) return cartCrossTabChannel;
        try {
            cartCrossTabChannel = typeof BroadcastChannel !== 'undefined'
                ? new BroadcastChannel(CART_CROSS_TAB_CHANNEL)
                : false;
        } catch (_) {
            cartCrossTabChannel = false;
        }
        return cartCrossTabChannel;
    }

    function broadcastCartCrossTabChange() {
        if (suppressCartCrossTabBroadcast) return;
        const channel = getCartCrossTabChannel();
        if (channel) {
            try {
                channel.postMessage({ type: 'cart:updated', at: Date.now() });
            } catch (_) { /* ignore */ }
        }
    }

    function initCartCrossTabSync(onRemoteChange) {
        const handler = typeof onRemoteChange === 'function' ? onRemoteChange : null;
        if (!handler) return;

        const channel = getCartCrossTabChannel();
        if (channel) {
            channel.onmessage = () => {
                suppressCartCrossTabBroadcast = true;
                try {
                    handler({ source: 'broadcast' });
                } finally {
                    suppressCartCrossTabBroadcast = false;
                }
            };
        }

        global.addEventListener('storage', (event) => {
            const cartKey = global.EOBStorageKeys && global.EOBStorageKeys.CART;
            if (!event.key || (event.key !== cartKey && event.key !== 'cart')) return;
            suppressCartCrossTabBroadcast = true;
            try {
                handler({ source: 'storage' });
            } finally {
                suppressCartCrossTabBroadcast = false;
            }
        });
    }

    /** POST /api/cart/merge — identity + quantity only (server reprices). */
    function stripGuestCartItemForMerge(item) {
        const src = item && typeof item === 'object' ? item : {};
        const productId = src.productId || src.id;
        if (!productId) return null;
        const out = {
            productId,
            quantity: Math.max(1, Number(src.quantity) || 1)
        };
        const variantId = src.variantId != null ? String(src.variantId).trim() : '';
        if (variantId) out.variantId = variantId;
        return out;
    }

    function stripGuestCartForMerge(items) {
        return (Array.isArray(items) ? items : [])
            .map(stripGuestCartItemForMerge)
            .filter(Boolean);
    }

    /** Normalize legacy/localStorage cart rows to a consistent image + metadata shape. */
    function normalizeCartItem(item, catalogProduct, opts) {
        const options = opts || {};
        const catalog = catalogProduct || null;
        const id = extractItemProductId(item);
        let resolvedImage = resolveCartLineImageUrl(item, catalog);
        const imagesFallback = Array.isArray(item?.images) && item.images[0]
            ? String(item.images[0]).trim()
            : '';

        if (!resolvedImage && imagesFallback) {
            resolvedImage = resolveCartLineImageUrl({ ...item, image: imagesFallback }, catalog)
                || normalizeSecureImageUrl(imagesFallback)
                || imagesFallback;
        }

        if (!resolvedImage && catalog) {
            resolvedImage = resolveCartLineImageUrl(
                { ...item, image: catalog.image, images: catalog.images || [] },
                catalog
            );
        }

        const displayImage = resolvedImage || imagesFallback || '';

        const PT = global.ProductThumbnail;
        let emoji = String(item?.emojiIcon || item?.icon || item?.emoji || '').trim();
        if (!emoji && PT && catalog) {
            emoji = PT.pickEmojiFromItem(PT.mergeMediaSources(item, catalog)) || '';
        }
        if (!emoji && catalog) {
            emoji = String(catalog.emojiIcon || catalog.icon || catalog.emoji || '').trim();
        }

        const preferServerPrice = options.preferServerPrice === true || item.__serverSynced === true;
        const price = preferServerPrice
            ? Number(item?.price) || 0
            : resolveLinePriceFromCatalog(item, catalog);

        return {
            id,
            productId: id,
            name: item?.name || catalog?.name || '',
            price,
            __serverSynced: preferServerPrice,
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

    /** Preserve guest localStorage image data when server cart items lack media. */
    function mergeCartItems(serverItems, localItems) {
        const serverList = Array.isArray(serverItems) ? serverItems : [];
        const localList = Array.isArray(localItems) ? localItems : [];
        const catalog = global.globalProductCatalog || [];

        return serverList.map((serverItem) => {
            const localMatch = localList.find((local) =>
                String(local.productId || local.id) === String(serverItem.productId || serverItem.id) &&
                String(local.variantId || '') === String(serverItem.variantId || '')
            );

            const serverCopy = { ...serverItem };
            if (!serverCopy.image && Array.isArray(serverCopy.images) && serverCopy.images.length > 0) {
                serverCopy.image = serverCopy.images[0];
            }

            const merged = {
                ...serverCopy,
                __serverSynced: true,
                id: serverCopy.id || serverCopy.productId,
                image: (
                    serverCopy.image
                    || (Array.isArray(serverCopy.images) && serverCopy.images[0])
                    || localMatch?.image
                    || localMatch?.products
                    || null
                ),
                emojiIcon: (
                    serverCopy.emojiIcon
                    || serverCopy.icon
                    || localMatch?.emojiIcon
                    || localMatch?.icon
                    || null
                ),
                icon: (
                    serverCopy.icon
                    || localMatch?.icon
                    || serverCopy.emojiIcon
                    || null
                ),
                images: (
                    (Array.isArray(serverCopy.images) && serverCopy.images.length > 0)
                        ? serverCopy.images
                        : (localMatch?.images || [])
                )
            };

            return normalizeCartItem(merged, findCatalogProduct(merged, catalog), { preferServerPrice: true });
        });
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
            raw = window.EOBStorage.getJSON(window.EOBStorageKeys.CART, []);
            if (!Array.isArray(raw)) raw = [];
        } catch (_) {
            window.EOBStorage.remove(window.EOBStorageKeys.CART);
            return [];
        }

        if (raw.length === 0) return [];

        const normalized = normalizeCartArray(raw, catalog);
        const needsPersist = normalized.some((item, index) => cartItemNeedsMigration(raw[index]));
        if (needsPersist) {
            window.EOBStorage.setJSON(window.EOBStorageKeys.CART, normalized);
        }
        return normalized;
    }

    function persistGuestCart(items) {
        const normalized = normalizeCartArray(items, global.globalProductCatalog || []);
        window.EOBStorage.setJSON(window.EOBStorageKeys.CART, normalized);
        broadcastCartCrossTabChange();
        return normalized;
    }

    function resolveItemImageUrl(rawUrl) {
        const raw = String(rawUrl || '').trim();
        if (!raw || isInvalidImageValue(raw)) return null;
        const PT = global.ProductThumbnail;
        if (PT) {
            const resolved = PT.toDisplayImageUrl
                ? (PT.toDisplayImageUrl(raw) || PT.resolveProductImagePath(raw))
                : PT.resolveProductImagePath(raw);
            if (resolved) return normalizeSecureImageUrl(resolved);
        }
        if (raw.startsWith('http') || raw.startsWith('/') || raw.startsWith('data:')) {
            return normalizeSecureImageUrl(raw);
        }
        return normalizeSecureImageUrl('/products/' + raw.replace(/^\/+/, ''));
    }

    function buildItemImageHtml(item, size, catalogProduct) {
        const px = size || '56px';
        const catalog = catalogProduct || findCatalogProduct(item, global.globalProductCatalog || []);
        const PT = global.ProductThumbnail;

        if (PT && typeof PT.buildForCartItem === 'function') {
            const thumbHtml = PT.buildForCartItem(item, catalog, {
                variant: 'compact',
                alt: item?.name || 'Product',
                escapeHtml
            });
            return '<div class="cart-item-thumb-wrap" style="width:' + px + ';height:' + px +
                ';flex-shrink:0;overflow:hidden;border-radius:8px;display:flex;align-items:center;justify-content:center">' +
                thumbHtml + '</div>';
        }

        const validatedHttpsUrl = resolveCartItemImageUrl(item, catalog);
        const fallbackUrl = getCartImagePlaceholderUrl();
        const onerrorHandler = "if(this.src!=='" + fallbackUrl + "')this.src='" + fallbackUrl + "'";

        return '<img src="' + escapeUrlForAttr(validatedHttpsUrl) + '" alt="" ' +
            'style="width:' + px + ';height:' + px + ';object-fit:cover;border-radius:8px;flex-shrink:0;display:block" ' +
            'onerror="' + onerrorHandler + '">';
    }

    function cartLineKey(productId, variantId) {
        return `${String(productId)}::${String(variantId || '')}`;
    }

    function createCartQtySyncManager(options) {
        const opts = options || {};
        const debounceMs = Number(opts.debounceMs) > 0 ? Number(opts.debounceMs) : 350;
        const lines = new Map();

        function lineState(key) {
            if (!lines.has(key)) {
                lines.set(key, {
                    timer: null,
                    confirmedQty: null,
                    pendingTarget: null,
                    inflight: false,
                    lastParams: null
                });
            }
            return lines.get(key);
        }

        function setLineLoading(key, loading) {
            if (typeof document === 'undefined' || !key) return;
            const selector = `[data-cart-line-key="${String(key).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
            document.querySelectorAll(selector).forEach((el) => {
                el.classList.toggle('is-loading', !!loading);
                el.querySelectorAll('.qty-control-btn').forEach((btn) => {
                    btn.disabled = !!loading;
                });
                const display = el.querySelector('.qty-display-number');
                if (display) display.setAttribute('aria-busy', loading ? 'true' : 'false');
            });
        }

        function enqueue(params) {
            if (!params || !params.lineKey) return;
            const st = lineState(params.lineKey);
            const beforeQty = Number(params.beforeQty);
            if (st.confirmedQty == null && Number.isFinite(beforeQty)) {
                st.confirmedQty = beforeQty;
            }

            st.pendingTarget = Number(params.targetQty);
            st.lastParams = params;

            if (typeof params.applyOptimistic === 'function') {
                params.applyOptimistic(st.pendingTarget);
            }

            clearTimeout(st.timer);
            st.timer = setTimeout(() => {
                flush(params.lineKey);
            }, debounceMs);
        }

        async function flush(lineKey) {
            const st = lineState(lineKey);
            const params = st.lastParams;
            if (!params || st.pendingTarget == null) return;

            if (st.inflight) {
                st.timer = setTimeout(() => flush(lineKey), 50);
                return;
            }

            const targetQty = st.pendingTarget;
            const baseline = st.confirmedQty != null ? st.confirmedQty : targetQty;

            st.inflight = true;
            setLineLoading(lineKey, true);

            const commerce = global.EOBCommerce;
            if (commerce && typeof commerce.beginCartMutation === 'function') {
                commerce.beginCartMutation();
            }

            let success = false;
            try {
                const result = await params.syncFn(targetQty);
                if (!result || result.ok === false) {
                    const err = new Error((result && result.message) || 'Could not update quantity');
                    err.status = result && result.status;
                    throw err;
                }
                st.confirmedQty = targetQty;
                success = true;
                if (typeof params.onSuccess === 'function') {
                    params.onSuccess(targetQty, result);
                }
            } catch (err) {
                st.pendingTarget = baseline;
                if (typeof params.applyOptimistic === 'function') {
                    params.applyOptimistic(baseline);
                }
                if (typeof params.onRollback === 'function') {
                    params.onRollback(baseline, err);
                }
                const msg = typeof params.formatError === 'function'
                    ? params.formatError(err)
                    : (err && err.message) || 'Could not update quantity';
                if (typeof global.showToast === 'function') {
                    global.showToast(msg, 'error');
                }
            } finally {
                st.inflight = false;
                setLineLoading(lineKey, false);
                if (commerce && typeof commerce.endCartMutation === 'function') {
                    commerce.endCartMutation();
                }
            }

            if (success && st.pendingTarget !== st.confirmedQty) {
                clearTimeout(st.timer);
                st.timer = setTimeout(() => flush(lineKey), debounceMs);
            }
        }

        return {
            enqueue,
            flush,
            setLineLoading,
            cartLineKey,
            debounceMs,
            _lines: lines
        };
    }

    let defaultQtySync = null;
    function getCartQtySync(options) {
        if (!defaultQtySync) {
            defaultQtySync = createCartQtySyncManager(options);
        }
        return defaultQtySync;
    }

    global.CartDisplayUtils = {
        escapeHtml,
        parseCartApiResponse,
        getProductDetailUrl,
        getCartItemVariantAttributes,
        buildVariantBadgesHtml,
        findCatalogProduct,
        extractItemProductId,
        resolveCartLineImageUrl,
        resolveCartItemImageUrl,
        normalizeCartItem,
        normalizeCartArray,
        mergeCartItems,
        getNormalizedGuestCart,
        persistGuestCart,
        buildItemImageHtml,
        resolveItemImageUrl,
        safeImg,
        isInvalidImageValue,
        getAbsoluteAssetUrl,
        getCartImagePlaceholderUrl,
        buildCartAddPayload,
        stripGuestCartItemForMerge,
        stripGuestCartForMerge,
        computeTotalCartQuantity,
        resolveCartBadgeCount,
        applyCartBadgeCount,
        initCartCrossTabSync,
        broadcastCartCrossTabChange,
        resolveLinePriceFromCatalog,
        cartLineKey,
        createCartQtySyncManager,
        getCartQtySync,
        CART_IMAGE_PLACEHOLDER,
        CART_IMAGE_FALLBACK
    };

    global.buildItemImageHtml = buildItemImageHtml;
})(typeof window !== 'undefined' ? window : globalThis);








