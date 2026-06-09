/********************************************************************
 * Project: EonlineBazar
 * File: product.js
 * Location: models/product.js
 * Author: Abdul Karim Sheikh
 * Description: Product Schema supporting multiple images, stock limits, 
 * built-in tracking for product ratings, total reviews, and customer review array.
 ********************************************************************/

const mongoose = require('mongoose');

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
    category: { 
        type: String, 
        default: 'General' 
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

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);


