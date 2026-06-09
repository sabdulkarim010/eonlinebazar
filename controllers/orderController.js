/********************************************************************
 * Project: EonlineBazar
 * File: orderController.js
 * Location: controllers/orderController.js
 * Author: Abdul Karim Sheikh
 * Description: Handles Order placement, stock updates, admin order management, 
 * order tracking, and fetching user-specific orders (My Orders).
 ********************************************************************/

const mongoose = require('mongoose'); 
const Product = require('../models/product'); 
const Order = require('../models/order'); 

// ১. নতুন অর্ডার তৈরি করা এবং স্টক কমানো
const createOrder = async (req, res) => {
    try {
        const customerName = req.body.customerName || req.body.name;
        const customerPhone = req.body.customerPhone || req.body.phone;
        const customerAddress = req.body.customerAddress || req.body.shippingAddress || req.body.address;
        const totalAmount = Number(req.body.totalAmount || req.body.total || req.body.totalPrice) || 0;
        const items = req.body.items || req.body.orderItems || req.body.cart || [];
        const note = req.body.note || req.body.notes || '';
        
        const orderId = req.body.orderId || 'ORD-' + Math.floor(100000 + Math.random() * 900000);

        if (!customerName || !customerPhone || !customerAddress) {
            return res.status(400).json({ success: false, message: "অনুগ্রহ করে নাম, phone নম্বর এবং সম্পূর্ণ ঠিকানা প্রদান করুন।" });
        }

        // লগইন করা ইউজার থাকলে তার আইডি নিবে
        const userId = req.user ? req.user.id : (req.body.userId || null);

        // ১. প্রথমে ডাটাবেজে অর্ডারটি সেভ করি
        const newOrder = new Order({
            orderId,
            user: userId,
            customerName,
            customerPhone,
            customerAddress,
            totalAmount,
            items: Array.isArray(items) ? items : [],
            note,
            status: 'Pending',
            isDelivered: false
        });

        await newOrder.save();

        // ২. স্টক কমানোর লজিক
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

        res.status(201).json({ 
            success: true, 
            message: "Order placed successfully! ধন্যবাদ আব্দুল করিম ভাই।", 
            data: newOrder 
        });

    } catch (err) {
        console.error("🔴 Order Save Error:", err);
        res.status(500).json({ success: false, message: "অর্ডার প্রসেস করতে ব্যর্থ হয়েছে।", error: err.message });
    }
};

// ২. সব অর্ডার ডাটাবেজ থেকে নিয়ে আসা (অ্যাডমিন প্যানেলের জন্য)
const getOrders = async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 }); 
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// 🌟 ৩. লগইন করা নির্দিষ্ট ইউজারের নিজস্ব অর্ডারগুলো দেখা (My Orders সেকশন)
const getMyOrders = async (req, res) => {
    try {
        // ফিক্স: লেটেস্ট আপডেট হওয়া অর্ডার আগে দেখাবে
        const myOrders = await Order.find({ user: req.user.id }).sort({ updatedAt: -1 });
        res.json({ success: true, data: myOrders });
    } catch (err) {
        console.error("Order Fetch Error:", err);
        res.status(500).json({ success: false, message: "অর্ডার হিস্ট্রি লোড করতে ব্যর্থ হয়েছে।" });
    }
};

// ৪. নির্দিষ্ট একটি অর্ডারের বিস্তারিত দেখা (অ্যাডমিন)
const getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found!" });
        }
        res.json({ success: true, data: order });
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

module.exports = { 
    createOrder, 
    getOrders, 
    getMyOrders, 
    getOrderById, 
    updateOrderStatus, 
    deleteOrder, 
    trackOrder 
};







