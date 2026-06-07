// models/Review.js
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    productId: {
        type: String, // প্রোডাক্টের আইডি (যা আমরা URL কুয়েরি থেকে পাচ্ছি)
        required: true,
        index: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    comment: {
        type: String,
        required: true,
        trim: true
    },
    timestamp: {
        type: Number, // ফ্রন্টএন্ডের Date.now() এর সাথে ম্যাচ রাখার জন্য Number রাখা হলো
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('Review', reviewSchema);



