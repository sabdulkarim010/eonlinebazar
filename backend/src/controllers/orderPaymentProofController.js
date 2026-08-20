/********************************************************************
 * Project: EonlineBazar
 * File: orderPaymentProofController.js
 * Location: backend/src/controllers/orderPaymentProofController.js
 * Description: Customer payment-proof submission and admin reconciliation.
 ********************************************************************/

const Order = require('../models/order');
const { emitToAdmins } = require('../services/socketService');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

function resolvePaymentProofStatus(order) {
    return String(order?.paymentProof?.status || 'none').toLowerCase();
}

function uploadPaymentProofScreenshot(file) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: 'payment-proofs' },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        streamifier.createReadStream(file.buffer).pipe(stream);
    });
}

/**
 * Customer submits TRX ID (+ optional screenshot) for a manual-payment order.
 */
const submitPaymentProof = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId || req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (!order.user || order.user.toString() !== String(req.user.id)) {
            return res.status(403).json({ success: false, message: 'You can only submit payment proof for your own orders.' });
        }

        if (String(order.payment?.type || '').toLowerCase() !== 'manual') {
            return res.status(400).json({ success: false, message: 'Payment proof is only required for manual payment orders.' });
        }

        const currentStatus = resolvePaymentProofStatus(order);
        if (currentStatus === 'submitted') {
            return res.status(400).json({ success: false, message: 'Payment proof is already submitted and awaiting admin review.' });
        }
        if (currentStatus === 'approved') {
            return res.status(400).json({ success: false, message: 'Payment proof has already been approved.' });
        }

        const trxId = String(req.body?.trxId || '').trim();
        if (!trxId) {
            return res.status(400).json({ success: false, message: 'Transaction ID (TRX ID) is required.' });
        }

        let screenshotUrl = order.paymentProof?.screenshotUrl || null;
        if (req.file) {
            const uploadResult = await uploadPaymentProofScreenshot(req.file);
            screenshotUrl = uploadResult.secure_url;
        }

        if (!order.paymentProof || typeof order.paymentProof !== 'object') {
            order.paymentProof = {};
        }

        order.paymentProof.trxId = trxId;
        order.paymentProof.screenshotUrl = screenshotUrl;
        order.paymentProof.submittedAt = new Date();
        order.paymentProof.status = 'submitted';
        order.paymentProof.reviewedAt = null;
        order.paymentProof.reviewedBy = null;
        order.paymentProof.adminNote = null;

        order.markModified('paymentProof');
        await order.save();

        emitToAdmins('payment_proof_submitted', {
            orderId: order.orderId,
            customerName: order.customerName,
            trxId,
            submittedAt: new Date()
        });

        return res.status(200).json({
            success: true,
            message: 'Payment proof submitted successfully'
        });
    } catch (err) {
        console.error('Submit payment proof error:', err);
        return res.status(500).json({ success: false, message: 'Failed to submit payment proof.' });
    }
};

/**
 * Admin: list orders with submitted payment proof awaiting review.
 */
const getPendingPaymentProofOrders = async (req, res) => {
    try {
        const orders = await Order.find({ 'paymentProof.status': 'submitted' })
            .populate('user', 'name phone')
            .sort({ 'paymentProof.submittedAt': -1 })
            .lean();

        const data = orders.map((order) => ({
            _id: order._id,
            orderId: order.orderId,
            customerName: order.customerName || order.user?.name || '',
            customerPhone: order.customerPhone || order.user?.phone || '',
            grandTotal: order.grandTotal ?? order.totalAmount ?? 0,
            paymentMethodName: order.payment?.name || order.paymentMethod || '',
            trxId: order.paymentProof?.trxId || '',
            screenshotUrl: order.paymentProof?.screenshotUrl || null,
            submittedAt: order.paymentProof?.submittedAt || null
        }));

        return res.json({ success: true, data });
    } catch (err) {
        console.error('Pending payment proof list error:', err);
        return res.status(500).json({ success: false, message: 'Failed to load pending payment proofs.' });
    }
};

/**
 * Admin approves or rejects submitted payment proof.
 */
const reviewPaymentProof = async (req, res) => {
    try {
        const { action, adminNote } = req.body || {};
        const normalizedAction = String(action || '').trim().toLowerCase();

        if (!['approve', 'reject'].includes(normalizedAction)) {
            return res.status(400).json({ success: false, message: 'Action must be "approve" or "reject".' });
        }

        const order = await Order.findById(req.params.orderId || req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (resolvePaymentProofStatus(order) !== 'submitted') {
            return res.status(400).json({ success: false, message: 'No submitted payment proof to review for this order.' });
        }

        if (!order.paymentProof || typeof order.paymentProof !== 'object') {
            order.paymentProof = {};
        }

        const now = new Date();
        order.paymentProof.reviewedAt = now;
        order.paymentProof.reviewedBy = req.admin?.id || null;

        if (normalizedAction === 'approve') {
            order.paymentProof.status = 'approved';
            order.paymentProof.adminNote = null;
            if (!order.payment) order.payment = {};
            order.payment.status = 'paid';
            order.payment.paidAt = now;
        } else {
            order.paymentProof.status = 'rejected';
            order.paymentProof.adminNote = String(adminNote || '').trim() || null;
        }

        order.markModified('paymentProof');
        order.markModified('payment');
        await order.save();

        return res.json({
            success: true,
            message: normalizedAction === 'approve'
                ? 'Payment proof approved. Order marked as paid.'
                : 'Payment proof rejected.',
            data: order.toObject()
        });
    } catch (err) {
        console.error('Review payment proof error:', err);
        return res.status(500).json({ success: false, message: 'Failed to review payment proof.' });
    }
};

module.exports = {
    submitPaymentProof,
    getPendingPaymentProofOrders,
    reviewPaymentProof
};





