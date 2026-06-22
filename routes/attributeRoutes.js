/********************************************************************
 * Project: EonlineBazar
 * File: attributeRoutes.js
 * Location: routes/attributeRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: প্রোডাক্ট অ্যাট্রিবিউট (Size/Color ইত্যাদি) ম্যানেজমেন্টের
 * REST API রাউট — ফেচ, তৈরি, আপডেট ও ডিলিট। প্রতিটি অ্যাট্রিবিউটে একটি
 * নাম এবং কমা-সেপারেটেড একাধিক মান (values) থাকতে পারে।
 ********************************************************************/

const express = require('express');
const router = express.Router();
const Attribute = require('../models/attribute');
const { verifyAdmin } = require('../middlewares/authMiddleware');

// কমা-সেপারেটেড স্ট্রিং অথবা অ্যারে থেকে পরিষ্কার values অ্যারে তৈরি
function normalizeValues(raw) {
    if (Array.isArray(raw)) {
        return raw.map(v => String(v).trim()).filter(Boolean);
    }
    if (typeof raw === 'string') {
        return raw.split(',').map(v => v.trim()).filter(Boolean);
    }
    return [];
}

// ১. সব অ্যাট্রিবিউট নিয়ে আসা
router.get('/', async (req, res) => {
    try {
        const attributes = await Attribute.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: attributes });
    } catch (error) {
        res.status(500).json({ success: false, message: "অ্যাট্রিবিউট লোড করতে সমস্যা হচ্ছে।" });
    }
});

// ২. নতুন অ্যাট্রিবিউট তৈরি করা
router.post('/', verifyAdmin, async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        const values = normalizeValues(req.body.values);
        if (!name) return res.status(400).json({ success: false, message: "অ্যাট্রিবিউটের নাম দেওয়া আবশ্যক!" });

        const existing = await Attribute.findOne({ name });
        if (existing) return res.status(400).json({ success: false, message: "এই অ্যাট্রিবিউটটি আগেই তৈরি করা হয়েছে!" });

        const newAttribute = new Attribute({ name, values });
        await newAttribute.save();
        res.status(201).json({ success: true, message: "অ্যাট্রিবিউট সফলভাবে যুক্ত হয়েছে!", data: newAttribute });
    } catch (error) {
        res.status(500).json({ success: false, message: "অ্যাট্রিবিউট সেভ করতে সার্ভার এরর!" });
    }
});

// ৩. অ্যাট্রিবিউট আপডেট করা (নাম এবং/অথবা মান)
router.put('/:id', verifyAdmin, async (req, res) => {
    try {
        const updateFields = {};
        if (req.body.name !== undefined) {
            const name = (req.body.name || '').trim();
            if (!name) return res.status(400).json({ success: false, message: "অ্যাট্রিবিউটের নাম দেওয়া আবশ্যক!" });
            updateFields.name = name;
        }
        if (req.body.values !== undefined) {
            updateFields.values = normalizeValues(req.body.values);
        }

        const updated = await Attribute.findByIdAndUpdate(req.params.id, updateFields, { new: true });
        if (!updated) return res.status(404).json({ success: false, message: "অ্যাট্রিবিউট পাওয়া যায়নি!" });

        res.status(200).json({ success: true, message: "অ্যাট্রিবিউট আপডেট হয়েছে!", data: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: "অ্যাট্রিবিউট আপডেট করতে ব্যর্থ হয়েছে!" });
    }
});

// ৪. অ্যাট্রিবিউট ডিলিট করা
router.delete('/:id', verifyAdmin, async (req, res) => {
    try {
        const deleted = await Attribute.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, message: "অ্যাট্রিবিউট পাওয়া যায়নি!" });
        res.status(200).json({ success: true, message: "অ্যাট্রিবিউট সফলভাবে ডিলিট করা হয়েছে!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "অ্যাট্রিবিউট ডিলিট করতে ব্যর্থ হয়েছে!" });
    }
});

module.exports = router;
