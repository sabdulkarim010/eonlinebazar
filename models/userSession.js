/********************************************************************
 * Project: EonlineBazar
 * File: userSession.js
 * Location: models/userSession.js
 * Author: Abdul Karim Sheikh
 * Description: Dedicated collection for JWT login sessions (Active
 * Devices / Remote Logout). Each successful login creates one record
 * here; the unique `sessionId` (UUID) is embedded inside the JWT so
 * the auth middleware can validate/revoke individual devices.
 ********************************************************************/

const mongoose = require('mongoose');

const userSessionSchema = new mongoose.Schema({
    // JWT-এর ভেতরে থাকা ইউনিক সেশন আইডি (UUID) — এর মাধ্যমেই ডিভাইস শনাক্ত ও রিভোক হয়
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    // কাঁচা User-Agent স্ট্রিং (ভবিষ্যতের রেফারেন্স/ডিবাগের জন্য)
    userAgent: {
        type: String,
        default: ''
    },
    // User-Agent থেকে পার্স করা সুন্দর ডিসপ্লে ভ্যালু
    device: {
        type: String,
        default: 'Unknown Device'
    },
    browser: {
        type: String,
        default: 'Unknown Browser'
    },
    ipAddress: {
        type: String,
        default: ''
    },
    // IP থেকে geoip-lite দিয়ে শনাক্ত করা সিটি ও কান্ট্রি (যেমন: "Dhaka, Bangladesh")
    location: {
        type: String,
        default: 'Unknown Location'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastActiveAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('UserSession', userSessionSchema);
