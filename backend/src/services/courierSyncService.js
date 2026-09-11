/********************************************************************
 * Project: EonlineBazar — ERP Logistics
 * File: courierSyncService.js
 * Location: services/courierSyncService.js
 * Author: Abdul Karim Sheikh
 * Description: Full courier auto-sync layer on top of courierService.js.
 *   • syncOrderWithCourier() — one-click booking: create the consignment,
 *     persist tracking details, move the order to Shipped, and fire the
 *     customer SMS + admin WhatsApp notifications.
 *   • autoSyncCourierStatus() — poll the courier tracking status, map it to
 *     an internal order status, persist the change, and (on delivery) credit
 *     the wallet cashback rewards.
 * Never throws — every path resolves to a result object.
 ********************************************************************/

const Order = require('../models/order');
const {
    bookParcelForOrder,
    buildTrackingUrl,
    loadCourierConfig,
    normalizeCourierSlug,
    resolveCodAmount,
    COURIER_PROVIDERS
} = require('./courierService');
const { sendSms, isCustomerSmsEnabled } = require('./smsService');
const { sendAdminCustomAlert } = require('./whatsappService');
const { creditOrderDeliveryRewards } = require('../utils/rewardSettings');
const { logSecurityEvent } = require('../utils/securityLogger');

const REQUEST_TIMEOUT_MS = Number(process.env.COURIER_API_TIMEOUT_MS || 20000);
const SHIPPED_STATUS = 'Shipped';

// Order states that should never be (re)booked or downgraded by a sync.
const NON_SHIPPABLE_STATUSES = ['cancelled', 'canceled', 'returned', 'refunded', 'return requested'];
const KEEP_STATUS_AS_IS = ['delivered'];

/**
 * Per-provider raw-status → internal order status mapping. Keys are compared
 * case-insensitively. Anything not listed leaves the order status unchanged.
 */
const STATUS_MAP = Object.freeze({
    steadfast: {
        delivered: 'Delivered',
        partial_delivered: 'Out for Delivery',
        partial_delivery: 'Out for Delivery',
        in_review: 'Shipped',
        pending: 'Shipped',
        hold: 'Shipped',
        cancelled: 'Cancelled'
    },
    pathao: {
        delivered: 'Delivered',
        'in transit': 'Shipped',
        in_transit: 'Shipped',
        pickup: 'Shipped',
        pending: 'Shipped'
    },
    redx: {
        delivered: 'Delivered',
        'delivery in progress': 'Out for Delivery',
        in_transit: 'Shipped',
        pending: 'Shipped'
    }
});

/** Map a courier's raw delivery status to an internal order status (or null). */
function mapCourierStatusToOrderStatus(provider, rawStatus) {
    const slug = normalizeCourierSlug(provider);
    const key = String(rawStatus || '').trim().toLowerCase();
    if (!key) return null;
    const providerMap = STATUS_MAP[slug] || {};
    return providerMap[key] || null;
}

function hasTrackingId(order) {
    return Boolean(String(order?.courierTrackingId || '').trim());
}

/**
 * Fetch the current courier delivery status for an already-booked order.
 * Steadfast exposes status_by_cid; other providers (or mock parcels) return
 * the order's stored courierStatus unchanged so the caller becomes a no-op.
 * @returns {Promise<{success: boolean, rawStatus: string, reason?: string}>}
 */
async function fetchCourierDeliveryStatus(order) {
    const provider = normalizeCourierSlug(order.courierProvider);
    const trackingId = String(order.courierTrackingId || '').trim();
    const consignmentId = String(order.courierConsignmentId || order.courierTrackingId || '').trim();

    if (!trackingId) {
        return { success: false, rawStatus: '', reason: 'Order has no courier tracking id.' };
    }

    // Mock parcels (no credentials) have no upstream to poll.
    if (/PENDING/i.test(trackingId)) {
        return { success: true, rawStatus: String(order.courierStatus || 'in_review') };
    }

    let config;
    try {
        config = await loadCourierConfig(provider);
    } catch (err) {
        return { success: false, rawStatus: '', reason: `Could not load courier config: ${err.message}` };
    }

    if (!config.isConfigured) {
        return { success: true, rawStatus: String(order.courierStatus || 'in_review') };
    }

    if (provider === 'steadfast') {
        try {
            const base = (COURIER_PROVIDERS.steadfast.createOrderUrl || '')
                .replace(/\/create_order\/?$/, '');
            const url = `${base}/status_by_cid/${encodeURIComponent(consignmentId)}`;
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Api-Key': config.apiKey,
                    'Secret-Key': config.secretKey,
                    Accept: 'application/json'
                },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            });
            const text = await res.text();
            let data = {};
            try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
            const raw = String(data.delivery_status || data.status || '').trim();
            if (!res.ok || !raw) {
                return { success: false, rawStatus: '', reason: `Steadfast status HTTP ${res.status}` };
            }
            return { success: true, rawStatus: raw };
        } catch (err) {
            return { success: false, rawStatus: '', reason: `Steadfast status fetch failed: ${err.message}` };
        }
    }

    // Pathao / RedX: no lightweight public status endpoint wired — keep current.
    return { success: true, rawStatus: String(order.courierStatus || 'in_review') };
}

/** Build the customer "shipped" SMS body with the tracking code. */
function buildShippedSms(order, trackingId) {
    const orderNo = order.orderId || String(order._id || '').slice(-8).toUpperCase();
    return `[EonlineBazar] Your order #${orderNo} has been shipped! Track your parcel: ${trackingId}`;
}

/**
 * syncOrderWithCourier(orderId, courierCode)
 * One-click booking + notifications. Returns
 * { success, trackingId, trackingUrl, ... } or { success:false, message }.
 */
async function syncOrderWithCourier(orderId, courierCode) {
    try {
        const order = await Order.findById(orderId);
        if (!order) {
            return { success: false, message: 'Order not found.' };
        }

        if (hasTrackingId(order)) {
            return {
                success: false,
                message: `This order is already booked. Tracking ID: ${order.courierTrackingId}`,
                trackingId: order.courierTrackingId,
                trackingUrl: buildTrackingUrl(order.courierProvider, order.courierTrackingId)
            };
        }

        const statusLower = String(order.status || '').trim().toLowerCase();
        if (NON_SHIPPABLE_STATUSES.includes(statusLower)) {
            return { success: false, message: `A ${order.status} order cannot be sent to the courier.` };
        }

        const requested = normalizeCourierSlug(courierCode || '');
        const result = await bookParcelForOrder(order, { courier: requested || undefined });

        if (!result.success) {
            return { success: false, message: result.reason || 'Courier booking failed.', reason: result.code };
        }

        const provider = normalizeCourierSlug(result.provider || '');
        const trackingId = String(result.trackingId || result.trackingCode || '').trim();
        const trackingUrl = result.trackingUrl || buildTrackingUrl(provider, trackingId);

        const previousStatus = order.status;

        order.courierProvider = provider;
        order.courierName = result.providerLabel || COURIER_PROVIDERS[provider]?.label || provider;
        order.courierTrackingId = trackingId;
        order.courierConsignmentId = String(result.consignmentId || trackingId).trim();
        order.courierStatus = result.courierStatus || 'in_review';
        order.courierBookedAt = new Date();

        if (!KEEP_STATUS_AS_IS.includes(String(previousStatus || '').trim().toLowerCase())) {
            order.status = SHIPPED_STATUS;
        }

        await order.save();

        // 6) Customer SMS with tracking code (respects Master Settings toggle).
        try {
            if (order.customerPhone && await isCustomerSmsEnabled()) {
                await sendSms({
                    to: order.customerPhone,
                    body: buildShippedSms(order, trackingId),
                    context: 'COURIER SHIPPED'
                });
            }
        } catch (smsErr) {
            console.warn('[CourierSync] Customer SMS failed:', smsErr.message);
        }

        // 7) Admin WhatsApp notification (fire-and-forget, best effort).
        try {
            const orderNo = order.orderId || String(order._id).slice(-8).toUpperCase();
            const codAmount = resolveCodAmount(order);
            const waBody = [
                '🚚 *Courier Booked - EOnlineBazar*',
                '',
                `• Order: #${orderNo}`,
                `• Courier: ${order.courierName}`,
                `• Tracking: ${trackingId}`,
                `• COD: ৳${Number(codAmount || 0).toLocaleString('en-US')}`,
                trackingUrl ? `• Track: ${trackingUrl}` : ''
            ].filter(Boolean).join('\n');
            sendAdminCustomAlert(waBody).catch((waErr) => {
                console.warn('[CourierSync] Admin WhatsApp alert failed:', waErr.message);
            });
        } catch (waErr) {
            console.warn('[CourierSync] Admin WhatsApp build failed:', waErr.message);
        }

        return {
            success: true,
            mockMode: Boolean(result.mockMode),
            trackingId,
            trackingUrl,
            provider,
            providerLabel: order.courierName,
            courierStatus: order.courierStatus,
            codAmount: result.codAmount ?? 0,
            order: order.toObject ? order.toObject() : order
        };
    } catch (err) {
        console.error('[CourierSync] syncOrderWithCourier error:', err);
        return { success: false, message: 'Failed to book and sync the courier parcel.' };
    }
}

/**
 * autoSyncCourierStatus(orderId)
 * Poll the courier status, map + persist any change, and credit delivery
 * rewards when the order transitions to Delivered.
 * @returns {Promise<{success, changed, orderId, from?, to?, rawStatus?, reason?}>}
 */
async function autoSyncCourierStatus(orderId) {
    try {
        const order = await Order.findById(orderId);
        if (!order) {
            return { success: false, changed: false, orderId, reason: 'Order not found.' };
        }
        if (!hasTrackingId(order)) {
            return { success: false, changed: false, orderId, reason: 'Order has no courier tracking id.' };
        }

        const statusResult = await fetchCourierDeliveryStatus(order);
        if (!statusResult.success) {
            return { success: false, changed: false, orderId, reason: statusResult.reason };
        }

        const rawStatus = statusResult.rawStatus;
        const previousStatus = String(order.status || '');
        const mappedStatus = mapCourierStatusToOrderStatus(order.courierProvider, rawStatus);

        order.courierStatus = rawStatus || order.courierStatus;
        order.courierSyncedAt = new Date();

        let changed = false;
        // Never downgrade a delivered order; only move forward on real mapping.
        if (
            mappedStatus
            && mappedStatus !== previousStatus
            && !KEEP_STATUS_AS_IS.includes(previousStatus.trim().toLowerCase())
        ) {
            order.status = mappedStatus;
            if (mappedStatus === 'Delivered') {
                order.isDelivered = true;
                order.deliveredAt = new Date();
            }
            changed = true;
        }

        await order.save();

        // On delivery, credit wallet cashback rewards (existing engine).
        if (changed && order.status === 'Delivered') {
            try {
                await creditOrderDeliveryRewards(order);
            } catch (rewardErr) {
                console.warn('[CourierSync] Reward credit on delivery failed:', rewardErr.message);
            }
        }

        return {
            success: true,
            changed,
            orderId: String(order._id),
            orderNumber: order.orderId || '',
            from: previousStatus,
            to: order.status,
            rawStatus
        };
    } catch (err) {
        console.error('[CourierSync] autoSyncCourierStatus error:', err);
        return { success: false, changed: false, orderId, reason: err.message };
    }
}

module.exports = {
    STATUS_MAP,
    mapCourierStatusToOrderStatus,
    fetchCourierDeliveryStatus,
    syncOrderWithCourier,
    autoSyncCourierStatus,
    logSecurityEvent // re-exported for convenience in the job
};
