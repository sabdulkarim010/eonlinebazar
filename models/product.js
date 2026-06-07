const mongoose = require('mongoose');

/********************************************************************
 # 01. PRODUCT MODEL (প্রোডাক্ট ডেটাবেজ স্কিমা - মাল্টিপল ইমেজ সাপোর্টেড)
 ********************************************************************/
const productSchema = new mongoose.Schema({
    productId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    name: { 
        type: String, 
        required: true 
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
    // পুরাতন সিঙ্গেল ইমেজের ফিল্ডও রাখলাম ব্যাকআপের জন্য
    image: { 
        type: String, 
        default: '' 
    },
    // 🌟 নতুন ফিল্ড: একসাথে একাধিক ছবি সেভ করার জন্য অ্যারে
    images: {
        type: [String],
        default: []
    },
    stock: { 
        type: Number, 
        default: 0 
    }
}, { timestamps: true });


// 🌟 ফিক্স: অলরেডি মডেল তৈরি করা থাকলে সেটিই ব্যবহার করবে, নতুন করে ওভাররাইট করবে না
module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);




