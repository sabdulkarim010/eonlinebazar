/**
 * Guest cart → authenticated cart sync helpers (login + navbar badge).
 */
(function initCartMergeClient(global) {
    const GUEST_CART_SNAPSHOT_KEY = 'eob_guest_cart_merge_snapshot';
    const MERGE_FETCH_TIMEOUT_MS = 15000;

    function getGuestCartFromStorage() {
        const CDU = global.CartDisplayUtils;
        const catalog = global.globalProductCatalog || [];
        if (CDU && typeof CDU.getNormalizedGuestCart === 'function') {
            return CDU.getNormalizedGuestCart(catalog);
        }
        try {
            const raw = window.EOBStorage.getJSON(window.EOBStorageKeys.CART, []);
            return Array.isArray(raw) ? raw : [];
        } catch (_) {
            return [];
        }
    }

    function snapshotGuestCartBeforeAuth() {
        const items = getGuestCartFromStorage();
        if (!items.length || !window.EOBStorage || !window.EOBStorage.session) return [];
        window.EOBStorage.session.setJSON(GUEST_CART_SNAPSHOT_KEY, items);
        return items;
    }

    function consumeGuestCartSnapshot() {
        if (!window.EOBStorage || !window.EOBStorage.session) return null;
        const snap = window.EOBStorage.session.getJSON(GUEST_CART_SNAPSHOT_KEY, null);
        if (snap) window.EOBStorage.session.remove(GUEST_CART_SNAPSHOT_KEY);
        return Array.isArray(snap) && snap.length > 0 ? snap : null;
    }

    function resolveBadgeCountFromItems(items) {
        const CDU = global.CartDisplayUtils;
        if (CDU && typeof CDU.computeTotalCartQuantity === 'function') {
            return CDU.computeTotalCartQuantity(items);
        }
        return (Array.isArray(items) ? items : []).reduce(
            (total, item) => total + Math.max(0, Number(item.quantity) || 0),
            0
        );
    }

    function updateNavbarCartBadges(count) {
        const CDU = global.CartDisplayUtils;
        if (CDU && typeof CDU.applyCartBadgeCount === 'function') {
            return CDU.applyCartBadgeCount(count);
        }
        const safeCount = Math.max(0, Number(count) || 0);
        const selectors = [
            '#cartCountBadge',
            '#nav-cart-count',
            '.Bag span'
        ];

        selectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((el) => {
                el.textContent = String(safeCount);
            });
        });

        const drawerCount = document.getElementById('cartDrawerCount');
        if (drawerCount) drawerCount.textContent = String(safeCount);
        return safeCount;
    }

    function mapServerCartItem(item = {}) {
        const CDU = global.CartDisplayUtils;
        const catalog = global.globalProductCatalog || [];
        if (CDU && typeof CDU.normalizeCartItem === 'function') {
            const product = CDU.findCatalogProduct
                ? CDU.findCatalogProduct(item, catalog)
                : null;
            return CDU.normalizeCartItem(item, product, { preferServerPrice: true });
        }
        const displayImage = String(
            item.selectedImage
            || item.variantImage
            || item.image
            || item.products
            || ''
        ).trim();
        return {
            id: item.productId || item.id,
            productId: item.productId || item.id,
            name: item.name,
            price: Number(item.price) || 0,
            products: displayImage,
            image: displayImage,
            selectedImage: displayImage,
            variantImage: displayImage,
            icon: item.icon || '',
            quantity: item.quantity || 1,
            selected: item.selected !== false,
            variantId: item.variantId || '',
            variantLabel: item.variantLabel || '',
            variantAttribute: item.variantAttribute || '',
            variantValue: item.variantValue || '',
            variantSku: item.variantSku || '',
            selectedColor: item.selectedColor || '',
            selectedSize: item.selectedSize || '',
            selectedVariant: item.selectedVariant || null,
            __serverSynced: true
        };
    }

    function clearGuestCartStorage() {
        window.EOBStorage.remove(window.EOBStorageKeys.CART);
    }

    function notifyCartCrossTabAfterMerge(items) {
        const CDU = global.CartDisplayUtils;
        if (CDU && typeof CDU.broadcastCartCrossTabChange === 'function') {
            CDU.broadcastCartCrossTabChange();
        }
        global.dispatchEvent(new CustomEvent('cart:merged', {
            detail: { items, badgeCount: resolveBadgeCountFromItems(items) }
        }));
    }

    function applyMergedCartToClient(serverItems = [], guestItems = []) {
        const CDU = global.CartDisplayUtils;
        const localItems = Array.isArray(guestItems) && guestItems.length > 0
            ? guestItems
            : getGuestCartFromStorage();
        const rawServer = Array.isArray(serverItems) ? serverItems : [];
        const items = CDU && typeof CDU.mergeCartItems === 'function'
            ? CDU.mergeCartItems(rawServer, localItems)
            : rawServer.map(mapServerCartItem);

        clearGuestCartStorage();

        if (typeof global.syncCartFromServerItems === 'function') {
            global.syncCartFromServerItems(items, localItems);
        } else if (typeof global.updateCartCount === 'function') {
            global.updateCartCount({ badgeCount: resolveBadgeCountFromItems(items) });
        } else {
            updateNavbarCartBadges(resolveBadgeCountFromItems(items));
        }

        notifyCartCrossTabAfterMerge(items);

        return items;
    }

    async function mergeGuestCartViaApi(token, guestItems) {
        const cartItems = Array.isArray(guestItems) ? guestItems : getGuestCartFromStorage();
        if (!token || cartItems.length === 0) return null;

        const mergeBody = (global.CartDisplayUtils && global.CartDisplayUtils.stripGuestCartForMerge)
            ? global.CartDisplayUtils.stripGuestCartForMerge(cartItems)
            : cartItems;

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller
            ? setTimeout(() => controller.abort(), MERGE_FETCH_TIMEOUT_MS)
            : null;

        let response;
        try {
            response = await fetch('/api/cart/merge', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ cartItems: mergeBody }),
                signal: controller ? controller.signal : undefined
            });
        } catch (error) {
            if (error && error.name === 'AbortError') {
                throw new Error('Cart merge timed out');
            }
            throw error;
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Cart merge failed');
        }

        const mergedItems = data.data || data.cart || data.items || [];
        return applyMergedCartToClient(mergedItems, cartItems);
    }

    async function mergeGuestCartWithUserCart(token, guestItems) {
        return mergeGuestCartViaApi(token, guestItems);
    }

    async function syncCartAfterLogin(loginResponse = {}, token) {
        const authToken = token
            || loginResponse.token
            || window.EOBStorage.get(window.EOBStorageKeys.TOKEN)
            || window.EOBStorage.get(window.EOBStorageKeys.CUSTOMER_TOKEN);

        if (!authToken) return null;

        if (loginResponse.cart && Array.isArray(loginResponse.cart.items)) {
            const snapshot = consumeGuestCartSnapshot() || [];
            return applyMergedCartToClient(loginResponse.cart.items, snapshot);
        }

        const guestItems = consumeGuestCartSnapshot() || getGuestCartFromStorage();
        if (guestItems.length === 0) {
            if (typeof global.fetchLiveDBCart === 'function') {
                try {
                    await global.fetchLiveDBCart();
                } catch (_) { /* ignore */ }
            }
            updateNavbarCartBadges(0);
            return [];
        }

        try {
            return await mergeGuestCartViaApi(authToken, guestItems);
        } catch (error) {
            console.error('Fallback cart merge failed:', error);
            updateNavbarCartBadges(resolveBadgeCountFromItems(guestItems));
            return null;
        }
    }

    global.CartMerge = {
        getGuestCartFromStorage,
        snapshotGuestCartBeforeAuth,
        consumeGuestCartSnapshot,
        mapServerCartItem,
        updateNavbarCartBadges,
        clearGuestCartStorage,
        applyMergedCartToClient,
        mergeGuestCartViaApi,
        mergeGuestCartWithUserCart,
        syncCartAfterLogin
    };
})(window);
