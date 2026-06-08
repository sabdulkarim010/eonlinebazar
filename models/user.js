const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    mobile: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true, // একই ইমেইল দিয়ে দুটি অ্যাকাউন্ট খোলা যাবে না
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    isVerified: {
        type: Boolean,
        default: false // শুরুতে অ্যাকাউন্ট ভেরিফাইড থাকবে না
    },
    verificationToken: String, // ইমেইল ভেরিফাই করার ইউনিক কোড বা লিঙ্ক টোকেন
    
    // 🌟 নতুন যোগ করা হলো: প্রোফাইল পিকচার এবং অ্যাড্রেস ফিল্ড (রিফ্রেশ প্রবলেম ফিক্স)
    avatar: {
        type: String,
        default: '' // শুরুতে কোনো ছবি না থাকলে খালি স্ট্রিং থাকবে
    },
    phone: {
        type: String,
        trim: true,
        default: ''
    },
    address: {
        type: String,
        trim: true,
        default: ''
    },
    
    // ফরগেট পাসওয়ার্ড OTP এবং এক্সপায়ারি টাইম
    resetPasswordOtp: {
        type: String,
        default: null
    },
    resetPasswordExpires: {
        type: Date,
        default: null
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', userSchema);




