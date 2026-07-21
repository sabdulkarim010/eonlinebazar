/**
 * ==========================================================================
 * File Name: js/wishlist.js
 * Project: eOnlineBazar
 * Description: Wishlist heart buttons, toggle API integration, and toasts
 *              for store product grids (home, search, etc.).
 * ==========================================================================
 */

(function () {
    const savedProductIds = new Set();
    let loadPromise = null;

    function getCustomerToken() {
        return localStorage.getItem('customerToken');
    }

    function normalizeId(id) {
        return String(id || '').trim();
    }

    function isSaved(productId) {
        return savedProductIds.has(normalizeId(productId));
    }

    function setHeartVisual(btn, active) {
        const icon = btn.querySelector('i');
        if (!icon) return;

        icon.classList.remove('fa-regular', 'fa-solid', 'far', 'fas');
        if (active) {
            icon.classList.add('fas', 'fa-heart');
            btn.classList.add('is-active');
            btn.setAttribute('aria-label', 'Remove from wishlist');
            btn.setAttribute('aria-pressed', 'true');
        } else {
            icon.classList.add('far', 'fa-heart');
            btn.classList.remove('is-active');
            btn.setAttribute('aria-label', 'Add to wishlist');
            btn.setAttribute('aria-pressed', 'false');
        }
    }

    function showWishlistToast(message, type = 'success') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }

        let container = document.getElementById('store-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'store-toast-container';
            container.className = 'store-toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `store-toast ${type === 'error' ? 'error' : 'success'}`;
        const iconClass = type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check';
        toast.innerHTML = `<i class="fa-solid ${iconClass}"></i><span>${message}</span>`;
        container.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add('show'));

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    async function loadUserWishlist() {
        const token = getCustomerToken();
        if (!token) return;

        try {
            const response = await fetch('/api/customer/wishlist', {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) return;

            const data = await response.json();
            savedProductIds.clear();
            (data.wishlist || []).forEach(item => {
                if (item && item.productId) {
                    savedProductIds.add(normalizeId(item.productId));
                }
            });
        } catch (error) {
            console.warn('Could not preload wishlist:', error);
        }
    }

    function ensureWishlistLoaded() {
        if (!loadPromise) {
            loadPromise = loadUserWishlist();
        }
        return loadPromise;
    }

    function refreshHearts(root = document) {
        root.querySelectorAll('.wishlist-heart-btn[data-product-id]').forEach(btn => {
            const productId = btn.getAttribute('data-product-id');
            setHeartVisual(btn, isSaved(productId));
        });
    }

    function createHeartButton(productId, product = {}) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wishlist-heart-btn';
        btn.setAttribute('data-product-id', normalizeId(productId));

        if (product.name) btn.dataset.name = product.name;
        if (product.price != null) btn.dataset.price = String(product.price);
        if (product.image) btn.dataset.image = product.image;
        if (product.icon) btn.dataset.icon = product.icon;

        btn.innerHTML = '<i class="far fa-heart"></i>';
        setHeartVisual(btn, isSaved(productId));
        return btn;
    }

    async function toggleWishlist(btn) {
        const productId = btn.getAttribute('data-product-id');
        if (!productId) return;

        const token = getCustomerToken();
        if (!token) {
            showWishlistToast('Please log in to add items to your wishlist!', 'error');
            return;
        }

        const payload = {
            productId,
            name: btn.dataset.name || '',
            price: btn.dataset.price ? Number(btn.dataset.price) : undefined,
            image: btn.dataset.image || '',
            icon: btn.dataset.icon || ''
        };

        btn.disabled = true;
        btn.classList.add('is-loading');

        try {
            const response = await fetch('/api/wishlist/toggle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => ({}));

            if (response.status === 401 || response.status === 403) {
                showWishlistToast('Please log in to add items to your wishlist!', 'error');
                return;
            }

            if (!response.ok || !data.success) {
                showWishlistToast(data.message || 'Could not update wishlist.', 'error');
                return;
            }

            if (data.added) {
                savedProductIds.add(normalizeId(productId));
                setHeartVisual(btn, true);
                if (typeof window.showWishlistAddedToast === 'function') {
                    window.showWishlistAddedToast();
                } else {
                    showWishlistToast('❤️ Saved to Wishlist!', 'wishlist');
                }
            } else {
                savedProductIds.delete(normalizeId(productId));
                setHeartVisual(btn, false);
                if (typeof window.showWishlistRemovedToast === 'function') {
                    window.showWishlistRemovedToast();
                } else {
                    showWishlistToast('Item removed from Wishlist', 'info');
                }
            }
        } catch (error) {
            console.error('Wishlist toggle error:', error);
            showWishlistToast('Could not reach the server. Please try again.', 'error');
        } finally {
            btn.disabled = false;
            btn.classList.remove('is-loading');
        }
    }

    function initWishlistEngine() {
        document.addEventListener('click', (event) => {
            const btn = event.target.closest('.wishlist-heart-btn');
            if (!btn) return;

            event.preventDefault();
            event.stopPropagation();
            toggleWishlist(btn);
        });

        ensureWishlistLoaded().then(() => refreshHearts());
    }

    window.WishlistEngine = {
        createHeartButton,
        refreshHearts,
        ensureLoaded: ensureWishlistLoaded,
        isSaved
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWishlistEngine);
    } else {
        initWishlistEngine();
    }
})();
