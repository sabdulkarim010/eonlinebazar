/********************************************************************
 * Project: EonlineBazar
 * File: attribute.js
 * Location: models/attribute.js
 * Author: Abdul Karim Sheikh
 * Description: প্রোডাক্ট অ্যাট্রিবিউট (যেমন: Size, Color, Material) এবং
 * তাদের সম্ভাব্য মান (values) সংরক্ষণের জন্য MongoDB স্কিমা। Catalog
 * Management → Attributes সেকশন থেকে ম্যানেজ করা হয়।
 ********************************************************************/

const mongoose = require('mongoose');

const attributeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    // অ্যাট্রিবিউটের মানসমূহ, যেমন Size → ["S", "M", "L", "XL"]
    values: {
        type: [String],
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.models.Attribute || mongoose.model('Attribute', attributeSchema);
