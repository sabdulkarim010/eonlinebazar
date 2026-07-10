/********************************************************************
 * Project: EonlineBazar
 * File: attributeController.js
 * Location: controllers/attributeController.js
 * Author: Abdul Karim Sheikh
 * Description: প্রোডাক্ট অ্যাট্রিবিউট (Size/Color ইত্যাদি) ও তাদের মান (terms)
 * ম্যানেজ করার সম্পূর্ণ CRUD কন্ট্রোলার। Manage Attributes সেকশন ও Add/Edit
 * Product-এর ডাইনামিক ভ্যারিয়েশন বিল্ডার এই এন্ডপয়েন্ট ব্যবহার করে।
 ********************************************************************/

const Attribute = require('../models/attribute');

// কমা-সেপারেটেড স্ট্রিং অথবা অ্যারে থেকে পরিষ্কার (unique, trimmed) values অ্যারে
function normalizeValues(raw) {
    let list = [];
    if (Array.isArray(raw)) {
        list = raw.map(v => String(v).trim());
    } else if (typeof raw === 'string') {
        list = raw.split(',').map(v => v.trim());
    }
    // ফাঁকা বাদ দিয়ে ডুপ্লিকেট (কেস-সংবেদনশীল নয়) সরানো
    const seen = new Set();
    const out = [];
    for (const v of list) {
        if (!v) continue;
        const key = v.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
    }
    return out;
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ১. সব অ্যাট্রিবিউট ফেচ করা (পাবলিক)
const getAttributes = async (req, res) => {
    try {
        const attributes = await Attribute.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: attributes });
    } catch (error) {
        console.error('Attribute Fetch Error:', error);
        res.status(500).json({ success: false, message: 'অ্যাট্রিবিউট লোড করতে সমস্যা হচ্ছে।' });
    }
};

// ২. নতুন অ্যাট্রিবিউট তৈরি করা (অ্যাডমিন)
const createAttribute = async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        // `values` অথবা `terms` — দুটোই গ্রহণযোগ্য
        const values = normalizeValues(req.body.values !== undefined ? req.body.values : req.body.terms);
        const status = req.body.status === 'inactive' ? 'inactive' : 'active';

        if (!name) {
            return res.status(400).json({ success: false, message: 'অ্যাট্রিবিউটের নাম দেওয়া আবশ্যক!' });
        }

        const existing = await Attribute.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
        if (existing) {
            return res.status(400).json({ success: false, message: 'এই অ্যাট্রিবিউটটি আগেই তৈরি করা হয়েছে!' });
        }

        const newAttribute = new Attribute({ name, values, status });
        await newAttribute.save();

        res.status(201).json({ success: true, message: 'অ্যাট্রিবিউট সফলভাবে যুক্ত হয়েছে!', data: newAttribute });
    } catch (error) {
        console.error('Attribute Create Error:', error);
        res.status(500).json({ success: false, message: 'অ্যাট্রিবিউট সেভ করতে সার্ভার এরর!' });
    }
};

// ৩. অ্যাট্রিবিউট আপডেট করা (নাম / মান / স্ট্যাটাস) (অ্যাডমিন)
const updateAttribute = async (req, res) => {
    try {
        const attribute = await Attribute.findById(req.params.id);
        if (!attribute) {
            return res.status(404).json({ success: false, message: 'অ্যাট্রিবিউট পাওয়া যায়নি!' });
        }

        if (req.body.name !== undefined) {
            const name = (req.body.name || '').trim();
            if (!name) return res.status(400).json({ success: false, message: 'অ্যাট্রিবিউটের নাম দেওয়া আবশ্যক!' });

            const dup = await Attribute.findOne({
                _id: { $ne: attribute._id },
                name: new RegExp(`^${escapeRegex(name)}$`, 'i')
            });
            if (dup) return res.status(400).json({ success: false, message: 'এই নামের আরেকটি অ্যাট্রিবিউট ইতিমধ্যে আছে!' });

            attribute.name = name;
            attribute.slug = Attribute.slugify(name);
        }

        if (req.body.values !== undefined) attribute.values = normalizeValues(req.body.values);
        else if (req.body.terms !== undefined) attribute.values = normalizeValues(req.body.terms);

        if (req.body.status !== undefined) attribute.status = req.body.status === 'inactive' ? 'inactive' : 'active';

        await attribute.save();

        res.status(200).json({ success: true, message: 'অ্যাট্রিবিউট আপডেট হয়েছে!', data: attribute });
    } catch (error) {
        console.error('Attribute Update Error:', error);
        res.status(500).json({ success: false, message: 'অ্যাট্রিবিউট আপডেট করতে ব্যর্থ হয়েছে!' });
    }
};

// ৪. অ্যাট্রিবিউট ডিলিট করা (অ্যাডমিন)
const deleteAttribute = async (req, res) => {
    try {
        const deleted = await Attribute.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'অ্যাট্রিবিউট পাওয়া যায়নি!' });
        }
        res.status(200).json({ success: true, message: 'অ্যাট্রিবিউট সফলভাবে ডিলিট করা হয়েছে!' });
    } catch (error) {
        console.error('Attribute Delete Error:', error);
        res.status(500).json({ success: false, message: 'অ্যাট্রিবিউট ডিলিট করতে ব্যর্থ হয়েছে!' });
    }
};

module.exports = { getAttributes, createAttribute, updateAttribute, deleteAttribute };
