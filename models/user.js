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
        unique: true, // একই ইমেইল দিয়ে দুটি অ্যাকাউন্ট খোলা যাবে না
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
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', userSchema);





