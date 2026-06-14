/********************************************************************
 * Project: EonlineBazar
 * File: order.js
 * Location: models/order.js
 * Author: Abdul Karim Sheikh
 * Description: এই ফাইলটি মঙ্গোডিবি (MongoDB) ডাটাবেজের জন্য অর্ডারের 
 * ডাটা স্কিমা বা মডেল ডিফাইন করে। এর মাধ্যমে প্রতিটি অর্ডারের ট্র্যাকিং আইডি, 
 * কাস্টমারের তথ্য, মোট টাকার পরিমাণ এবং অর্ডারের লাইভ স্ট্যাটাস সংরক্ষিত থাকে।
 ********************************************************************/

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderId: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, 
    customerName: String,
    customerPhone: String,
    customerAddress: String,
    totalAmount: Number,
    paymentMethod: { type: String, required: true, default: 'COD' }, // 🟢 নতুন যুক্ত করা হলো
    status: { type: String, default: 'Pending' },
    isDelivered: { type: Boolean, default: false }, 
    items: Array,
    note: { type: String, default: "" }, // 🟢 আগেরটা ঠিক করে ডিফল্ট ভ্যালু দেওয়া হলো
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);



