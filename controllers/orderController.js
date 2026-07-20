/********************************************************************
 * Project: EonlineBazar
 * File: orderController.js
 * Location: controllers/orderController.js
 * Author: Abdul Karim Sheikh
 * Description: এই কন্ট্রোলারটি কাস্টমারের নতুন অর্ডার প্লেসমেন্ট, স্টক আপডেট, 
 * ইউজার ভিত্তিক অর্ডার হিস্ট্রি, পাবলিক অর্ডার ট্র্যাকিং এবং ড্যাশবোর্ডের 
 * রিয়েল-টাইম স্ট্যাটাস বা সামারি ডাটা প্রসেস করে।
 ********************************************************************/

const mongoose = require('mongoose'); 
const Product = require('../models/product'); 
const Order = require('../models/order'); 
const User = require('../models/user'); 
const {
    validateCouponForCart,
    assertCouponActiveAndUnexpired,
    runCouponAutoExpiry,
    redeemCoupon,
    recordCouponUserUse,
    releaseCouponSlot
} = require('./couponController');
const { getApplicationNow, isExpiryReached } = require('../utils/applicationTime');
const Coupon = require('../models/coupon');
const {
    getDeliverySettings,
    resolveDistrictLabel,
    resolveDeliveryZone,
    toShippingLocationLabel,
    computeDeliveryCharge,
    buildLockedOrderTotals,
    roundMoney,
    isValidDistrict
} = require('../utils/deliveryChargeService');
const { syncCheckoutAddressToProfile } = require('../utils/savedAddress');
const {
    loadRewardSettings,
    creditOrderDeliveryRewards,
    isWithinRefundUndoWindow
} = require('../utils/rewardSettings');

/**
 * 🌟 হেল্পার: একটি অর্ডার-আইটেমের ভ্যারিয়েন্ট প্রোডাক্টের variants অ্যারের কোন
 * ইনডেক্সে আছে তা খুঁজে বের করে। sku অগ্রাধিকার পায়, নইলে attribute+value
 * (case-insensitive) মিলিয়ে দেখা হয়। কোনো ভ্যারিয়েন্ট না থাকলে -1 রিটার্ন করে।
 */
function findVariantIndex(product, item) {
    if (!product || !Array.isArray(product.variants) || product.variants.length === 0) return -1;

    const norm = (v) => String(v || '').trim().toLowerCase();
    const sku = norm(item.variantSku || item.sku);
    const attr = norm(item.variantAttribute || item.attribute);
    const val = norm(item.variantValue || item.value);
    const vid = norm(item.variantId);

    // ১. SKU দিয়ে সবচেয়ে নির্ভরযোগ্য ম্যাচ
    if (sku) {
        const idx = product.variants.findIndex(v => norm(v.sku) && norm(v.sku) === sku);
        if (idx > -1) return idx;
    }
    // ২. attribute + value কম্বিনেশন
    if (attr && val) {
        const idx = product.variants.findIndex(v => norm(v.attribute) === attr && norm(v.value) === val);
        if (idx > -1) return idx;
    }
    // ৩. variantId ("attribute::value" বা sku) দিয়ে fallback ম্যাচ
    if (vid) {
        const idx = product.variants.findIndex(v =>
            norm(v.sku) === vid || `${norm(v.attribute)}::${norm(v.value)}` === vid
        );
        if (idx > -1) return idx;
    }
    return -1;
}

/** Verified selling price from catalog — never trust client item.price. */
function resolveSellingPrice(product, item) {
    if (!product) return NaN;

    const vIdx = findVariantIndex(product, item);
    if (vIdx > -1) {
        const variantPrice = Number(product.variants[vIdx].price);
        if (Number.isFinite(variantPrice) && variantPrice >= 0) return variantPrice;
    }

    return Number(product.price);
}

function buildLockedPricingPayload({
    subTotal,
    discountAmount,
    deliveryCharge,
    merchandisePayable,
    grandTotal,
    shippingDistrict,
    shippingLocationType,
    deliveryLocationType
}) {
    return {
        subTotal: roundMoney(subTotal),
        discountAmount: roundMoney(discountAmount),
        deliveryCharge: roundMoney(deliveryCharge),
        merchandisePayable: roundMoney(merchandisePayable),
        grandTotal: roundMoney(grandTotal),
        totalAmount: roundMoney(grandTotal),
        shippingDistrict,
        shippingLocationType,
        deliveryLocationType
    };
}

// ১. নতুন অর্ডার তৈরি করা এবং স্টক কমানো
const createOrder = async (req, res) => {
    try {
        const customerName = req.body.customerName || req.body.name;
        const customerPhone = req.body.customerPhone || req.body.phone;
        const customerAddress = req.body.customerAddress || req.body.shippingAddress || req.body.address;
        const items = req.body.items || req.body.orderItems || req.body.cart || [];
        const note = req.body.note || req.body.notes || '';
        const couponCode = String(req.body.couponCode || req.body.coupon || '').trim().toUpperCase();
        
        const paymentMethod = req.body.paymentMethod || req.body.method || 'COD'; 
        
        const orderId = req.body.orderId || 'ORD-' + Math.floor(100000 + Math.random() * 900000);

        if (!customerName || !customerPhone || !customerAddress) {
            return res.status(400).json({ success: false, message: "অনুগ্রহ করে নাম, phone নম্বর এবং সম্পূর্ণ ঠিকানা প্রদান করুন।" });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Your order must include at least one item.' });
        }

        const userId = req.user ? req.user.id : (req.body.userId || null);
        const shippingDistrict = resolveDistrictLabel(
            req.body.shippingDistrict || req.body.customerDistrict || req.body.district
        );

        if (!shippingDistrict || !isValidDistrict(shippingDistrict)) {
            return res.status(400).json({
                success: false,
                message: 'Please select a valid shipping district.'
            });
        }

        // Never trust client-supplied totals or line prices — verified below from DB catalog + Settings.
        // 🌟 প্রতিটি আইটেমে প্রোডাক্টের বিক্রয় ও ক্রয়মূল্য (buyingPrice) স্ন্যাপশট হিসেবে যুক্ত করা।
        // ভবিষ্যতে প্রোডাক্টের দাম বদলালেও এই অর্ডারের প্রফিট/লস নির্ভুল থাকবে।
        let normalizedItems = [];
        let totalBuyingPrice = 0;
        let subtotal = 0;

        for (const rawItem of items) {
            const item = { ...rawItem };
            const targetId = item.id || item.productId || item._id;
            const quantity = Math.max(1, Number(item.quantity) || 1);

            if (!targetId) {
                return res.status(400).json({
                    success: false,
                    message: 'Each order item must include a valid product id.'
                });
            }

            const query = mongoose.Types.ObjectId.isValid(targetId)
                ? { $or: [{ _id: targetId }, { productId: targetId }] }
                : { productId: targetId };

            const prod = await Product.findOne(query).select('price buyingPrice variants name image productId category');
            if (!prod) {
                return res.status(400).json({
                    success: false,
                    message: `Product not found: ${targetId}`
                });
            }

            const verifiedPrice = resolveSellingPrice(prod, item);
            if (!Number.isFinite(verifiedPrice) || verifiedPrice < 0) {
                return res.status(400).json({
                    success: false,
                    message: `Unable to verify price for "${prod.name || targetId}".`
                });
            }

            item.price = verifiedPrice;
            item.quantity = quantity;
            if (!item.name) item.name = prod.name;
            if (!item.productId) item.productId = prod.productId || String(prod._id);
            item.category = prod.category || 'General';

            const vIdx = findVariantIndex(prod, item);
            let buyingPrice = 0;
            if (vIdx > -1) {
                const variantBuying = Number(prod.variants[vIdx].buyingPrice);
                buyingPrice = (Number.isFinite(variantBuying) && variantBuying > 0)
                    ? variantBuying
                    : (Number(prod.buyingPrice) || 0);
            } else {
                buyingPrice = Number(prod.buyingPrice) || 0;
            }

            item.buyingPrice = buyingPrice;
            subtotal += verifiedPrice * quantity;
            totalBuyingPrice += buyingPrice * quantity;
            normalizedItems.push(item);
        }

        subtotal = roundMoney(subtotal);

        // Server-side coupon re-validation (never trust client discount alone)
        let discountAmount = 0;
        let appliedCouponCode = '';
        let couponDocId = null;

        if (couponCode) {
            const now = getApplicationNow();
            await runCouponAutoExpiry(now);

            const couponRecord = await Coupon.findOne({ code: couponCode });
            if (!couponRecord) {
                return res.status(404).json({
                    success: false,
                    message: 'Invalid coupon code.'
                });
            }

            if (isExpiryReached(couponRecord.expiryDate, now) && couponRecord.status !== 'EXPIRED') {
                couponRecord.status = 'EXPIRED';
                couponRecord.isActive = false;
                await couponRecord.save();
            }

            const eligibility = assertCouponActiveAndUnexpired(couponRecord, now);
            if (!eligibility.ok) {
                return res.status(eligibility.status).json({
                    success: false,
                    message: eligibility.message
                });
            }

            const couponResult = await validateCouponForCart({
                code: couponCode,
                subtotal,
                userId,
                now
            });
            if (!couponResult.ok) {
                return res.status(couponResult.status).json({
                    success: false,
                    message: couponResult.message
                });
            }

            // Defense in depth — discount always from server breakdown, never req.body
            discountAmount = couponResult.breakdown.discountAmount;
            appliedCouponCode = couponResult.breakdown.code;
            couponDocId = couponResult.coupon._id;

            const redeemEligibility = assertCouponActiveAndUnexpired(couponResult.coupon, now);
            if (!redeemEligibility.ok) {
                return res.status(redeemEligibility.status).json({
                    success: false,
                    message: redeemEligibility.message
                });
            }

            // Atomically claim a usage slot before persisting the order (race-safe)
            const redeemed = await redeemCoupon(couponDocId, now);
            if (!redeemed) {
                return res.status(400).json({
                    success: false,
                    message: 'This coupon has reached its usage limit.'
                });
            }
        }

        const deliverySettings = await getDeliverySettings();
        const deliveryLocationType = resolveDeliveryZone(deliverySettings, shippingDistrict);
        const shippingLocationType = toShippingLocationLabel(deliveryLocationType);
        const deliveryCharge = computeDeliveryCharge(deliverySettings, {
            customerDistrict: shippingDistrict,
            subtotal
        });
        const lockedTotals = buildLockedOrderTotals({
            itemSubtotal: subtotal,
            discountAmount,
            deliveryCharge
        });
        const {
            subTotal,
            grandTotal,
            deliveryCharge: lockedDeliveryCharge,
            merchandisePayable
        } = lockedTotals;

        const lockedPricing = buildLockedPricingPayload({
            subTotal,
            discountAmount,
            deliveryCharge: lockedDeliveryCharge,
            merchandisePayable,
            grandTotal,
            shippingDistrict,
            shippingLocationType,
            deliveryLocationType
        });

        const newOrder = new Order({
            orderId,
            user: userId,
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
            couponCode: appliedCouponCode,
            deliveryLocationType,
            shippingFee: lockedDeliveryCharge,
            totalBuyingPrice: Math.round(totalBuyingPrice),
            paymentMethod, 
            items: normalizedItems,
            note,
            status: 'Pending',
            isDelivered: false
        });

        try {
            await newOrder.save();
        } catch (saveErr) {
            if (couponDocId) {
                try {
                    await releaseCouponSlot(couponDocId);
                } catch (rbErr) {
                    console.error('⚠️ Coupon rollback error:', rbErr.message);
                }
            }
            throw saveErr;
        }

        // Track per-user usage only after a successful order save
        if (couponDocId && userId) {
            try {
                await recordCouponUserUse(couponDocId, userId);
            } catch (userUseErr) {
                console.error('⚠️ Coupon usedBy record error:', userUseErr.message);
            }
        }

        if (normalizedItems.length > 0) {
            for (const item of normalizedItems) {
                const targetId = item.id || item.productId || item._id;
                const quantityOrdered = Number(item.quantity) || 1; 

                if (!targetId) continue;

                let query = {};
                if (mongoose.Types.ObjectId.isValid(targetId)) {
                    query = { $or: [{ _id: targetId }, { productId: targetId }] };
                } else {
                    query = { productId: targetId };
                }

                const product = await Product.findOne(query);
                if (!product) continue;

                // 🌟 ভ্যারিয়েন্ট অর্ডার হলে ঐ নির্দিষ্ট ভ্যারিয়েন্টের স্টক কমানো হয়;
                // পাশাপাশি মূল stock ফিল্ডও সমান্তরালে কমে (aggregate সঠিক রাখতে)।
                const vIdx = findVariantIndex(product, item);
                if (vIdx > -1) {
                    const current = Number(product.variants[vIdx].stock) || 0;
                    product.variants[vIdx].stock = Math.max(0, current - quantityOrdered);
                    product.stock = Math.max(0, (Number(product.stock) || 0) - quantityOrdered);
                    product.markModified('variants');
                    await product.save();
                } else {
                    // সাধারণ প্রোডাক্ট (ভ্যারিয়েন্ট নেই) — মূল stock ফিল্ড কমানো
                    await Product.updateOne(query, { $inc: { stock: -quantityOrdered } });
                }
            }
        }

        if (userId) {
            const addressSyncResult = await syncCheckoutAddressToProfile(userId, req.body, {
                shippingDistrict,
                customerPhone
            });

            if (addressSyncResult.saved) {
                console.log('✅ Checkout address synced to user profile.');
            } else if (!addressSyncResult.skipped) {
                console.warn(
                    '⚠️ Checkout address profile sync skipped:',
                    addressSyncResult.reason || 'unknown'
                );
            }
        }

        res.status(201).json({
            success: true,
            message: "Order placed successfully! ধন্যবাদ আব্দুল করিম ভাই।",
            data: newOrder.toObject(),
            lockedPricing
        });

    } catch (err) {
        console.error("🔴 Order Save Error:", err);
        res.status(500).json({ success: false, message: "অর্ডার প্রসেস করতে ব্যর্থ হয়েছে।", error: err.message });
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

// ৩. লগইন করা নির্দিষ্ট ইউজারের নিজস্ব অর্ডারগুলো দেখা (My Orders সেকশন)
const getMyOrders = async (req, res) => {
    try {
        const myOrders = await Order.find({ user: req.user.id }).sort({ updatedAt: -1 });
        res.json({ success: true, data: myOrders });
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
        if (orderObj.items && Array.isArray(orderObj.items)) {
            for (let item of orderObj.items) {
                const targetId = item.id || item.productId || item._id;
                if (targetId) {
                    let query = {};
                    if (mongoose.Types.ObjectId.isValid(targetId)) {
                        query = { $or: [{ _id: targetId }, { productId: targetId }] };
                    } else {
                        query = { productId: targetId };
                    }
                    
                    // শুধুমাত্র image ফিল্ডটি সিলেক্ট করে নিয়ে আসা
                    const prod = await Product.findOne(query).select('image');
                    if (prod) {
                        item.image = prod.image; // আইটেমের ভেতরে ইমেজ পুশ করা হলো
                    } else {
                        item.image = ''; // ছবি না পাওয়া গেলে ফাকা থাকবে
                    }
                }
            }
        }

        res.json({ success: true, data: orderObj });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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

function normalizeOrderStatus(status) {
    return String(status || '').trim().toLowerCase();
}

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

function getOrderRefundAmount(order) {
    return Number(order?.grandTotal ?? order?.totalAmount) || 0;
}

function getOrderDisplayId(order) {
    if (order.orderId) return order.orderId;
    if (order._id) return String(order._id).slice(-6).toUpperCase();
    return 'N/A';
}

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
        const refundNote = `Refund for returned order #${displayOrderId}`;

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
            user.walletBalance = Number(user.walletBalance || 0) + refundAmount;
            user.walletHistory.unshift({
                type: 'refund',
                amount: refundAmount,
                note: refundNote,
                date: new Date()
            });
            await user.save();
        } catch (walletErr) {
            await Order.findByIdAndUpdate(orderId, {
                $set: { status: 'Return Requested' },
                $unset: { refundedAt: '', refundAmount: '', statusBeforeRefund: '' }
            });
            throw walletErr;
        }

        res.json({
            success: true,
            message: `Return approved. ৳${refundAmount.toLocaleString()} refunded to customer wallet.`,
            data: {
                order: updatedOrder,
                refundAmount,
                walletBalance: user.walletBalance,
                walletHistoryEntry: user.walletHistory[0]
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
            const userAfter = await User.findOneAndUpdate(
                { _id: order.user, walletBalance: { $gte: refundAmount } },
                {
                    $inc: { walletBalance: -refundAmount },
                    $push: {
                        walletHistory: {
                            $each: [{
                                type: 'debit',
                                amount: refundAmount,
                                note: 'Reversal: Refund cancelled by Admin',
                                date: new Date()
                            }],
                            $position: 0
                        }
                    }
                },
                { new: true }
            );

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

// ৮. ড্যাশবোর্ড স্ট্যাটাস সামারি (ইউজার ভিত্তিক লাইভ কাউন্ট)
const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const orders = await Order.find({ user: userId }).sort({ createdAt: -1 });
        
        const totalOrders = orders.length;
        const pendingOrders = orders.filter(o => 
            o.status && o.status.toLowerCase() === 'pending'
        ).length;
        
        const recentOrders = orders.slice(0, 4);

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
    createOrder, 
    getOrders, 
    getMyOrders, 
    getOrderById, 
    updateOrderStatus, 
    deleteOrder, 
    trackOrder,
    getDashboardStats,
    cancelUserOrder,
    returnUserOrder,
    approveOrderReturn,
    undoOrderRefund,
};





