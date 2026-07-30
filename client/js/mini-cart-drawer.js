/**
 * Site-wide slide-over mini cart drawer triggered from header cart icons.
 */
(function initMiniCartDrawer(global) {
    const DRAWER_HTML = `
<div id="miniCartBackdrop" class="mini-cart-backdrop" aria-hidden="true"></div>
<aside id="miniCartDrawer" class="mini-cart-drawer" role="dialog" aria-modal="true" aria-labelledby="miniCartDrawerTitle" aria-hidden="true">
    <div class="mini-cart-drawer__header">
        <h2 id="miniCartDrawerTitle" class="mini-cart-drawer__title">
            <i class="fa-solid fa-bag-shopping" aria-hidden="true"></i>
            Your Bag (<span id="cartDrawerCount">0</span>)
        </h2>
        <button type="button" id="miniCartCloseBtn" class="mini-cart-drawer__close" aria-label="Close cart">
            <i class="fa-solid fa-xmark"></i>
        </button>
    </div>
    <div id="cartDrawerItems" class="mini-cart-drawer__body"></div>
    <div id="cartDrawerFooter" class="mini-cart-drawer__footer">
        <div class="mini-cart-drawer__meta">
            <span id="miniCartSelectedCount">0 items selected</span>
        </div>
        <div class="mini-cart-drawer__subtotal">
            <span class="mini-cart-drawer__subtotal-label" data-i18n="cart.total">Total</span>
            <span class="mini-cart-drawer__subtotal-value">৳<span id="cartDrawerTotal">0</span></span>
        </div>
        <button type="button" id="miniCartCheckoutBtn" class="mini-cart-drawer__checkout-btn" disabled>
            <span data-i18n="cart.checkout">Checkout</span> <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
        </button>
        <a href="/cart" class="mini-cart-drawer__view-cart-link">View My Cart</a>
    </div>
</aside>`;

    let backdropEl = null;
    let drawerEl = null;
    let closeBtnEl = null;
    let isOpen = false;

    function ensureDrawerMounted() {
        if (document.getElementById('miniCartDrawer')) {
            backdropEl = document.getElementById('miniCartBackdrop');
            drawerEl = document.getElementById('miniCartDrawer');
            closeBtnEl = document.getElementById('miniCartCloseBtn');
            return;
        }
        document.body.insertAdjacentHTML('beforeend', DRAWER_HTML);
        backdropEl = document.getElementById('miniCartBackdrop');
        drawerEl = document.getElementById('miniCartDrawer');
        closeBtnEl = document.getElementById('miniCartCloseBtn');
        if (global.i18n) global.i18n.applyTranslations();
    }

    function openMiniCart() {
        ensureDrawerMounted();
        if (!drawerEl || isOpen) return;

        isOpen = true;
        document.body.classList.add('mini-cart-open');
        backdropEl.classList.add('is-visible');
        drawerEl.classList.add('is-open');
        backdropEl.setAttribute('aria-hidden', 'false');
        drawerEl.setAttribute('aria-hidden', 'false');

        if (typeof global.renderCartDrawerItems === 'function') {
            global.renderCartDrawerItems();
        }
        if (typeof global.updateCartCount === 'function') {
            global.updateCartCount();
        }

        closeBtnEl?.focus();
    }

    function closeMiniCart() {
        if (!drawerEl || !isOpen) return;

        isOpen = false;
        document.body.classList.remove('mini-cart-open');
        backdropEl?.classList.remove('is-visible');
        drawerEl.classList.remove('is-open');
        backdropEl?.setAttribute('aria-hidden', 'true');
        drawerEl.setAttribute('aria-hidden', 'true');
    }

    function bindTriggers() {
        document.querySelectorAll('[data-mini-cart-trigger], .nav-cart-box').forEach((el) => {
            if (el.dataset.miniCartBound === '1') return;
            el.dataset.miniCartBound = '1';

            el.setAttribute('role', 'button');
            el.setAttribute('tabindex', '0');
            el.style.cursor = 'pointer';

            el.addEventListener('click', (e) => {
                e.preventDefault();
                openMiniCart();
            });

            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openMiniCart();
                }
            });
        });
    }

    function bindDrawerControls() {
        ensureDrawerMounted();

        closeBtnEl?.addEventListener('click', closeMiniCart);
        backdropEl?.addEventListener('click', closeMiniCart);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen) closeMiniCart();
        });
    }

    function init() {
        ensureDrawerMounted();
        bindDrawerControls();
        bindTriggers();

        const observer = new MutationObserver(() => bindTriggers());
        observer.observe(document.body, { childList: true, subtree: true });
    }

    global.MiniCartDrawer = {
        open: openMiniCart,
        close: closeMiniCart,
        bindTriggers
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    document.addEventListener('languageChanged', () => {
        if (global.i18n) global.i18n.applyTranslations();
        if (typeof global.renderCartDrawerItems === 'function') {
            global.renderCartDrawerItems();
        }
    });
})(window);
