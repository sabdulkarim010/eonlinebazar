/********************************************************************
 * Project: EonlineBazar — ERP Logistics
 * File: courierController.js
 * Location: controllers/admin/courierController.js
 * Description: Admin courier deep-integration endpoints — Book & Sync
 * and manual status refresh. Delegates to courierSyncService.js.
 ********************************************************************/

const mongoose = require('mongoose');
const Order = require('../../models/order');
const { normalizeCourierSlug, buildTrackingUrl } = require('../../services/courierService');
const {
    syncOrderWithCourier,
    autoSyncCourierStatus
} = require('../../services/courierSyncService');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

/** Everything the panel needs to render the courier badge for one order. */
const toCourierPayload = (order) => ({
    orderId: order._id,
    orderNumber: order.orderId || '',
    status: order.status,
    courierProvider: order.courierProvider || '',
    courierName: order.courierName || '',
    courierTrackingId: order.courierTrackingId || '',
    courierConsignmentId: order.courierConsignmentId || '',
    courierStatus: order.courierStatus || 'unbooked',
    courierBookedAt: order.courierBookedAt || null,
    trackingUrl: buildTrackingUrl(order.courierProvider, order.courierTrackingId)
});

/**
 * PATCH /api/admin/orders/:orderId/book-courier
 * One-click "Book & Sync" — creates the consignment, saves tracking,
 * moves the order to Shipped, and fires SMS + WhatsApp notifications.
 */
const bookAndSyncCourier = async (req, res) => {
    const orderId = req.params.orderId || req.params.id;

    try {
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID.' });
        }

        const courierCode = normalizeCourierSlug(req.body?.courierCode || req.body?.courier || '');
        const result = await syncOrderWithCourier(orderId, courierCode || undefined);

        if (!result.success) {
            const status = result.message && /already booked/i.test(result.message) ? 409 : 422;
            return res.status(status).json({
                success: false,
                message: result.message || 'Courier booking failed.',
                data: result.trackingId
                    ? { trackingId: result.trackingId, trackingUrl: result.trackingUrl }
                    : undefined
            });
        }

        await logSecurityEvent({
            action: result.mockMode ? 'Courier Booked & Synced (Mock)' : 'Courier Booked & Synced',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Order #${result.order?.orderId || orderId} → ${result.providerLabel || result.provider} · tracking ${result.trackingId}`,
            resourceType: 'order',
            resourceId: String(orderId)
        });

        return res.status(200).json({
            success: true,
            mockMode: Boolean(result.mockMode),
            message: result.mockMode
                ? `Mock parcel booked & synced. Tracking ID: ${result.trackingId}`
                : `Parcel booked & synced! Tracking ID: ${result.trackingId}`,
            data: {
                trackingId: result.trackingId,
                trackingUrl: result.trackingUrl,
                courierProvider: result.provider,
                courierName: result.providerLabel,
                courierStatus: result.courierStatus,
                codAmount: result.codAmount ?? 0,
                order: result.order
            }
        });
    } catch (error) {
        console.error('Book & Sync Courier Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to book and sync the courier parcel. Please try again.'
        });
    }
};

/**
 * GET /api/admin/orders/:orderId/courier-status
 * Manual refresh — poll the courier tracking status and reconcile the order.
 */
const getCourierStatus = async (req, res) => {
    const orderId = req.params.orderId || req.params.id;

    try {
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID.' });
        }

        const result = await autoSyncCourierStatus(orderId);
        if (!result.success) {
            return res.status(400).json({ success: false, message: result.reason || 'Could not refresh courier status.' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (result.changed) {
            await logSecurityEvent({
                action: 'Courier Status Refreshed',
                actor: req.admin?.username || 'admin',
                actorType: 'admin',
                ipAddress: getClientIp(req),
                details: `Order #${order.orderId || orderId}: ${result.oldStatus || result.from} → ${result.newStatus || result.to} (courier: ${result.rawStatus})`,
                resourceType: 'order',
                resourceId: String(orderId)
            });
        }

        return res.status(200).json({
            success: true,
            changed: result.changed,
            oldStatus: result.oldStatus || result.from,
            newStatus: result.newStatus || result.to,
            message: result.changed
                ? `Status updated: ${result.oldStatus || result.from} → ${result.newStatus || result.to}`
                : 'Courier status is up to date.',
            data: {
                ...toCourierPayload(order),
                rawStatus: result.rawStatus,
                order
            }
        });
    } catch (error) {
        console.error('Get Courier Status Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to refresh courier status.' });
    }
};

module.exports = {
    bookAndSyncCourier,
    getCourierStatus
};
