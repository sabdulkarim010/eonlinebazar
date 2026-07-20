/********************************************************************
 * Project: EonlineBazar
 * File: categoryRoutes.js
 * Location: routes/categoryRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: এই ফাইলটি ডাইনামিক ক্যাটাগরির জন্য API রাউটগুলো হ্যান্ডেল করে।
 * এর মাধ্যমে ক্যাটাগরি ফেচ করা (GET), নতুন ক্যাটাগরি যুক্ত করা (POST) 
 * এবং ডিলিট করা (DELETE) যায়।
 ********************************************************************/

const express = require('express');
const router = express.Router();
const Category = require('../models/category');
const { verifyAdmin } = require('../middlewares/authMiddleware');

function parseCustomCashbackPercentage(raw, { required = false } = {}) {
    if (raw === undefined) {
        return required
            ? { error: 'Custom cashback must be a number between 0 and 100, or left blank.' }
            : undefined;
    }
    if (raw === null || raw === '') return null;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        return { error: 'Custom cashback must be a number between 0 and 100, or left blank.' };
    }
    return parsed;
}

// ১. সব ক্যাটাগরি ডাটাবেজ থেকে নিয়ে আসা
router.get('/', async (req, res) => {
    try {
        const categories = await Category.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, message: "ক্যাটাগরি লোড করতে সমস্যা হচ্ছে।" });
    }
});

// ২. নতুন ক্যাটাগরি তৈরি করা
router.post('/', verifyAdmin, async (req, res) => {
    try {
        const { name, customCashbackPercentage } = req.body;
        if (!name) return res.status(400).json({ success: false, message: "ক্যাটাগরির নাম দেওয়া আবশ্যক!" });

        const parsedCashback = parseCustomCashbackPercentage(customCashbackPercentage);
        if (parsedCashback && parsedCashback.error) {
            return res.status(400).json({ success: false, message: parsedCashback.error });
        }

        // চেক করা ক্যাটাগরি আগে থেকেই আছে কি না
        const existingCategory = await Category.findOne({ name });
        if (existingCategory) return res.status(400).json({ success: false, message: "এই ক্যাটাগরিটি আগেই তৈরি করা হয়েছে!" });

        const newCategory = new Category({
            name,
            customCashbackPercentage: parsedCashback === undefined ? null : parsedCashback
        });
        await newCategory.save();

        res.status(201).json({ success: true, message: "ক্যাটাগরি সফলভাবে যুক্ত হয়েছে!", data: newCategory });
    } catch (error) {
        res.status(500).json({ success: false, message: "ক্যাটাগরি সেভ করতে সার্ভার এরর!" });
    }
});

// ৩. ক্যাটাগরি ডিলিট করা
router.delete('/:id', verifyAdmin, async (req, res) => {
    try {
        const deletedCategory = await Category.findByIdAndDelete(req.params.id);
        if (!deletedCategory) return res.status(404).json({ success: false, message: "ক্যাটাগরি পাওয়া যায়নি!" });
        
        res.status(200).json({ success: true, message: "ক্যাটাগরি সফলভাবে ডিলিট করা হয়েছে!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "ক্যাটাগরি ডিলিট করতে ব্যর্থ হয়েছে!" });
    }
});


// PUT রাউট আপডেট
router.put('/:id', verifyAdmin, async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) return res.status(404).json({ success: false, message: "Category not found" });

        const oldName = category.name;
        const newName = req.body.name;

        if (newName !== undefined && !String(newName).trim()) {
            return res.status(400).json({ success: false, message: 'Category name is required.' });
        }

        const parsedCashback = parseCustomCashbackPercentage(req.body.customCashbackPercentage);
        if (parsedCashback && parsedCashback.error) {
            return res.status(400).json({ success: false, message: parsedCashback.error });
        }

        // ১. ক্যাটাগরির নাম আপডেট করা
        if (newName !== undefined) category.name = String(newName).trim();
        if (parsedCashback !== undefined) category.customCashbackPercentage = parsedCashback;
        await category.save();

        // ২. প্রোডাক্ট কালেকশনে সেই ক্যাটাগরির সব প্রোডাক্টের নাম আপডেট করা
        if (newName !== undefined && String(newName).trim() !== oldName) {
            const Product = require('../models/product');
            await Product.updateMany(
                { category: oldName },
                { $set: { category: String(newName).trim() } }
            );
        }

        res.status(200).json({ success: true, message: "Category and linked products updated!", data: category });
    } catch (error) {
        res.status(500).json({ success: false, message: "Update failed!" });
    }
});



module.exports = router;




