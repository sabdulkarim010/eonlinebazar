/********************************************************************
 # 01. ORDER MODEL (অর্ডার ডেটাবেজ স্কিমা)
 ********************************************************************/
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderId: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // 🌟 ফিক্স: লগইন করা ইউজারের সাথে অর্ডারটি লিংক করার জন্য
    customerName: String,
    customerPhone: String,
    customerAddress: String,
    totalAmount: Number,
    status: { type: String, default: 'Pending' },
    isDelivered: { type: Boolean, default: false }, // 🌟 ফিক্স: প্রোফাইলে রিভিউ বাটন শো করানোর জন্য
    items: Array,
    note: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);



