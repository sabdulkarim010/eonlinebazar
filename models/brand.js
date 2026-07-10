/********************************************************************
 * Project: EonlineBazar
 * File: brand.js
 * Location: models/brand.js
 * Author: Abdul Karim Sheikh
 * Description: ব্র্যান্ড ম্যানেজমেন্টের জন্য MongoDB স্কিমা। Catalog
 * Management → Manage Brands সেকশন থেকে অ্যাডমিন ব্র্যান্ড তৈরি, এডিট ও
 * ডিলিট করতে পারবেন। এটি Shopify/Daraz স্টাইলের enterprise catalog-এর
 * অংশ — name, slug, description ও status সাপোর্ট করে।
 ********************************************************************/

const mongoose = require('mongoose');

// নাম থেকে URL-বান্ধব slug তৈরির হেল্পার (e.g. "Apple Inc." → "apple-inc")
function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\u0980-\u09FF]+/g, '-') // বাংলা ইউনিকোড রেঞ্জসহ
        .replace(/^-+|-+$/g, '');
}

const brandSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    // URL-বান্ধব ইউনিক আইডেন্টিফায়ার (auto-generated)
    slug: {
        type: String,
        trim: true,
        lowercase: true,
        index: true
    },
    description: {
        type: String,
        default: '',
        trim: true
    },
    // active/inactive — inactive হলে স্টোরফ্রন্টে দেখানো হবে না
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

// সেভ/আপডেটের আগে নাম থেকে slug অটো-জেনারেট করা (slug না দিলে)
brandSchema.pre('save', function (next) {
    if (!this.slug && this.name) {
        this.slug = slugify(this.name);
    }
    next();
});

brandSchema.statics.slugify = slugify;

module.exports = mongoose.models.Brand || mongoose.model('Brand', brandSchema);
