/**
 * Shared order status timeline — order details, profile, payment success.
 */
(function (global) {
    const TIMELINE_STEPS = [
        { id: 'placed', label: 'Order Placed', icon: 'fa-solid fa-clipboard-check' },
        { id: 'payment', label: 'Payment Verified', icon: 'fa-solid fa-shield-check' },
        { id: 'processing', label: 'Processing', icon: 'fa-solid fa-box-open' },
        { id: 'shipped', label: 'Shipped', icon: 'fa-solid fa-truck-fast' },
        { id: 'delivered', label: 'Delivered', icon: 'fa-solid fa-circle-check' }
    ];

    function normalizeStatus(status) {
        return String(status || 'pending').trim().toLowerCase();
    }

    function isCancelledStatus(status) {
        const key = normalizeStatus(status);
        return key === 'cancelled' || key === 'canceled';
    }

    function isReturnedStatus(status) {
        const key = normalizeStatus(status);
        return key === 'returned'
            || key === 'return requested'
            || key === 'refund pending'
            || key === 'refunded';
    }

    function isPaymentVerified(order) {
        if (!order || typeof order !== 'object') return false;
        const pay = order.payment || {};
        const status = String(pay.status || order.paymentStatus || '').toLowerCase();
        if (['paid', 'verified', 'success', 'completed', 'approved'].includes(status)) return true;
        if (String(order.paymentProof?.status || '').toLowerCase() === 'approved') return true;

        const method = String(order.paymentMethod || pay.method || pay.name || '').toLowerCase();
        if (method.includes('cod') || method.includes('cash on delivery') || method === 'cash') {
            return true;
        }
        return false;
    }

    /** Maps order.status / fulfillmentStatus to timeline step index (0–4). */
    function getFulfillmentStepIndex(order) {
        const raw = order?.fulfillmentStatus || order?.status || 'pending';
        const key = normalizeStatus(raw);
        if (key === 'delivered') return 4;
        if (key.includes('ship') || key === 'out for delivery' || key === 'out-for-delivery' || key === 'out_for_delivery') {
            return 3;
        }
        if (key.includes('process') || key === 'confirmed') return 2;
        if (key === 'pending') return 1;
        return 1;
    }

    /**
     * Pure mapper for tests — derives step states from backend order payload.
     * @returns {{ variant: string, steps: Array<{id,label,state}>, activeIndex: number, meta: object }}
     */
    function resolveTimelineFromOrder(order) {
        const status = normalizeStatus(order?.status);
        const meta = buildTimelineMeta(order);

        if (isCancelledStatus(status)) {
            return {
                variant: 'cancelled',
                activeIndex: -1,
                meta,
                steps: TIMELINE_STEPS.map((step) => ({ ...step, state: 'cancelled' }))
            };
        }

        if (isReturnedStatus(status)) {
            return {
                variant: 'returned',
                activeIndex: -1,
                meta,
                steps: TIMELINE_STEPS.map((step, index) => ({
                    ...step,
                    state: index <= 2 ? 'completed' : 'returned'
                }))
            };
        }

        const paymentOk = isPaymentVerified(order);
        const fulfillmentStep = getFulfillmentStepIndex(order);

        if (status === 'delivered') {
            return {
                variant: 'progress',
                activeIndex: 4,
                highestComplete: 4,
                paymentOk,
                meta,
                steps: TIMELINE_STEPS.map((step) => ({ ...step, state: 'completed' }))
            };
        }

        const activeIndex = paymentOk ? Math.min(fulfillmentStep, 4) : 1;

        const steps = TIMELINE_STEPS.map((step, index) => {
            let state = 'pending';
            if (index < activeIndex) state = 'completed';
            else if (index === activeIndex) state = 'active';
            return { ...step, state };
        });

        return {
            variant: 'progress',
            activeIndex,
            highestComplete: Math.max(0, activeIndex - 1),
            paymentOk,
            meta,
            steps
        };
    }

    function formatHistoryTimestamp(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString('en-GB', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }

    function findHistoryEntry(history, matchers) {
        if (!Array.isArray(history)) return null;
        const keys = Array.isArray(matchers) ? matchers : [matchers];
        return history.find((entry) => {
            const s = normalizeStatus(entry?.status);
            return keys.some((m) => s === normalizeStatus(m) || s.includes(normalizeStatus(m)));
        }) || null;
    }

    function buildTimelineMeta(order) {
        if (!order) return {};
        const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
        const placedAt = order.createdAt || findHistoryEntry(history, ['Pending', 'placed'])?.changedAt;
        const processingAt = findHistoryEntry(history, ['Processing', 'processing'])?.changedAt;
        const shippedAt = findHistoryEntry(history, ['Shipped', 'shipped'])?.changedAt;
        const deliveredAt = order.deliveredAt || findHistoryEntry(history, ['Delivered', 'delivered'])?.changedAt;

        return {
            placedAt,
            processingAt,
            shippedAt,
            deliveredAt,
            estimatedDelivery: order.estimatedDelivery || '',
            courierName: order.courierName || order.courierProvider || '',
            courierTrackingId: order.courierTrackingId || '',
            courierStatus: order.courierStatus || ''
        };
    }

    function stepTimestamp(stepId, meta) {
        if (!meta) return '';
        if (stepId === 'placed') return formatHistoryTimestamp(meta.placedAt);
        if (stepId === 'processing') return formatHistoryTimestamp(meta.processingAt);
        if (stepId === 'shipped') return formatHistoryTimestamp(meta.shippedAt);
        if (stepId === 'delivered') return formatHistoryTimestamp(meta.deliveredAt);
        return '';
    }

    function renderTimelineModel(container, model) {
        if (!container || !model) return;

        container.innerHTML = '';
        container.classList.toggle('order-status-timeline--cancelled', model.variant === 'cancelled');
        container.classList.toggle('order-status-timeline--returned', model.variant === 'returned');

        const track = document.createElement('div');
        track.className = 'order-status-timeline';
        track.setAttribute('role', 'list');
        track.setAttribute('aria-label', 'Order status progress');

        (model.steps || TIMELINE_STEPS).forEach((step) => {
            const stepEl = document.createElement('div');
            stepEl.className = 'order-timeline-step';
            stepEl.setAttribute('role', 'listitem');
            if (step.state) {
                stepEl.classList.add(`is-${step.state}`);
                if (step.state === 'completed' || step.state === 'active') {
                    stepEl.classList.add(step.state);
                }
            }

            const when = stepTimestamp(step.id, model.meta);
            stepEl.innerHTML = `
                <div class="order-timeline-step__marker" aria-hidden="true">
                    <span class="order-timeline-step__icon"><i class="${step.icon}"></i></span>
                </div>
                <span class="order-timeline-step__label">${step.label}</span>
                ${when ? `<span class="order-timeline-step__time">${when}</span>` : ''}
            `;
            track.appendChild(stepEl);
        });

        container.appendChild(track);

        const metaEl = document.createElement('div');
        metaEl.className = 'order-timeline-meta';
        container.appendChild(metaEl);
        renderTimelineMeta(metaEl, model.meta);
    }

    function renderTimelineMeta(host, meta) {
        if (!host) return;
        if (!meta || (!meta.estimatedDelivery && !meta.courierTrackingId && !meta.courierName)) {
            host.innerHTML = '';
            host.hidden = true;
            return;
        }
        host.hidden = false;
        const parts = [];
        if (meta.estimatedDelivery) {
            parts.push(`<p><i class="fa-regular fa-calendar-check" aria-hidden="true"></i> <strong>Estimated delivery:</strong> ${escapeHtml(meta.estimatedDelivery)}</p>`);
        }
        if (meta.courierName || meta.courierTrackingId) {
            parts.push(`<p><i class="fa-solid fa-truck" aria-hidden="true"></i> <strong>Carrier:</strong> ${escapeHtml(meta.courierName || 'Courier')} ${meta.courierTrackingId ? `· Tracking <code>${escapeHtml(meta.courierTrackingId)}</code>` : ''}</p>`);
        }
        if (meta.courierStatus && meta.courierStatus !== 'unbooked') {
            parts.push(`<p class="order-timeline-meta__status">Status: ${escapeHtml(meta.courierStatus)}</p>`);
        }
        host.innerHTML = parts.join('');
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderCancelledBanner(bannerEl, status) {
        if (!bannerEl) return;
        if (!isCancelledStatus(status)) {
            bannerEl.classList.add('hidden');
            bannerEl.innerHTML = '';
            return;
        }
        bannerEl.classList.remove('hidden');
        bannerEl.innerHTML = `
            <i class="fa-solid fa-circle-xmark" aria-hidden="true"></i>
            <div class="order-cancelled-banner__text">
                <strong>Order Cancelled</strong>
                <span>This order was cancelled and will not be delivered.</span>
            </div>
        `;
    }

    function renderReturnedBanner(bannerEl, status) {
        if (!bannerEl || !bannerEl.id) return;
        if (!isReturnedStatus(status)) return;
        if (bannerEl.classList.contains('order-cancelled-banner')) {
            bannerEl.classList.remove('hidden');
            bannerEl.innerHTML = `
                <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
                <div class="order-cancelled-banner__text">
                    <strong>Return / Refund in progress</strong>
                    <span>This order has a return or refund request on file.</span>
                </div>
            `;
        }
    }

    function renderOrderStatusTimeline(container, statusOrOrder) {
        const order = typeof statusOrOrder === 'object' && statusOrOrder !== null
            ? statusOrOrder
            : { status: statusOrOrder };
        const model = resolveTimelineFromOrder(order);
        renderTimelineModel(container, model);
    }

    function renderReturnProgressTrack(container, order) {
        if (!container) return;
        const workflow = global.OrderReturnWorkflow;
        const model = workflow?.resolveReturnProgressFromOrder
            ? workflow.resolveReturnProgressFromOrder(order)
            : null;

        if (!model) {
            container.innerHTML = '';
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        container.setAttribute('role', 'list');
        container.setAttribute('aria-label', 'Return and refund progress');

        const stepsHtml = (model.steps || []).map((step) => {
            const state = step.state || 'pending';
            return `
                <div class="order-return-progress__step is-${state}" role="listitem">
                    <span class="order-return-progress__dot" aria-hidden="true"></span>
                    <span class="order-return-progress__label">${escapeHtml(step.label)}</span>
                </div>`;
        }).join('');

        const refundLine = model.estimatedRefund > 0
            ? `<p class="order-return-progress__refund">Estimated refund: ৳${Number(model.estimatedRefund).toLocaleString()}</p>`
            : '';

        container.innerHTML = `
            <h4 class="order-return-progress__title"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Return status</h4>
            <div class="order-return-progress__track">${stepsHtml}</div>
            ${refundLine}
        `;
    }

    function renderOrderStatusUI(options = {}) {
        const order = options.order || { status: options.status };
        const status = order.status || options.status;
        const timelineEl = options.timelineEl || document.getElementById('order-status-timeline');
        const bannerEl = options.bannerEl || document.getElementById('order-cancelled-banner');
        const returnProgressEl = options.returnProgressEl
            || document.getElementById('order-return-progress');

        renderCancelledBanner(bannerEl, status);
        if (!isCancelledStatus(status)) {
            renderReturnedBanner(bannerEl, status);
        }
        renderOrderStatusTimeline(timelineEl, order);
        renderReturnProgressTrack(returnProgressEl, order);
    }

    const VERTICAL_FLOW = [
        'Pending',
        'Processing',
        'Shipped',
        'Out for Delivery',
        'Delivered'
    ];

    function renderVerticalStatusHistory(container, options = {}) {
        if (!container) return;

        const status = options.status || 'Pending';
        const history = Array.isArray(options.history) ? options.history : [];
        const currentKey = normalizeStatus(status);
        const cancelled = isCancelledStatus(status);

        if (cancelled) {
            container.innerHTML = `
                <div class="order-vtimeline order-vtimeline--cancelled">
                    <div class="order-vtimeline__item is-cancelled">
                        <span class="order-vtimeline__dot"></span>
                        <div class="order-vtimeline__content">
                            <strong>Order Cancelled</strong>
                            <span class="order-vtimeline__meta">${formatHistoryTimestamp(findHistoryEntry(history, 'Cancelled')?.changedAt) || '—'}</span>
                        </div>
                    </div>
                </div>`;
            return;
        }

        const currentIndex = VERTICAL_FLOW.findIndex((step) => normalizeStatus(step) === currentKey);

        container.innerHTML = `
            <div class="order-vtimeline" role="list" aria-label="Order status history">
                ${VERTICAL_FLOW.map((step, index) => {
                    const entry = findHistoryEntry(history, step);
                    const isComplete = entry || (currentIndex >= 0 && index < currentIndex);
                    const isCurrent = currentIndex === index;
                    const isPending = !isComplete && !isCurrent;
                    const stateClass = isCurrent
                        ? 'is-current'
                        : isComplete
                            ? 'is-complete'
                            : 'is-pending';
                    const actor = entry?.changedBy ? ` · ${entry.changedBy}` : '';
                    const when = entry?.changedAt
                        ? formatHistoryTimestamp(entry.changedAt)
                        : isPending
                            ? 'pending'
                            : '—';

                    return `
                        <div class="order-vtimeline__item ${stateClass}" role="listitem">
                            <span class="order-vtimeline__dot" aria-hidden="true"></span>
                            <div class="order-vtimeline__content">
                                <strong>${step}</strong>
                                <span class="order-vtimeline__meta">${when}${actor}</span>
                            </div>
                        </div>`;
                }).join('')}
            </div>`;
    }

    global.OrderStatusTimeline = {
        TIMELINE_STEPS,
        normalizeStatus,
        isCancelledStatus,
        isReturnedStatus,
        isPaymentVerified,
        getFulfillmentStepIndex,
        resolveTimelineFromOrder,
        renderTimelineModel,
        renderOrderStatusTimeline,
        renderVerticalStatusHistory,
        renderCancelledBanner,
        renderOrderStatusUI,
        renderReturnProgressTrack
    };
})(window);
