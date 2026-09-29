/**
 * Multi-tab checkout synchronization — BroadcastChannel + storage events.
 */

export const CHECKOUT_SYNC_EVENTS = {
    ORDER_COMPLETED: 'ORDER_COMPLETED',
    CHECKOUT_SESSION_INVALIDATED: 'CHECKOUT_SESSION_INVALIDATED'
};

const CHECKOUT_CHANNEL = 'eob_checkout_sync';
const CART_CHANNEL = 'eob_cart_sync';
const PING_KEY = 'eob_checkout_sync_ping';

let checkoutChannel = null;
let suppressBroadcast = false;

function getCheckoutChannel() {
    if (checkoutChannel !== null) return checkoutChannel;
    try {
        checkoutChannel = typeof BroadcastChannel !== 'undefined'
            ? new BroadcastChannel(CHECKOUT_CHANNEL)
            : false;
    } catch (_) {
        checkoutChannel = false;
    }
    return checkoutChannel;
}

function readPingPayload() {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    try {
        const raw = window.sessionStorage.getItem(PING_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function writePingPayload(payload) {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
        window.sessionStorage.setItem(PING_KEY, JSON.stringify(payload));
    } catch (_) { /* ignore */ }
}

export function broadcastCheckoutSync(type, detail = {}) {
    if (suppressBroadcast || typeof window === 'undefined') return;
    const message = {
        type,
        detail: detail || {},
        at: Date.now()
    };

    const channel = getCheckoutChannel();
    if (channel) {
        try {
            channel.postMessage(message);
        } catch (_) { /* ignore */ }
    }

    writePingPayload(message);
}

function handleRemoteCheckoutEvent(message, handlers) {
    if (!message || !message.type) return;
    if (message.type === CHECKOUT_SYNC_EVENTS.ORDER_COMPLETED) {
        handlers.onOrderCompleted?.(message.detail || {});
        return;
    }
    if (message.type === CHECKOUT_SYNC_EVENTS.CHECKOUT_SESSION_INVALIDATED) {
        handlers.onSessionInvalidated?.(message.detail || {});
    }
}

export function markCheckoutStaleUi(reason) {
    const proceedBtn = document.getElementById('proceedToPaymentBtn')
        || document.getElementById('proceed-to-payment');
    const confirmBtn = document.getElementById('confirmOrderFinalBtn');
    const bannerId = 'checkoutCrossTabNotice';

    [proceedBtn, confirmBtn].forEach((btn) => {
        if (!btn) return;
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
    });

    let banner = document.getElementById(bannerId);
    if (!banner) {
        banner = document.createElement('div');
        banner.id = bannerId;
        banner.className = 'checkout-cross-tab-notice';
        banner.setAttribute('role', 'alert');
        document.body.prepend(banner);
    }
    banner.textContent = reason || 'Checkout was updated in another tab.';
    banner.style.display = 'block';
}

export function handleOrderCompletedInOtherTab(detail = {}) {
    if (typeof window !== 'undefined' && window.EOBCheckoutState) {
        window.EOBCheckoutState.set('checkoutCrossTabBlocked', true);
    }
    const orderId = detail.orderId || '';
    markCheckoutStaleUi(
        orderId
            ? `This order (${orderId}) was already completed in another window.`
            : 'This order has already been completed in another window.'
    );

    if (typeof window !== 'undefined' && orderId) {
        const onPayment = /\/payment/i.test(window.location.pathname);
        if (onPayment) {
            setTimeout(() => {
                window.location.href = `/order-details?id=${encodeURIComponent(orderId)}`;
            }, 1800);
        }
    }
}

export function handleCheckoutSessionInvalidated(detail = {}) {
    if (typeof requestOrderQuoteRefresh === 'function') {
        requestOrderQuoteRefresh({ silent: detail.silent !== false });
    }
    if (typeof showCouponToast === 'function') {
        showCouponToast('Your cart or checkout changed in another tab. Review totals before paying.', 'warning');
    } else if (typeof openCheckoutAlertModal === 'function') {
        openCheckoutAlertModal('Your cart or checkout changed in another tab. Please review before continuing.');
    }
}

export function initCheckoutCrossTabSync(handlers = {}) {
    if (typeof window === 'undefined') return;

    const mergedHandlers = {
        onOrderCompleted: (detail) => {
            handleOrderCompletedInOtherTab(detail);
            handlers.onOrderCompleted?.(detail);
        },
        onSessionInvalidated: (detail) => {
            handleCheckoutSessionInvalidated(detail);
            handlers.onSessionInvalidated?.(detail);
        }
    };

    const channel = getCheckoutChannel();
    if (channel) {
        channel.onmessage = (event) => {
            suppressBroadcast = true;
            try {
                handleRemoteCheckoutEvent(event.data, mergedHandlers);
            } finally {
                suppressBroadcast = false;
            }
        };
    }

    window.addEventListener('storage', (event) => {
        const keys = window.EOBStorageKeys || {};
        if (event.key === keys.CART || event.key === 'cart') {
            suppressBroadcast = true;
            try {
                mergedHandlers.onSessionInvalidated({ source: 'storage', key: event.key });
                broadcastCheckoutSync(CHECKOUT_SYNC_EVENTS.CHECKOUT_SESSION_INVALIDATED, { source: 'storage' });
            } finally {
                suppressBroadcast = false;
            }
            return;
        }
        if (event.key === keys.ACTIVE_CHECKOUT_SESSION || event.key === 'activeCheckoutSession') {
            suppressBroadcast = true;
            try {
                mergedHandlers.onSessionInvalidated({ source: 'checkout_session' });
            } finally {
                suppressBroadcast = false;
            }
        }
    });

    try {
        const cartChannel = typeof BroadcastChannel !== 'undefined'
            ? new BroadcastChannel(CART_CHANNEL)
            : null;
        if (cartChannel) {
            cartChannel.onmessage = () => {
                mergedHandlers.onSessionInvalidated({ source: 'cart_broadcast' });
            };
        }
    } catch (_) { /* ignore */ }

    const ping = readPingPayload();
    if (ping && ping.type) {
        handleRemoteCheckoutEvent(ping, mergedHandlers);
    }
}

export function broadcastOrderCompleted(orderId, extra = {}) {
    broadcastCheckoutSync(CHECKOUT_SYNC_EVENTS.ORDER_COMPLETED, {
        orderId,
        ...extra
    });
}

export function broadcastCheckoutSessionInvalidated(extra = {}) {
    broadcastCheckoutSync(CHECKOUT_SYNC_EVENTS.CHECKOUT_SESSION_INVALIDATED, extra);
}

if (typeof window !== 'undefined') {
    Object.assign(window, {
        initCheckoutCrossTabSync,
        broadcastOrderCompleted,
        broadcastCheckoutSessionInvalidated,
        CHECKOUT_SYNC_EVENTS
    });
}
