const mongoose = require('mongoose'); // 🌟 ফিক্স: আইডি ভ্যালিডেশন চেক করার জন্য প্রয়োজন
const Product = require('../models/product'); 
const Order = require('../models/order'); 

// ১. নতুন অর্ডার তৈরি করা এবং স্টক কমানো
const createOrder = async (req, res) => {
    try {
        console.log("--- ফ্রন্টএন্ড থেকে আসা অর্ডারের ডাটা ---");
        console.log(req.body);

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

        // ১. প্রথমে ডাটাবেজে অর্ডারটি সেভ করি
        const newOrder = new Order({
            orderId,
            customerName,
            customerPhone,
            customerAddress,
            totalAmount,
            items: Array.isArray(items) ? items : [],
            note,
            status: 'Pending'
        });

        await newOrder.save();

        // 🌟 ২. স্টক কমানোর সম্পূর্ণ ফিক্সড লজিক
        if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
                // ফ্রন্টএন্ড (checkout.js) থেকে আইডিটি 'item.id' নামে আসছে, তাই সব অপশন রাখা হলো
                const targetId = item.id || item.productId || item._id; 
                const quantityOrdered = Number(item.quantity) || 1; 

                if (targetId) {
                    let query = {};
                    // আইডিটি যদি মঙ্গোডিবি-র ২৪ অক্ষরের অবজেক্ট আইডি হয়
                    if (mongoose.Types.ObjectId.isValid(targetId)) {
                        query = { $or: [{ _id: targetId }, { productId: targetId }] };
                    } else {
                        // আইডিটি যদি আপনার কাস্টম তৈরি করা স্ট্রিল আইডি হয়
                        query = { productId: targetId };
                    }

                    // findOneAndUpdate ব্যবহার করে নিখুঁতভাবে স্টক মাইনাস করা হলো
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
            message: "Order placed successfully and stock updated! ধন্যবাদ আব্দুল করিম ভাই।", 
            data: newOrder 
        });

    } catch (err) {
        console.error("🔴 ডাটাবেজে অর্ডার সেভ বা স্টক আপডেটে এরর এসেছে:");
        console.error(err);
        res.status(500).json({ success: false, message: "অর্ডার প্রসেস করতে ব্যর্থ হয়েছে।", error: err.message });
    }
};



// ২. সব অর্ডার ডাটাবেজ থেকে নিয়ে আসা (অ্যাডমিন প্যানেলের জন্য)
const getOrders = async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 }); // নতুন অর্ডার সবার উপরে দেখাবে
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ৩. নির্দিষ্ট একটি অর্ডারের বিস্তারিত দেখা (অ্যাডমিন)
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

// ৪. অর্ডারের স্ট্যাটাস পরিবর্তন করা (অ্যাডমিন প্যানেল থেকে - Pending/Delivered)
const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ success: false, message: "Status is required" });
        }

        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id, 
            { $set: { status } }, 
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



// ৫. অর্ডার ডিলিট করা (অ্যাডমিন প্যানেল থেকে)
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

// 🌟 ফিক্স: module.exports-এ 'deleteOrder' যুক্ত করা হলো
module.exports = { createOrder, getOrders, getOrderById, updateOrderStatus, deleteOrder };








