/********************************************************************
 * Project: EonlineBazar — Fortified Admin Security Suite
 * File: blacklistedIp.js
 * Location: models/blacklistedIp.js
 * Author: Abdul Karim Sheikh
 * Description: Stores banned IP addresses. Entries can be created
 * automatically by the Intrusion Detection middleware (after repeated
 * failed admin logins) or manually by a super-admin. A TTL index on
 * `expiresAt` auto-removes temporary bans once they lapse. A null
 * `expiresAt` means a permanent (manual) ban.
 ********************************************************************/

const mongoose = require('mongoose');

const blacklistedIpSchema = new mongoose.Schema({
    ip: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true
    },
    reason: {
        type: String,
        default: 'Suspicious activity',
        trim: true
    },
    // 'auto' = Intrusion Detection, 'manual' = added by admin
    source: {
        type: String,
        enum: ['auto', 'manual'],
        default: 'auto'
    },
    blockedBy: {
        type: String,
        default: 'system'
    },
    blockedAt: {
        type: Date,
        default: Date.now
    },
    // null => permanent ban. Otherwise MongoDB TTL removes it automatically.
    expiresAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

// TTL: MongoDB purges the document at the moment `expiresAt` passes.
// Docs with expiresAt = null are never expired by the TTL monitor.
blacklistedIpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('BlacklistedIP', blacklistedIpSchema);
