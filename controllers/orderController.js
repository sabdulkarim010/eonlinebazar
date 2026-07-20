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
    redeemCoupon,
    recordCouponUserUse,
    releaseCouponSlot
} = require('./couponController');
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

            const prod = await Product.findOne(query).select('price buyingPrice variants name image productId');
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
            const couponResult = await validateCouponForCart({
                code: couponCode,
                subtotal,
                userId
            });
            if (!couponResult.ok) {
                return res.status(couponResult.status).json({
                    success: false,
                    message: couponResult.message
                });
            }
            discountAmount = couponResult.breakdown.discountAmount;
            appliedCouponCode = couponResult.breakdown.code;
            couponDocId = couponResult.coupon._id;

            // Atomically claim a usage slot before persisting the order (race-safe)
            const redeemed = await redeemCoupon(couponDocId);
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

        // 🌟 নতুন: লগইন করা ইউজারকে লয়্যালটি পয়েন্ট ও ক্যাশব্যাক দেওয়া
        // রেট: প্রতি ৳১০ খরচে ১ পয়েন্ট (ডাবল পয়েন্ট অফার), এবং ১% ইনস্ট্যান্ট ক্যাশব্যাক
        if (userId) {
            try {
                const earnedPoints = Math.floor(grandTotal / 10);
                const cashback = Math.round(grandTotal * 0.01);

                const rewardUpdate = {
                    $inc: { loyaltyPoints: earnedPoints, walletBalance: cashback }
                };
                if (cashback > 0) {
                    rewardUpdate.$push = {
                        walletHistory: {
                            $each: [{
                                type: 'cashback',
                                amount: cashback,
                                note: `Cashback for order ${orderId}`,
                                date: new Date()
                            }],
                            $position: 0
                        }
                    };
                }
                await User.findByIdAndUpdate(userId, rewardUpdate);
            } catch (rewardErr) {
                console.error("⚠️ Reward credit error (order still placed):", rewardErr.message);
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

        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id, 
            { $set: { status, isDelivered } }, 
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(404).json({ success: false, message: "Order not found!" });
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
};





