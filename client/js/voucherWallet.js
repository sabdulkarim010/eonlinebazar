/**
 * Voucher Wallet — one-click apply/remove for active storefront coupons.
 */
(function initVoucherWallet(global) {
    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatExpiry(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function formatOffer(voucher) {
        if (voucher.discountType === 'percentage') {
            return `${Number(voucher.discountValue) || 0}% off`;
        }
        if (voucher.discountType === 'flat') {
            return `৳${Number(voucher.discountValue) || 0} off`;
        }
        return 'Special offer';
    }

    function buildWalletCard(voucher, appliedCode) {
        const code = String(voucher.code || '').toUpperCase();
        const isApplied = appliedCode && appliedCode === code;
        const eligible = voucher.eligible === true;
        const savings = Number(voucher.estimatedSavings) || 0;
        const minOrder = Number(voucher.minOrderAmount) || 0;
        const expiry = formatExpiry(voucher.expiryDate);

        let statusClass = eligible ? 'is-eligible' : 'is-ineligible';
        if (isApplied) statusClass = 'is-applied';

        const actionBtn = isApplied
            ? `<button type="button" class="voucher-wallet__btn voucher-wallet__btn--remove" data-voucher-action="remove" data-code="${escapeHtml(code)}">Remove</button>`
            : `<button type="button" class="voucher-wallet__btn voucher-wallet__btn--apply" data-voucher-action="apply" data-code="${escapeHtml(code)}" ${eligible ? '' : 'disabled'}>Apply</button>`;

        const savingsLine = savings > 0
            ? `<p class="voucher-wallet__savings">Save ${global.EOBOrderQuote?.formatMoneyBdt?.(savings) || `৳${savings}`} on this order</p>`
            : '';

        const minLine = minOrder > 0
            ? `<p class="voucher-wallet__meta">Min. order ৳${minOrder.toLocaleString('en-US')}</p>`
            : '';

        const reason = !eligible && voucher.ineligibilityReason
            ? `<p class="voucher-wallet__reason" role="status">${escapeHtml(voucher.ineligibilityReason)}</p>`
            : '';

        const expiryLine = expiry
            ? `<p class="voucher-wallet__meta">Expires ${escapeHtml(expiry)}</p>`
            : '';

        return `
            <article class="voucher-wallet__card ${statusClass}" data-voucher-code="${escapeHtml(code)}">
                <div class="voucher-wallet__head">
                    <span class="voucher-wallet__code">${escapeHtml(code)}</span>
                    <span class="voucher-wallet__offer">${escapeHtml(formatOffer(voucher))}</span>
                </div>
                ${savingsLine}
                ${minLine}
                ${expiryLine}
                ${reason}
                <div class="voucher-wallet__actions">${actionBtn}</div>
            </article>
        `;
    }

    async function fetchWalletVouchers({ subtotal, token, cartItems }) {
        const headers = {
            Accept: 'application/json',
            'Content-Type': 'application/json'
        };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch('/api/coupons/wallet', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                subtotal: Number(subtotal) || 0,
                cartItems: Array.isArray(cartItems) ? cartItems : []
            })
        });

        const payload = await res.json();
        if (!res.ok || !payload.success) {
            return { vouchers: [], message: payload.message || '' };
        }
        return { vouchers: payload.data?.vouchers || payload.vouchers || [] };
    }

    function createVoucherWallet(config = {}) {
        const {
            rootId,
            prefix = 'checkout',
            getSubtotal,
            getCartItems,
            getToken,
            onApplied,
            onRemoved,
            feedbackElId
        } = config;

        const root = document.getElementById(rootId);
        if (!root) return { refresh: () => {}, destroy: () => {} };

        root.setAttribute('role', 'region');
        root.setAttribute('aria-label', 'Voucher wallet');

        let refreshTimer = null;

        async function refreshWallet() {
            const subtotal = typeof getSubtotal === 'function' ? getSubtotal() : 0;
            if (subtotal <= 0) {
                root.innerHTML = '<p class="voucher-wallet__empty">Add items to see available vouchers.</p>';
                return;
            }

            root.setAttribute('aria-busy', 'true');
            root.innerHTML = '<p class="voucher-wallet__loading">Loading vouchers…</p>';

            try {
                const { vouchers } = await fetchWalletVouchers({
                    subtotal,
                    token: typeof getToken === 'function' ? getToken() : '',
                    cartItems: typeof getCartItems === 'function' ? getCartItems() : []
                });

                const applied = global.CouponUI?.getAppliedCoupon?.() || null;
                const appliedCode = applied?.code ? String(applied.code).toUpperCase() : '';

                if (!vouchers.length) {
                    root.innerHTML = '<p class="voucher-wallet__empty">No public vouchers right now. You can still enter a code below.</p>';
                    return;
                }

                root.innerHTML = `
                    <h3 class="voucher-wallet__title"><i class="fa-solid fa-wallet" aria-hidden="true"></i> Voucher wallet</h3>
                    <div class="voucher-wallet__list">${vouchers.map((v) => buildWalletCard(v, appliedCode)).join('')}</div>
                `;
            } catch (_) {
                root.innerHTML = '<p class="voucher-wallet__empty">Could not load vouchers. Try again shortly.</p>';
            } finally {
                root.removeAttribute('aria-busy');
            }
        }

        function scheduleRefresh() {
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => {
                refreshTimer = null;
                refreshWallet();
            }, 300);
        }

        async function applyCode(code) {
            const subtotal = typeof getSubtotal === 'function' ? getSubtotal() : 0;
            const msgEl = feedbackElId ? document.getElementById(feedbackElId) : null;
            if (!code || subtotal <= 0) return;

            const { ok, result } = await global.CouponUI.applyCouponRequest({
                code,
                subtotal,
                token: typeof getToken === 'function' ? getToken() : null
            });

            if (ok && result.data) {
                global.CouponUI.setAppliedCoupon(global.CouponUI.buildAppliedCouponPayload(result.data));
                global.CouponUI.setCouponFeedback(msgEl, global.CouponUI.formatSuccessMessage(result.data), 'success');
                if (typeof onApplied === 'function') onApplied(result.data);
                await refreshWallet();
                return;
            }

            global.CouponUI.setCouponFeedback(
                msgEl,
                result?.message || 'This voucher cannot be applied.',
                'error'
            );
        }

        function removeCode() {
            const msgEl = feedbackElId ? document.getElementById(feedbackElId) : null;
            global.CouponUI.setAppliedCoupon(null);
            global.CouponUI.setCouponFeedback(msgEl, 'Voucher removed.', 'warning');
            if (typeof onRemoved === 'function') onRemoved();
            setTimeout(() => {
                if (!global.CouponUI.getAppliedCoupon()) {
                    global.CouponUI.setCouponFeedback(msgEl, '', null);
                }
            }, 2000);
            refreshWallet();
        }

        root.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-voucher-action]');
            if (!btn || !root.contains(btn)) return;
            const action = btn.getAttribute('data-voucher-action');
            const code = btn.getAttribute('data-code');
            if (action === 'apply') applyCode(code);
            if (action === 'remove') removeCode();
        });

        refreshWallet();

        return {
            refresh: refreshWallet,
            scheduleRefresh,
            destroy: () => {
                if (refreshTimer) clearTimeout(refreshTimer);
            }
        };
    }

    global.EOBVoucherWallet = {
        createVoucherWallet,
        fetchWalletVouchers,
        buildWalletCard
    };
})(window);
