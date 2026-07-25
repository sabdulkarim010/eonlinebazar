/********************************************************************
 * Project: EonlineBazar
 * File: courierController.js
 * Location: controllers/courierController.js
 * Author: Abdul Karim Sheikh
 * Description: Admin API for one-click courier parcel booking. Reads
 * gateway credentials from Master Settings, books the parcel through
 * utils/courierService.js, then stores the tracking details on the order
 * and moves it to "Shipped".
 ********************************************************************/

const mongoose = require('mongoose');
const Order = require('../models/order');
const {
    bookParcelForOrder,
    buildTrackingUrl,
    loadCourierConfig,
    COURIER_ERROR_CODES
} = require('../utils/courierService');
const { notifyOrderStatusUpdated } = require('../utils/smsService');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');

const SHIPPED_STATUS = 'Shipped';

// Orders in these states must never reach a courier.
const NON_SHIPPABLE_STATUSES = ['cancelled', 'canceled', 'returned', 'refunded', 'return requested'];

// Statuses the booking must not downgrade — a delivered parcel stays delivered.
const KEEP_STATUS_AS_IS = ['delivered', 'shipped'];

/**
 * A crashed request could leave `courierStatus` stuck on 'booking' forever, so
 * a claim older than this window is treated as abandoned and can be retried.
 */
const BOOKING_LOCK_STALE_MS = 2 * 60 * 1000;

const hasTrackingId = (order) => Boolean(String(order?.courierTrackingId || '').trim());

/** Everything the panel needs to render the courier badge for one order. */
const toCourierPayload = (order) => ({
    orderId: order._id,
    orderNumber: order.orderId || '',
    status: order.status,
    courierProvider: order.courierProvider || '',
    courierTrackingId: order.courierTrackingId || '',
    courierConsignmentId: order.courierConsignmentId || '',
    courierStatus: order.courierStatus || 'unbooked',
    courierBookedAt: order.courierBookedAt || null,
    trackingUrl: buildTrackingUrl(order.courierProvider, order.courierTrackingId)
});

/**
 * Maps a courierService failure code to an HTTP status: misconfiguration and
 * bad order data are the admin's to fix (4xx), upstream faults are 502.
 */
const resolveFailureStatus = (code) => {
    switch (code) {
        case COURIER_ERROR_CODES.NOT_CONFIGURED:
        case COURIER_ERROR_CODES.UNSUPPORTED_PROVIDER:
        case COURIER_ERROR_CODES.AUTH_FAILED:
            return 422;
        case COURIER_ERROR_CODES.INVALID_ORDER:
            return 400;
        case COURIER_ERROR_CODES.SETTINGS_ERROR:
            return 500;
        default:
            return 502;
    }
};

/**
 * Claims the order for booking with one atomic write, so a double-clicked
 * button cannot create two parcels for the same order.
 * @returns {Promise<object|null>} the claimed order, or null if already claimed/booked.
 */
const claimOrderForBooking = async (orderId) => {
    const staleBefore = new Date(Date.now() - BOOKING_LOCK_STALE_MS);

    return Order.findOneAndUpdate(
        {
            _id: orderId,
            $and: [
                { $or: [{ courierTrackingId: { $exists: false } }, { courierTrackingId: '' }, { courierTrackingId: null }] },
                { $or: [{ courierStatus: { $ne: 'booking' } }, { updatedAt: { $lt: staleBefore } }] }
            ]
        },
        { $set: { courierStatus: 'booking' } },
        { new: true }
    );
};

/** Releases a failed claim so the admin can fix the cause and retry. */
const releaseBookingClaim = async (orderId, courierStatus = 'failed') => {
    try {
        await Order.updateOne({ _id: orderId }, { $set: { courierStatus } });
    } catch (err) {
        console.error('[COURIER] Failed to release booking lock:', err.message);
    }
};

/**
 * POST /api/admin/orders/:id/send-courier
 * Books the order as a courier parcel and returns the tracking details.
 */
const sendOrderToCourier = async (req, res) => {
    const { id } = req.params;

    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID.' });
        }

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found!' });
        }

        if (hasTrackingId(order)) {
            return res.status(409).json({
                success: false,
                message: `This order is already booked. Tracking ID: ${order.courierTrackingId}`,
                data: toCourierPayload(order)
            });
        }

        const statusLower = String(order.status || '').trim().toLowerCase();
        if (NON_SHIPPABLE_STATUSES.includes(statusLower)) {
            return res.status(400).json({
                success: false,
                message: `A ${order.status} order cannot be sent to the courier.`
            });
        }

        const claimedOrder = await claimOrderForBooking(id);
        if (!claimedOrder) {
            const current = await Order.findById(id);
            if (current && hasTrackingId(current)) {
                return res.status(409).json({
                    success: false,
                    message: `This order is already booked. Tracking ID: ${current.courierTrackingId}`,
                    data: toCourierPayload(current)
                });
            }
            return res.status(409).json({
                success: false,
                message: 'A courier booking for this order is already in progress. Please wait a moment.'
            });
        }

        const result = await bookParcelForOrder(claimedOrder);

        if (!result.success) {
            await releaseBookingClaim(id, 'failed');
            return res.status(resolveFailureStatus(result.code)).json({
                success: false,
                message: result.reason || 'Courier booking failed.',
                reason: result.code || COURIER_ERROR_CODES.API_ERROR
            });
        }

        const previousStatus = claimedOrder.status;

        claimedOrder.courierProvider = result.provider || '';
        claimedOrder.courierTrackingId = result.trackingId || '';
        claimedOrder.courierConsignmentId = result.consignmentId || '';
        claimedOrder.courierStatus = result.courierStatus || 'in_review';
        claimedOrder.courierBookedAt = new Date();

        if (!KEEP_STATUS_AS_IS.includes(String(previousStatus || '').trim().toLowerCase())) {
            claimedOrder.status = SHIPPED_STATUS;
        }

        await claimedOrder.save();

        // The customer-facing SMS engine owns its own enabled/disabled checks.
        if (String(previousStatus || '') !== String(claimedOrder.status || '')) {
            notifyOrderStatusUpdated(claimedOrder, claimedOrder.status);
        }

        await logSecurityEvent({
            action: 'Courier Parcel Booked',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Order #${claimedOrder.orderId || claimedOrder._id} booked with ${result.providerLabel || result.provider} — tracking ${result.trackingId}, COD ৳${result.codAmount ?? 0}`
        });

        return res.status(200).json({
            success: true,
            message: `Parcel booked successfully! Tracking ID: ${result.trackingId}`,
            data: {
                ...toCourierPayload(claimedOrder),
                trackingUrl: result.trackingUrl || buildTrackingUrl(result.provider, result.trackingId),
                codAmount: result.codAmount ?? 0,
                order: claimedOrder
            }
        });
    } catch (error) {
        console.error('Send Order To Courier Error:', error);
        await releaseBookingClaim(id, 'failed');
        return res.status(500).json({
            success: false,
            message: 'Failed to book the courier parcel. Please try again.'
        });
    }
};

/**
 * GET /api/admin/courier/status
 * Lets the panel show whether courier credentials are live without exposing them.
 */
const getCourierConfigStatus = async (req, res) => {
    try {
        const config = await loadCourierConfig();
        return res.status(200).json({
            success: true,
            data: {
                provider: config.provider,
                providerLabel: config.providerLabel,
                isConfigured: config.isConfigured,
                supportsBooking: config.provider === 'Steadfast'
            }
        });
    } catch (error) {
        console.error('Get Courier Config Status Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to read courier settings.' });
    }
};

module.exports = {
    sendOrderToCourier,
    getCourierConfigStatus
};
