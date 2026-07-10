/********************************************************************
 * Project: EonlineBazar
 * File: product.js
 * Location: models/product.js
 * Author: Abdul Karim Sheikh
 * Description: Product Schema supporting multiple images, stock limits, 
 * built-in tracking for product ratings, total reviews, and customer review array.
 ********************************************************************/

const mongoose = require('mongoose');

/**
 * 🌟 প্রোডাক্ট ভ্যারিয়েশন সাব-স্কিমা (Shopify/Daraz স্টাইল)
 * প্রতিটি ভ্যারিয়েশন একটি নির্দিষ্ট কম্বিনেশন (যেমন Size: M, Color: Red) এবং
 * তার নিজস্ব SKU, দাম ও স্টক ধারণ করে — যাতে ভ্যারিয়েন্ট-ভিত্তিক ইনভেন্টরি
 * ট্র্যাক করা যায়। সম্পূর্ণ অপশনাল, তাই পুরাতন প্রোডাক্টের সাথে backward-compatible।
 */
const variantSchema = new mongoose.Schema({
    attribute: { type: String, trim: true, default: '' }, // যেমন "Size"
    value:     { type: String, trim: true, default: '' }, // যেমন "M"
    sku:       { type: String, trim: true, default: '' },
    price:     { type: Number, default: 0 },
    buyingPrice: { type: Number, default: 0 },
    stock:     { type: Number, default: 0 }
}, { _id: false });

const productSchema = new mongoose.Schema({
    productId: { 
        type: String, 
       // required: true, 
        unique: true 
    },
    name: { 
        type: String, 
       // required: true 
    },
    price: { 
        type: Number, 
        required: true 
    },
    // 🌟 ক্রয়মূল্য (Buying / Cost Price) — Finance মডিউলে নেট প্রফিট
    // (Selling Price - Buying Price) সঠিকভাবে হিসাব করার জন্য ব্যবহৃত হয়।
    buyingPrice: { 
        type: Number, 
        default: 0 
    },
    category: { 
        type: String, 
        default: 'General' 
    },
    // 🌟 ব্র্যান্ড রেফারেন্স (ObjectId) — Manage Brands মডিউলের সাথে লিংকড।
    // অপশনাল রাখা হয়েছে যাতে পুরাতন প্রোডাক্ট অক্ষত থাকে।
    brand: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Brand',
        default: null
    },
    // ব্র্যান্ডের নামের ক্যাশড কপি — দ্রুত টেবিল রেন্ডার ও ফিল্টারিংয়ের জন্য।
    brandName: {
        type: String,
        default: ''
    },
    // 🌟 ভ্যারিয়েশন/অ্যাট্রিবিউট অ্যারে — ভ্যারিয়েন্ট-ভিত্তিক স্টক ও দাম।
    variants: {
        type: [variantSchema],
        default: []
    },
    description: { 
        type: String, 
        default: '' 
    },
    detailedDescription: {
        type: String,
        default: ''
    },
    highlights: { 
        type: [String], 
        default: [] 
    },
    // 🌟 সার্চ ট্যাগ/কিওয়ার্ড অ্যারে — কাস্টমার-বান্ধব keyword রাউটিংয়ের জন্য
    // (যেমন "sharee", "kamij", "ladies fashion")। ফুল-টেক্সট ইনডেক্সে অন্তর্ভুক্ত।
    tags: {
        type: [String],
        default: []
    },
    icon: { 
        type: String, 
        default: '📦' 
    },
    // পুরাতন সিঙ্গেল ইমেজের ফিল্ড (ব্যাকআপের জন্য রাখা হলো)
    image: { 
        type: String, 
        default: '' 
    },
    // একসাথে একাধিক ছবি সেভ করার জন্য অ্যারে
    images: {
        type: [String],
        default: []
    },
    stock: { 
        type: Number, 
        default: 0 
    },
    // প্রোডাক্টের এভারেজ রেটিং ড্যাশবোর্ডে দেখানোর জন্য ফিল্ড
    rating: {
        type: Number,
        default: 0
    },
    // টোটাল কয়জন রিভিউ দিয়েছে তার সংখ্যা
    numOfReviews: {
        type: Number,
        default: 0
    },
    // 🌟 নতুন ফিক্স: কাস্টমারদের মাল্টিপল রিভিউ ও স্টার রেটিং সেভ করার অ্যারে সাব-স্কিমা
    reviews: [
        {
            user: { 
                type: mongoose.Schema.Types.ObjectId, 
                ref: 'User', 
                required: true 
            },
            name: { 
                type: String, 
                required: true 
            },
            rating: { 
                type: Number, 
                required: true 
            },
            comment: { 
                type: String, 
                required: true 
            },
            createdAt: { 
                type: Date, 
                default: Date.now 
            }
        }
    ]
}, { timestamps: true });

/**
 * 🌟 ফুল-টেক্সট সার্চ ইনডেক্স (Daraz/Shopify স্টাইল কিওয়ার্ড রাউটিং)
 * একটি কম্পাউন্ড Text Index তৈরি করা হলো যা name, description, tags সহ
 * category ও ক্যাশড brandName-এর উপর কিওয়ার্ড-ভিত্তিক (stemmed) সার্চ করে।
 * weights দিয়ে relevance নিয়ন্ত্রণ করা হয়েছে — টাইটেল ও ট্যাগ সবচেয়ে গুরুত্বপূর্ণ।
 * দ্রষ্টব্য: MongoDB প্রতি কালেকশনে একটিমাত্র text index সাপোর্ট করে, তাই সব
 * সার্চযোগ্য ফিল্ড এই একটি ইনডেক্সেই একত্র করা হয়েছে।
 */
productSchema.index(
    {
        name: 'text',
        tags: 'text',
        brandName: 'text',
        category: 'text',
        highlights: 'text',
        description: 'text',
        detailedDescription: 'text'
    },
    {
        name: 'ProductTextIndex',
        default_language: 'english',
        weights: {
            name: 10,
            tags: 8,
            brandName: 6,
            category: 5,
            highlights: 3,
            description: 2,
            detailedDescription: 1
        }
    }
);

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);





