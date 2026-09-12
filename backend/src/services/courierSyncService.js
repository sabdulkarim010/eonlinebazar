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
    COURIER_PROVIDERS,
    fetchSteadfastOrderStatus,
    fetchPathaoOrderStatus,
    fetchRedxParcelStatus
} = require('./courierService');
const { sendSms, isCustomerSmsEnabled } = require('./smsService');
const { sendAdminCustomAlert } = require('./whatsappService');
const { creditOrderDeliveryRewards } = require('../utils/rewardSettings');
const { upgradeTierIfNeeded } = require('./loyaltyTierService');
const { logSecurityEvent } = require('../utils/securityLogger');
const { notifyAdminsWithPermission } = require('./notificationService');

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
        pending: 'Shipped',
        returned: 'Returned'
    },
    redx: {
        delivered: 'Delivered',
        'in transit': 'Shipped',
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
        const steadfastResult = await fetchSteadfastOrderStatus(consignmentId, config);
        if (!steadfastResult.success) {
            return { success: false, rawStatus: '', reason: steadfastResult.reason };
        }
        return { success: true, rawStatus: steadfastResult.rawStatus };
    }

    if (provider === 'pathao') {
        const pathaoResult = await fetchPathaoOrderStatus(consignmentId);
        if (!pathaoResult.success) {
            return { success: false, rawStatus: '', reason: pathaoResult.reason };
        }
        return { success: true, rawStatus: pathaoResult.rawStatus };
    }

    if (provider === 'redx') {
        const redxResult = await fetchRedxParcelStatus(trackingId);
        if (!redxResult.success) {
            return { success: false, rawStatus: '', reason: redxResult.reason };
        }
        return { success: true, rawStatus: redxResult.rawStatus };
    }

    return { success: true, rawStatus: String(order.courierStatus || 'in_review') };
}

/** Build the customer "shipped" SMS body with the tracking URL. */
function buildShippedSms(order, trackingUrl) {
    const orderNo = order.orderId || String(order._id || '').slice(-8).toUpperCase();
    const trackPart = trackingUrl || 'our store';
    return `Your order #${orderNo} has been shipped. Track: ${trackPart}`;
}

/**
 * syncOrderWithCourier(orderId, courierCode)
 * One-click booking + notifications. Returns
 * { success, trackingId, trackingUrl, ... } or { success:false, message }.
 */
async function syncOrderWithCourier(orderId, courierCode) {
    try {
        const order = await Order.findById(orderId).populate('user', 'name phone email');
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

        // 6) Customer SMS with tracking URL (respects Master Settings toggle).
        try {
            if (order.customerPhone && await isCustomerSmsEnabled()) {
                await sendSms({
                    to: order.customerPhone,
                    body: buildShippedSms(order, trackingUrl || trackingId),
                    context: 'COURIER SHIPPED'
                });
            }
        } catch (smsErr) {
            console.warn('[CourierSync] Customer SMS failed:', smsErr.message);
        }

        // 7) Admin WhatsApp notification to private number (fire-and-forget).
        try {
            const orderNo = order.orderId || String(order._id).slice(-8).toUpperCase();
            const waBody = `Order #${orderNo} booked with ${order.courierName}. Tracking: ${trackingId}`;
            sendAdminCustomAlert(waBody).catch((waErr) => {
                console.warn('[CourierSync] Admin WhatsApp alert failed:', waErr.message);
            });
        } catch (waErr) {
            console.warn('[CourierSync] Admin WhatsApp build failed:', waErr.message);
        }

        // 8) Security audit log for the booking event.
        try {
            await logSecurityEvent({
                action: result.mockMode ? 'Courier Booked & Synced (Mock)' : 'Courier Booked & Synced',
                actor: 'courier-sync',
                actorType: 'system',
                details: `Order #${order.orderId || orderId} booked with ${order.courierName}. Tracking: ${trackingId}`,
                resourceType: 'order',
                resourceId: String(orderId)
            });
        } catch (logErr) {
            console.warn('[CourierSync] SecurityLog write failed:', logErr.message);
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
            if (order.user) {
                try {
                    await upgradeTierIfNeeded(order.user);
                } catch (tierErr) {
                    console.warn('[CourierSync] Tier upgrade on delivery failed:', tierErr.message);
                }
            }
            notifyAdminsWithPermission(
                'manage_orders',
                'order',
                'Order delivered',
                `Order #${order.orderId || order._id} marked Delivered by courier`,
                'view-orders'
            ).catch((err) => {
                console.warn('[CourierSync] In-app notification failed:', err.message);
            });
        }

        return {
            success: true,
            changed,
            orderId: String(order._id),
            orderNumber: order.orderId || '',
            from: previousStatus,
            to: order.status,
            oldStatus: previousStatus,
            newStatus: order.status,
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
    autoSyncCourierStatus
};
