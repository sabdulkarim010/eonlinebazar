/**
 * Express Buy Now — isolated checkout session without mutating the main cart.
 */
(function initEOBExpressCheckout(global) {
    'use strict';

    const DEFAULT_REDIRECT = '/checkout.html';

    function resolveStock(product) {
        if (!product || typeof product !== 'object') return 0;
        const sq = Number(product.stockQuantity);
        const s = Number(product.stock);
        if (Number.isFinite(sq) && sq >= 0) return sq;
        if (Number.isFinite(s) && s >= 0) return s;
        return 1;
    }

    function productRequiresVariantSelection(product) {
        if (!product) return false;
        if (product.hasVariants === true) return true;
        const variants = Array.isArray(product.variants) ? product.variants : [];
        if (variants.length === 0) return false;
        return variants.some((v) => {
            const attrs = v.attributes && typeof v.attributes === 'object' ? v.attributes : {};
            return Object.keys(attrs).length > 1 || (v.attribute && v.value);
        });
    }

    function buildCatalogExpressItem(product, quantity) {
        const productId = product._id || product.id || product.productId;
        const PT = global.ProductThumbnail;
        const meta = PT && typeof PT.getDisplayMeta === 'function'
            ? PT.getDisplayMeta(product)
            : { image: product.image || product.photo || '', emoji: product.icon || '' };
        const image = PT && typeof PT.toDisplayImageUrl === 'function'
            ? (PT.toDisplayImageUrl(meta.image) || meta.image)
            : meta.image;

        const line = {
            id: productId,
            productId,
            name: product.name,
            price: Number(product.price) || 0,
            quantity: Math.max(1, Number(quantity) || 1),
            icon: meta.emoji || product.icon || '',
            emoji: meta.emoji || product.icon || '',
            image,
            products: image,
            variantId: '',
            variantLabel: '',
            selected: true
        };

        const CDU = global.CartDisplayUtils;
        if (CDU && typeof CDU.normalizeCartItem === 'function') {
            return CDU.normalizeCartItem(line, product);
        }
        return line;
    }

    function clearCheckoutQuoteSession() {
        if (global.EOBCheckoutState) {
            global.EOBCheckoutState.set('activeQuote', null);
            global.EOBCheckoutState.set('quoteMeta', null);
        }
        try {
            global.EOBStorage?.remove?.('eob_checkout_idempotency_key');
        } catch (_) { /* ignore */ }
    }

    function persistBuyNowSession(items) {
        const list = Array.isArray(items) ? items : [];
        if (global.EOBCommerce) {
            global.EOBCommerce.setBuyNowMode(true);
            global.EOBCommerce.setBuyNowItems(list);
            global.EOBCommerce.markCheckoutSessionActiveFlag();
        } else {
            const K = global.EOBStorageKeys || {};
            global.EOBStorage?.set?.(K.IS_BUY_NOW_MODE || 'isBuyNowMode', 'true');
            global.EOBStorage?.setJSON?.(K.BUY_NOW_ITEM || 'buy_now_item', list);
            global.EOBStorage?.set?.(K.ACTIVE_CHECKOUT_SESSION || 'activeCheckoutSession', 'true');
        }
        clearCheckoutQuoteSession();
    }

    /**
     * @param {{ items: object[], redirectTo?: string, skipRedirect?: boolean }} options
     */
    function startExpressCheckout(options = {}) {
        const items = Array.isArray(options.items) ? options.items.filter(Boolean) : [];
        if (!items.length) {
            if (typeof global.showToast === 'function') {
                global.showToast('No items to checkout.', 'error');
            }
            return { ok: false, reason: 'empty' };
        }

        persistBuyNowSession(items);

        if (options.skipRedirect) {
            return { ok: true, items, redirectTo: null };
        }

        const target = options.redirectTo || DEFAULT_REDIRECT;
        if (typeof options.onBeforeRedirect === 'function') {
            options.onBeforeRedirect({ items, redirectTo: target });
        } else {
            global.location.href = target;
        }
        return { ok: true, items, redirectTo: target };
    }

    function startExpressFromCatalogProduct(product, quantity = 1, options = {}) {
        if (!product) {
            return { ok: false, reason: 'no_product' };
        }

        const productId = product._id || product.id || product.productId;
        if (productRequiresVariantSelection(product)) {
            const url = global.EOBUrlUtils
                ? global.EOBUrlUtils.buildUrl('/product-details.html', { id: productId, buyNow: '1' })
                : `/product-details.html?id=${encodeURIComponent(productId)}&buyNow=1`;
            global.location.href = url;
            return { ok: false, reason: 'variant_required', redirectTo: url };
        }

        const stock = resolveStock(product);
        if (stock <= 0) {
            if (typeof global.showOutOfStockToast === 'function') {
                global.showOutOfStockToast();
            } else if (typeof global.showToast === 'function') {
                global.showToast('This product is out of stock.', 'error');
            }
            return { ok: false, reason: 'out_of_stock' };
        }

        const item = buildCatalogExpressItem(product, quantity);
        return startExpressCheckout({
            items: [item],
            redirectTo: options.redirectTo,
            skipRedirect: options.skipRedirect === true,
            onBeforeRedirect: options.onBeforeRedirect
        });
    }

    global.EOBExpressCheckout = {
        DEFAULT_REDIRECT,
        resolveStock,
        productRequiresVariantSelection,
        buildCatalogExpressItem,
        persistBuyNowSession,
        startExpressCheckout,
        startExpressFromCatalogProduct
    };
})(typeof window !== 'undefined' ? window : globalThis);
