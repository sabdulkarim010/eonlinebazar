/********************************************************************
 * File: order.js
 * Location: models/order.js
 * Author: Abdul Karim Sheikh
 * Description: এই ফাইলটি মঙ্গোডিবি (MongoDB) ডাটাবেজের জন্য অর্ডারের 
 * ডাটা স্কিমা বা মডেল ডিফাইন করে। এর মাধ্যমে প্রতিটি অর্ডারের ট্র্যাকিং আইডি, 
 * কাস্টমারের তথ্য, মোট টাকার পরিমাণ এবং অর্ডারের লাইভ স্ট্যাটাস সংরক্ষিত থাকে।
 ********************************************************************/

const mongoose = require('mongoose');

/*
 * অর্ডার আইটেম সাব-স্কিমা।
 * strict: false রাখা হয়েছে যাতে কার্ট থেকে আসা অন্যান্য যেকোনো ফিল্ড
 * (যেমন image, icon, slug ইত্যাদি) আগের মতোই সংরক্ষিত থাকে এবং পুরোনো
 * অর্ডার ডাটা ভেঙে না যায়। buyingPrice হলো অর্ডারের সময়ে নেওয়া
 * প্রোডাক্টের ক্রয়মূল্যের স্ন্যাপশট — যা ভবিষ্যতে দাম বদলালেও নির্ভুল
 * প্রফিট/লস হিসাবের জন্য জরুরি।
 */
const orderItemSchema = new mongoose.Schema({
    id: { type: String },
    productId: { type: String },
    name: { type: String },
    price: { type: Number, default: 0 },        // বিক্রয়মূল্য (Selling Price)
    buyingPrice: { type: Number, default: 0 },  // ক্রয়মূল্য (Cost Price snapshot)
    quantity: { type: Number, default: 1 },
    image: { type: String },
    // 🌟 অর্ডারকৃত ভ্যারিয়েন্টের স্ন্যাপশট — কোন Size/Color অর্ডার হয়েছে তা
    // সংরক্ষণ করে, যাতে সঠিক ভ্যারিয়েন্টের স্টক কমানো ও ইনভয়েসে দেখানো যায়।
    variantId: { type: String, default: '' },
    variantLabel: { type: String, default: '' },
    variantAttribute: { type: String, default: '' },
    variantValue: { type: String, default: '' },
    variantSku: { type: String, default: '' }
}, { _id: false, strict: false });

const orderSchema = new mongoose.Schema({
    orderId: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, 
    customerName: String,
    customerPhone: String,
    customerAddress: String,
    subTotal: { type: Number, required: true, default: 0, min: 0 },
    deliveryCharge: { type: Number, required: true, default: 0, min: 0 },
    grandTotal: { type: Number, required: true, default: 0, min: 0 },
    shippingLocationType: {
        type: String,
        enum: ['Inside City', 'Outside City'],
        default: 'Inside City'
    },
    shippingDistrict: { type: String, default: '', trim: true },
    totalAmount: Number,
    // অর্ডারের মোট ক্রয়মূল্য (সব আইটেমের buyingPrice × quantity যোগফল) —
    // দ্রুত প্রফিট/লস রিপোর্টিংয়ের জন্য অর্ডার লেভেলে সংরক্ষিত।
    totalBuyingPrice: { type: Number, default: 0 },
    // Coupon / discount snapshot (optional — backwards compatible with legacy orders)
    subtotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    couponCode: { type: String, default: '', trim: true, uppercase: true },
    deliveryLocationType: { type: String, enum: ['inside', 'outside'], default: 'inside' },
    shippingFee: { type: Number, default: 0, min: 0 },
    paymentMethod: { type: String, required: true, default: 'COD' }, 
    status: { type: String, default: 'Pending' },
    isDelivered: { type: Boolean, default: false }, 
    items: { type: [orderItemSchema], default: [] },
    note: { type: String, default: "" }, 
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);




