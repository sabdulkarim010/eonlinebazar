/********************************************************************
 * Project: EonlineBazar
 * File: orderCustomerController.js
 * Location: backend/src/controllers/orderCustomerController.js
 * Description: Customer order history, tracking, cancel/return, invoices, dashboard stats.
 ********************************************************************/

const Order = require('../models/order');
const User = require('../models/user');
const { generateOrderInvoicePdf, resolveInvoiceNumber } = require('../utils/invoicePdf');
const { enrichOrderItemsWithImages, enrichOrdersWithImages } = require('../utils/orderItemImages');
const { normalizeOrderStatus } = require('./orderControllerHelpers');
const { sendAdminNotification } = require('../services/notificationService');

function mapCustomerOrderItem(item = {}) {
    const productImages = Array.isArray(item.product?.images) ? item.product.images : [];
    const image = item.image
        || item.productImage
        || item.imageUrl
        || productImages[0]
        || item.product?.image
        || '';
    const variant = item.variant
        || item.variantLabel
        || [item.variantAttribute, item.variantValue].filter(Boolean).join(' ')
        || '';

    return {
        ...item,
        name: item.name || item.product?.name || 'Product',
        price: Number(item.price) || 0,
        quantity: Number(item.quantity || item.qty) || 1,
        image,
        productImage: item.productImage || image,
        color: item.color || '',
        size: item.size || '',
        variant
    };
}

function mapCustomerOrder(order = {}) {
    return {
        ...order,
        items: Array.isArray(order.items) ? order.items.map(mapCustomerOrderItem) : []
    };
}

// ৩. লগইন করা নির্দিষ্ট ইউজারের নিজস্ব অর্ডারগুলো দেখা (My Orders সেকশন)
const getMyOrders = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const filter = { user: req.user.id };

        const total = await Order.countDocuments(filter);
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const safePage = Math.min(page, totalPages);

        const myOrders = await Order.find(filter)
            .sort({ updatedAt: -1 })
            .skip((safePage - 1) * limit)
            .limit(limit);

        const enrichedOrders = (await enrichOrdersWithImages(myOrders)).map(mapCustomerOrder);

        res.json({
            success: true,
            data: enrichedOrders,
            pagination: {
                page: safePage,
                limit,
                total,
                totalPages
            }
        });
    } catch (err) {
        console.error("Order Fetch Error:", err);
        res.status(500).json({ success: false, message: "অর্ডার হিস্ট্রি লোড করতে ব্যর্থ হয়েছে।" });
    }
};

// 🌟 ৪. নির্দিষ্ট একটি অর্ডারের বিস্তারিত দেখা (আপডেট: প্রোডাক্টের ছবি যুক্ত করার লজিক সহ)
const getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: "অর্ডারটি খুঁজে পাওয়া যায়নি!" });
        }
        
        // নিরাপত্তা চেক
        if (order.user && order.user.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: "দুঃখিত, আপনি অন্য কারো অর্ডারের বিবরণ দেখতে পারবেন না।" });
        }

        // 🟢 মঙ্গুজ ডকুমেন্টকে প্লেইন অবজেক্টে রূপান্তর করা, যাতে ডাইনামিকভাবে 'image' ফিল্ড পুশ করা যায়
        const orderObj = order.toObject();

        // আইটেমগুলোর ইমেজ ডাটাবেজের Product কালেকশন থেকে লাইভ খুঁজে নিয়ে আসা
        await enrichOrderItemsWithImages(orderObj);

        res.json({ success: true, data: orderObj });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Download order invoice as PDF (customer-owned orders only)
const downloadOrderInvoice = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (order.user && order.user.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'You cannot download this invoice.' });
        }

        const orderObj = order.toObject();
        await enrichOrderItemsWithImages(orderObj);

        const pdfBuffer = await generateOrderInvoicePdf(orderObj);
        const invoiceNo = resolveInvoiceNumber(orderObj);
        const filename = `Invoice-${invoiceNo}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        return res.send(pdfBuffer);
    } catch (err) {
        console.error('Invoice PDF Error:', err);
        return res.status(500).json({ success: false, message: 'Failed to generate invoice PDF.' });
    }
};

// ৭. অর্ডার ট্র্যাক করা (পাবলিক সার্চ)
const trackOrder = async (req, res) => {
    try {
        const { orderId, phone } = req.query;
        const order = await Order.findOne({ orderId: orderId, customerPhone: phone });
        
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        res.status(200).json(order);
    } catch (error) {
        console.error("Tracking Error:", error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function getOrderDeliveryDate(order) {
    return order.deliveredAt || order.deliveryDate || order.updatedAt || null;
}

function isOrderWithinReturnWindow(order) {
    if (normalizeOrderStatus(order.status) !== 'delivered') return false;

    const deliveryDate = getOrderDeliveryDate(order);
    if (!deliveryDate) return false;

    const delivered = new Date(deliveryDate);
    if (Number.isNaN(delivered.getTime())) return false;

    const diffMs = Date.now() - delivered.getTime();
    return diffMs >= 0 && diffMs <= RETURN_WINDOW_MS;
}

function assertOrderOwnership(order, userId) {
    if (!order.user || order.user.toString() !== userId) {
        const err = new Error('You are not authorized to modify this order.');
        err.statusCode = 403;
        throw err;
    }
}

/** Resolve final reason text from dropdown + optional custom "Other" input */
function resolveSubmittedReason(body = {}) {
    const selected = String(body.selectedReason || body.reasonCode || '').trim();
    const custom = String(body.customReason || '').trim();
    const fallback = String(body.reason || '').trim();

    if (selected === 'Other') {
        return custom || fallback;
    }
    return selected || fallback;
}

// ৯. ইউজার অর্ডার বাতিল (Cancel Order)
const cancelUserOrder = async (req, res) => {
    try {
        const cancelReason = resolveSubmittedReason(req.body);
        if (!cancelReason) {
            return res.status(400).json({ success: false, message: 'Please provide a reason for cancellation.' });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        assertOrderOwnership(order, req.user.id);

        const status = normalizeOrderStatus(order.status);
        if (status === 'cancelled' || status === 'canceled') {
            return res.status(400).json({ success: false, message: 'This order is already cancelled.' });
        }
        if (status !== 'pending' && status !== 'processing') {
            return res.status(400).json({
                success: false,
                message: `Order cannot be cancelled while status is "${order.status}".`
            });
        }

        order.status = 'Cancelled';
        order.cancelReason = cancelReason;
        order.cancelledBy = 'Customer';
        order.actionReason = cancelReason;
        await order.save();

        res.json({
            success: true,
            message: 'Your order has been cancelled successfully.',
            data: order
        });
    } catch (err) {
        const statusCode = err.statusCode || 500;
        if (statusCode >= 500) console.error('Cancel Order Error:', err);
        res.status(statusCode).json({
            success: false,
            message: err.statusCode ? err.message : 'Failed to cancel order.'
        });
    }
};

async function findOrderForCustomer(id) {
    const value = String(id || '');
    if (/^[a-fA-F0-9]{24}$/.test(value)) {
        const byId = await Order.findById(value);
        if (byId) return byId;
    }
    return Order.findOne({ orderId: value });
}

// PUT /api/orders/:id/cancel — Pending orders only (mobile + API clients)
const cancelPendingOrder = async (req, res) => {
    try {
        const order = await findOrderForCustomer(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        assertOrderOwnership(order, req.user.id);

        const status = normalizeOrderStatus(order.status);
        if (status === 'cancelled' || status === 'canceled') {
            return res.status(400).json({ success: false, message: 'This order is already cancelled.' });
        }
        if (status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Order can only be cancelled while status is Pending. Current status: "${order.status}".`
            });
        }

        const cancelReason = resolveSubmittedReason(req.body) || 'Cancelled from the mobile app';
        order.status = 'Cancelled';
        order.cancelReason = cancelReason;
        order.cancelledBy = 'Customer';
        order.actionReason = cancelReason;
        await order.save();

        res.json({
            success: true,
            message: 'Your order has been cancelled successfully.',
            data: order
        });
    } catch (err) {
        const statusCode = err.statusCode || 500;
        if (statusCode >= 500) console.error('Cancel Pending Order Error:', err);
        res.status(statusCode).json({
            success: false,
            message: err.statusCode ? err.message : 'Failed to cancel order.'
        });
    }
};

// ১০. ইউজার রিটার্ন রিকোয়েস্ট (Return Order — admin approval required)
const returnUserOrder = async (req, res) => {
    try {
        const returnReason = resolveSubmittedReason(req.body);
        if (!returnReason) {
            return res.status(400).json({ success: false, message: 'Please provide a reason for the return request.' });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        assertOrderOwnership(order, req.user.id);

        const status = normalizeOrderStatus(order.status);
        if (status === 'return requested') {
            return res.status(400).json({ success: false, message: 'A return has already been requested for this order.' });
        }
        if (status !== 'delivered') {
            return res.status(400).json({
                success: false,
                message: `Return requests are only allowed for delivered orders. Current status: "${order.status}".`
            });
        }
        if (!isOrderWithinReturnWindow(order)) {
            return res.status(400).json({
                success: false,
                message: 'Return window has expired. Returns are only allowed within 7 days of delivery.'
            });
        }

        order.status = 'Return Requested';
        order.returnReason = returnReason;
        order.actionReason = returnReason;
        order.returnRequestedAt = new Date();
        await order.save();

        res.json({
            success: true,
            message: 'Return request submitted successfully. Our team will review it shortly.',
            data: order
        });
    } catch (err) {
        const statusCode = err.statusCode || 500;
        if (statusCode >= 500) console.error('Return Order Error:', err);
        res.status(statusCode).json({
            success: false,
            message: err.statusCode ? err.message : 'Failed to submit return request.'
        });
    }
};

function collectOrderLineProductIds(item = {}) {
    return [item.productId, item.id, item._id, item.product]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
}

function findOrderLineForProduct(order, productId) {
    const target = String(productId || '').trim();
    if (!target || !Array.isArray(order.items)) return null;

    return order.items.find((item) =>
        collectOrderLineProductIds(item).some((id) => id === target)
    ) || null;
}

// Per-line-item return request (subset of order items)
const returnOrderItems = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;
        const { items, reason, photos } = req.body || {};

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one item is required for a return request.'
            });
        }

        const order = await Order.findOne({ _id: req.params.id, user: userId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const status = normalizeOrderStatus(order.status);
        if (status === 'return requested') {
            return res.status(400).json({
                success: false,
                message: 'A return has already been requested for this order.'
            });
        }
        if (status !== 'delivered') {
            return res.status(400).json({
                success: false,
                message: 'Returns are only allowed for delivered orders.'
            });
        }
        if (!isOrderWithinReturnWindow(order)) {
            return res.status(400).json({
                success: false,
                message: 'Return window has expired (7 days after delivery).'
            });
        }

        const returnItems = [];

        for (const item of items) {
            const productId = String(item.productId || '').trim();
            if (!productId) {
                return res.status(400).json({
                    success: false,
                    message: 'Each return item must include productId.'
                });
            }

            const orderLine = findOrderLineForProduct(order, productId);
            if (!orderLine) {
                return res.status(400).json({
                    success: false,
                    message: `Product ${productId} was not found in this order.`
                });
            }

            const requestedQty = Math.max(1, Number(item.quantity) || 1);
            const maxQty = Math.max(1, Number(orderLine.quantity) || 1);
            if (requestedQty > maxQty) {
                return res.status(400).json({
                    success: false,
                    message: `Return quantity for "${orderLine.name || productId}" cannot exceed ${maxQty}.`
                });
            }

            returnItems.push({
                productId,
                productName: String(item.productName || orderLine.name || 'Product').trim(),
                quantity: requestedQty,
                price: Number(item.price ?? orderLine.price) || 0,
                reason: String(item.reason || reason || 'No reason provided').trim(),
                photos: Array.isArray(photos) ? photos : (Array.isArray(item.photos) ? item.photos : []),
                status: 'pending'
            });
        }

        const returnReason = resolveSubmittedReason(req.body)
            || String(reason || '').trim()
            || returnItems[0]?.reason
            || 'Return requested';

        order.returnItems = returnItems;
        order.returnReason = returnReason;
        order.actionReason = returnReason;
        order.status = 'Return Requested';
        order.returnRequestedAt = new Date();
        if (!order.notificationsSent) order.notificationsSent = {};
        order.notificationsSent.returnReceived = true;
        order.markModified('returnItems');
        order.markModified('notificationsSent');
        await order.save();

        try {
            const customer = await User.findById(userId).select('name');
            await sendAdminNotification({
                type: 'return_request',
                orderId: order._id,
                orderNumber: order.orderId,
                customerName: customer?.name || order.customerName,
                itemCount: returnItems.length
            });
        } catch (notifErr) {
            console.warn('Return notification failed:', notifErr.message);
        }

        res.json({
            success: true,
            message: 'Return request submitted successfully.',
            data: {
                _id: order._id,
                status: order.status,
                returnItems: order.returnItems
            }
        });
    } catch (err) {
        console.error('returnOrderItems error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ৮. ড্যাশবোর্ড স্ট্যাটাস সামারি (ইউজার ভিত্তিক লাইভ কাউন্ট)
const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const orders = await Order.find({ user: userId }).sort({ createdAt: -1 });
        
        const totalOrders = orders.length;
        const pendingOrders = orders.filter(o => 
            o.status && o.status.toLowerCase() === 'pending'
        ).length;
        
        const recentOrders = await enrichOrdersWithImages(orders.slice(0, 4));

        // 🌟 নতুন: ইউজারের আসল ওয়ালেট ব্যালেন্স ও লয়্যালটি পয়েন্ট ডাটাবেজ থেকে আনা
        const user = await User.findById(userId).select('walletBalance loyaltyPoints');
        const balance = user ? (user.walletBalance || 0) : 0;
        const loyaltyPoints = user ? (user.loyaltyPoints || 0) : 0;
        
        res.json({ 
            success: true, 
            totalOrders: totalOrders, 
            pendingOrders: pendingOrders, 
            balance: balance, 
            loyaltyPoints: loyaltyPoints,
            recentOrders: recentOrders, 
            data: {
                totalOrders: totalOrders,
                pendingOrders: pendingOrders,
                balance: balance,
                loyaltyPoints: loyaltyPoints,
                recentOrders: recentOrders 
            }
        });

    } catch (err) {
        console.error("Dashboard Stats Error:", err);
        res.status(500).json({ success: false, message: "Stats load failed" });
    }
};

module.exports = {
    getMyOrders,
    getOrderById,
    downloadOrderInvoice,
    trackOrder,
    cancelUserOrder,
    cancelPendingOrder,
    returnUserOrder,
    returnOrderItems,
    getDashboardStats
};

