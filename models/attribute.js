/********************************************************************
 * Project: EonlineBazar
 * File: attribute.js
 * Location: models/attribute.js
 * Author: Abdul Karim Sheikh
 * Description: প্রোডাক্ট অ্যাট্রিবিউট (যেমন: Size, Color, Material) এবং
 * তাদের সম্ভাব্য মান (values / terms) সংরক্ষণের জন্য MongoDB স্কিমা।
 * Catalog Management → Attributes সেকশন থেকে ম্যানেজ করা হয় এবং Add/Edit
 * Product ফর্মের ডাইনামিক ভ্যারিয়েশন বিল্ডারে ব্যবহৃত হয়।
 ********************************************************************/

const mongoose = require('mongoose');

function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\u0980-\u09FF]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

const attributeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    slug: {
        type: String,
        trim: true,
        lowercase: true,
        index: true
    },
    // অ্যাট্রিবিউটের মানসমূহ (terms), যেমন Size → ["S", "M", "L", "XL"]
    // দ্রষ্টব্য: ব্যাকওয়ার্ড-কম্প্যাটিবিলিটির জন্য canonical ফিল্ডের নাম `values`।
    values: {
        type: [String],
        default: []
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// `terms` — `values` এর একটি বন্ধুত্বপূর্ণ অ্যালিয়াস (Shopify/Daraz পরিভাষা)
attributeSchema.virtual('terms')
    .get(function () { return this.values; })
    .set(function (v) { this.values = v; });

attributeSchema.set('toJSON', { virtuals: true });
attributeSchema.set('toObject', { virtuals: true });

attributeSchema.pre('save', function (next) {
    if (!this.slug && this.name) {
        this.slug = slugify(this.name);
    }
    next();
});

attributeSchema.statics.slugify = slugify;

module.exports = mongoose.models.Attribute || mongoose.model('Attribute', attributeSchema);
