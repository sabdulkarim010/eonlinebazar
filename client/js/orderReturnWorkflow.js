/**
 * Customer return & refund workflow — eligibility, form validation, API payloads.
 */
(function initOrderReturnWorkflow(global) {
    const RETURN_POLICY_DAYS = 7;
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    const RETURN_REASONS = [
        { code: 'defective', label: 'Defective / Damaged' },
        { code: 'wrong_item', label: 'Wrong Size / Item' },
        { code: 'quality', label: 'Quality Not as Expected' },
        { code: 'changed_mind', label: 'Changed Mind' }
    ];

    const RETURN_PROGRESS_STEPS = [
        { id: 'pending', label: 'Return Pending' },
        { id: 'approved', label: 'Approved' },
        { id: 'received', label: 'Item Received' },
        { id: 'refunded', label: 'Refunded' },
        { id: 'rejected', label: 'Rejected' }
    ];

    function normalizeStatus(status) {
        return String(status || '').trim().toLowerCase();
    }

    function getDeliveryDate(order) {
        return order?.deliveredAt || order?.deliveryDate || order?.updatedAt || null;
    }

    function daysSinceDelivery(order) {
        const deliveryDate = getDeliveryDate(order);
        if (!deliveryDate) return null;
        const delivered = new Date(deliveryDate);
        if (Number.isNaN(delivered.getTime())) return null;
        return (Date.now() - delivered.getTime()) / MS_PER_DAY;
    }

    function isDeliveredOrder(order) {
        return normalizeStatus(order?.status) === 'delivered';
    }

    /**
     * True only when the customer (or admin) has an explicit return on file.
     * Ignores Mongo default returnRequest.status === 'pending' on new orders.
     */
    function hasActiveReturnRequest(order) {
        if (!order) return false;
        const status = normalizeStatus(order?.status);
        if (
            status === 'return requested'
            || status === 'returned'
            || status === 'refunded'
            || status === 'refund pending'
        ) {
            return true;
        }
        if (order.returnRequestedAt) return true;
        if (Array.isArray(order.returnItems) && order.returnItems.length > 0) return true;

        const req = order.returnRequest;
        if (!req || typeof req !== 'object') return false;
        if (req.requestedAt) return true;
        if (Array.isArray(req.items) && req.items.length > 0) return true;
        const reqStatus = normalizeStatus(req.status);
        if (reqStatus === 'approved' || reqStatus === 'rejected') return true;
        return false;
    }

    function isWithinReturnPolicyWindow(order, policyDays = RETURN_POLICY_DAYS) {
        if (!isDeliveredOrder(order)) return false;
        const days = daysSinceDelivery(order);
        if (days == null) return false;
        return days >= 0 && days <= policyDays;
    }

    function isOrderReturnEligible(order) {
        if (!order) return false;
        if (hasActiveReturnRequest(order)) return false;
        return isWithinReturnPolicyWindow(order);
    }

    function resolveLineProductId(item) {
        return String(item?.productId || item?.id || item?._id || '').trim();
    }

    function resolveLineSku(item) {
        return String(item?.variantSku || item?.sku || item?.productSku || '').trim();
    }

    function buildLineKey(item, index) {
        const pid = resolveLineProductId(item);
        const sku = resolveLineSku(item);
        return `${pid}::${sku}::${index}`;
    }

    function returnedProductIds(order) {
        const set = new Set();
        (order?.returnItems || []).forEach((row) => {
            const pid = String(row.productId || '').trim();
            if (pid) set.add(pid);
        });
        return set;
    }

    function isLineReturnEligible(order, item, index) {
        if (!isOrderReturnEligible(order)) return false;
        const pid = resolveLineProductId(item);
        if (!pid) return false;
        if (returnedProductIds(order).has(pid)) return false;
        return true;
    }

    function reasonLabelFromCode(code) {
        const match = RETURN_REASONS.find((r) => r.code === code);
        return match ? match.label : '';
    }

    function validateReturnForm(formState) {
        const errors = [];
        const selections = Array.isArray(formState?.selections) ? formState.selections : [];
        const selected = selections.filter((s) => s.selected && s.quantity > 0);

        if (!selected.length) {
            errors.push('Select at least one item to return.');
        }

        const reasonCode = String(formState?.reasonCode || '').trim();
        if (!reasonCode || !reasonLabelFromCode(reasonCode)) {
            errors.push('Choose a return reason.');
        }

        selected.forEach((sel) => {
            const maxQty = Math.max(1, Number(sel.maxQuantity) || 1);
            const qty = Math.max(0, Number(sel.quantity) || 0);
            if (qty < 1) errors.push(`Quantity required for ${sel.productName || 'item'}.`);
            if (qty > maxQty) errors.push(`Return quantity cannot exceed ${maxQty} for ${sel.productName || 'item'}.`);
        });

        return { ok: errors.length === 0, errors };
    }

    function estimateRefundAmount(selections) {
        return (selections || []).reduce((sum, row) => {
            if (!row.selected) return sum;
            const qty = Math.max(1, Number(row.quantity) || 1);
            const price = Number(row.price) || 0;
            return sum + qty * price;
        }, 0);
    }

    /**
     * Build POST /api/orders/:id/return-request body (mirrors returnOrderItems).
     */
    function buildReturnRequestPayload(order, formState) {
        const reasonCode = String(formState?.reasonCode || '').trim();
        const reasonLabel = reasonLabelFromCode(reasonCode);
        const notes = String(formState?.notes || '').trim();
        const proofUrl = String(formState?.proofUrl || '').trim();
        const photos = proofUrl ? [proofUrl] : [];

        const selections = (formState?.selections || []).filter((s) => s.selected && s.quantity > 0);
        const items = selections.map((sel) => ({
            productId: sel.productId,
            productName: sel.productName,
            quantity: Math.max(1, Number(sel.quantity) || 1),
            price: Number(sel.price) || 0,
            sku: sel.sku || '',
            reason: reasonLabel,
            photos
        }));

        return {
            items,
            reason: reasonLabel,
            reasonCode,
            selectedReason: reasonLabel,
            notes,
            photos,
            estimatedRefund: Math.round(estimateRefundAmount(selections) * 100) / 100
        };
    }

    function mapReturnStatusTag(order) {
        if (!hasActiveReturnRequest(order)) return null;

        const orderStatus = normalizeStatus(order?.status);
        const reqStatus = normalizeStatus(order?.returnRequest?.status);

        if (reqStatus === 'rejected' || order?.returnRejectedAt) {
            return { label: 'Return Rejected', className: 'return-status-rejected' };
        }
        if (orderStatus === 'refunded' || Number(order?.refundAmount) > 0) {
            return { label: 'Refunded', className: 'return-status-refunded' };
        }
        if (orderStatus === 'returned') {
            return { label: 'Item Received', className: 'return-status-received' };
        }
        if (reqStatus === 'approved' || order?.returnApprovedAt) {
            return { label: 'Return Approved', className: 'return-status-approved' };
        }
        if (orderStatus === 'return requested' || reqStatus === 'pending') {
            return { label: 'Return Pending', className: 'return-status-pending' };
        }
        return null;
    }

    function resolveReturnProgressFromOrder(order) {
        if (!hasActiveReturnRequest(order)) return null;

        const orderStatus = normalizeStatus(order?.status);
        const reqStatus = normalizeStatus(order?.returnRequest?.status);
        const rejected = reqStatus === 'rejected' || Boolean(order?.returnRejectedAt);
        const refunded = orderStatus === 'refunded' || Number(order?.refundAmount) > 0;
        const received = orderStatus === 'returned';
        const approved = reqStatus === 'approved' || Boolean(order?.returnApprovedAt);
        const pending = orderStatus === 'return requested'
            || reqStatus === 'pending'
            || Boolean(order?.returnRequestedAt);

        let activeId = 'pending';
        if (rejected) activeId = 'rejected';
        else if (refunded) activeId = 'refunded';
        else if (received) activeId = 'received';
        else if (approved) activeId = 'approved';

        const orderIds = RETURN_PROGRESS_STEPS.map((s) => s.id);
        const activeIndex = orderIds.indexOf(activeId);

        const steps = RETURN_PROGRESS_STEPS.filter((s) => s.id !== 'rejected' || rejected).map((step) => {
            if (step.id === 'rejected') {
                return { ...step, state: rejected ? 'active' : 'pending' };
            }
            const idx = orderIds.indexOf(step.id);
            let state = 'pending';
            if (idx < activeIndex) state = 'completed';
            else if (idx === activeIndex && !rejected) state = 'active';
            if (rejected && step.id !== 'rejected' && idx <= orderIds.indexOf('approved')) {
                state = step.id === 'pending' ? 'completed' : 'cancelled';
            }
            return { ...step, state };
        });

        const estimated = Number(order?.returnRequest?.refundAmount) || 0;

        return {
            steps,
            activeId,
            estimatedRefund: estimated,
            note: order?.returnRequest?.note || order?.returnReason || ''
        };
    }

    function buildInitialSelections(order) {
        const items = order?.items || order?.products || [];
        return items.map((item, index) => ({
            lineKey: buildLineKey(item, index),
            productId: resolveLineProductId(item),
            productName: item.name || item.product?.name || 'Product',
            sku: resolveLineSku(item),
            price: Number(item.price) || 0,
            maxQuantity: Math.max(1, Number(item.quantity) || 1),
            quantity: Math.max(1, Number(item.quantity) || 1),
            selected: false
        }));
    }

    const api = {
        RETURN_POLICY_DAYS,
        RETURN_REASONS,
        RETURN_PROGRESS_STEPS,
        normalizeStatus,
        isOrderReturnEligible,
        isLineReturnEligible,
        isWithinReturnPolicyWindow,
        hasActiveReturnRequest,
        validateReturnForm,
        buildReturnRequestPayload,
        buildInitialSelections,
        mapReturnStatusTag,
        resolveReturnProgressFromOrder,
        estimateRefundAmount,
        reasonLabelFromCode,
        returnedProductIds,
        buildLineKey,
        resolveLineProductId,
        resolveLineSku
    };

    global.OrderReturnWorkflow = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : global);
