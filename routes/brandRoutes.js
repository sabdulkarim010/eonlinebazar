/********************************************************************
 * Project: EonlineBazar
 * File: brandRoutes.js
 * Location: routes/brandRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: ব্র্যান্ড ম্যানেজমেন্টের জন্য REST API রাউট — সব ব্র্যান্ড
 * ফেচ (GET), নতুন ব্র্যান্ড তৈরি (POST), নাম আপডেট (PUT) এবং ডিলিট
 * (DELETE)। Catalog Management ড্যাশবোর্ড সেকশন এই রাউটগুলো ব্যবহার করে।
 ********************************************************************/

const express = require('express');
const router = express.Router();
const Brand = require('../models/brand');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// ১. সব ব্র্যান্ড নিয়ে আসা
router.get('/', async (req, res) => {
    try {
        const brands = await Brand.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: brands });
    } catch (error) {
        res.status(500).json({ success: false, message: "ব্র্যান্ড লোড করতে সমস্যা হচ্ছে।" });
    }
});

// ২. নতুন ব্র্যান্ড তৈরি করা
router.post('/', verifyAdmin, async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        if (!name) return res.status(400).json({ success: false, message: "ব্র্যান্ডের নাম দেওয়া আবশ্যক!" });

        const existing = await Brand.findOne({ name });
        if (existing) return res.status(400).json({ success: false, message: "এই ব্র্যান্ডটি আগেই তৈরি করা হয়েছে!" });

        const newBrand = new Brand({ name });
        await newBrand.save();
        res.status(201).json({ success: true, message: "ব্র্যান্ড সফলভাবে যুক্ত হয়েছে!", data: newBrand });
    } catch (error) {
        res.status(500).json({ success: false, message: "ব্র্যান্ড সেভ করতে সার্ভার এরর!" });
    }
});

// ৩. ব্র্যান্ডের নাম আপডেট করা
router.put('/:id', verifyAdmin, async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        if (!name) return res.status(400).json({ success: false, message: "ব্র্যান্ডের নাম দেওয়া আবশ্যক!" });

        const updated = await Brand.findByIdAndUpdate(req.params.id, { name }, { new: true });
        if (!updated) return res.status(404).json({ success: false, message: "ব্র্যান্ড পাওয়া যায়নি!" });

        res.status(200).json({ success: true, message: "ব্র্যান্ড আপডেট হয়েছে!", data: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: "ব্র্যান্ড আপডেট করতে ব্যর্থ হয়েছে!" });
    }
});

// ৪. ব্র্যান্ড ডিলিট করা
router.delete('/:id', verifyAdmin, async (req, res) => {
    try {
        const deleted = await Brand.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, message: "ব্র্যান্ড পাওয়া যায়নি!" });
        res.status(200).json({ success: true, message: "ব্র্যান্ড সফলভাবে ডিলিট করা হয়েছে!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "ব্র্যান্ড ডিলিট করতে ব্যর্থ হয়েছে!" });
    }
});

module.exports = router;
