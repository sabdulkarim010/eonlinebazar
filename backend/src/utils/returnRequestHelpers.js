/********************************************************************
 * Return request snapshot helpers on Order documents.
 ********************************************************************/

function buildReturnRequestFromOrder(order = {}, { status = 'pending', reviewedBy = '', note = '' } = {}) {
    const items = Array.isArray(order.returnItems) ? order.returnItems : [];
    const refundAmount = items.reduce((sum, item) => {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const price = Number(item.price) || 0;
        return sum + (qty * price);
    }, 0);

    return {
        requestedAt: order.returnRequestedAt || new Date(),
        reason: String(order.returnReason || order.actionReason || '').trim(),
        items,
        status,
        reviewedBy: String(reviewedBy || '').trim(),
        reviewedAt: status === 'pending' ? null : new Date(),
        refundAmount: Math.round(refundAmount * 100) / 100,
        refundMethod: String(order.refundMethod || 'wallet').trim(),
        note: String(note || '').trim()
    };
}

function applyReturnRequestReview(order, { status, refundAmount, refundMethod, note, reviewedBy }) {
    if (!order.returnRequest || typeof order.returnRequest !== 'object') {
        order.returnRequest = buildReturnRequestFromOrder(order);
    }

    order.returnRequest.status = status;
    order.returnRequest.reviewedBy = reviewedBy || 'admin';
    order.returnRequest.reviewedAt = new Date();
    if (refundAmount !== undefined) order.returnRequest.refundAmount = Number(refundAmount) || 0;
    if (refundMethod) order.returnRequest.refundMethod = String(refundMethod).trim();
    if (note) order.returnRequest.note = String(note).trim();
    order.markModified('returnRequest');
    return order;
}

module.exports = {
    buildReturnRequestFromOrder,
    applyReturnRequestReview
};
