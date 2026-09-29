/**
 * Server-authoritative checkout quote — POST /api/orders/quote
 */

const QUOTE_DEBOUNCE_MS = 400;
let quoteRequestTimer = null;
let quoteInFlight = null;
let quoteRequestSeq = 0;

function getCheckoutStateApi() {
    return window.EOBCheckoutState || null;
}

function buildOrderQuotePayload(overrides = {}) {
    const itemsFn = typeof getCheckoutItems === 'function' ? getCheckoutItems : () => [];
    const items = itemsFn().map((item) => {
        const payload = {
            productId: item.productId || item.id,
            quantity: Math.max(1, Number(item.quantity) || 1)
        };
        const vid = item.variantId != null ? String(item.variantId).trim() : '';
        if (vid) payload.variantId = vid;
        return payload;
    });

    const district = overrides.district
        || (typeof selectedShippingDistrict !== 'undefined' ? selectedShippingDistrict : '')
        || document.getElementById('shippingDistrict')?.value?.trim()
        || '';

    const upazila = overrides.upazila
        || (typeof selectedShippingUpazila !== 'undefined' ? selectedShippingUpazila : '')
        || document.getElementById('shippingUpazila')?.value?.trim()
        || '';

    const applied = typeof getAppliedCoupon === 'function' ? getAppliedCoupon() : null;
    const zoneLabel = typeof resolveShippingZoneLabel === 'function'
        ? resolveShippingZoneLabel()
        : '';
    const deliveryMethod = zoneLabel === 'Inside City' ? 'inside' : 'outside';

    return {
        items,
        shippingAddress: {
            district,
            upazila,
            street: document.getElementById('shippingAddress')?.value?.trim() || ''
        },
        couponCode: overrides.couponCode != null
            ? overrides.couponCode
            : (applied?.code || ''),
        deliveryMethod: overrides.deliveryMethod || deliveryMethod,
        applyWallet: typeof applyWalletAtCheckout !== 'undefined' ? applyWalletAtCheckout : false,
        applyLoyaltyPoints: typeof applyLoyaltyAtCheckout !== 'undefined' ? applyLoyaltyAtCheckout : false,
        ...overrides
    };
}

function resolvePayableFromQuoteOrSession(serverQuote, sessionData) {
    const q = normalizeActiveQuote(serverQuote);
    if (q) {
        return {
            subtotal: q.subtotal,
            discountAmount: q.discountAmount,
            deliveryCharge: q.shippingFee,
            vatAmount: q.vatAmount,
            grandTotal: q.grandTotal,
            payableAfterWallet: q.payableAfterWallet,
            source: 'server'
        };
    }
    const session = sessionData || {};
    const subtotal = Number(session.subtotal) || 0;
    const discountAmount = Number(session.discountAmount) || 0;
    const deliveryCharge = Number(session.deliveryCharge ?? session.shippingFee) || 0;
    const grandTotal = Number(session.grandTotal ?? session.totalAmount) || 0;
    const payableAfterWallet = Number(session.payableAfterWallet ?? grandTotal) || 0;
    return {
        subtotal,
        discountAmount,
        deliveryCharge,
        vatAmount: Number(session.vatAmount ?? session.taxAmount) || 0,
        grandTotal,
        payableAfterWallet,
        source: 'session'
    };
}

function syncProceedToPaymentGate() {
    const btn = document.getElementById('proceedToPaymentBtn')
        || document.getElementById('proceed-to-payment');
    if (!btn) return;
    const block = typeof isQuoteBlockingCheckout === 'function' && isQuoteBlockingCheckout();
    btn.disabled = !!block;
    btn.setAttribute('aria-disabled', block ? 'true' : 'false');
}

function normalizeActiveQuote(apiQuote) {
    if (!apiQuote || typeof apiQuote !== 'object') return null;
    const subtotal = Number(apiQuote.subtotal) || 0;
    const shippingFee = Number(apiQuote.shippingFee ?? apiQuote.deliveryCharge) || 0;
    const tax = Number(apiQuote.tax ?? apiQuote.vatAmount) || 0;
    const discountAmount = Number(apiQuote.discountAmount) || 0;
    const grandTotal = Number(apiQuote.grandTotal ?? apiQuote.payableTotal) || 0;
    const payableAfterWallet = Number(apiQuote.payableAfterWallet ?? grandTotal) || 0;

    return {
        subtotal,
        shippingFee,
        tax,
        vatAmount: tax,
        discountAmount,
        merchandisePayable: Number(apiQuote.merchandisePayable) || Math.max(0, subtotal - discountAmount),
        grandTotal,
        payableTotal: Number(apiQuote.payableTotal) || grandTotal,
        walletApplied: Number(apiQuote.walletApplied) || 0,
        payableAfterWallet,
        couponCode: apiQuote.couponCode || '',
        loyaltyDiscount: Number(apiQuote.loyaltyDiscount) || 0,
        loyaltyPointsToUse: Number(apiQuote.loyaltyPointsToUse) || 0,
        vatPercentage: Number(apiQuote.vatPercentage) || 0,
        vatEnabled: apiQuote.vatEnabled === true,
        priceTaxMode: apiQuote.priceTaxMode || '',
        taxableAmount: Number(apiQuote.taxableAmount) || 0,
        shippingLocationType: apiQuote.shippingLocationType || '',
        estimatedDelivery: apiQuote.estimatedDelivery || null,
        quoteGeneratedAt: apiQuote.quoteGeneratedAt || null
    };
}

function setActiveQuote(quote, meta = {}) {
    const stateApi = getCheckoutStateApi();
    const normalized = normalizeActiveQuote(quote);
    if (stateApi) {
        stateApi.set('activeQuote', normalized);
        stateApi.set('quoteMeta', {
            source: meta.source || 'server',
            fallback: meta.fallback === true,
            error: meta.error || null,
            itemErrors: meta.itemErrors || [],
            valid: meta.valid !== false && normalized != null
        });
    }
    if (typeof window !== 'undefined') {
        window.__activeOrderQuote = normalized;
    }
    return normalized;
}

function getActiveQuote() {
    const stateApi = getCheckoutStateApi();
    if (stateApi) return stateApi.get('activeQuote');
    return window.__activeOrderQuote || null;
}

function isQuoteBlockingCheckout() {
    const stateApi = getCheckoutStateApi();
    const meta = stateApi ? stateApi.get('quoteMeta') : null;
    if (!meta) return false;
    return meta.valid === false || (Array.isArray(meta.itemErrors) && meta.itemErrors.length > 0);
}

function applyQuotedLinePricesToCart(quotedItems) {
    if (!Array.isArray(quotedItems) || quotedItems.length === 0) return;
    const list = typeof getCheckoutItems === 'function' ? getCheckoutItems() : [];
    if (!list.length) return;

    quotedItems.forEach((row) => {
        const pid = row.productId || row.id;
        const vid = String(row.variantId || '');
        const match = list.find((item) =>
            String(item.productId || item.id) === String(pid)
            && String(item.variantId || '') === vid
        );
        if (match && Number.isFinite(Number(row.price))) {
            match.price = Number(row.price);
        }
    });
}

function renderTotalsFromActiveQuote(quote) {
    const q = quote || getActiveQuote();
    if (!q) return null;

    const subtotalText = document.getElementById('checkoutSubtotal');
    const deliveryChargeEl = document.getElementById('checkoutDeliveryCharge');
    const freeShippingBadge = document.getElementById('checkoutFreeShippingBadge');
    const grandTotalText = document.getElementById('checkoutGrandTotal');
    const discountRow = document.getElementById('checkoutDiscountRow');
    const discountAmountEl = document.getElementById('checkoutDiscountAmount');
    const couponLabel = document.getElementById('checkoutCouponCodeLabel');
    const vatRow = document.getElementById('checkoutVatRow');
    const vatAmountEl = document.getElementById('checkoutVatAmount');

    if (subtotalText) subtotalText.innerText = `৳${q.subtotal.toLocaleString('en-US')}`;
    if (deliveryChargeEl) {
        deliveryChargeEl.innerText = q.shippingFee === 0 ? '৳0' : `৳${q.shippingFee.toLocaleString('en-US')}`;
        deliveryChargeEl.style.display = q.shippingFee === 0 ? 'none' : 'inline';
    }
    if (freeShippingBadge) {
        freeShippingBadge.style.display = q.shippingFee === 0 && q.subtotal > 0 ? 'inline-flex' : 'none';
    }
    if (discountRow && discountAmountEl) {
        if (q.discountAmount > 0) {
            discountRow.style.display = 'flex';
            discountAmountEl.innerText = `-৳${q.discountAmount.toLocaleString('en-US')}`;
            if (couponLabel) couponLabel.textContent = q.couponCode || '';
        } else {
            discountRow.style.display = 'none';
        }
    }
    if (typeof window !== 'undefined' && window.EOBOrderQuote?.applyOrderSummaryLines) {
        window.EOBOrderQuote.applyOrderSummaryLines(document, 'checkout', q);
    } else if (vatRow && vatAmountEl) {
        if (q.vatAmount > 0) {
            vatRow.style.display = 'flex';
            vatAmountEl.innerText = `৳${q.vatAmount.toLocaleString('en-US')}`;
        } else {
            vatRow.style.display = 'none';
        }
    }
    if (grandTotalText) {
        grandTotalText.innerText = `৳${q.grandTotal.toLocaleString('en-US')}`;
    }

    let walletSummary = { walletApplied: q.walletApplied, payableTotal: q.payableAfterWallet };
    if (typeof renderCheckoutWalletSummary === 'function') {
        walletSummary = renderCheckoutWalletSummary(q.grandTotal);
    }

    if (typeof renderCheckoutLoyaltySummary === 'function') {
        renderCheckoutLoyaltySummary(q.merchandisePayable);
    }

    if (typeof updateCheckoutDeliveryEstimate === 'function') {
        updateCheckoutDeliveryEstimate(q.subtotal);
    }

    return {
        subtotal: q.subtotal,
        merchandisePayable: q.merchandisePayable,
        deliveryCharge: q.shippingFee,
        vatAmount: q.vatAmount,
        grandTotal: q.grandTotal,
        walletApplied: walletSummary.walletApplied,
        payableTotal: walletSummary.payableTotal,
        loyaltyDiscount: q.loyaltyDiscount,
        discountAmount: q.discountAmount
    };
}

function showQuoteUserNotice(message, type = 'warning') {
    if (typeof showCouponToast === 'function') {
        showCouponToast(message, type === 'error' ? 'error' : 'warning');
        return;
    }
    if (typeof openCheckoutAlertModal === 'function') {
        openCheckoutAlertModal(message);
    }
}

async function fetchOrderQuote(options = {}) {
    const payload = buildOrderQuotePayload(options);
    if (!payload.items.length) {
        setActiveQuote(null, { valid: false, error: 'empty_cart' });
        return null;
    }

    if (typeof window !== 'undefined' && window.EOBSkeletons?.setCheckoutSummarySkeleton) {
        window.EOBSkeletons.setCheckoutSummarySkeleton(true);
    }

    try {
        const token = typeof getCheckoutAuthToken === 'function' ? getCheckoutAuthToken() : '';
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const seq = ++quoteRequestSeq;
        const response = await fetch('/api/orders/quote', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        let data = {};
        try {
            data = await response.json();
        } catch (_) {
            data = {};
        }

        if (seq !== quoteRequestSeq) {
            return getActiveQuote();
        }

        if (!response.ok || !data.success) {
            setActiveQuote(null, {
                valid: false,
                fallback: true,
                error: data.message || 'quote_failed',
                itemErrors: data.itemErrors || []
            });
            if (typeof updateCheckoutTotalsClient === 'function') {
                const sub = typeof getCheckoutSubtotal === 'function' ? getCheckoutSubtotal() : 0;
                updateCheckoutTotalsClient(sub);
            }
            syncProceedToPaymentGate();
            if (options.silent !== true) {
                const isStock = data.code === 'ITEM_UNAVAILABLE' || (data.itemErrors && data.itemErrors.length);
                showQuoteUserNotice(
                    data.message || 'Could not refresh pricing from the server. Showing estimated totals.',
                    isStock ? 'error' : 'warning'
                );
            }
            return null;
        }

        const quote = setActiveQuote(data.data, { valid: true, fallback: false });
        if (Array.isArray(data.items)) {
            applyQuotedLinePricesToCart(data.items);
        }
        if (typeof renderTotalsFromActiveQuote === 'function') {
            renderTotalsFromActiveQuote(quote);
        }
        syncProceedToPaymentGate();
        return quote;
    } finally {
        if (typeof window !== 'undefined' && window.EOBSkeletons?.setCheckoutSummarySkeleton) {
            window.EOBSkeletons.setCheckoutSummarySkeleton(false);
        }
    }
}

function requestOrderQuoteRefresh(options = {}) {
    if (quoteRequestTimer) clearTimeout(quoteRequestTimer);
    quoteRequestTimer = setTimeout(() => {
        quoteRequestTimer = null;
        if (quoteInFlight) return;
        quoteInFlight = fetchOrderQuote(options)
            .catch(() => null)
            .finally(() => {
                quoteInFlight = null;
            });
    }, options.immediate ? 0 : QUOTE_DEBOUNCE_MS);
}

async function refreshOrderQuoteNow(options = {}) {
    if (quoteRequestTimer) {
        clearTimeout(quoteRequestTimer);
        quoteRequestTimer = null;
    }
    return fetchOrderQuote(options);
}

const quoteExports = {
    buildOrderQuotePayload,
    normalizeActiveQuote,
    resolvePayableFromQuoteOrSession,
    syncProceedToPaymentGate,
    setActiveQuote,
    getActiveQuote,
    isQuoteBlockingCheckout,
    fetchOrderQuote,
    requestOrderQuoteRefresh,
    refreshOrderQuoteNow,
    renderTotalsFromActiveQuote,
    applyQuotedLinePricesToCart
};

if (typeof window !== 'undefined') {
    Object.assign(window, quoteExports);
}

export {
    buildOrderQuotePayload,
    normalizeActiveQuote,
    resolvePayableFromQuoteOrSession,
    syncProceedToPaymentGate,
    setActiveQuote,
    getActiveQuote,
    isQuoteBlockingCheckout,
    fetchOrderQuote,
    requestOrderQuoteRefresh,
    refreshOrderQuoteNow,
    renderTotalsFromActiveQuote
};
