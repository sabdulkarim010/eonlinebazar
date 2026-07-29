/********************************************************************
 * Project: EonlineBazar
 * File: paymentIpnController.js
 * Location: controllers/paymentIpnController.js
 * Author: Abdul Karim Sheikh
 * Description: Automated gateway surface — hosted-checkout initiation and
 * the IPN (Instant Payment Notification) receiver with live provider
 * verification for SSLCommerz, Aamarpay, and ShurjoPay.
 ********************************************************************/

const Order = require('../models/order');
const User = require('../models/user');
const PaymentMethod = require('../models/PaymentMethod');
const { IPN_EVENT_LIMIT } = require('../models/PaymentMethod');
const { getGatewayAdapter, envGatewayConfigured } = require('../utils/paymentGatewayAdapters');
const {
    getPublicPaymentPayload,
    buildWebhookUrl,
    isCheckoutReady
} = require('../utils/paymentMethodService');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');

function frontendBase() {
    return String(process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || '')
        .trim()
        .replace(/\/+$/, '');
}

function buildOrderProductSummary(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) return 'Order Items';

    const names = items.slice(0, 3).map((item) => item.name).filter(Boolean);
    const summary = names.join(', ');
    if (items.length > 3) return `${summary} +${items.length - 3} more`;
    return summary || 'Order Items';
}

function countOrderItems(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    return items.reduce((total, item) => total + (Number(item.quantity) || 1), 0) || 1;
}

async function resolveCustomerEmail(order) {
    if (order.user) {
        const user = await User.findById(order.user).select('email').lean();
        if (user?.email) return user.email;
    }
    return '';
}

function buildOrderDataFromDocument(order, customerEmail = '') {
    return {
        orderId: order.orderId,
        amount: Number(order.grandTotal) || 0,
        customerName: order.customerName || '',
        customerEmail,
        customerPhone: order.customerPhone || '',
        shippingAddress: order.customerAddress || '',
        customerAddress: order.customerAddress || '',
        city: order.shippingDistrict || 'Dhaka',
        shippingDistrict: order.shippingDistrict || '',
        productSummary: buildOrderProductSummary(order),
        itemCount: countOrderItems(order)
    };
}

function wantsHtmlRedirect(req) {
    const accept = String(req.headers.accept || '').toLowerCase();
    return accept.includes('text/html') || Boolean(req.query?.status);
}

function sendBrowserRedirect(res, orderId, outcome) {
    const base = frontendBase() || '';
    const target = `${base}/order-details?id=${encodeURIComponent(orderId)}&payment=${encodeURIComponent(outcome)}`;
    const safeTarget = target.replace(/"/g, '&quot;');

    res.status(200).type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${safeTarget}">
<title>Redirecting…</title>
<script>window.location.replace(${JSON.stringify(target)});</script>
</head>
<body><p>Redirecting to your order…</p></body>
</html>`);
}

/** Storefront method list — same payload the checkout page renders from. */
const getPublicPaymentMethods = async (req, res) => {
    try {
        const payload = await getPublicPaymentPayload({ forceRefresh: req.query.refresh === '1' });
        return res.status(200).json({ success: true, data: payload });
    } catch (error) {
        console.error('Get Public Payment Methods Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load payment methods.' });
    }
};

/**
 * Starts a hosted-checkout session for an automated method.
 *
 * Reads gateway credentials from .env (preferred) or the encrypted admin config,
 * builds the provider redirect URL, and persists the session key on the order.
 */
const initiateGatewayPayment = async (req, res) => {
    try {
        const orderId = String(req.body?.orderId || '').trim();
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'An order id is required to start a payment.' });
        }

        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (order.payment?.status === 'paid') {
            return res.status(409).json({ success: false, message: 'This order is already paid.' });
        }

        const methodId = order.payment?.methodId || req.body?.paymentMethodId;
        const method = methodId ? await PaymentMethod.findById(methodId) : null;

        if (!method || method.type !== 'automated' || !isCheckoutReady(method)) {
            return res.status(400).json({
                success: false,
                message: 'This order is not payable through an automated gateway.'
            });
        }

        const credentials = method.getDecryptedApiConfig();
        const envReady = envGatewayConfigured(method.provider);
        if (!envReady && !credentials.storePassword && !credentials.apiKey) {
            return res.status(503).json({
                success: false,
                message: 'Gateway credentials are missing. Add API keys to .env or re-save them in the Admin Panel.'
            });
        }

        const adapter = getGatewayAdapter(method.provider);
        const customerEmail = await resolveCustomerEmail(order);
        const orderData = buildOrderDataFromDocument(order, customerEmail);

        const session = await adapter.buildRedirect(orderData);

        order.payment.status = 'pending';
        order.payment.transactionId = order.payment.transactionId || order.orderId;

        if (session.sessionKey) {
            order.payment.gatewayReference = session.sessionKey;
        }

        await order.save();

        if (!session.success && !session.ready) {
            return res.status(502).json({
                success: false,
                message: session.error || session.message
                    || `The ${adapter.label} adapter could not create a payment session.`,
                data: {
                    provider: adapter.id,
                    isSandbox: credentials.isSandbox,
                    endpoints: adapter.endpoints(credentials.isSandbox)
                }
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Payment session created.',
            redirectUrl: session.redirectUrl,
            data: {
                provider: adapter.id,
                redirectUrl: session.redirectUrl,
                sessionKey: session.sessionKey || '',
                isSandbox: credentials.isSandbox
            }
        });
    } catch (error) {
        console.error('Initiate Gateway Payment Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to start the payment session.' });
    }
};

/**
 * IPN receiver: POST|GET /api/payments/ipn/:code
 *
 * Verifies each callback with the provider API when possible, updates the
 * order payment snapshot, and redirects the customer's browser after
 * success/fail/cancel return URLs.
 */
const handleGatewayIpn = async (req, res) => {
    const code = String(req.params.code || '').trim().toLowerCase();
    const payload = { ...(req.query || {}), ...(req.body || {}) };
    const browserOutcome = String(req.query?.status || '').trim().toLowerCase();

    try {
        const method = await PaymentMethod.findOne({ code })
            || await PaymentMethod.findOne({ provider: code, type: 'automated', isActive: true });
        const adapter = getGatewayAdapter(method?.provider || code);

        if (!method) {
            await logSecurityEvent({
                action: 'Payment IPN Rejected',
                actor: 'gateway',
                actorType: 'system',
                ipAddress: getClientIp(req),
                details: `Unknown payment method code "${code}".`
            });
            return res.status(404).json({ success: false, message: 'Unknown payment method callback.' });
        }

        if (method.type !== 'automated') {
            const transactionId = String(
                payload.orderId || payload.tran_id || payload.transactionId || ''
            ).trim();
            let order = null;

            if (transactionId) {
                order = await Order.findOne({
                    $or: [
                        { orderId: transactionId },
                        { 'payment.transactionId': transactionId }
                    ]
                });
            }

            if (order) {
                if (!order.payment) order.payment = {};
                order.payment.ipnHistory = [
                    ...(order.payment.ipnHistory || []),
                    {
                        receivedAt: new Date(),
                        provider: method.code,
                        status: String(payload.status || 'pending').toLowerCase(),
                        verified: false,
                        transactionId,
                        amount: Number(payload.amount) || 0,
                        message: 'Manual payment notification received.',
                        raw: payload
                    }
                ].slice(-IPN_EVENT_LIMIT);

                const manualStatus = String(payload.status || '').trim().toLowerCase();
                if (manualStatus === 'paid') {
                    order.payment.status = 'paid';
                    if (!order.payment.paidAt) order.payment.paidAt = new Date();
                } else if (manualStatus && order.payment.status === 'unpaid') {
                    order.payment.status = 'pending';
                }

                order.markModified('payment');
                await order.save();
            }

            return res.status(200).json({
                success: true,
                message: 'Manual payment notification received.',
                data: {
                    provider: method.code,
                    orderMatched: Boolean(order)
                }
            });
        }

        const verification = await adapter.verifyIpn({
            body: payload,
            headers: req.headers,
            credentials: method.getDecryptedApiConfig()
        });

        let transactionId = String(
            verification.transactionId
            || payload.tran_id
            || payload.mer_txnid
            || payload.customer_order_id
            || ''
        ).trim();

        if (!verification.verified && browserOutcome === 'fail') {
            verification.status = 'failed';
        } else if (!verification.verified && browserOutcome === 'cancel') {
            verification.status = 'cancelled';
        } else if (!verification.verified && browserOutcome === 'success') {
            verification.message = verification.message || 'Browser return received but provider verification did not confirm payment.';
        }

        let order = transactionId
            ? await Order.findOne({
                $or: [
                    { 'payment.transactionId': transactionId },
                    { orderId: transactionId }
                ]
            })
            : null;

        if (!order && payload.tran_id) {
            transactionId = String(payload.tran_id).trim();
            order = await Order.findOne({
                $or: [
                    { 'payment.transactionId': transactionId },
                    { orderId: transactionId }
                ]
            });
        }

        if (order) {
            if (!order.payment) order.payment = {};

            order.payment.ipnHistory = [
                ...(order.payment.ipnHistory || []),
                {
                    receivedAt: new Date(),
                    provider: adapter.id,
                    status: verification.status,
                    verified: verification.verified === true,
                    transactionId,
                    amount: Number(verification.amount) || 0,
                    message: verification.message || '',
                    raw: payload
                }
            ].slice(-IPN_EVENT_LIMIT);

            order.payment.transactionId = transactionId || order.payment.transactionId;
            order.payment.gatewayReference = verification.gatewayReference || order.payment.gatewayReference;

            if (verification.verified) {
                order.payment.status = verification.status;
                if (verification.status === 'paid' && !order.payment.paidAt) {
                    order.payment.paidAt = new Date();
                }
            } else if (['failed', 'cancelled'].includes(verification.status) && order.payment.status !== 'paid') {
                order.payment.status = verification.status;
            } else if (order.payment.status === 'unpaid') {
                order.payment.status = 'pending';
            }

            order.markModified('payment');
            await order.save();
        }

        await logSecurityEvent({
            action: 'Payment IPN Received',
            actor: adapter.label,
            actorType: 'system',
            ipAddress: getClientIp(req),
            details: [
                `method=${method.code}`,
                `txn=${transactionId || 'n/a'}`,
                `status=${verification.status}`,
                `verified=${verification.verified === true}`,
                `order=${order ? order.orderId : 'not-matched'}`
            ].join(' · ')
        });

        if (wantsHtmlRedirect(req) && ['success', 'fail', 'cancel', 'failed', 'cancelled'].includes(browserOutcome)) {
            const resolvedOrderId = order?.orderId
                || payload.tran_id
                || payload.mer_txnid
                || payload.customer_order_id
                || '';
            if (resolvedOrderId) {
                const outcome = browserOutcome === 'success' && verification.status === 'paid'
                    ? 'success'
                    : (browserOutcome === 'cancel' || browserOutcome === 'cancelled' ? 'cancelled' : 'failed');
                return sendBrowserRedirect(res, resolvedOrderId, outcome);
            }
        }

        return res.status(200).json({
            success: true,
            message: 'IPN received.',
            data: {
                provider: adapter.id,
                verified: verification.verified === true,
                status: verification.status,
                orderMatched: Boolean(order)
            }
        });
    } catch (error) {
        console.error('Handle Gateway IPN Error:', error);
        return res.status(200).json({ success: false, message: 'IPN accepted but could not be processed.' });
    }
};

module.exports = {
    getPublicPaymentMethods,
    initiateGatewayPayment,
    handleGatewayIpn
};
