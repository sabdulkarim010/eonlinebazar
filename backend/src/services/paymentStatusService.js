/********************************************************************
 * Customer payment phase mapping for gateway / COD orders.
 ********************************************************************/

const AUTOMATED_HINTS = ['sslcommerz', 'aamarpay', 'shurjopay', 'gateway', 'automated'];

function isAutomatedPaymentMethod(order = {}) {
    const method = String(order.paymentMethod || '').toLowerCase();
    const type = String(order.payment?.methodType || order.payment?.type || '').toLowerCase();
    if (type === 'automated') return true;
    return AUTOMATED_HINTS.some((hint) => method.includes(hint));
}

function resolvePaymentPhase(order = {}) {
    const payment = order.payment || {};
    const rawStatus = String(payment.status || 'pending').toLowerCase();

    if (rawStatus === 'paid' || payment.paidAt) {
        return 'PAYMENT_SUCCESS';
    }
    if (rawStatus === 'failed') {
        return 'PAYMENT_FAILED';
    }
    if (rawStatus === 'cancelled' || rawStatus === 'canceled') {
        return 'PAYMENT_CANCELLED';
    }

    if (isAutomatedPaymentMethod(order)) {
        if (payment.gatewaySessionId || payment.transactionId || payment.redirectInitiated) {
            return 'GATEWAY_VERIFYING';
        }
        return 'GATEWAY_INITIATED';
    }

    return 'COD_PENDING';
}

function buildVerifyPayload(order) {
    const phase = resolvePaymentPhase(order);
    const payment = order.payment || {};
    return {
        orderId: order.orderId,
        orderStatus: order.status,
        paymentStatus: payment.status || 'pending',
        phase,
        paid: phase === 'PAYMENT_SUCCESS',
        paymentMethod: order.paymentMethod || '',
        grandTotal: Number(order.grandTotal) || 0
    };
}

module.exports = {
    resolvePaymentPhase,
    buildVerifyPayload,
    isAutomatedPaymentMethod
};
