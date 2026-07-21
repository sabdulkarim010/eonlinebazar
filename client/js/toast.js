/**
 * Global toast notification engine for the customer storefront.
 */
(function (global) {
    const DEFAULT_DURATION = 3000;
    const MAX_VISIBLE = 4;

    const TYPE_ALIASES = {
        danger: 'error',
        error: 'error',
        success: 'success',
        warning: 'warning',
        info: 'info',
        wishlist: 'wishlist'
    };

    const TYPE_ICONS = {
        success: 'fa-circle-check',
        error: 'fa-circle-exclamation',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info',
        wishlist: 'fa-heart'
    };

    const MESSAGES = {
        CART_ADDED: '🛒 Added to Cart successfully!',
        CART_REMOVED: 'Item removed from Cart',
        WISHLIST_ADDED: '❤️ Saved to Wishlist!',
        WISHLIST_REMOVED: 'Item removed from Wishlist',
        STOCK_EXCEEDED: '⚠️ Requested quantity exceeds available stock',
        OUT_OF_STOCK: '⚠️ This item is currently out of stock'
    };

    function normalizeType(type) {
        const key = String(type || 'success').trim().toLowerCase();
        return TYPE_ALIASES[key] || 'info';
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function ensureContainer() {
        let container = document.getElementById('global-toast-stack');
        if (!container) {
            container = document.createElement('div');
            container.id = 'global-toast-stack';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-atomic', 'false');
            document.body.appendChild(container);
        }
        return container;
    }

    function dismissToast(toast) {
        if (!toast || toast.dataset.dismissed === 'true') return;
        toast.dataset.dismissed = 'true';
        toast.classList.remove('is-visible');
        toast.classList.add('is-leaving');
        window.setTimeout(() => toast.remove(), 320);
    }

    function trimStack(container) {
        const toasts = container.querySelectorAll('.global-toast');
        if (toasts.length <= MAX_VISIBLE) return;
        dismissToast(toasts[0]);
    }

    function showToast(message, type = 'success', options = {}) {
        if (!message) return null;

        const normalizedType = normalizeType(type);
        const duration = Number(options.duration) > 0 ? Number(options.duration) : DEFAULT_DURATION;
        const container = ensureContainer();
        trimStack(container);

        const toast = document.createElement('div');
        toast.className = `global-toast global-toast--${normalizedType}`;
        toast.setAttribute('role', normalizedType === 'error' ? 'alert' : 'status');
        toast.innerHTML = `
            <span class="global-toast__icon" aria-hidden="true">
                <i class="fa-solid ${TYPE_ICONS[normalizedType]}"></i>
            </span>
            <span class="global-toast__message">${escapeHtml(message)}</span>
            <button type="button" class="global-toast__close" aria-label="Dismiss notification">&times;</button>
        `;

        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('is-visible'));

        const closeBtn = toast.querySelector('.global-toast__close');
        closeBtn?.addEventListener('click', () => dismissToast(toast));

        const timer = window.setTimeout(() => dismissToast(toast), duration);
        toast.addEventListener('mouseenter', () => window.clearTimeout(timer));
        toast.addEventListener('mouseleave', () => {
            window.setTimeout(() => dismissToast(toast), 1200);
        });

        return toast;
    }

    global.ToastMessages = MESSAGES;
    global.showToast = showToast;
    global.showCartAddedToast = () => showToast(MESSAGES.CART_ADDED, 'success');
    global.showCartRemovedToast = () => showToast(MESSAGES.CART_REMOVED, 'info');
    global.showWishlistAddedToast = () => showToast(MESSAGES.WISHLIST_ADDED, 'wishlist');
    global.showWishlistRemovedToast = () => showToast(MESSAGES.WISHLIST_REMOVED, 'info');
    global.showStockExceededToast = () => showToast(MESSAGES.STOCK_EXCEEDED, 'error');
    global.showOutOfStockToast = () => showToast(MESSAGES.OUT_OF_STOCK, 'error');
})(window);
