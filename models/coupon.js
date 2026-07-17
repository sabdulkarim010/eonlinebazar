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
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Normalize code before save
couponSchema.pre('save', function (next) {
    if (this.code) {
        this.code = String(this.code).trim().toUpperCase();
    }
    next();
});

module.exports = mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);
