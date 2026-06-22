/********************************************************************
 * Project: EonlineBazar
 * File: brand.js
 * Location: models/brand.js
 * Author: Abdul Karim Sheikh
 * Description: ব্র্যান্ড ম্যানেজমেন্টের জন্য MongoDB স্কিমা। Catalog
 * Management → Manage Brands সেকশন থেকে অ্যাডমিন ব্র্যান্ড তৈরি, এডিট ও
 * ডিলিট করতে পারবেন। ক্যাটাগরির অনুরূপ গঠন অনুসরণ করা হয়েছে।
 ********************************************************************/

const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.models.Brand || mongoose.model('Brand', brandSchema);
