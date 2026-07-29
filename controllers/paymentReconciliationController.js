/********************************************************************
 * Project: EonlineBazar
 * File: paymentReconciliationController.js
 * Description: Admin payment reconciliation — gateway paid/unpaid,
 * manual proof queue, COD orders, and manual mark-paid override.
 ********************************************************************/

const mongoose = require('mongoose');
const Order = require('../models/order');

const VALID_TYPES = new Set(['all', 'gateway', 'manual', 'cod']);
const VALID_STATUSES = new Set(['paid', 'unpaid', 'pending']);
const VALID_GATEWAYS = new Set(['sslcommerz', 'aamarpay', 'shurjopay']);

const COD_MATCH = {
    $or: [
        { paymentMethod: /^cod$/i },
        { 'payment.code': 'cod' }
    ]
};

function classifyPaymentType(order) {
    const methodLabel = String(order.paymentMethod || '').trim().toUpperCase();
    const code = String(order.payment?.code || '').trim().toLowerCase();
    if (methodLabel === 'COD' || code === 'cod') return 'cod';
    if (order.payment?.type === 'automated') return 'gateway';
    if (order.payment?.type === 'manual') return 'manual';
    if (methodLabel === 'COD') return 'cod';
    return 'manual';
}

function buildDateFilter(startDate, endDate) {
    if (!startDate && !endDate) return {};

    const createdAt = {};
    if (startDate) {
        const start = new Date(startDate);
        if (!Number.isNaN(start.getTime())) createdAt.$gte = start;
    }
    if (endDate) {
        const end = new Date(endDate);
        if (!Number.isNaN(end.getTime())) {
            end.setHours(23, 59, 59, 999);
            createdAt.$lte = end;
        }
    }
    return Object.keys(createdAt).length ? { createdAt } : {};
}

function buildTypeFilter(type) {
    switch (type) {
        case 'gateway':
            return { 'payment.type': 'automated' };
        case 'manual':
            return {
                'payment.type': 'manual',
                $nor: [{ paymentMethod: /^cod$/i }, { 'payment.code': 'cod' }]
            };
        case 'cod':
            return COD_MATCH;
        default:
            return {};
    }
}

function buildPaymentStatusFilter(paymentStatus) {
    switch (paymentStatus) {
        case 'paid':
            return { 'payment.status': 'paid' };
        case 'unpaid':
            return { 'payment.status': { $in: ['unpaid', 'failed', 'cancelled'] } };
        case 'pending':
            return {
                $or: [
                    { 'payment.status': 'pending' },
                    { 'paymentProof.status': 'submitted' }
                ]
            };
        default:
            return {};
    }
}

function buildReconciliationQuery(queryParams = {}) {
    const type = VALID_TYPES.has(queryParams.type) ? queryParams.type : 'all';
    const paymentStatus = VALID_STATUSES.has(queryParams.paymentStatus)
        ? queryParams.paymentStatus
        : null;
    const gateway = VALID_GATEWAYS.has(queryParams.gateway) ? queryParams.gateway : null;

    const clauses = [
        buildDateFilter(queryParams.startDate, queryParams.endDate),
        buildTypeFilter(type),
        buildPaymentStatusFilter(paymentStatus)
    ].filter((part) => Object.keys(part).length > 0);

    if (gateway) {
        clauses.push({ 'payment.provider': gateway });
    }

    if (clauses.length === 0) return {};
    if (clauses.length === 1) return clauses[0];
    return { $and: clauses };
}

function orderTotal(order) {
    return Number(order.grandTotal ?? order.totalAmount ?? 0) || 0;
}

function customerDisplayName(order) {
    if (order.customerName) return order.customerName;
    const user = order.user;
    if (!user) return '';
    if (user.name) return user.name;
    const parts = [user.firstName, user.lastName].filter(Boolean);
    return parts.join(' ').trim();
}

function hasVerifiedIpn(order) {
    const history = order.payment?.ipnHistory;
    if (!Array.isArray(history) || history.length === 0) return false;
    return history.some((event) => {
        if (event.verified) return true;
        const status = String(event.status || '').toLowerCase();
        return ['valid', 'success', 'successful', 'completed', 'paid'].includes(status);
    });
}

function mapReconciliationOrder(order) {
    const paymentType = classifyPaymentType(order);
    const proofStatus = order.paymentProof?.status || 'none';

    return {
        _id: order._id,
        orderId: order.orderId,
        customerName: customerDisplayName(order),
        customerPhone: order.customerPhone || order.user?.phone || '',
        customerEmail: order.user?.email || '',
        grandTotal: orderTotal(order),
        paymentMethod: order.payment?.name || order.paymentMethod || '',
        paymentType,
        paymentStatus: order.payment?.status || 'unpaid',
        ipnReceived: paymentType === 'gateway' ? hasVerifiedIpn(order) : null,
        proofStatus: paymentType === 'manual' ? proofStatus : null,
        createdAt: order.createdAt,
        paymentProof: paymentType === 'manual' ? {
            trxId: order.paymentProof?.trxId || '',
            screenshotUrl: order.paymentProof?.screenshotUrl || null,
            submittedAt: order.paymentProof?.submittedAt || null,
            status: proofStatus,
            adminNote: order.paymentProof?.adminNote || null
        } : null
    };
}

async function computeSummary(baseQuery) {
    const [
        totalOrders,
        paidCount,
        unpaidCount,
        pendingProofCount,
        gatewayPaidCount,
        gatewayUnpaidCount,
        codCount,
        revenueAgg
    ] = await Promise.all([
        Order.countDocuments(baseQuery),
        Order.countDocuments({ ...baseQuery, 'payment.status': 'paid' }),
        Order.countDocuments({
            ...baseQuery,
            'payment.status': { $in: ['unpaid', 'failed', 'cancelled'] }
        }),
        Order.countDocuments({ ...baseQuery, 'paymentProof.status': 'submitted' }),
        Order.countDocuments({
            ...baseQuery,
            'payment.type': 'automated',
            'payment.status': 'paid'
        }),
        Order.countDocuments({
            ...baseQuery,
            'payment.type': 'automated',
            'payment.status': { $ne: 'paid' }
        }),
        Order.countDocuments({ ...baseQuery, ...COD_MATCH }),
        Order.aggregate([
            { $match: { ...baseQuery, 'payment.status': 'paid' } },
            {
                $group: {
                    _id: null,
                    totalRevenue: {
                        $sum: { $ifNull: ['$grandTotal', '$totalAmount', 0] }
                    }
                }
            }
        ])
    ]);

    return {
        totalOrders,
        totalRevenue: revenueAgg[0]?.totalRevenue || 0,
        paidCount,
        unpaidCount,
        pendingProofCount,
        gatewayPaidCount,
        gatewayUnpaidCount,
        codCount
    };
}

async function findOrderByParam(orderId) {
    if (mongoose.Types.ObjectId.isValid(orderId)) {
        const byId = await Order.findById(orderId);
        if (byId) return byId;
    }
    return Order.findOne({ orderId: String(orderId).trim() });
}

/**
 * GET /api/admin/payments/reconciliation
 */
const getPaymentReconciliation = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;

        const baseQuery = buildReconciliationQuery(req.query);

        const [summary, total, orders] = await Promise.all([
            computeSummary(baseQuery),
            Order.countDocuments(baseQuery),
            Order.find(baseQuery)
                .populate('user', 'firstName lastName phone email name')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
        ]);

        return res.json({
            success: true,
            summary,
            orders: orders.map(mapReconciliationOrder),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 0
            }
        });
    } catch (err) {
        console.error('[PaymentReconciliation] List error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to load payment reconciliation data.'
        });
    }
};

/**
 * PATCH /api/admin/payments/:orderId/mark-paid
 * Manual override for unpaid gateway orders.
 */
const markGatewayOrderPaid = async (req, res) => {
    try {
        const order = await findOrderByParam(req.params.orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (order.payment?.type !== 'automated') {
            return res.status(400).json({
                success: false,
                message: 'Only automated gateway orders can be marked as paid via this action.'
            });
        }

        if (order.payment?.status === 'paid') {
            return res.status(400).json({
                success: false,
                message: 'This order is already marked as paid.'
            });
        }

        const adminNote = String(req.body?.adminNote || '').trim();
        const adminId = req.admin?.id || req.admin?._id || null;
        const now = new Date();

        if (!order.payment) order.payment = {};
        order.payment.status = 'paid';
        order.payment.paidAt = now;

        if (!Array.isArray(order.payment.ipnHistory)) {
            order.payment.ipnHistory = [];
        }

        order.payment.ipnHistory.push({
            receivedAt: now,
            provider: 'admin',
            status: 'paid',
            verified: true,
            transactionId: order.payment.transactionId || '',
            amount: orderTotal(order),
            message: adminNote ? `manual_override: ${adminNote}` : 'manual_override',
            raw: {
                event: 'manual_override',
                by: adminId,
                at: now,
                note: adminNote || null
            }
        });

        order.markModified('payment');
        await order.save();

        return res.json({
            success: true,
            message: 'Gateway order marked as paid.',
            data: order.toObject()
        });
    } catch (err) {
        console.error('[PaymentReconciliation] Mark paid error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to mark order as paid.'
        });
    }
};

module.exports = {
    getPaymentReconciliation,
    markGatewayOrderPaid,
    buildReconciliationQuery,
    mapReconciliationOrder,
    classifyPaymentType
};
