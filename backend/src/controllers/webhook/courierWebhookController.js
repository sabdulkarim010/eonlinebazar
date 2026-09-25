/********************************************************************
 * Project: EonlineBazar — Courier Webhooks
 * File: courierWebhookController.js
 * Description: Real-time courier status webhook receivers (Steadfast, Pathao, RedX).
 ********************************************************************/

'use strict';

const crypto = require('crypto');
const Order = require('../../models/order');
const { applyCourierWebhookStatusUpdate } = require('../../services/courierSyncService');
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');

function readWebhookSecret(provider) {
    const slug = String(provider || '').trim().toUpperCase();
    return String(
        process.env[`${slug}_WEBHOOK_SECRET`]
        || process.env.COURIER_WEBHOOK_SECRET
        || process.env.STEADFAST_API_SECRET
        || ''
    ).trim();
}

function validateWebhookAuth(req, provider) {
    const secret = readWebhookSecret(provider);
    if (!secret) {
        return process.env.NODE_ENV === 'test';
    }

    const authHeader = String(req.headers.authorization || '').trim();
    if (authHeader === `Bearer ${secret}`) return true;

    const apiKey = String(
        req.headers['x-api-key']
        || req.headers['x-webhook-key']
        || req.body?.api_key
        || req.body?.apiKey
        || ''
    ).trim();
    if (apiKey && apiKey === secret) return true;

    const signature = String(
        req.headers['x-webhook-signature']
        || req.headers['x-courier-signature']
        || req.headers['x-pathao-signature']
        || req.headers['x-redx-signature']
        || ''
    ).trim();

    if (signature && req.rawBody) {
        const expected = crypto
            .createHmac('sha256', secret)
            .update(req.rawBody)
            .digest('hex');
        const normalized = signature.replace(/^sha256=/i, '');
        return normalized === expected;
    }

    return false;
}

function pickFirstString(...values) {
    for (const value of values) {
        const str = String(value || '').trim();
        if (str) return str;
    }
    return '';
}

function extractSteadfastPayload(body = {}) {
    return {
        rawStatus: pickFirstString(body.status, body.delivery_status, body.notification_type),
        trackingId: pickFirstString(body.tracking_code, body.tracking_id, body.trfid),
        consignmentId: pickFirstString(body.consignment_id, body.cid, body.id),
        orderId: pickFirstString(body.invoice, body.merchant_order_id, body.order_id)
    };
}

function extractPathaoPayload(body = {}) {
    const nested = body.data && typeof body.data === 'object' ? body.data : {};
    return {
        rawStatus: pickFirstString(body.order_status, body.status, nested.order_status, nested.status),
        trackingId: pickFirstString(body.tracking_id, nested.tracking_id, body.consignment_id),
        consignmentId: pickFirstString(body.consignment_id, nested.consignment_id, body.order_id),
        orderId: pickFirstString(body.merchant_order_id, nested.merchant_order_id, body.invoice)
    };
}

function extractRedxPayload(body = {}) {
    const nested = body.parcel && typeof body.parcel === 'object' ? body.parcel : {};
    return {
        rawStatus: pickFirstString(body.status, nested.status, body.parcel_status),
        trackingId: pickFirstString(body.tracking_id, nested.tracking_id, body.parcel_id),
        consignmentId: pickFirstString(body.parcel_id, nested.parcel_id, body.consignment_id),
        orderId: pickFirstString(body.merchant_order_id, body.invoice, body.order_id)
    };
}

const EXTRACTORS = {
    steadfast: extractSteadfastPayload,
    pathao: extractPathaoPayload,
    redx: extractRedxPayload
};

async function resolveOrderFromWebhookPayload(provider, payload = {}) {
    const clauses = [];
    if (payload.trackingId) {
        clauses.push({ courierTrackingId: payload.trackingId });
    }
    if (payload.consignmentId) {
        clauses.push({ courierConsignmentId: payload.consignmentId });
        clauses.push({ courierTrackingId: payload.consignmentId });
    }
    if (payload.orderId) {
        clauses.push({ orderId: payload.orderId });
    }
    if (!clauses.length) return null;

    const order = await Order.findOne({ $or: clauses });
    if (order) return order;

    if (provider) {
        return Order.findOne({
            courierProvider: new RegExp(`^${provider}$`, 'i'),
            $or: clauses
        });
    }

    return null;
}

async function handleCourierWebhook(provider, req, res) {
    try {
        if (!validateWebhookAuth(req, provider)) {
            return res.status(401).json({ success: false, message: 'Unauthorized courier webhook.' });
        }

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const extractor = EXTRACTORS[provider];
        const payload = extractor ? extractor(body) : extractSteadfastPayload(body);

        if (!payload.rawStatus) {
            return res.status(400).json({ success: false, message: 'Missing courier status in webhook payload.' });
        }

        const order = await resolveOrderFromWebhookPayload(provider, payload);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Matching order not found.' });
        }

        const result = await applyCourierWebhookStatusUpdate(order, {
            provider,
            rawStatus: payload.rawStatus,
            actor: `webhook:${provider}`,
            note: `Courier webhook status: ${payload.rawStatus}`,
            ipAddress: getClientIp(req)
        });

        await logSecurityEvent({
            action: 'Courier Webhook Received',
            actor: `webhook:${provider}`,
            actorType: 'system',
            ipAddress: getClientIp(req),
            details: `Order #${order.orderId || order._id} — ${payload.rawStatus} → ${result.newStatus || order.status}`,
            resourceType: 'order',
            resourceId: String(order._id)
        });

        return res.status(200).json({
            success: true,
            changed: result.changed,
            orderId: String(order._id),
            orderNumber: order.orderId || '',
            from: result.from,
            to: result.to,
            rawStatus: payload.rawStatus
        });
    } catch (err) {
        console.error(`[CourierWebhook:${provider}]`, err.message);
        return res.status(500).json({ success: false, message: 'Failed to process courier webhook.' });
    }
}

const handleSteadfastWebhook = (req, res) => handleCourierWebhook('steadfast', req, res);
const handlePathaoWebhook = (req, res) => handleCourierWebhook('pathao', req, res);
const handleRedxWebhook = (req, res) => handleCourierWebhook('redx', req, res);

module.exports = {
    validateWebhookAuth,
    extractSteadfastPayload,
    extractPathaoPayload,
    extractRedxPayload,
    resolveOrderFromWebhookPayload,
    handleSteadfastWebhook,
    handlePathaoWebhook,
    handleRedxWebhook
};
