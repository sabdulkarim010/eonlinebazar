//File Name: models/admin.js



const mongoose = require('mongoose');

// অ্যাডমিন ডাটাবেজ স্ট্রাকচার (মার্জড ও আপডেট করা সংস্করণ)
const adminSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true // ইউজারনেমের আগে-পরে স্পেস থাকলে তা অটোমেটিক কেটে যাবে
    },
    password: {
        type: String,
        required: true
    },
    // 🔐 2FA / OTP ডেলিভারির জন্য অ্যাডমিন ইমেইল (খালি থাকলে EMAIL_USER-এ পাঠানো হয়)
    email: {
        type: String,
        default: '',
        trim: true,
        lowercase: true
    },
    // 🔐 Two-Factor Authentication (Email OTP) — হ্যাশড OTP ও এক্সপায়ারি
    loginOtpHash: { type: String, default: null, select: false },
    loginOtpExpires: { type: Date, default: null, select: false },
    image: { 
        type: String, 
        default: '' // প্রোফাইল ছবির ক্লাউডিনারি URL এখানে সেভ হবে
    },
    displayName: { type: String, default: 'Super Admin', trim: true },
    storeName: { type: String, default: 'EonlineBazar', trim: true },
    currency: { type: String, default: 'BDT', trim: true },
    currencySymbol: { type: String, default: '৳', trim: true },
    timezone: { type: String, default: 'Asia/Dhaka', trim: true },
    logoUrl: { type: String, default: '' },
    faviconUrl: { type: String, default: '' }
}, { timestamps: true }); // এটি অটোমেটিক অ্যাকাউন্ট তৈরি ও আপডেটের সময় রেকর্ড রাখবে

module.exports = mongoose.model('Admin', adminSchema);




