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

/*
 * প্রতিটি IPN/কলব্যাক ইভেন্টের অডিট ট্রেইল। গেটওয়ে একই ট্রানজেকশনের জন্য
 * একাধিকবার কলব্যাক পাঠাতে পারে, তাই raw পেলোডসহ সব ইভেন্ট জমা থাকে —
 * ভবিষ্যতের অটোমেটেড অ্যাকাউন্টিং/রিকনসিলিয়েশনের ভিত্তি।
 */
const ipnEventSchema = new mongoose.Schema({
    receivedAt: { type: Date, default: Date.now },
    provider: { type: String, default: '', trim: true },
    status: { type: String, default: '', trim: true },
    verified: { type: Boolean, default: false },
    transactionId: { type: String, default: '', trim: true },
    amount: { type: Number, default: 0 },
    message: { type: String, default: '', trim: true },
    raw: { type: mongoose.Schema.Types.Mixed, default: null }
}, { _id: false });

/*
 * 💳 অর্ডারের পেমেন্ট স্ন্যাপশট — PaymentMethod ডকুমেন্টের আইডিসহ সেই সময়ের
 * নাম, ফি, এবং ম্যানুয়াল অ্যাকাউন্ট নম্বর বা গেটওয়ে storeId সংরক্ষণ করে।
 * ফলে অ্যাডমিন পরে মেথডের নাম/ফি বদলালে বা মেথড ডিলিট করলেও পুরোনো অর্ডারের
 * লেজার হিসাব অপরিবর্তিত থাকে — মূল কোড না বদলেই মডুলার অ্যাকাউন্টিং সম্ভব।
 */
const orderPaymentSchema = new mongoose.Schema({
    methodId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod', default: null },
    code: { type: String, default: '', trim: true },
    name: { type: String, default: '', trim: true },
    type: { type: String, enum: ['manual', 'automated'], default: 'manual' },
    provider: { type: String, default: '', trim: true },
    // ম্যানুয়াল মেথডের মার্চেন্ট ওয়ালেট/ব্যাংক নম্বর (রিকনসিলিয়েশনের জন্য)
    accountNumber: { type: String, default: '', trim: true },
    // অটোমেটেড গেটওয়ের storeId (কোন মার্চেন্ট অ্যাকাউন্টে টাকা এসেছে)
    gatewayStoreId: { type: String, default: '', trim: true },
    isSandbox: { type: Boolean, default: false },
    processingFee: { type: Number, default: 0, min: 0 },
    feeType: { type: String, enum: ['flat', 'percentage'], default: 'percentage' },
    feeRate: { type: Number, default: 0, min: 0 },
    feeBaseAmount: { type: Number, default: 0, min: 0 },
    status: {
        type: String,
        enum: ['unpaid', 'pending', 'paid', 'failed', 'cancelled', 'refunded'],
        default: 'unpaid'
    },
    transactionId: { type: String, default: '', trim: true },
    gatewayReference: { type: String, default: '', trim: true },
    paidAt: { type: Date, default: null },
    settledFromWallet: { type: Boolean, default: false },
    ipnHistory: { type: [ipnEventSchema], default: [] }
}, { _id: false });

/*
 * Manual payment proof — customer-submitted TRX ID and optional screenshot
 * for bKash/Nagad/bank transfers; admin reviews and approves or rejects.
 */
const paymentProofSchema = new mongoose.Schema({
    trxId: { type: String, default: null },
    screenshotUrl: { type: String, default: null },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    status: {
        type: String,
        enum: ['none', 'submitted', 'approved', 'rejected'],
        default: 'none'
    },
    adminNote: { type: String, default: null }
}, { _id: false });

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
    walletApplied: { type: Number, default: 0, min: 0 },
    couponCode: { type: String, default: '', trim: true, uppercase: true },
    deliveryLocationType: { type: String, enum: ['inside', 'outside'], default: 'inside' },
    shippingFee: { type: Number, default: 0, min: 0 },
    // মানুষ-পাঠযোগ্য লেবেল (ইনভয়েস, টেবিল, SMS) — payment.name এর মিরর
    paymentMethod: { type: String, required: true, default: 'COD' },
    // গেটওয়ে প্রসেসিং ফি অর্ডার লেভেলে — grandTotal-এ যোগ হয়ে থাকে
    processingFee: { type: Number, default: 0, min: 0 },
    payment: { type: orderPaymentSchema, default: () => ({}) },
    paymentProof: { type: paymentProofSchema, default: () => ({}) },
    status: { type: String, default: 'Pending' },
    isDelivered: { type: Boolean, default: false },
    deliveredAt: { type: Date, default: null },
    cancelReason: { type: String, default: '', trim: true },
    cancelledBy: { type: String, enum: ['Customer', 'Admin', ''], default: '' },
    returnReason: { type: String, default: '', trim: true },
    actionReason: { type: String, default: '', trim: true }, // legacy — mirrors cancel/return reason
    refundedAt: { type: Date, default: null },
    refundAmount: { type: Number, default: 0, min: 0 },
    statusBeforeRefund: { type: String, default: '' },
    rewardsCredited: { type: Boolean, default: false },
    rewardsPointsEarned: { type: Number, default: 0, min: 0 },
    rewardsCashbackAmount: { type: Number, default: 0, min: 0 },
    items: { type: [orderItemSchema], default: [] },
    // 🚚 কুরিয়ার বুকিং স্ন্যাপশট — Steadfast/Pathao/RedX-এ পার্সেল বুক করার পর
    // ফেরত আসা ট্র্যাকিং কোড ও কনসাইনমেন্ট আইডি এখানে জমা থাকে, যাতে অ্যাডমিন
    // প্যানেল থেকে সরাসরি ট্র্যাক করা যায় এবং একই অর্ডার দুইবার বুক না হয়।
    courierProvider: { type: String, default: '', trim: true },
    courierTrackingId: { type: String, default: '', trim: true },
    courierConsignmentId: { type: String, default: '', trim: true },
    courierStatus: { type: String, default: 'unbooked', trim: true },
    courierBookedAt: { type: Date, default: null },
    note: { type: String, default: "" },
    estimatedDelivery: { type: String, default: '' },
    orderSource: {
        type: String,
        enum: ['online', 'manual'],
        default: 'online'
    },
    createdByAdmin: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// IPN কলব্যাক ট্রানজেকশন আইডি দিয়ে অর্ডার খোঁজে, আর অ্যাকাউন্টিং রিপোর্ট
// পেমেন্ট মেথড ভিত্তিক গ্রুপিং করে — দুটোরই ইনডেক্স।
orderSchema.index({ 'payment.transactionId': 1 });
orderSchema.index({ 'payment.methodId': 1, createdAt: -1 });

// Order lookup, user history, status filters, and recent-first sorting.
orderSchema.index({ orderId: 1 });
orderSchema.index({ user: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'paymentProof.status': 1, 'paymentProof.submittedAt': -1 });

module.exports = mongoose.model('Order', orderSchema);




