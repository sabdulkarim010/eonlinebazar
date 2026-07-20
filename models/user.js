//File Name: models/user.js

const mongoose = require('mongoose');
const { wishlistItemSchema } = require('./wishlist');

/* প্রতিটি সেভ করা ঠিকানার সাব-স্কিমা (Addresses Management) */
const addressSchema = new mongoose.Schema({
    label: { type: String, default: 'Home', trim: true },
    fullAddress: { type: String, required: true, trim: true },
    phone: { type: String, default: '', trim: true },
    isDefault: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

/* ওয়ালেট / পয়েন্ট ট্রানজেকশন লগ (Cashback & Conversion History) */
const walletHistorySchema = new mongoose.Schema({
    type: { type: String, default: 'credit' }, // credit | debit | conversion | cashback
    amount: { type: Number, default: 0 },
    note: { type: String, default: '' },
    date: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other']
    },
    dateOfBirth: {
        type: Date
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
    // অ্যাডমিন প্যানেল থেকে অ্যাকাউন্ট নিয়ন্ত্রণ: active | suspended | blocked
    accountStatus: {
        type: String,
        enum: ['active', 'suspended', 'blocked'],
        default: 'active'
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
    wishlist: [wishlistItemSchema],

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

// Migrate legacy documents that still store a single `name` field
userSchema.pre('validate', function (next) {
    if ((!this.firstName || !this.lastName) && this._doc && this._doc.name) {
        const parts = String(this._doc.name).trim().split(/\s+/).filter(Boolean);
        if (!this.firstName) this.firstName = parts[0] || 'User';
        if (!this.lastName) {
            this.lastName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || 'User';
        }
    }
    next();
});

// Backward compatibility: login, profile, admin, and emails still read `name`
userSchema.virtual('name').get(function () {
    const fromParts = [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
    if (fromParts) return fromParts;
    const legacy = this._doc && this._doc.name;
    return legacy ? String(legacy).trim() : '';
});

userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
