const mongoose = require('mongoose');

// অ্যাডমিন ডাটাবেজ স্ট্রাকচার (মার্জড ও আপডেট করা সংস্করণ)
const adminSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true // ইউজারনেমের আগে-পরে স্পেস থাকলে তা অটোমেটিক কেটে যাবে
    },
    password: {
        type: String,
        required: true
    },
    image: { 
        type: String, 
        default: '' // প্রোফাইল ছবির ক্লাউডিনারি URL এখানে সেভ হবে
    }
}, { timestamps: true }); // এটি অটোমেটিক অ্যাকাউন্ট তৈরি ও আপডেটের সময় রেকর্ড রাখবে

module.exports = mongoose.model('Admin', adminSchema);


