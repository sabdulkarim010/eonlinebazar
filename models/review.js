/********************************************************************
 * File: Review.js
 * Location: models/Review.js
 * Description: Database schema for product reviews. Supports rating, 
 * text comments, optional photo, and links to User, Product, and Order.
 ********************************************************************/

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    productId: {
        type: String, // আপনার আগের স্কিমা অনুযায়ী String রাখা হলো, তবে ObjectId ও ব্যবহার করা যায়
        required: true,
        index: true
    },
    orderId: {
        type: String,
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        required: true,
        trim: true
    },
    photo: {
        type: String, // ছবি আপলোড হলে তার URL বা পাথ এখানে সেভ হবে
        default: ''
    }
}, { timestamps: true });

module.exports = mongoose.model('Review', reviewSchema);




