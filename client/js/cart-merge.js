/**
 * Guest cart → authenticated cart sync helpers (login + navbar badge).
 */
(function initCartMergeClient(global) {
    function getGuestCartFromStorage() {
        try {
            const raw = JSON.parse(localStorage.getItem('cart') || '[]');
            return Array.isArray(raw) ? raw : [];
        } catch (_) {
            return [];
        }
    }

    function mapServerCartItem(item = {}) {
        return {
            id: item.productId || item.id,
            productId: item.productId || item.id,
            name: item.name,
            price: Number(item.price) || 0,
            products: item.image || item.products || '',
            image: item.image || item.products || '',
            icon: item.icon || '',
            quantity: item.quantity || 1,
            selected: item.selected !== false,
            variantId: item.variantId || '',
            variantLabel: item.variantLabel || '',
            variantAttribute: item.variantAttribute || '',
            variantValue: item.variantValue || '',
            variantSku: item.variantSku || ''
        };
    }

    function updateNavbarCartBadges(count) {
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
    }

    function clearGuestCartStorage() {
        localStorage.removeItem('cart');
    }

    function applyMergedCartToClient(serverItems = []) {
        const items = Array.isArray(serverItems) ? serverItems.map(mapServerCartItem) : [];
        clearGuestCartStorage();

        if (typeof global.syncCartFromServerItems === 'function') {
            global.syncCartFromServerItems(items);
        } else if (typeof global.updateCartCount === 'function') {
            global.updateCartCount();
        } else {
            updateNavbarCartBadges(items.length);
        }

        global.dispatchEvent(new CustomEvent('cart:merged', {
            detail: { items, count: items.length }
        }));

        return items;
    }

    async function mergeGuestCartViaApi(token, guestItems) {
        const cartItems = Array.isArray(guestItems) ? guestItems : getGuestCartFromStorage();
        if (!token || cartItems.length === 0) return null;

        const response = await fetch('/api/cart/merge', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ cartItems })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Cart merge failed');
        }

        const mergedItems = data.cart || data.items || [];
        return applyMergedCartToClient(mergedItems);
    }

    async function syncCartAfterLogin(loginResponse = {}, token) {
        const authToken = token
            || loginResponse.token
            || localStorage.getItem('token')
            || localStorage.getItem('customerToken');

        if (!authToken) return null;

        if (loginResponse.cart && Array.isArray(loginResponse.cart.items)) {
            return applyMergedCartToClient(loginResponse.cart.items);
        }

        const guestItems = getGuestCartFromStorage();
        if (guestItems.length === 0) {
            updateNavbarCartBadges(0);
            return [];
        }

        try {
            return await mergeGuestCartViaApi(authToken, guestItems);
        } catch (error) {
            console.error('Fallback cart merge failed:', error);
            updateNavbarCartBadges(guestItems.length);
            return null;
        }
    }

    global.CartMerge = {
        getGuestCartFromStorage,
        mapServerCartItem,
        updateNavbarCartBadges,
        clearGuestCartStorage,
        applyMergedCartToClient,
        mergeGuestCartViaApi,
        syncCartAfterLogin
    };
})(window);
