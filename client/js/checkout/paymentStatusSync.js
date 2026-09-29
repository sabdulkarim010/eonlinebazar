/**
 * Payment gateway / COD outcome state machine for storefront checkout.
 */

export const PaymentFlowStatus = Object.freeze({
    COD_PENDING: 'COD_PENDING',
    GATEWAY_INITIATED: 'GATEWAY_INITIATED',
    GATEWAY_VERIFYING: 'GATEWAY_VERIFYING',
    PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    PAYMENT_CANCELLED: 'PAYMENT_CANCELLED'
});

const TERMINAL = new Set([
    PaymentFlowStatus.PAYMENT_SUCCESS,
    PaymentFlowStatus.PAYMENT_FAILED,
    PaymentFlowStatus.PAYMENT_CANCELLED
]);

function getStateApi() {
    return typeof window !== 'undefined' ? window.EOBCheckoutState : null;
}

export function setPaymentFlowStatus(status, meta = {}) {
    const api = getStateApi();
    if (api) {
        api.set('paymentFlowStatus', status);
        api.set('paymentFlowMeta', { ...(meta || {}), updatedAt: Date.now() });
    }
    if (typeof window !== 'undefined') {
        window.__paymentFlowStatus = status;
        window.__paymentFlowMeta = meta;
    }
    return status;
}

export function getPaymentFlowStatus() {
    const api = getStateApi();
    return api?.get('paymentFlowStatus') || (typeof window !== 'undefined' ? window.__paymentFlowStatus : null);
}

export function mapVerifyResponseToStatus(data = {}, methodType = '') {
    const phase = String(data.phase || '').toUpperCase();
    if (phase && PaymentFlowStatus[phase]) {
        return PaymentFlowStatus[phase];
    }
    if (data.paid === true) return PaymentFlowStatus.PAYMENT_SUCCESS;
    const paymentStatus = String(data.paymentStatus || '').toLowerCase();
    if (paymentStatus === 'paid') return PaymentFlowStatus.PAYMENT_SUCCESS;
    if (paymentStatus === 'failed') return PaymentFlowStatus.PAYMENT_FAILED;
    if (paymentStatus === 'cancelled' || paymentStatus === 'canceled') {
        return PaymentFlowStatus.PAYMENT_CANCELLED;
    }
    if (methodType === 'automated') return PaymentFlowStatus.GATEWAY_VERIFYING;
    return PaymentFlowStatus.COD_PENDING;
}

export function resolveStatusAfterOrderCreate(orderResult = {}, method = {}) {
    const order = orderResult.data || orderResult;
    const payment = order.payment || {};
    if (payment.status === 'paid' || payment.paidAt) {
        return PaymentFlowStatus.PAYMENT_SUCCESS;
    }
    if (method?.type === 'automated') {
        return PaymentFlowStatus.GATEWAY_INITIATED;
    }
    return PaymentFlowStatus.COD_PENDING;
}

export async function fetchPaymentVerification(orderId, options = {}) {
    const id = String(orderId || '').trim();
    if (!id) return null;

    const phone = options.phone
        || options.customerPhone
        || (typeof window !== 'undefined' && window.__checkoutSession?.customerPhone);

    const headers = {};
    const token = typeof window !== 'undefined'
        ? (window.EOBStorage?.get(window.EOBStorageKeys?.TOKEN)
            || window.EOBStorage?.get(window.EOBStorageKeys?.CUSTOMER_TOKEN))
        : '';
    if (token) headers.Authorization = `Bearer ${token}`;

    const qs = phone ? `?phone=${encodeURIComponent(phone)}` : '';
    const response = await fetch(`/api/payments/verify/${encodeURIComponent(id)}${qs}`, {
        method: 'GET',
        headers
    });
    const body = await response.json();
    if (!response.ok || !body.success) {
        return { ok: false, status: response.status, message: body.message || 'Verify failed', data: null };
    }
    return { ok: true, data: body.data };
}

export async function pollPaymentVerification(orderId, options = {}) {
    const opts = options || {};
    const maxAttempts = Math.max(1, Number(opts.maxAttempts) || 8);
    const intervalMs = Math.max(500, Number(opts.intervalMs) || 1500);
    const methodType = opts.methodType || '';

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const result = await fetchPaymentVerification(orderId, opts);
        if (result?.ok && result.data) {
            const status = mapVerifyResponseToStatus(result.data, methodType);
            setPaymentFlowStatus(status, { orderId, verify: result.data, attempt });
            if (TERMINAL.has(status)) {
                return { status, data: result.data };
            }
        }
        if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
    }

    setPaymentFlowStatus(PaymentFlowStatus.GATEWAY_VERIFYING, { orderId, pollingExhausted: true });
    return { status: PaymentFlowStatus.GATEWAY_VERIFYING, data: null };
}

export function persistGatewayPaymentContext(ctx) {
    if (typeof window === 'undefined' || !window.EOBStorageKeys) return;
    window.EOBStorage.setJSON('eob_gateway_payment_context', ctx);
}

export function readGatewayPaymentContext() {
    if (typeof window === 'undefined' || !window.EOBStorage) return null;
    return window.EOBStorage.getJSON('eob_gateway_payment_context', null);
}

export function clearGatewayPaymentContext() {
    if (typeof window === 'undefined' || !window.EOBStorage) return;
    window.EOBStorage.remove('eob_gateway_payment_context');
}

if (typeof window !== 'undefined') {
    Object.assign(window, {
        PaymentFlowStatus,
        setPaymentFlowStatus,
        getPaymentFlowStatus,
        mapVerifyResponseToStatus,
        resolveStatusAfterOrderCreate,
        fetchPaymentVerification,
        pollPaymentVerification
    });
}
