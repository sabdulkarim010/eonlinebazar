//File Name: models/user.js

const mongoose = require('mongoose');

/* প্রতিটি সেভ করা ঠিকানার সাব-স্কিমা (Addresses Management) */
const addressSchema = new mongoose.Schema({
    label: { type: String, default: 'Home', trim: true },
    fullAddress: { type: String, required: true, trim: true },
    phone: { type: String, default: '', trim: true },
    isDefault: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

/* উইশলিস্ট আইটেমের সাব-স্কিমা (My Wishlist) */
const wishlistSchema = new mongoose.Schema({
    productId: { type: String, required: true },
    name: { type: String, default: '' },
    price: { type: Number, default: 0 },
    image: { type: String, default: '' },
    icon: { type: String, default: '📦' },
    addedAt: { type: Date, default: Date.now }
});

/* ওয়ালেট / পয়েন্ট ট্রানজেকশন লগ (Cashback & Conversion History) */
const walletHistorySchema = new mongoose.Schema({
    type: { type: String, default: 'credit' }, // credit | debit | conversion | cashback
    amount: { type: Number, default: 0 },
    note: { type: String, default: '' },
    date: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    mobile: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true, // একই ইমেইল দিয়ে দুটি অ্যাকাউন্ট খোলা যাবে না
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    isVerified: {
        type: Boolean,
        default: false // শুরুতে অ্যাকাউন্ট ভেরিফাইড থাকবে না
    },
    verificationToken: String, // ইমেইল ভেরিফাই করার ইউনিক কোড বা লিঙ্ক টোকেন
    
    // 🌟 নতুন যোগ করা হলো: প্রোফাইল পিকচার এবং অ্যাড্রেস ফিল্ড (রিফ্রেশ প্রবলেম ফিক্স)
    avatar: {
        type: String,
        default: '' // শুরুতে কোনো ছবি না থাকলে খালি স্ট্রিং থাকবে
    },
    
    avatarPublicId: { 
        type: String, 
        default: '' 
    },
    
    phone: {
        type: String,
        trim: true,
        default: ''
    },
    address: {
        type: String,
        trim: true,
        default: ''
    },

    // 🟢 নতুন: ওয়ালেট ব্যালেন্স এবং লয়্যালটি পয়েন্ট (Wallet & Loyalty Points)
    walletBalance: {
        type: Number,
        default: 0
    },
    loyaltyPoints: {
        type: Number,
        default: 0
    },
    walletHistory: [walletHistorySchema],

    // 🟢 নতুন: একাধিক ডেলিভারি ঠিকানা (Addresses Management)
    addresses: [addressSchema],

    // 🟢 নতুন: উইশলিস্ট (My Wishlist - persists until removed)
    wishlist: [wishlistSchema],

    // নোট: অ্যাক্টিভ লগইন সেশন এখন আলাদা UserSession কালেকশনে রাখা হয়
    // (models/userSession.js) — পুরোনো এম্বেডেড sessions অ্যারে সরিয়ে ফেলা হয়েছে।

    // ফরগেট পাসওয়ার্ড OTP এবং এক্সপায়ারি টাইম
    resetPasswordOtp: {
        type: String,
        default: null
    },
    resetPasswordExpires: {
        type: Date,
        default: null
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', userSchema);
