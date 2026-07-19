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
    // 🔐 2FA / OTP ডেলিভারির জন্য অ্যাডমিন ইমেইল (খালি থাকলে SMTP_USER / EMAIL_USER-এ পাঠানো হয়)
    email: {
        type: String,
        default: '',
        trim: true,
        lowercase: true
    },
    // 📱 Phone number used for SMS-based 2FA (E.164 format e.g. +8801XXXXXXXXX)
    phone: {
        type: String,
        default: '',
        trim: true
    },

    // ============================================================
    // 🔐 MULTI-OPTION TWO-FACTOR AUTHENTICATION
    // ============================================================
    // Admin-selectable 2FA delivery preference:
    //   'email' → one-time code emailed via Nodemailer (default)
    //   'totp'  → Google Authenticator / Authy time-based code (speakeasy)
    //   'sms'   → one-time code delivered via SMS gateway (placeholder)
    twoFactorMethod: {
        type: String,
        enum: ['email', 'totp', 'sms'],
        default: 'email'
    },
    // Master switch — if false, login completes right after password (no 2nd step)
    twoFactorEnabled: {
        type: Boolean,
        default: true
    },

    // — Email / SMS OTP challenge —
    // otp = 6-digit String; otpExpiry = Date.now() + TTL (UTC epoch ms — timezone-independent)
    otp: { type: String, default: null, select: false },
    otpExpiry: { type: Number, default: null, select: false },

    // — Google Authenticator (TOTP via speakeasy) —
    // base32 shared secret; never exposed in normal queries (select: false)
    totpSecret: { type: String, default: null, select: false },
    // Pending (unconfirmed) secret held during the "scan QR → verify once" setup step
    totpPendingSecret: { type: String, default: null, select: false },
    // Only true after the admin proves they scanned the QR by entering a valid code
    totpVerified: { type: Boolean, default: false },

    // — SMS setup verification (self-service "send test code → verify" step) —
    // Distinct from the login OTP (otp/otpExpiry) so an in-progress SMS setup can
    // never collide with an active login challenge. Epoch-ms expiry, timezone-safe.
    smsSetupOtp: { type: String, default: null, select: false },
    smsSetupOtpExpiry: { type: Number, default: null, select: false },
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




