/********************************************************************
 * Project: EonlineBazar
 * File: coupon.js
 * Location: models/coupon.js
 * Author: Abdul Karim Sheikh
 * Description: Enterprise Coupon & Discount schema — unique promo codes
 * with percentage/flat discounts, usage limits, expiry, and per-user
 * redemption tracking (Shopify/Daraz-style).
 ********************************************************************/

const mongoose = require('mongoose');
const { getApplicationNow, isExpiryReached } = require('../utils/applicationTime');

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'flat'],
        required: true
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0
    },
    minOrderAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    // Ceiling for percentage discounts (optional; null/0 = no cap)
    maxDiscountAmount: {
        type: Number,
        default: null,
        min: 0
    },
    expiryDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'EXPIRED'],
        default: 'ACTIVE'
    },
    usageLimit: {
        type: Number,
        required: true,
        min: 1
    },
    usedCount: {
        type: Number,
        default: 0,
        min: 0
    },
    perUserLimit: {
        type: Number,
        default: 1,
        min: 1
    },
    // One entry per successful redemption (same user may appear multiple times)
    usedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    // Deprecated — kept for backward compatibility; synced from `status` on save
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

/** Derive ACTIVE / EXPIRED from precise expiry datetime (inclusive at expiry moment). */
couponSchema.methods.syncStatusFromExpiry = function (now = getApplicationNow()) {
    if (!this.expiryDate) return;
    const expired = isExpiryReached(this.expiryDate, now);
    this.status = expired ? 'EXPIRED' : 'ACTIVE';
    this.isActive = this.status === 'ACTIVE';
};

/**
 * Bulk-expire coupons whose precise expiry time has passed (authoritative server clock).
 * Only touches records still marked ACTIVE (idempotent, safe on every request).
 * Restricts to valid BSON dates so legacy/corrupt expiry values never break admin reads.
 */
couponSchema.statics.expireDueCoupons = async function (now = getApplicationNow()) {
    const nowDate = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    return this.updateMany(
        {
            status: 'ACTIVE',
            expiryDate: { $exists: true, $ne: null, $type: 'date', $lte: nowDate }
        },
        { $set: { status: 'EXPIRED', isActive: false } }
    );
};

/**
 * UI / API display status — Active, date/manual Expired, or usage Exhausted.
 * Legacy `DISABLED` and manual `EXPIRED` (before expiry date) map to EXPIRED.
 */
couponSchema.statics.deriveDisplayStatus = function (coupon, now = getApplicationNow()) {
    if (!coupon) return 'EXPIRED';

    const used = Number(coupon.usedCount) || 0;
    const limit = Number(coupon.usageLimit) || 0;
    if (limit > 0 && used >= limit) {
        return 'EXHAUSTED';
    }

    const expiryMs = new Date(coupon.expiryDate).getTime();
    const status = String(coupon.status || '').toUpperCase();

    if (
        !Number.isFinite(expiryMs) ||
        isExpiryReached(coupon.expiryDate, now) ||
        status === 'EXPIRED' ||
        status === 'DISABLED'
    ) {
        return 'EXPIRED';
    }

    return 'ACTIVE';
};

// Normalize code + auto status before save (Mongoose 9+: no next() callback in pre hooks)
couponSchema.pre('save', function () {
    if (this.code) {
        this.code = String(this.code).trim().toUpperCase();
    }
    this.syncStatusFromExpiry();
});

module.exports = mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);
