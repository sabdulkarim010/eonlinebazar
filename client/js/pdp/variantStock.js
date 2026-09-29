/**
 * PDP variant stock resolution, badge states, CTA labels, notify-me placeholder.
 */
(function initPdpVariantStock(global) {
    'use strict';

    const DEFAULT_LOW_STOCK_THRESHOLD = 5;
    const ADD_TO_CART_DEFAULT = 'Add to Cart';
    const ADD_TO_CART_OUT = 'Out of Stock';
    const ADD_TO_CART_SELECT = 'Select options';

    let notifyBound = false;

    function resolveEntityStock(entity) {
        if (!entity || typeof entity !== 'object') return 0;
        const sq = Number(entity.stockQuantity);
        const s = Number(entity.stock);
        if (Number.isFinite(sq) && sq >= 0) return Math.floor(sq);
        if (Number.isFinite(s) && s >= 0) return Math.floor(s);
        return 0;
    }

    function getLowStockThreshold(product) {
        const t = Number(product && product.lowStockThreshold);
        if (Number.isFinite(t) && t > 0) return Math.floor(t);
        return DEFAULT_LOW_STOCK_THRESHOLD;
    }

    /**
     * @returns {'in'|'low'|'out'|'select'}
     */
    function classifyStockLevel(stock, threshold) {
        const qty = Number(stock);
        if (!Number.isFinite(qty) || qty <= 0) return 'out';
        const th = Number(threshold) || DEFAULT_LOW_STOCK_THRESHOLD;
        if (qty <= th) return 'low';
        return 'in';
    }

    function formatStockBadgeText(level, stock, options = {}) {
        const qty = Number(stock) || 0;
        const i18n = global.i18n;
        if (level === 'select') {
            return options.selectLabel
                || (i18n && i18n.t ? i18n.t('product.select_options') : 'Select options');
        }
        if (level === 'out') {
            return i18n && i18n.t ? i18n.t('product.out_of_stock') : 'Out of Stock';
        }
        if (level === 'low') {
            const lowTpl = i18n && i18n.t
                ? i18n.t('product.low_stock', { count: qty })
                : null;
            if (lowTpl && lowTpl !== 'product.low_stock') return lowTpl;
            return `Low Stock — Only ${qty} left!`;
        }
        return i18n && i18n.t ? i18n.t('product.in_stock') : 'In Stock';
    }

    function applyStockBadgeToElement(el, level, text) {
        if (!el) return;
        el.classList.remove(
            'stock-status-badge--in',
            'stock-status-badge--low',
            'stock-status-badge--out',
            'stock-status-badge--select'
        );
        const mod = level === 'in' ? 'in'
            : level === 'low' ? 'low'
                : level === 'select' ? 'select'
                    : 'out';
        el.classList.add(`stock-status-badge--${mod}`);
        el.textContent = text;
        el.setAttribute('data-stock-level', mod);
        el.style.color = '';
    }

    function paintStockBadge(stock, product, options = {}) {
        const el = document.getElementById('stockStatus');
        if (!el) return;

        if (options.selectionIncomplete) {
            const text = formatStockBadgeText('select', 0, options);
            applyStockBadgeToElement(el, 'select', text);
            return;
        }

        const threshold = getLowStockThreshold(product || global.currentProductData);
        const level = classifyStockLevel(stock, threshold);
        const text = formatStockBadgeText(level, stock, options);
        applyStockBadgeToElement(el, level, text);
    }

    function cacheDefaultCartLabels() {
        const btn = document.getElementById('addToCartBtn');
        if (!btn || btn.dataset.defaultLabel) return;
        const span = btn.querySelector('span');
        const label = span ? span.textContent.trim() : btn.textContent.trim();
        btn.dataset.defaultLabel = label || ADD_TO_CART_DEFAULT;
    }

    function setPrimaryAddToCartLabel(text) {
        const btn = document.getElementById('addToCartBtn');
        if (!btn) return;
        cacheDefaultCartLabels();
        const span = btn.querySelector('span');
        if (span) span.textContent = text;
        else btn.textContent = text;
    }

    function restorePrimaryAddToCartLabel() {
        const btn = document.getElementById('addToCartBtn');
        if (!btn) return;
        const def = btn.dataset.defaultLabel || ADD_TO_CART_DEFAULT;
        setPrimaryAddToCartLabel(def);
    }

    /**
     * @param {boolean} enabled
     * @param {{ reason?: 'out'|'incomplete'|null }} [options]
     */
    function syncCartCtaState(enabled, options = {}) {
        const reason = options.reason || null;
        ['addToCartBtn', 'buyNowBtn', 'stickyAddToCartBtn', 'stickyBuyNowBtn'].forEach((id) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.disabled = !enabled;
            btn.style.opacity = enabled ? '' : '0.55';
            btn.style.cursor = enabled ? '' : 'not-allowed';
            btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        });

        if (!enabled && reason === 'out') {
            setPrimaryAddToCartLabel(ADD_TO_CART_OUT);
        } else if (!enabled && reason === 'incomplete') {
            setPrimaryAddToCartLabel(ADD_TO_CART_SELECT);
        } else if (enabled) {
            restorePrimaryAddToCartLabel();
        }
    }

    function ensureNotifyRestockDom() {
        let btn = document.getElementById('pdpNotifyRestockBtn');
        if (btn) return btn;

        const actions = document.querySelector('.action-buttons-group');
        if (!actions) return null;

        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'pdpNotifyRestockBtn';
        btn.className = 'btn-notify-restock hidden';
        btn.innerHTML = '<i class="fa-regular fa-bell" aria-hidden="true"></i> Notify me when back in stock';
        actions.appendChild(btn);

        let modal = document.getElementById('pdpNotifyRestockModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'pdpNotifyRestockModal';
            modal.className = 'pdp-notify-modal';
            modal.hidden = true;
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-label', 'Notify when back in stock');
            modal.innerHTML = `
                <div class="pdp-notify-modal__backdrop" data-notify-close tabindex="-1"></div>
                <div class="pdp-notify-modal__panel">
                    <button type="button" class="pdp-notify-modal__close" aria-label="Close">&times;</button>
                    <h3 class="pdp-notify-modal__title">Back in stock alerts</h3>
                    <p class="pdp-notify-modal__copy">We&apos;ll email you when this variant is available again. (Placeholder — full alerts coming soon.)</p>
                    <label class="pdp-notify-modal__field">
                        <span>Email</span>
                        <input type="email" id="pdpNotifyRestockEmail" placeholder="you@example.com" autocomplete="email" />
                    </label>
                    <button type="button" class="btn-notify-restock-submit" id="pdpNotifyRestockSubmit">Notify me</button>
                </div>`;
            document.body.appendChild(modal);
        }

        if (!notifyBound) {
            notifyBound = true;
            btn.addEventListener('click', () => openNotifyRestockModal());
            modal.querySelector('.pdp-notify-modal__close')?.addEventListener('click', closeNotifyRestockModal);
            modal.querySelector('[data-notify-close]')?.addEventListener('click', closeNotifyRestockModal);
            modal.querySelector('#pdpNotifyRestockSubmit')?.addEventListener('click', () => {
                if (typeof global.showToast === 'function') {
                    global.showToast('Thanks — we\'ll notify you when this item is back in stock.', 'success');
                }
                closeNotifyRestockModal();
            });
        }

        return btn;
    }

    function openNotifyRestockModal() {
        ensureNotifyRestockDom();
        const modal = document.getElementById('pdpNotifyRestockModal');
        if (!modal) return;
        modal.hidden = false;
        document.body.classList.add('pdp-notify-open');
        modal.querySelector('#pdpNotifyRestockEmail')?.focus();
    }

    function closeNotifyRestockModal() {
        const modal = document.getElementById('pdpNotifyRestockModal');
        if (!modal) return;
        modal.hidden = true;
        document.body.classList.remove('pdp-notify-open');
    }

    function setNotifyRestockVisible(visible) {
        const btn = ensureNotifyRestockDom();
        if (!btn) return;
        btn.classList.toggle('hidden', !visible);
        if (!visible) closeNotifyRestockModal();
    }

    function buildSelectionHint(missingGroupNames) {
        const names = (missingGroupNames || []).filter(Boolean);
        if (!names.length) return '';
        if (names.length === 1) return `Please select ${names[0]}.`;
        return `Please select: ${names.join(', ')}.`;
    }

    function getMissingMatrixGroups(matrixVariants, selectedAttrs) {
        const VU = global.VariantUtils;
        const groups = VU && VU.extractAttributeGroups
            ? VU.extractAttributeGroups(matrixVariants)
            : [];
        return groups
            .filter((g) => !selectedAttrs[g.name])
            .map((g) => g.name);
    }

    global.PdpVariantStock = {
        DEFAULT_LOW_STOCK_THRESHOLD,
        resolveEntityStock,
        getLowStockThreshold,
        classifyStockLevel,
        formatStockBadgeText,
        applyStockBadgeToElement,
        paintStockBadge,
        syncCartCtaState,
        setNotifyRestockVisible,
        openNotifyRestockModal,
        closeNotifyRestockModal,
        buildSelectionHint,
        getMissingMatrixGroups,
        ADD_TO_CART_OUT,
        ADD_TO_CART_SELECT
    };
})(typeof window !== 'undefined' ? window : globalThis);
