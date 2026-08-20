/********************************************************************
 * Project: EonlineBazar — Fortified Admin Security Suite
 * File: loginAttempt.js
 * Location: models/loginAttempt.js
 * Author: Abdul Karim Sheikh
 * Description: Rich audit record of every admin authentication event
 * (successful logins, failed passwords, OTP challenges, blocked IPs).
 * Powers the "Login History & Failed Attempts" audit tab and the
 * Intrusion Detection counter (failed attempts per IP within a window).
 * Records auto-expire after 30 days via a TTL index.
 ********************************************************************/

const mongoose = require('mongoose');

const loginAttemptSchema = new mongoose.Schema({
    username: {
        type: String,
        default: 'unknown',
        trim: true
    },
    ipAddress: {
        type: String,
        default: 'Unknown',
        index: true
    },
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
    deviceType: {
        type: String,
        default: 'Desktop'
    },
    userAgent: {
        type: String,
        default: ''
    },
    // Lifecycle statuses across the 2-step flow
    status: {
        type: String,
        enum: [
            'success',      // full login completed (OTP verified)
            'failed',       // wrong username/password
            'otp_sent',     // step 1 passed, OTP dispatched
            'otp_failed',   // wrong/expired OTP at step 2
            'blocked'       // request came from a blacklisted IP
        ],
        default: 'failed',
        index: true
    },
    details: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Counting index for Intrusion Detection (ip + status + time window)
loginAttemptSchema.index({ ipAddress: 1, status: 1, createdAt: -1 });
// TTL: purge attempt logs after 30 days to keep the collection lean
loginAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);
