/********************************************************************
 * Project: EonlineBazar — Fortified Admin Security Suite
 * File: adminSession.js
 * Location: models/adminSession.js
 * Author: Abdul Karim Sheikh
 * Description: Dedicated collection for authenticated Admin login
 * sessions (Active Devices / Remote Logout). Each successful 2FA
 * verification creates one record here. The unique `sessionId` (UUID)
 * is embedded inside the admin JWT as `sid`, so verifyAdmin can
 * validate/revoke individual admin devices in real time.
 ********************************************************************/

const mongoose = require('mongoose');

const adminSessionSchema = new mongoose.Schema({
    // JWT-এর ভেতরে থাকা ইউনিক সেশন আইডি (UUID) — এর মাধ্যমেই ডিভাইস শনাক্ত ও রিভোক হয়
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    // কোন অ্যাডমিন এই সেশনের মালিক (username)
    adminUsername: {
        type: String,
        required: true,
        index: true
    },
    ipAddress: {
        type: String,
        default: 'Unknown'
    },
    // geoip-lite দিয়ে শনাক্ত করা "City, Country"
    location: {
        type: String,
        default: 'Unknown Location'
    },
    os: {
        type: String,
        default: 'Unknown OS'
    },
    browser: {
        type: String,
        default: 'Unknown Browser'
    },
    // Desktop / Mobile / Tablet
    deviceType: {
        type: String,
        default: 'Desktop'
    },
    // সুন্দর ডিসপ্লে ভ্যালু (যেমন: "Windows · Chrome")
    device: {
        type: String,
        default: 'Unknown Device'
    },
    userAgent: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['active', 'revoked'],
        default: 'active',
        index: true
    },
    lastActive: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('AdminSession', adminSessionSchema);
