//File Name: models/user.js

const mongoose = require('mongoose');
const { wishlistItemSchema } = require('./wishlist');

/* প্রতিটি সেভ করা ঠিকানার সাব-স্কিমা (Addresses Management) */
const addressSchema = new mongoose.Schema({
    label: { type: String, default: 'Home', trim: true },
    district: { type: String, trim: true, default: '' },
    upazilaOrThana: { type: String, trim: true, default: '' },
    fullAddress: { type: String, required: true, trim: true },
    phone: { type: String, default: '', trim: true },
    isDefault: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

/* ওয়ালেট / পয়েন্ট ট্রানজেকশন লগ (Cashback & Conversion History) */
const walletHistorySchema = new mongoose.Schema({
    type: { type: String, default: 'credit' }, // CREDIT | DEBIT | conversion | cashback | refund
    amount: { type: Number, default: 0 },
    note: { type: String, default: '' },
    referenceOrder: { type: String, default: '', trim: true },
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
        required: false,
        default: null,
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
        required: false,
        default: null
    },
    googleId: {
        type: String,
        default: null
    },
    avatarUrl: {
        type: String,
        default: null
    },
    lastLogin: {
        type: Date,
        default: null
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
    verificationToken: {
        type: String,
        default: null
    },
    verificationTokenExpiry: {
        type: Date,
        default: null
    },
    
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
    district: {
        type: String,
        trim: true,
        default: ''
    },
    upazila: {
        type: String,
        trim: true,
        default: ''
    },
    thana: {
        type: String,
        trim: true,
        default: ''
    },
    fullAddress: {
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

    // 🤝 রেফারেল সিস্টেম (Referral Program — CRM automation)
    // referralCode প্রতিটি ইউজারের জন্য অটো-জেনারেটেড ৮-অক্ষরের কোড; নতুন
    // ইউজার এই কোড দিয়ে রেজিস্টার করলে referredBy সেট হয় এবং প্রথম অর্ডারে
    // referralEarnings-এ রিওয়ার্ড জমা হয় (ওয়ালেটে ক্রেডিটসহ)।
    referralCode: {
        type: String,
        unique: true,
        sparse: true,
        uppercase: true,
        trim: true,
        default: null
    },
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    referralEarnings: {
        type: Number,
        default: 0
    },

    // 🏅 Customer loyalty tier (Silver / Gold / Platinum — lifetime spend based)
    loyaltyTier: {
        type: String,
        enum: ['none', 'silver', 'gold', 'platinum'],
        default: 'none'
    },
    tierUpgradedAt: {
        type: Date,
        default: null
    },
    lifetimeSpend: {
        type: Number,
        default: 0
    },
    tierCashbackRate: {
        type: Number,
        default: 0
    },

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

    // Profile email/phone change OTP (Security tab verification)
    profileUpdateOtp: {
        type: String,
        default: null
    },
    profileUpdateOtpExpires: {
        type: Date,
        default: null
    },
    profileUpdateType: {
        type: String,
        enum: ['email', 'mobile', null],
        default: null
    },
    pendingEmail: {
        type: String,
        default: null,
        trim: true,
        lowercase: true
    },
    pendingMobile: {
        type: String,
        default: null,
        trim: true
    },
    
    isSandbox: {
        type: Boolean,
        default: false
    },

    isDeleted: {
        type: Boolean,
        default: false,
        index: true
    },
    deletedAt: {
        type: Date,
        default: null
    },
    deletionReason: {
        type: String,
        default: '',
        trim: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Migrate legacy documents that still store a single `name` field
userSchema.pre('validate', function () {
    if ((!this.firstName || !this.lastName) && this._doc && this._doc.name) {
        const parts = String(this._doc.name).trim().split(/\s+/).filter(Boolean);
        if (!this.firstName) this.firstName = parts[0] || 'User';
        if (!this.lastName) {
            this.lastName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || 'User';
        }
    }
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

// Auth & lookup — email unique index comes from field `unique: true`; mobile for phone lookups.
userSchema.index({ mobile: 1 });
userSchema.index({ googleId: 1 }, { sparse: true });
userSchema.index({ loyaltyTier: 1 });

// Referral codes intentionally exclude ambiguous characters (0/O, 1/I) so they
// can be read aloud or shared over the phone without confusion.
const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

userSchema.statics.generateReferralCode = function generateReferralCode(length = 8) {
    let code = '';
    for (let i = 0; i < length; i += 1) {
        code += REFERRAL_CODE_ALPHABET[Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length)];
    }
    return code;
};

// Every user gets a referral code on first save. The unique+sparse index is the
// real guard; the retry loop just avoids a save error on the rare collision.
userSchema.pre('save', async function ensureReferralCode() {
    if (this.referralCode) return;
    let attempts = 0;
    // eslint-disable-next-line no-await-in-loop
    while (attempts < 6) {
        const candidate = this.constructor.generateReferralCode();
        // eslint-disable-next-line no-await-in-loop
        const clash = await this.constructor.exists({ referralCode: candidate });
        if (!clash) {
            this.referralCode = candidate;
            return;
        }
        attempts += 1;
    }
});

module.exports = mongoose.model('User', userSchema);
