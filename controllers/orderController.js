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

// ১. নতুন অর্ডার তৈরি করা এবং স্টক কমানো
const createOrder = async (req, res) => {
    try {
        const customerName = req.body.customerName || req.body.name;
        const customerPhone = req.body.customerPhone || req.body.phone;
        const customerAddress = req.body.customerAddress || req.body.shippingAddress || req.body.address;
        const totalAmount = Number(req.body.totalAmount || req.body.total || req.body.totalPrice) || 0;
        const items = req.body.items || req.body.orderItems || req.body.cart || [];
        const note = req.body.note || req.body.notes || '';
        
        const paymentMethod = req.body.paymentMethod || req.body.method || 'COD'; 
        
        const orderId = req.body.orderId || 'ORD-' + Math.floor(100000 + Math.random() * 900000);

        if (!customerName || !customerPhone || !customerAddress) {
            return res.status(400).json({ success: false, message: "অনুগ্রহ করে নাম, phone নম্বর এবং সম্পূর্ণ ঠিকানা প্রদান করুন।" });
        }

        const userId = req.user ? req.user.id : (req.body.userId || null);

        const newOrder = new Order({
            orderId,
            user: userId,
            customerName,
            customerPhone,
            customerAddress,
            totalAmount,
            paymentMethod, 
            items: Array.isArray(items) ? items : [],
            note,
            status: 'Pending',
            isDelivered: false
        });

        await newOrder.save();

        if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
                const targetId = item.id || item.productId || item._id; 
                const quantityOrdered = Number(item.quantity) || 1; 

                if (targetId) {
                    let query = {};
                    if (mongoose.Types.ObjectId.isValid(targetId)) {
                        query = { $or: [{ _id: targetId }, { productId: targetId }] };
                    } else {
                        query = { productId: targetId };
                    }

                    await Product.findOneAndUpdate(
                        query,
                        { $inc: { stock: -quantityOrdered } }, 
                        { new: true }
                    );
                }
            }
        }

        // 🌟 নতুন: লগইন করা ইউজারকে লয়্যালটি পয়েন্ট ও ক্যাশব্যাক দেওয়া
        // রেট: প্রতি ৳১০ খরচে ১ পয়েন্ট (ডাবল পয়েন্ট অফার), এবং ১% ইনস্ট্যান্ট ক্যাশব্যাক
        if (userId) {
            try {
                const earnedPoints = Math.floor(totalAmount / 10);
                const cashback = Math.round(totalAmount * 0.01);

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
            data: newOrder 
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





