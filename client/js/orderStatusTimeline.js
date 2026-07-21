/**
 * Shared order status timeline renderer for order-details and profile views.
 */
(function (global) {
    const TIMELINE_STEPS = [
        { label: 'Placed', icon: 'fa-solid fa-clipboard-check' },
        { label: 'Processing', icon: 'fa-solid fa-box-open' },
        { label: 'Shipped', icon: 'fa-solid fa-truck-fast' },
        { label: 'Out for Delivery', icon: 'fa-solid fa-motorcycle' },
        { label: 'Delivered', icon: 'fa-solid fa-circle-check' }
    ];

    const STATUS_STEP_INDEX = {
        pending: 0,
        placed: 0,
        processing: 1,
        shipped: 2,
        'out for delivery': 3,
        'out-for-delivery': 3,
        out_for_delivery: 3,
        delivered: 4
    };

    function normalizeStatus(status) {
        return String(status || 'pending').trim().toLowerCase();
    }

    function isCancelledStatus(status) {
        const key = normalizeStatus(status);
        return key === 'cancelled' || key === 'canceled';
    }

    function getTimelineStepIndex(status) {
        const key = normalizeStatus(status);
        if (isCancelledStatus(key)) return -1;
        if (STATUS_STEP_INDEX[key] !== undefined) return STATUS_STEP_INDEX[key];
        if (key.includes('deliver') && key.includes('out')) return 3;
        if (key === 'delivered') return 4;
        if (key.includes('ship')) return 2;
        if (key.includes('process')) return 1;
        return 0;
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

    function renderOrderStatusTimeline(container, status) {
        if (!container) return;

        const cancelled = isCancelledStatus(status);
        const currentIndex = getTimelineStepIndex(status);
        const isDelivered = normalizeStatus(status) === 'delivered';

        container.innerHTML = '';
        container.classList.toggle('order-status-timeline--cancelled', cancelled);

        const track = document.createElement('div');
        track.className = 'order-status-timeline';
        track.setAttribute('role', 'list');
        track.setAttribute('aria-label', 'Order status progress');

        TIMELINE_STEPS.forEach((step, index) => {
            const stepEl = document.createElement('div');
            stepEl.className = 'order-timeline-step';
            stepEl.setAttribute('role', 'listitem');

            if (cancelled) {
                stepEl.classList.add('is-cancelled');
            } else if (isDelivered || index < currentIndex) {
                stepEl.classList.add('completed');
            } else if (index === currentIndex) {
                stepEl.classList.add('active');
            }

            stepEl.innerHTML = `
                <div class="order-timeline-step__marker" aria-hidden="true">
                    <span class="order-timeline-step__icon"><i class="${step.icon}"></i></span>
                </div>
                <span class="order-timeline-step__label">${step.label}</span>
            `;
            track.appendChild(stepEl);
        });

        container.appendChild(track);
    }

    function renderOrderStatusUI(options = {}) {
        const {
            status,
            timelineEl = document.getElementById('order-status-timeline'),
            bannerEl = document.getElementById('order-cancelled-banner')
        } = options;

        renderCancelledBanner(bannerEl, status);
        renderOrderStatusTimeline(timelineEl, status);
    }

    global.OrderStatusTimeline = {
        TIMELINE_STEPS,
        normalizeStatus,
        isCancelledStatus,
        getTimelineStepIndex,
        renderOrderStatusTimeline,
        renderCancelledBanner,
        renderOrderStatusUI
    };
})(window);
