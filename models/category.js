/********************************************************************
 * Project: EonlineBazar
 * File: category.js
 * Location: models/category.js
 * Author: Abdul Karim Sheikh
 * Description: এই ফাইলটি মঙ্গোডিবি (MongoDB) ডাটাবেজের জন্য ডাইনামিক 
 * ক্যাটাগরির স্কিমা বা মডেল ডিফাইন করে। এর মাধ্যমে অ্যাডমিন প্যানেল থেকে 
 * ক্যাটাগরি তৈরি, ডিলিট এবং ম্যানেজ করা যাবে।
 ********************************************************************/

const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true 
    },
    customCashbackPercentage: {
        type: Number,
        default: null,
        min: 0,
        max: 100
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Category', categorySchema);





