/**
 * Shared coupon / promo UI helpers for cart and checkout.
 * Uses localStorage key `appliedCoupon` — same as existing checkout flow.
 */
(function initCouponUiModule(global) {
    const STORAGE_KEY = 'appliedCoupon';

    function getAppliedCoupon() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
        } catch (_) {
            return null;
        }
    }

    function setAppliedCoupon(data) {
        if (!data) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function roundMoney(value) {
        return Math.round((Number(value) || 0) * 100) / 100;
    }

    function formatDiscountTypeHint(data = {}) {
        if (data.discountType === 'percentage') {
            return `${Number(data.discountValue) || 0}% off`;
        }
        if (data.discountType === 'flat') {
            return `৳${Number(data.discountValue) || 0} off`;
        }
        return '';
    }

    function formatSuccessMessage(data = {}) {
        const saved = roundMoney(data.discountAmount);
        const hint = formatDiscountTypeHint(data);
        return hint
            ? `Promo code applied! You saved ৳${saved} (${hint})`
            : `Promo code applied! You saved ৳${saved}`;
    }

    function setCouponFeedback(msgEl, message, type) {
        if (!msgEl) return;
        const text = String(message || '').trim();
        msgEl.textContent = text;
        msgEl.style.display = text ? 'block' : 'none';
        msgEl.classList.remove('is-success', 'is-error', 'is-warning');
        if (text && type) msgEl.classList.add(`is-${type}`);
    }

    async function checkActiveCoupons() {
        try {
            const res = await fetch('/api/coupons/active-check', { cache: 'no-store' });
            if (!res.ok) return false;
            const data = await res.json();
            return Boolean(data && data.hasActiveCoupon === true);
        } catch (_) {
            return false;
        }
    }

    async function applyCouponRequest({ code, subtotal, token }) {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch('/api/coupons/apply', {
            method: 'POST',
            headers,
            body: JSON.stringify({ code, subtotal })
        });

        const result = await res.json();
        return { ok: res.ok && result.success, status: res.status, result };
    }

    function subtotalsMatch(a, b) {
        return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
    }

    function buildAppliedCouponPayload(apiData = {}) {
        return {
            code: apiData.code,
            discountAmount: apiData.discountAmount,
            subtotal: apiData.subtotal,
            finalTotal: apiData.finalTotal,
            discountType: apiData.discountType,
            discountValue: apiData.discountValue
        };
    }

    /**
     * Returns merchandise payable after discount (subtotal - discount).
     * Clears stale coupon when subtotal no longer matches.
     */
    function resolveMerchandisePayable(subtotal, couponsAvailable = true) {
        const normalizedSubtotal = roundMoney(subtotal);
        if (!couponsAvailable) {
            const applied = getAppliedCoupon();
            if (applied) setAppliedCoupon(null);
            return normalizedSubtotal;
        }

        const applied = getAppliedCoupon();
        if (
            applied
            && applied.code
            && Number(applied.discountAmount) > 0
            && subtotalsMatch(applied.subtotal, normalizedSubtotal)
        ) {
            return roundMoney(applied.finalTotal);
        }

        if (applied && !subtotalsMatch(applied.subtotal, normalizedSubtotal)) {
            setAppliedCoupon(null);
        }

        return normalizedSubtotal;
    }

    function getAppliedDiscountAmount(subtotal, couponsAvailable = true) {
        const normalizedSubtotal = roundMoney(subtotal);
        const payable = resolveMerchandisePayable(normalizedSubtotal, couponsAvailable);
        return roundMoney(Math.max(0, normalizedSubtotal - payable));
    }

    /**
     * Sync coupon panel UI (input state, discount row, feedback, buttons).
     */
    function syncCouponPanel(config = {}) {
        const {
            prefix = 'checkout',
            subtotal = 0,
            couponsAvailable = true,
            preserveFeedback = false
        } = config;

        const container = document.getElementById(`${prefix}-coupon-container`);
        const discountRow = document.getElementById(`${prefix}DiscountRow`);
        const discountEl = document.getElementById(`${prefix}DiscountAmount`);
        const codeLabel = document.getElementById(`${prefix}CouponCodeLabel`);
        const msgEl = document.getElementById(`${prefix}CouponFeedbackMsg`)
            || document.getElementById(`${prefix}CouponAppliedMsg`);
        const removeBtn = document.getElementById(`${prefix}RemoveCouponBtn`);
        const applyBtn = document.getElementById(`${prefix}ApplyCouponBtn`);
        const input = document.getElementById(`${prefix}CouponInput`);

        if (!couponsAvailable) {
            if (container) container.style.display = 'none';
            setAppliedCoupon(null);
            if (discountRow) discountRow.style.display = 'none';
            if (!preserveFeedback) setCouponFeedback(msgEl, '', null);
            if (removeBtn) removeBtn.style.display = 'none';
            if (applyBtn) applyBtn.style.display = 'none';
            if (input) {
                input.value = '';
                input.disabled = false;
            }
            return { merchandisePayable: roundMoney(subtotal), discountAmount: 0, applied: null };
        }

        if (container) container.style.display = 'block';

        const applied = getAppliedCoupon();
        const normalizedSubtotal = roundMoney(subtotal);
        const isValidApplied = applied
            && applied.code
            && Number(applied.discountAmount) > 0
            && subtotalsMatch(applied.subtotal, normalizedSubtotal);

        if (isValidApplied) {
            const typeHint = formatDiscountTypeHint(applied);
            if (discountRow) discountRow.style.display = 'flex';
            if (discountEl) discountEl.textContent = `-৳${roundMoney(applied.discountAmount)}`;
            if (codeLabel) {
                codeLabel.textContent = typeHint ? `${applied.code} · ${typeHint}` : applied.code;
            }
            if (!preserveFeedback) {
                setCouponFeedback(msgEl, formatSuccessMessage(applied), 'success');
            }
            if (removeBtn) removeBtn.style.display = 'inline-flex';
            if (applyBtn) applyBtn.style.display = 'none';
            if (input) {
                input.value = applied.code;
                input.disabled = true;
            }
            if (container) container.classList.add('has-applied-coupon');

            return {
                merchandisePayable: roundMoney(applied.finalTotal),
                discountAmount: roundMoney(applied.discountAmount),
                applied
            };
        }

        if (applied && !subtotalsMatch(applied.subtotal, normalizedSubtotal)) {
            setAppliedCoupon(null);
        }

        if (discountRow) discountRow.style.display = 'none';
        if (!preserveFeedback) setCouponFeedback(msgEl, '', null);
        if (removeBtn) removeBtn.style.display = 'none';
        if (applyBtn) applyBtn.style.display = 'inline-flex';
        if (input && !getAppliedCoupon()) {
            input.disabled = false;
        }
        if (container) container.classList.remove('has-applied-coupon');

        return { merchandisePayable: normalizedSubtotal, discountAmount: 0, applied: null };
    }

    async function bindCouponForm(config = {}) {
        const {
            prefix = 'checkout',
            getSubtotal,
            getToken,
            onTotalsChange,
            onAvailabilityChange
        } = config;

        const container = document.getElementById(`${prefix}-coupon-container`);
        const applyBtn = document.getElementById(`${prefix}ApplyCouponBtn`);
        const removeBtn = document.getElementById(`${prefix}RemoveCouponBtn`);
        const input = document.getElementById(`${prefix}CouponInput`);
        const msgEl = document.getElementById(`${prefix}CouponFeedbackMsg`)
            || document.getElementById(`${prefix}CouponAppliedMsg`);

        if (!container) return { couponsAvailable: false };

        let couponsAvailable = await checkActiveCoupons();
        if (typeof onAvailabilityChange === 'function') {
            onAvailabilityChange(couponsAvailable);
        }

        if (!couponsAvailable) {
            container.style.display = 'none';
            setAppliedCoupon(null);
            return { couponsAvailable: false };
        }

        container.style.display = 'block';

        const refreshTotals = () => {
            const subtotal = typeof getSubtotal === 'function' ? getSubtotal() : 0;
            syncCouponPanel({ prefix, subtotal, couponsAvailable });
            if (typeof onTotalsChange === 'function') onTotalsChange(subtotal);
        };

        refreshTotals();

        if (applyBtn) {
            applyBtn.addEventListener('click', async () => {
                if (!couponsAvailable) {
                    setCouponFeedback(msgEl, 'No active promo codes right now.', 'warning');
                    return;
                }

                const code = (input?.value || '').trim().toUpperCase();
                if (!code) {
                    setCouponFeedback(msgEl, 'Please enter a promo code.', 'warning');
                    return;
                }

                const subtotal = typeof getSubtotal === 'function' ? getSubtotal() : 0;
                if (subtotal <= 0) {
                    setCouponFeedback(msgEl, 'Add items to your cart first.', 'warning');
                    return;
                }

                applyBtn.disabled = true;
                applyBtn.textContent = 'Applying...';

                try {
                    const { ok, result } = await applyCouponRequest({
                        code,
                        subtotal,
                        token: typeof getToken === 'function' ? getToken() : null
                    });

                    if (ok && result.data) {
                        setAppliedCoupon(buildAppliedCouponPayload(result.data));
                        setCouponFeedback(msgEl, formatSuccessMessage(result.data), 'success');
                        refreshTotals();
                    } else {
                        setCouponFeedback(
                            msgEl,
                            result.message || 'Invalid or expired coupon',
                            'error'
                        );
                    }
                } catch (_) {
                    setCouponFeedback(msgEl, 'Could not apply promo code. Try again.', 'error');
                } finally {
                    applyBtn.disabled = false;
                    applyBtn.textContent = 'Apply';
                }
            });
        }

        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                setAppliedCoupon(null);
                if (input) {
                    input.value = '';
                    input.disabled = false;
                }
                setCouponFeedback(msgEl, 'Promo code removed.', 'warning');
                refreshTotals();
                setTimeout(() => {
                    if (!getAppliedCoupon()) setCouponFeedback(msgEl, '', null);
                }, 2200);
            });
        }

        if (input) {
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    applyBtn?.click();
                }
            });
            input.addEventListener('input', () => {
                if (!getAppliedCoupon()) setCouponFeedback(msgEl, '', null);
            });
        }

        return {
            couponsAvailable,
            refreshTotals,
            async recheckAvailability() {
                couponsAvailable = await checkActiveCoupons();
                if (typeof onAvailabilityChange === 'function') {
                    onAvailabilityChange(couponsAvailable);
                }
                if (!couponsAvailable) {
                    container.style.display = 'none';
                    setAppliedCoupon(null);
                }
                refreshTotals();
                return couponsAvailable;
            }
        };
    }

    global.CouponUI = {
        getAppliedCoupon,
        setAppliedCoupon,
        roundMoney,
        formatDiscountTypeHint,
        formatSuccessMessage,
        setCouponFeedback,
        checkActiveCoupons,
        applyCouponRequest,
        buildAppliedCouponPayload,
        subtotalsMatch,
        resolveMerchandisePayable,
        getAppliedDiscountAmount,
        syncCouponPanel,
        bindCouponForm
    };
})(window);
