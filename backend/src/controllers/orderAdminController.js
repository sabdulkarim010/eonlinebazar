/********************************************************************
 * Project: EonlineBazar
 * File: orderAdminController.js
 * Location: backend/src/controllers/orderAdminController.js
 * Description: Admin order list, status, shipping, bulk ops, manual POS, return refunds.
 ********************************************************************/

const mongoose = require('mongoose');
const Product = require('../models/product');
const Order = require('../models/order');
const User = require('../models/user');
const {
    getDeliverySettings,
    resolveDistrictLabel,
    resolveDeliveryZone,
    toShippingLocationLabel,
    buildLockedOrderTotals,
    roundMoney,
    isValidDistrict
} = require('../services/deliveryChargeService');
const { getDeliveryEstimate } = require('../services/deliveryEstimateService');
const { isSandboxMode } = require('../services/sandboxService');
const {
    loadRewardSettings,
    creditOrderDeliveryRewards,
    isWithinRefundUndoWindow
} = require('../utils/rewardSettings');
const { pickImageFromSources, pickEmojiFromSources } = require('../utils/orderItemImages');
const { notifyOrderStatusUpdated } = require('../services/smsService');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');
const { findVariantIndex } = require('../utils/variantHelpers');
const { creditWalletForUser, reverseWalletCredit } = require('../services/walletService');
const { loadFlashSaleSettings } = require('../services/flashSaleService');
const { invalidate, CACHE_KEYS } = require('../services/cacheService');
const { emitToAdmins } = require('../services/socketService');
const {
    resolvePaymentMethodForCheckout,
    buildOrderPaymentSnapshot
} = require('../services/paymentMethodService');
const {
    dispatchAdminWhatsAppAlertSafely,
    resolveSellingPriceFromSettings,
    buildLockedPricingPayload,
    buildVariantSnapshot,
    resolveAvailableStock,
    deductOrderStock,
    normalizeOrderStatus,
    getOrderRefundAmount,
    getOrderDisplayId
} = require('./orderControllerHelpers');

/**
 * Staff POS / phone-order entry — admin creates orders with manual pricing,
 * variant-aware stock deduction, and finance-ready buyingPrice snapshots.
 */
const createManualOrder = async (req, res) => {
    try {
        const customerName = String(req.body.customerName || req.body.name || '').trim();
        const customerPhone = String(req.body.customerPhone || req.body.phone || '').trim();
        const customerAddress = String(
            req.body.customerAddress || req.body.shippingAddress || req.body.address || ''
        ).trim();
        const items = req.body.items || req.body.orderItems || [];
        const note = String(req.body.note || req.body.notes || '').trim();
        const manualDiscount = roundMoney(Number(req.body.manualDiscount ?? req.body.discountAmount) || 0);
        const shippingFee = roundMoney(Number(req.body.shippingFee ?? req.body.deliveryCharge) || 0);
        const paymentStatus = String(req.body.paymentStatus || req.body.paymentMethod || 'COD').trim();
        const deliveryAreaRaw = String(
            req.body.deliveryArea || req.body.shippingLocationType || req.body.deliveryLocationType || 'inside'
        ).trim().toLowerCase();

        if (!customerName || !customerPhone || !customerAddress) {
            return res.status(400).json({
                success: false,
                message: 'Customer name, phone, and delivery address are required.'
            });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Add at least one product line to the manual order.'
            });
        }

        const deliveryLocationType = deliveryAreaRaw.includes('outside') ? 'outside' : 'inside';
        const shippingLocationType = toShippingLocationLabel(deliveryLocationType);
        const shippingDistrict = deliveryLocationType === 'inside' ? 'Dhaka' : 'Outside Dhaka';
        const deliveryEstimate = getDeliveryEstimate(deliveryLocationType);

        let normalizedItems = [];
        let totalBuyingPrice = 0;
        let subtotal = 0;
        const flashSettings = await loadFlashSaleSettings();

        for (const rawItem of items) {
            const item = { ...rawItem };
            const targetId = item.id || item.productId || item._id;
            const quantity = Math.max(1, Number(item.quantity) || 1);

            if (!targetId) {
                return res.status(400).json({
                    success: false,
                    message: 'Each line item must include a valid product id.'
                });
            }

            const query = mongoose.Types.ObjectId.isValid(targetId)
                ? { $or: [{ _id: targetId }, { productId: targetId }] }
                : { productId: targetId };

            const prod = await Product.findOne(query).select(
                'price buyingPrice variants name image images icon productId category stock stockQuantity hasVariants'
            );
            if (!prod) {
                return res.status(400).json({
                    success: false,
                    message: `Product not found: ${targetId}`
                });
            }

            const vIdx = findVariantIndex(prod, item);
            const hasVariants = Array.isArray(prod.variants) && prod.variants.length > 0;

            if (hasVariants && vIdx <= -1) {
                return res.status(400).json({
                    success: false,
                    message: `Select a valid Size/Color variant for "${prod.name}".`
                });
            }

            const availableStock = resolveAvailableStock(prod, vIdx);
            if (quantity > availableStock) {
                const variantHint = vIdx > -1 ? buildVariantSnapshot(prod, vIdx).variantLabel : 'default';
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for "${prod.name}" (${variantHint || 'default'}). Available: ${availableStock}, requested: ${quantity}.`
                });
            }

            const verifiedPrice = resolveSellingPriceFromSettings(prod, item, flashSettings);
            if (!Number.isFinite(verifiedPrice) || verifiedPrice < 0) {
                return res.status(400).json({
                    success: false,
                    message: `Unable to verify price for "${prod.name || targetId}".`
                });
            }

            item.price = verifiedPrice;
            item.quantity = quantity;
            item.name = prod.name;
            item.productId = prod.productId || String(prod._id);
            item.category = prod.category || 'General';

            let buyingPrice = 0;
            if (vIdx > -1) {
                Object.assign(item, buildVariantSnapshot(prod, vIdx));
                const variantBuying = Number(prod.variants[vIdx].buyingPrice);
                buyingPrice = (Number.isFinite(variantBuying) && variantBuying > 0)
                    ? variantBuying
                    : (Number(prod.buyingPrice) || 0);
            } else {
                buyingPrice = Number(prod.buyingPrice) || 0;
            }

            item.buyingPrice = buyingPrice;

            const snapshotImage = pickImageFromSources(item, prod);
            const snapshotEmoji = pickEmojiFromSources(item, prod);
            if (snapshotImage) {
                item.image = snapshotImage;
                item.imageUrl = snapshotImage;
                item.products = snapshotImage;
            }
            if (snapshotEmoji) {
                item.emoji = snapshotEmoji;
                item.icon = snapshotEmoji;
            }

            subtotal += verifiedPrice * quantity;
            totalBuyingPrice += buyingPrice * quantity;
            normalizedItems.push(item);
        }

        subtotal = roundMoney(subtotal);

        if (manualDiscount > subtotal) {
            return res.status(400).json({
                success: false,
                message: 'Manual discount cannot exceed the merchandise subtotal.'
            });
        }

        const lockedTotals = buildLockedOrderTotals({
            itemSubtotal: subtotal,
            discountAmount: manualDiscount,
            deliveryCharge: shippingFee
        });

        const {
            subTotal,
            grandTotal,
            deliveryCharge: lockedDeliveryCharge,
            discountAmount,
            merchandisePayable
        } = lockedTotals;

        const isPaid = paymentStatus.toLowerCase() === 'paid';
        const paymentMethod = isPaid ? 'Paid' : 'COD';
        const status = isPaid ? 'Processing' : 'Pending';

        // POS অর্ডারেও একই পেমেন্ট স্ন্যাপশট রাখা হয় (paymentMethodId পাঠানো
        // হলে), যাতে অনলাইন ও কাউন্টার — দুই চ্যানেলের লেজার একই কাঠামোয় থাকে।
        // স্টাফ কোনো মেথড না বাছলে COD/Paid লেবেলসহ খালি স্ন্যাপশট যায়।
        const posPaymentMethod = req.body.paymentMethodId
            ? await resolvePaymentMethodForCheckout(req.body.paymentMethodId)
            : null;
        const posPaymentSnapshot = buildOrderPaymentSnapshot(posPaymentMethod, { amount: grandTotal });
        posPaymentSnapshot.status = isPaid ? 'paid' : 'unpaid';
        if (isPaid) posPaymentSnapshot.paidAt = new Date();
        if (!posPaymentMethod) posPaymentSnapshot.name = paymentMethod;
        const orderId = req.body.orderId || `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
        const staffNote = note ? `[Manual POS] ${note}` : '[Manual POS] Staff phone / counter entry';
        const inSandbox = await isSandboxMode();

        const newOrder = new Order({
            orderId,
            user: null,
            customerName,
            customerPhone,
            customerAddress,
            subTotal,
            deliveryCharge: lockedDeliveryCharge,
            grandTotal,
            shippingLocationType,
            shippingDistrict,
            totalAmount: grandTotal,
            subtotal: subTotal,
            discountAmount,
            deliveryLocationType,
            shippingFee: lockedDeliveryCharge,
            estimatedDelivery: deliveryEstimate.label,
            totalBuyingPrice: Math.round(totalBuyingPrice),
            paymentMethod,
            payment: posPaymentSnapshot,
            items: normalizedItems,
            note: staffNote,
            status,
            isDelivered: false,
            orderSource: 'manual',
            createdByAdmin: req.admin?.username || req.admin?.displayName || 'admin',
            isSandbox: inSandbox
        });

        await newOrder.save();
        await deductOrderStock(normalizedItems);

        emitToAdmins('new_order', {
            orderId: newOrder.orderId,
            customerName: newOrder.customerName,
            total: newOrder.grandTotal,
            paymentMethod: newOrder.paymentMethod,
            createdAt: newOrder.createdAt
        });

        console.log(`[Order] ✓ Manual order #${newOrder.orderId} saved — scheduling background WhatsApp alert`);
        dispatchAdminWhatsAppAlertSafely(newOrder);

        await logSecurityEvent({
            action: 'Manual Order Created',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${orderId} · ${customerName} · ৳${grandTotal} · ${normalizedItems.length} item(s) · ${paymentMethod}`
        });

        await invalidate(CACHE_KEYS.POPULAR_PRODUCTS);

        res.status(201).json({
            success: true,
            message: 'Manual order created successfully.',
            data: newOrder.toObject(),
            lockedPricing: buildLockedPricingPayload({
                subTotal,
                discountAmount,
                deliveryCharge: lockedDeliveryCharge,
                merchandisePayable,
                grandTotal,
                shippingDistrict,
                shippingLocationType,
                deliveryLocationType
            })
        });
    } catch (err) {
        console.error('Manual Order Error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to create manual order.',
            error: err.message
        });
    }
};

// ২. সব অর্ডার ডাটাবেজ থেকে নিয়ে আসা (অ্যাডমিন প্যানেলের জন্য)
const getOrders = async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 }); 
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * Admin: update shipping / customer contact fields on an existing order.
 * Does not recalculate totals — only corrects delivery identity data.
 */
const updateOrderShippingAddress = async (req, res) => {
    try {
        const {
            customerName,
            customerPhone,
            customerAddress,
            shippingDistrict,
            shippingUpazila,
            upazila,
            shippingStreetAddress,
            streetAddress,
            note
        } = req.body;

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const trimmedName = String(customerName || '').trim();
        const trimmedPhone = String(customerPhone || '').replace(/\D/g, '');
        const district = resolveDistrictLabel(String(shippingDistrict || '').trim());
        const resolvedUpazila = String(shippingUpazila || upazila || '').trim();
        const street = String(shippingStreetAddress || streetAddress || '').trim();
        const directAddress = String(customerAddress || '').trim();
        const compositeAddress = directAddress
            || [street, resolvedUpazila, district].filter(Boolean).join(', ');

        if (!trimmedName) {
            return res.status(400).json({ success: false, message: 'Customer name is required.' });
        }
        if (!/^01[3-9]\d{8}$/.test(trimmedPhone)) {
            return res.status(400).json({
                success: false,
                message: 'Phone must be a valid 11-digit Bangladeshi mobile number.'
            });
        }
        if (!district || !isValidDistrict(district)) {
            return res.status(400).json({ success: false, message: 'Please select a valid district.' });
        }
        if (!resolvedUpazila) {
            return res.status(400).json({ success: false, message: 'Upazila / thana is required.' });
        }
        if (!compositeAddress) {
            return res.status(400).json({ success: false, message: 'Delivery address is required.' });
        }

        const deliverySettings = await getDeliverySettings();
        const deliveryLocationType = resolveDeliveryZone(deliverySettings, district);
        const shippingLocationType = toShippingLocationLabel(deliveryLocationType);

        order.customerName = trimmedName;
        order.customerPhone = trimmedPhone;
        order.customerAddress = compositeAddress;
        order.shippingDistrict = district;
        order.shippingLocationType = shippingLocationType;
        order.deliveryLocationType = deliveryLocationType;
        if (note !== undefined) {
            order.note = String(note || '').trim();
        }

        await order.save();

        await logSecurityEvent({
            action: 'Order Shipping Updated',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${order.orderId || order._id} shipping details edited by admin`
        });

        return res.status(200).json({
            success: true,
            message: 'Shipping details updated successfully.',
            data: order
        });
    } catch (error) {
        console.error('Update Order Shipping Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update shipping details.' });
    }
};

// ৫. অর্ডারের স্ট্যাটাস পরিবর্তন করা (অ্যাডমিন প্যানেল থেকে - Pending/Delivered)
const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ success: false, message: "Status is required" });
        }

        const isDelivered = status.toLowerCase() === 'delivered';
        const statusLower = status.toLowerCase();
        const updatePayload = { status, isDelivered };

        const paymentStatus = String(req.body.paymentStatus || '').trim().toLowerCase();
        if (paymentStatus) {
            updatePayload['payment.status'] = paymentStatus;
            if (paymentStatus === 'paid') {
                updatePayload['payment.paidAt'] = new Date();
            }
        }

        if (isDelivered) {
            updatePayload.deliveredAt = new Date();
        }

        if (statusLower === 'cancelled' || statusLower === 'canceled') {
            updatePayload.cancelledBy = 'Admin';
            updatePayload.isDelivered = false;
        }

        const existingOrder = await Order.findById(req.params.id);
        if (!existingOrder) {
            return res.status(404).json({ success: false, message: "Order not found!" });
        }

        if ((statusLower === 'cancelled' || statusLower === 'canceled') && !existingOrder.cancelReason) {
            updatePayload.cancelReason = String(req.body?.cancelReason || 'Cancelled by admin').trim();
        }

        const wasDelivered = existingOrder.isDelivered === true
            || String(existingOrder.status || '').trim().toLowerCase() === 'delivered';

        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id,
            { $set: updatePayload },
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(404).json({ success: false, message: "Order not found!" });
        }

        if (isDelivered && !wasDelivered && updatedOrder.user) {
            try {
                await creditOrderDeliveryRewards(updatedOrder);
            } catch (rewardErr) {
                console.error('⚠️ Reward credit error on delivery:', rewardErr.message);
            }
        }

        if (String(existingOrder.status || '') !== String(updatedOrder.status || '')) {
            notifyOrderStatusUpdated(updatedOrder, updatedOrder.status);
        }

        res.json({ success: true, message: "Order status updated successfully!", data: updatedOrder });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ৬. অর্ডার ডিলিট করা (অ্যাডমিন প্যানেল থেকে)
const deleteOrder = async (req, res) => {
    try {
        const deletedOrder = await Order.findByIdAndDelete(req.params.id);
        if (!deletedOrder) {
            return res.status(404).json({ success: false, message: "Order not found!" });
        }
        res.json({ success: true, message: "Order deleted successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * Bulk delete orders (admin reconciliation / live orders).
 * POST /api/admin/orders/bulk-delete
 */
const bulkDeleteOrders = async (req, res) => {
    try {
        const { orderIds } = req.body || {};

        if (!Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'orderIds array is required.'
            });
        }

        if (orderIds.length > 50) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 50 orders can be deleted at once.'
            });
        }

        const validIds = orderIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
        if (validIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid order IDs provided.'
            });
        }

        const result = await Order.deleteMany({ _id: { $in: validIds } });

        return res.json({
            success: true,
            deleted: result.deletedCount,
            message: `${result.deletedCount} order(s) deleted.`
        });
    } catch (err) {
        console.error('Bulk delete orders error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete orders.'
        });
    }
};

// ১১. অ্যাডমিন: রিটার্ন রিকোয়েস্ট অনুমোদন ও ওয়ালেট রিফান্ড
const approveOrderReturn = async (req, res) => {
    const orderId = req.params.id;

    try {
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (normalizeOrderStatus(order.status) !== 'return requested') {
            return res.status(400).json({
                success: false,
                message: `Only orders with status "Return Requested" can be approved. Current status: "${order.status}".`
            });
        }

        if (!order.user) {
            return res.status(400).json({ success: false, message: 'This order is not linked to a registered user account.' });
        }

        const user = await User.findById(order.user);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Customer account not found for this order.' });
        }

        const refundAmount = getOrderRefundAmount(order);
        if (refundAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid refund amount for this order.' });
        }

        const displayOrderId = getOrderDisplayId(order);

        const updatedOrder = await Order.findOneAndUpdate(
            { _id: orderId, status: 'Return Requested' },
            {
                $set: {
                    status: 'Returned',
                    refundedAt: new Date(),
                    refundAmount,
                    statusBeforeRefund: order.status || 'Return Requested'
                }
            },
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(409).json({
                success: false,
                message: 'Return approval could not be completed. The order may have already been processed.'
            });
        }

        try {
            await creditWalletForUser(
                order.user,
                refundAmount,
                displayOrderId,
                'Refund for returned items'
            );
        } catch (walletErr) {
            await Order.findByIdAndUpdate(orderId, {
                $set: { status: 'Return Requested' },
                $unset: { refundedAt: '', refundAmount: '', statusBeforeRefund: '' }
            });
            throw walletErr;
        }

        const walletUser = await User.findById(order.user).select('walletBalance walletHistory');

        res.json({
            success: true,
            message: `Return approved. ৳${refundAmount.toLocaleString()} refunded to customer wallet.`,
            data: {
                order: updatedOrder,
                refundAmount,
                walletBalance: walletUser?.walletBalance || 0,
                walletHistoryEntry: walletUser?.walletHistory?.[0] || null
            }
        });
    } catch (err) {
        console.error('Approve Return Error:', err);
        res.status(500).json({ success: false, message: 'Failed to approve return and process refund.' });
    }
};

const SPENT_REFUND_FUNDS_MESSAGE = 'Cannot undo. Customer has already spent the refunded wallet funds.';

// ১২. অ্যাডমিন: ভুল রিফান্ড নিরাপদে উল্টানো (Safe Undo Refund)
const undoOrderRefund = async (req, res) => {
    const orderId = req.params.id;

    try {
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const status = normalizeOrderStatus(order.status);
        if (status !== 'returned' && status !== 'refunded') {
            return res.status(400).json({
                success: false,
                message: `Only returned or refunded orders can have their refund undone. Current status: "${order.status}".`
            });
        }

        const settings = await loadRewardSettings();
        if (settings.refundUndoWindowHours <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Refund undo is disabled in master settings.'
            });
        }

        const refundedAt = order.refundedAt || order.updatedAt;
        if (!isWithinRefundUndoWindow(refundedAt, settings.refundUndoWindowHours)) {
            return res.status(400).json({
                success: false,
                message: `Refund undo window has expired (${settings.refundUndoWindowHours} hours).`
            });
        }

        if (!order.user) {
            return res.status(400).json({ success: false, message: 'This order is not linked to a registered user account.' });
        }

        const refundAmount = Number(order.refundAmount) || getOrderRefundAmount(order);
        if (refundAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid refund amount for this order.' });
        }

        const user = await User.findById(order.user);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Customer account not found for this order.' });
        }

        if (Number(user.walletBalance || 0) < refundAmount) {
            return res.status(400).json({
                success: false,
                message: SPENT_REFUND_FUNDS_MESSAGE
            });
        }

        const revertStatus = order.statusBeforeRefund || 'Return Requested';
        const previousRefundMeta = {
            status: order.status,
            refundedAt: order.refundedAt,
            refundAmount: order.refundAmount,
            statusBeforeRefund: order.statusBeforeRefund
        };

        const updatedOrder = await Order.findOneAndUpdate(
            { _id: orderId, status: { $in: ['Returned', 'Refunded'] } },
            {
                $set: { status: revertStatus, refundedAt: null, refundAmount: 0 },
                $unset: { statusBeforeRefund: '' }
            },
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(409).json({
                success: false,
                message: 'Refund undo could not be completed. The order may have already been updated.'
            });
        }

        try {
            const userAfter = await reverseWalletCredit(order.user, refundAmount);

            if (!userAfter) {
                await Order.findByIdAndUpdate(orderId, { $set: previousRefundMeta });
                return res.status(400).json({
                    success: false,
                    message: SPENT_REFUND_FUNDS_MESSAGE
                });
            }

            res.json({
                success: true,
                message: `Refund reversed. ৳${refundAmount.toLocaleString()} deducted from customer wallet. Order status restored to "${revertStatus}".`,
                data: {
                    order: updatedOrder,
                    refundAmount,
                    walletBalance: userAfter.walletBalance,
                    walletHistoryEntry: userAfter.walletHistory[0]
                }
            });
        } catch (walletErr) {
            await Order.findByIdAndUpdate(orderId, { $set: previousRefundMeta });
            throw walletErr;
        }
    } catch (err) {
        console.error('Undo Refund Error:', err);
        res.status(500).json({ success: false, message: 'Failed to undo refund.' });
    }
};

module.exports = {
    createManualOrder,
    getOrders,
    updateOrderShippingAddress,
    updateOrderStatus,
    deleteOrder,
    bulkDeleteOrders,
    approveOrderReturn,
    undoOrderRefund
};

