/********************************************************************
 # 01. ORDER MODEL (অর্ডার ডেটাবেজ স্কিমা)
 ********************************************************************/
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderId: String,
    customerName: String,
    customerPhone: String,
    customerAddress: String,
    totalAmount: Number,
    status: { type: String, default: 'Pending' },
    items: Array,
    note: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);

