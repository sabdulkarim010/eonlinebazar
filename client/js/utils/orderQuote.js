/**
 * Shared order-quote summary helpers (tax labels, summary DOM) for cart & checkout.
 */
(function initOrderQuoteUtils(global) {
    function roundMoney(value) {
        return Math.round((Number(value) || 0) * 100) / 100;
    }

    function formatMoneyBdt(amount) {
        const n = roundMoney(amount);
        return `৳${n.toLocaleString('en-US')}`;
    }

    /**
     * Human-readable VAT/tax line label aligned with backend taxSettings priceTaxMode.
     * @param {object} quote normalized quote or API payload
     * @returns {{ show: boolean, label: string, amount: number, policyNote: string }}
     */
    function formatTaxLineLabel(quote) {
        const q = quote || {};
        const amount = roundMoney(Number(q.vatAmount ?? q.tax) || 0);
        const pctRaw = Number(q.vatPercentage ?? q.vatRate) || 0;
        const pctLabel = pctRaw > 0 ? `${pctRaw % 1 === 0 ? pctRaw : pctRaw.toFixed(1)}%` : '';
        const mode = String(q.priceTaxMode || '').toUpperCase();
        const vatEnabled = q.vatEnabled === true;

        if (amount <= 0 && !vatEnabled) {
            return { show: false, label: '', amount: 0, policyNote: '' };
        }

        if (amount <= 0) {
            return { show: false, label: '', amount: 0, policyNote: '' };
        }

        let label;
        let policyNote;
        if (mode === 'INCLUSIVE') {
            label = pctLabel ? `VAT (${pctLabel} included)` : 'VAT (included in prices)';
            policyNote = 'Product prices include VAT where applicable.';
        } else if (mode === 'EXCLUSIVE') {
            label = pctLabel ? `Calculated tax (${pctLabel})` : 'Calculated tax';
            policyNote = 'Tax is calculated on your order subtotal after discounts.';
        } else {
            label = pctLabel ? `VAT / Tax (${pctLabel})` : 'VAT / Tax';
            policyNote = '';
        }

        return { show: true, label, amount, policyNote };
    }

    function resolveSummaryElementIds(prefix) {
        const p = String(prefix || 'checkout');
        if (p === 'checkout') {
            return {
                vatRow: 'checkoutVatRow',
                vatLabel: 'checkoutVatLabel',
                vatAmount: 'checkoutVatAmount',
                discountRow: 'checkoutDiscountRow',
                discountAmount: 'checkoutDiscountAmount',
                couponLabel: 'checkoutCouponCodeLabel',
                grandTotal: 'checkoutGrandTotal'
            };
        }
        return {
            vatRow: 'cartVatRow',
            vatLabel: 'cartVatLabel',
            vatAmount: 'cartVatAmount',
            discountRow: 'cartDiscountRow',
            discountAmount: 'cartDiscountAmount',
            couponLabel: 'cartCouponCodeLabel',
            grandTotal: 'cartGrandTotalAmount'
        };
    }

    /**
     * Update tax + discount summary rows from a server quote.
     * @param {Document} doc
     * @param {string} prefix 'checkout' | 'cart'
     * @param {object} quote
     */
    function applyOrderSummaryLines(doc, prefix, quote) {
        const documentRef = doc || (typeof document !== 'undefined' ? document : null);
        if (!documentRef || !quote) return null;

        const ids = resolveSummaryElementIds(prefix);
        const taxLine = formatTaxLineLabel(quote);
        const vatRow = documentRef.getElementById(ids.vatRow);
        const vatLabelEl = documentRef.getElementById(ids.vatLabel);
        const vatAmountEl = documentRef.getElementById(ids.vatAmount);

        if (vatRow && vatAmountEl) {
            if (taxLine.show) {
                vatRow.style.display = 'flex';
                vatAmountEl.textContent = formatMoneyBdt(taxLine.amount);
                if (vatLabelEl) {
                    vatLabelEl.textContent = taxLine.label;
                    if (taxLine.policyNote) {
                        vatRow.setAttribute('title', taxLine.policyNote);
                        vatLabelEl.setAttribute('aria-description', taxLine.policyNote);
                    }
                } else {
                    const span = vatRow.querySelector('span');
                    if (span) span.textContent = `${taxLine.label}:`;
                }
            } else {
                vatRow.style.display = 'none';
            }
        }

        const discountRow = documentRef.getElementById(ids.discountRow);
        const discountAmountEl = documentRef.getElementById(ids.discountAmount);
        const couponLabel = documentRef.getElementById(ids.couponLabel);
        const discountAmount = roundMoney(Number(quote.discountAmount) || 0);

        if (discountRow && discountAmountEl) {
            if (discountAmount > 0) {
                discountRow.style.display = 'flex';
                discountAmountEl.textContent = `-${formatMoneyBdt(discountAmount)}`;
                if (couponLabel) {
                    couponLabel.textContent = quote.couponCode || '';
                }
            } else {
                discountRow.style.display = 'none';
            }
        }

        const grandEl = documentRef.getElementById(ids.grandTotal);
        if (grandEl && Number.isFinite(Number(quote.grandTotal))) {
            grandEl.textContent = formatMoneyBdt(quote.grandTotal);
        }

        return {
            taxLine,
            discountAmount,
            grandTotal: roundMoney(Number(quote.grandTotal) || 0)
        };
    }

    let cartQuoteTimer = null;
    let cartQuoteSeq = 0;

    function buildCartQuoteItemsFromLines(lines) {
        return (Array.isArray(lines) ? lines : []).map((item) => {
            const payload = {
                productId: item.productId || item.id,
                quantity: Math.max(1, Number(item.quantity) || 1)
            };
            const vid = item.variantId != null ? String(item.variantId).trim() : '';
            if (vid) payload.variantId = vid;
            return payload;
        }).filter((row) => row.productId);
    }

    /**
     * Debounced cart page quote preview (POST /api/orders/quote).
     */
    function scheduleCartQuotePreview(options = {}) {
        if (typeof fetch !== 'function') return;
        const {
            getSelectedLines,
            getToken,
            getAppliedCouponCode,
            onQuote,
            debounceMs = 450
        } = options;

        if (cartQuoteTimer) clearTimeout(cartQuoteTimer);
        cartQuoteTimer = setTimeout(async () => {
            cartQuoteTimer = null;
            const seq = ++cartQuoteSeq;
            const lines = typeof getSelectedLines === 'function' ? getSelectedLines() : [];
            const items = buildCartQuoteItemsFromLines(lines);
            if (!items.length) {
                if (typeof onQuote === 'function') onQuote(null);
                return;
            }

            const headers = { 'Content-Type': 'application/json' };
            const token = typeof getToken === 'function' ? getToken() : '';
            if (token) headers.Authorization = `Bearer ${token}`;

            const couponCode = typeof getAppliedCouponCode === 'function' ? getAppliedCouponCode() : '';

            try {
                const res = await fetch('/api/orders/quote', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        items,
                        couponCode: couponCode || '',
                        shippingAddress: { district: '', upazila: '', street: '' },
                        deliveryMethod: 'outside'
                    })
                });
                const payload = await res.json();
                if (seq !== cartQuoteSeq) return;
                if (!res.ok || !payload.success) {
                    if (typeof onQuote === 'function') onQuote(null);
                    return;
                }
                const quote = payload.data || payload.quote || null;
                if (typeof onQuote === 'function') onQuote(quote);
            } catch (_) {
                if (seq === cartQuoteSeq && typeof onQuote === 'function') onQuote(null);
            }
        }, debounceMs);
    }

    const api = {
        roundMoney,
        formatMoneyBdt,
        formatTaxLineLabel,
        applyOrderSummaryLines,
        resolveSummaryElementIds,
        buildCartQuoteItemsFromLines,
        scheduleCartQuotePreview
    };

    global.EOBOrderQuote = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : global);
