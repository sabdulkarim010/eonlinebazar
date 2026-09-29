/**
 * Cart/checkout catalog hydration — lookup by cart line IDs (no bulk prefetch).
 */
(function initCartCatalogBootstrap(global) {
    'use strict';

    async function afterCartReady(cartItems) {
        const CC = global.EOBCatalogClient;
        if (!CC || typeof CC.hydrateCatalogForCart !== 'function') return;
        try {
            await CC.hydrateCatalogForCart(cartItems || []);
        } catch (err) {
            if (global.console && global.console.error) {
                global.console.error('[CartCatalogBootstrap] hydrate failed:', err);
            }
        }
    }

    global.CartCatalogBootstrap = {
        afterCartReady
    };
})(typeof window !== 'undefined' ? window : global);
