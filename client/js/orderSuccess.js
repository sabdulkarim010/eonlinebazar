/**
 * Order / payment outcome UI — avoids false "paid" success on gateway flows.
 */

import { PaymentFlowStatus } from './checkout/paymentStatusSync.js';

function escapeHtml(str) {
    if (window.EOBSanitizer?.escapeHtml) return window.EOBSanitizer.escapeHtml(str);
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function setModalTitle(title) {
    const h2 = document.querySelector('#orderSuccessModal h2');
    if (h2) h2.textContent = title;
}

function setStatusInfo(html, tone = 'pending') {
    const info = document.querySelector('#orderSuccessModal .modal-order-status-info');
    if (!info) return;
    info.innerHTML = html;
    info.style.background = tone === 'success' ? '#dcfce7' : tone === 'error' ? '#fee2e2' : '#fef3c7';
    info.style.color = tone === 'success' ? '#166534' : tone === 'error' ? '#b91c1c' : '#d97706';
}

function ensurePaymentActionBar() {
    let bar = document.getElementById('paymentOutcomeActionBar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'paymentOutcomeActionBar';
    bar.className = 'payment-outcome-action-bar';
    bar.style.display = 'none';
    bar.style.marginTop = '12px';
    bar.style.display = 'flex';
    bar.style.gap = '8px';
    bar.style.flexWrap = 'wrap';
    const modalCard = document.querySelector('#orderSuccessModal .custom-premium-modal-card');
    if (modalCard) modalCard.appendChild(bar);
    return bar;
}

export function renderOrderSuccessTimeline(orderLike = {}) {
    if (typeof window === 'undefined' || !window.OrderStatusTimeline?.renderOrderStatusTimeline) {
        return;
    }
    let host = document.getElementById('orderSuccessTimelineHost');
    if (!host) {
        const modalCard = document.querySelector('#orderSuccessModal .custom-premium-modal-card');
        if (!modalCard) return;
        host = document.createElement('div');
        host.id = 'orderSuccessTimelineHost';
        host.className = 'order-success-timeline-host';
        const anchor = document.getElementById('modalGatewayMessage');
        if (anchor && anchor.parentElement) {
            anchor.parentElement.insertBefore(host, anchor);
        } else {
            modalCard.appendChild(host);
        }
    }
    const inner = document.createElement('div');
    inner.className = 'order-status-timeline-host order-status-timeline-host--compact';
    host.innerHTML = '';
    host.appendChild(inner);
    window.OrderStatusTimeline.renderOrderStatusTimeline(inner, orderLike);
}

export function renderPaymentOutcomeUi(options = {}) {
    const {
        orderId,
        methodLabel = '',
        status = PaymentFlowStatus.COD_PENDING,
        orderSnapshot = null,
        onRetryPayment,
        onSwitchToCod
    } = options;

    const successModal = document.getElementById('orderSuccessModal');
    if (!successModal) return;

    const modalOrderId = document.getElementById('modalOrderId');
    const gatewayMessage = document.getElementById('modalGatewayMessage');
    const iconWrap = successModal.querySelector('.modal-success-icon-badge i');

    if (modalOrderId) modalOrderId.textContent = orderId || '—';

    const safeOrder = escapeHtml(orderId || '');
    const safeMethod = escapeHtml(methodLabel || 'selected method');

    if (status === PaymentFlowStatus.PAYMENT_SUCCESS) {
        setModalTitle('Payment confirmed');
        if (iconWrap) iconWrap.style.color = '#22c55e';
        if (gatewayMessage) {
            gatewayMessage.innerHTML = `Order <strong>${safeOrder}</strong> is paid via <strong>${safeMethod}</strong>.`;
        }
        setStatusInfo('<i class="fa-solid fa-circle-check"></i> Payment verified. Thank you for shopping with EonlineBazar.', 'success');
    } else if (status === PaymentFlowStatus.GATEWAY_INITIATED || status === PaymentFlowStatus.GATEWAY_VERIFYING) {
        setModalTitle('Order placed — payment pending');
        if (iconWrap) iconWrap.style.color = '#f59e0b';
        if (gatewayMessage) {
            gatewayMessage.innerHTML = `Order <strong>${safeOrder}</strong> is created. Complete payment on <strong>${safeMethod}</strong> or wait while we verify your transaction.`;
        }
        setStatusInfo('<i class="fa-solid fa-clock"></i> Payment is not confirmed yet. Do not close this page until verification finishes.', 'pending');
    } else if (status === PaymentFlowStatus.PAYMENT_FAILED || status === PaymentFlowStatus.PAYMENT_CANCELLED) {
        setModalTitle('Payment not completed');
        if (iconWrap) iconWrap.style.color = '#ef4444';
        if (gatewayMessage) {
            gatewayMessage.innerHTML = `Order <strong>${safeOrder}</strong> is saved, but payment via <strong>${safeMethod}</strong> did not complete.`;
        }
        setStatusInfo('<i class="fa-solid fa-triangle-exclamation"></i> Your order remains pending until payment succeeds.', 'error');
    } else {
        setModalTitle('Order placed — pending payment');
        if (iconWrap) iconWrap.style.color = '#f59e0b';
        if (gatewayMessage) {
            gatewayMessage.innerHTML = `Order <strong>${safeOrder}</strong> via <strong>${safeMethod}</strong> is placed. Complete payment using the instructions shown.`;
        }
        setStatusInfo('<i class="fa-solid fa-clock"></i> Our team will verify manual/COD payments shortly.', 'pending');
    }

    if (orderSnapshot || orderId) {
        renderOrderSuccessTimeline(orderSnapshot || {
            status: status === PaymentFlowStatus.PAYMENT_SUCCESS ? 'Processing' : 'Pending',
            payment: {
                status: status === PaymentFlowStatus.PAYMENT_SUCCESS ? 'paid' : 'pending'
            },
            paymentMethod: methodLabel,
            createdAt: new Date().toISOString()
        });
    }

    const actionBar = ensurePaymentActionBar();
    actionBar.innerHTML = '';
    if (status === PaymentFlowStatus.PAYMENT_FAILED || status === PaymentFlowStatus.PAYMENT_CANCELLED) {
        actionBar.style.display = 'flex';
        if (typeof onRetryPayment === 'function') {
            const retryBtn = document.createElement('button');
            retryBtn.type = 'button';
            retryBtn.className = 'premium-order-confirm-btn';
            retryBtn.textContent = 'Retry payment';
            retryBtn.onclick = onRetryPayment;
            actionBar.appendChild(retryBtn);
        }
        if (typeof onSwitchToCod === 'function') {
            const codBtn = document.createElement('button');
            codBtn.type = 'button';
            codBtn.className = 'premium-order-confirm-btn';
            codBtn.style.background = '#475569';
            codBtn.textContent = 'Switch to COD';
            codBtn.onclick = onSwitchToCod;
            actionBar.appendChild(codBtn);
        }
    } else {
        actionBar.style.display = 'none';
    }

    successModal.style.setProperty('display', 'flex', 'important');
}

export function bindOrderSuccessModalNavigation(orderId, options = {}) {
    const autoRedirectSeconds = Number(options.autoRedirectSeconds) || 30;
    let timeLeft = autoRedirectSeconds;
    const timerEl = document.getElementById('modalTimerCount');
    const continueBtn = document.getElementById('modalCloseAndHomeBtn');

    const timer = setInterval(() => {
        timeLeft -= 1;
        if (timerEl) timerEl.textContent = String(timeLeft);
        if (timeLeft <= 0) {
            clearInterval(timer);
            window.location.href = orderId
                ? `/order-details?id=${encodeURIComponent(orderId)}`
                : '/';
        }
    }, 1000);

    if (continueBtn) {
        continueBtn.onclick = () => {
            clearInterval(timer);
            window.location.href = orderId
                ? `/order-details?id=${encodeURIComponent(orderId)}`
                : '/';
        };
    }

    const copyBtn = document.getElementById('copyOrderIdBtn');
    if (copyBtn && orderId) {
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(orderId).catch(() => {});
        };
    }
}
