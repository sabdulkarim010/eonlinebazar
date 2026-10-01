/**
 * Shared storefront render helpers (image pipeline entry points).
 */
(function initEOBRender(global) {
    'use strict';

    function mountProductCardImage(container, product, options) {
        if (!container || !product) return;
        const PT = global.ProductThumbnail;
        if (!PT || typeof PT.mountInto !== 'function') return;

        const opts = options || {};
        const cardIndex = Number(opts.index);
        const priority = opts.priority || (cardIndex === 0 ? 'lazy' : 'lazy');

        const altName = global.ProductLocale
            ? global.ProductLocale.pickProductName(product)
            : (product.name || 'Product Image');
        PT.mountInto(container, product, {
            variant: 'card',
            alt: altName || 'Product Image',
            priority,
            loading: priority === 'lcp' ? 'eager' : 'lazy'
        });
    }

    function mountCartLineImage(container, cartItem, catalogProduct, options) {
        const PT = global.ProductThumbnail;
        if (!PT || !container) return;
        PT.mountCartItemInto(container, cartItem, catalogProduct, {
            variant: 'compact',
            alt: cartItem?.name || 'Product',
            priority: 'lazy',
            ...(options || {})
        });
    }

    global.EOBRender = {
        mountProductCardImage,
        mountCartLineImage
    };
})(typeof window !== 'undefined' ? window : global);
