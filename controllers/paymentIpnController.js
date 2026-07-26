/********************************************************************
 * Project: EonlineBazar
 * File: paymentIpnController.js
 * Location: controllers/paymentIpnController.js
 * Author: Abdul Karim Sheikh
 * Description: Automated gateway surface — hosted-checkout initiation and
 * the IPN (Instant Payment Notification) receiver. The transport calls are
 * intentionally stubbed in the adapters; routing, credential decryption,
 * signature verification and the order audit trail are fully live.
 ********************************************************************/

const Order = require('../models/order');
const PaymentMethod = require('../models/PaymentMethod');
const { IPN_EVENT_LIMIT } = require('../models/PaymentMethod');
const { getGatewayAdapter } = require('../utils/paymentGatewayAdapters');
const {
    getPublicPaymentPayload,
    buildWebhookUrl,
    isCheckoutReady
} = require('../utils/paymentMethodService');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');

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
 * Credentials are decrypted here and never leave the server: only the redirect
 * URL the adapter produces is returned to the browser.
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
        if (!credentials.storePassword && !credentials.apiKey) {
            return res.status(503).json({
                success: false,
                message: 'Gateway credentials are missing or could not be decrypted. Re-save them in the Admin Panel.'
            });
        }

        const adapter = getGatewayAdapter(method.provider);
        const ipnUrl = credentials.webhookUrl || buildWebhookUrl(method.code, req);
        const origin = `${req.protocol}://${req.headers.host}`;

        const session = adapter.buildRedirect({
            order: {
                orderId: order.orderId,
                amount: Number(order.grandTotal) || 0,
                transactionRef: order.payment?.transactionId || order.orderId,
                customerName: order.customerName,
                customerPhone: order.customerPhone
            },
            credentials,
            callbacks: {
                ipn: ipnUrl,
                success: `${origin}/order-details?id=${encodeURIComponent(order.orderId)}&payment=success`,
                fail: `${origin}/order-details?id=${encodeURIComponent(order.orderId)}&payment=failed`,
                cancel: `${origin}/order-details?id=${encodeURIComponent(order.orderId)}&payment=cancelled`
            }
        });

        order.payment.status = 'pending';
        order.payment.transactionId = order.payment.transactionId || order.orderId;
        await order.save();

        if (!session.ready) {
            return res.status(501).json({
                success: false,
                message: session.message
                    || `The ${adapter.label} adapter is not wired to a live endpoint yet.`,
                data: {
                    provider: adapter.id,
                    isSandbox: credentials.isSandbox,
                    endpoints: adapter.endpoints(credentials.isSandbox),
                    ipnUrl
                }
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Payment session created.',
            data: {
                provider: adapter.id,
                redirectUrl: session.redirectUrl,
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
 * Gateways retry until they get a 2xx, so this always answers 200 once the
 * callback has been recorded — even for an unverifiable signature, which is
 * stored for manual review instead of silently trusted. Only a verified
 * callback may move an order to `paid`.
 */
const handleGatewayIpn = async (req, res) => {
    const code = String(req.params.code || '').trim().toLowerCase();
    const payload = { ...(req.query || {}), ...(req.body || {}) };

    try {
        const method = await PaymentMethod.findOne({ code });
        if (!method || method.type !== 'automated') {
            // Unknown callback target: log it and answer 404 so a misconfigured
            // gateway dashboard is visible rather than silently swallowed.
            await logSecurityEvent({
                action: 'Payment IPN Rejected',
                actor: 'gateway',
                actorType: 'system',
                ipAddress: getClientIp(req),
                details: `Unknown automated payment method code "${code}".`
            });
            return res.status(404).json({ success: false, message: 'Unknown payment method callback.' });
        }

        const adapter = getGatewayAdapter(method.provider);
        const verification = adapter.verifyIpn({
            body: payload,
            headers: req.headers,
            credentials: method.getDecryptedApiConfig()
        });

        const transactionId = String(verification.transactionId || '').trim();
        const order = transactionId
            ? await Order.findOne({
                $or: [
                    { 'payment.transactionId': transactionId },
                    { orderId: transactionId }
                ]
            })
            : null;

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

            // An unverified callback is recorded but never settles an order.
            if (verification.verified) {
                order.payment.status = verification.status;
                if (verification.status === 'paid' && !order.payment.paidAt) {
                    order.payment.paidAt = new Date();
                }
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
        // Still a 200: a 500 makes gateways retry the same broken payload for hours.
        return res.status(200).json({ success: false, message: 'IPN accepted but could not be processed.' });
    }
};

module.exports = {
    getPublicPaymentMethods,
    initiateGatewayPayment,
    handleGatewayIpn
};
