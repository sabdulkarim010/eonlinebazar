/********************************************************************
 * Project: EonlineBazar
 * File: brandController.js
 * Location: controllers/brandController.js
 * Author: Abdul Karim Sheikh
 * Description: ব্র্যান্ড ম্যানেজমেন্টের সম্পূর্ণ CRUD কন্ট্রোলার। Manage
 * Brands সেকশন এবং Add/Edit Product ফর্মের ব্র্যান্ড ড্রপডাউন এই এন্ডপয়েন্ট
 * ব্যবহার করে। রেসপন্স ফরম্যাট { success, message, data } — পুরাতন রাউটের
 * সাথে সম্পূর্ণ backward-compatible।
 ********************************************************************/

const Brand = require('../models/brand');
const Product = require('../models/product');

// ১. সব ব্র্যান্ড ফেচ করা (পাবলিক) — নতুন থেকে পুরাতন ক্রমে
const getBrands = async (req, res) => {
    try {
        const brands = await Brand.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: brands });
    } catch (error) {
        console.error('Brand Fetch Error:', error);
        res.status(500).json({ success: false, message: 'ব্র্যান্ড লোড করতে সমস্যা হচ্ছে।' });
    }
};

// ২. নতুন ব্র্যান্ড তৈরি করা (অ্যাডমিন)
const createBrand = async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        const description = (req.body.description || '').trim();
        const status = req.body.status === 'inactive' ? 'inactive' : 'active';

        if (!name) {
            return res.status(400).json({ success: false, message: 'ব্র্যান্ডের নাম দেওয়া আবশ্যক!' });
        }

        // কেস-ইনসেনসিটিভ ডুপ্লিকেট চেক
        const existing = await Brand.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
        if (existing) {
            return res.status(400).json({ success: false, message: 'এই ব্র্যান্ডটি আগেই তৈরি করা হয়েছে!' });
        }

        const newBrand = new Brand({ name, description, status });
        await newBrand.save();

        res.status(201).json({ success: true, message: 'ব্র্যান্ড সফলভাবে যুক্ত হয়েছে!', data: newBrand });
    } catch (error) {
        console.error('Brand Create Error:', error);
        res.status(500).json({ success: false, message: 'ব্র্যান্ড সেভ করতে সার্ভার এরর!' });
    }
};

// ৩. ব্র্যান্ড আপডেট করা (নাম / ডেসক্রিপশন / স্ট্যাটাস) (অ্যাডমিন)
const updateBrand = async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        if (!brand) {
            return res.status(404).json({ success: false, message: 'ব্র্যান্ড পাওয়া যায়নি!' });
        }

        const oldName = brand.name;

        if (req.body.name !== undefined) {
            const name = (req.body.name || '').trim();
            if (!name) return res.status(400).json({ success: false, message: 'ব্র্যান্ডের নাম দেওয়া আবশ্যক!' });

            // অন্য কোনো ব্র্যান্ডে একই নাম আছে কি না যাচাই
            const dup = await Brand.findOne({
                _id: { $ne: brand._id },
                name: new RegExp(`^${escapeRegex(name)}$`, 'i')
            });
            if (dup) return res.status(400).json({ success: false, message: 'এই নামের আরেকটি ব্র্যান্ড ইতিমধ্যে আছে!' });

            brand.name = name;
            brand.slug = Brand.slugify(name);
        }

        if (req.body.description !== undefined) brand.description = (req.body.description || '').trim();
        if (req.body.status !== undefined) brand.status = req.body.status === 'inactive' ? 'inactive' : 'active';

        await brand.save();

        // নাম পরিবর্তন হলে লিংকড প্রোডাক্টের ক্যাশড brandName আপডেট করা
        if (brand.name !== oldName) {
            await Product.updateMany({ brand: brand._id }, { $set: { brandName: brand.name } });
        }

        res.status(200).json({ success: true, message: 'ব্র্যান্ড আপডেট হয়েছে!', data: brand });
    } catch (error) {
        console.error('Brand Update Error:', error);
        res.status(500).json({ success: false, message: 'ব্র্যান্ড আপডেট করতে ব্যর্থ হয়েছে!' });
    }
};

// ৪. ব্র্যান্ড ডিলিট করা (অ্যাডমিন) — লিংকড প্রোডাক্টের রেফারেন্স ক্লিয়ার করা
const deleteBrand = async (req, res) => {
    try {
        const deleted = await Brand.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'ব্র্যান্ড পাওয়া যায়নি!' });
        }

        // এই ব্র্যান্ড ব্যবহারকারী প্রোডাক্টগুলো orphan না রেখে রেফারেন্স মুছে ফেলা
        await Product.updateMany({ brand: deleted._id }, { $set: { brand: null, brandName: '' } });

        res.status(200).json({ success: true, message: 'ব্র্যান্ড সফলভাবে ডিলিট করা হয়েছে!' });
    } catch (error) {
        console.error('Brand Delete Error:', error);
        res.status(500).json({ success: false, message: 'ব্র্যান্ড ডিলিট করতে ব্যর্থ হয়েছে!' });
    }
};

// রেগেক্স স্পেশাল ক্যারেক্টার এস্কেপ করার হেল্পার (ইনজেকশন-নিরাপদ ডুপ্লিকেট চেক)
function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { getBrands, createBrand, updateBrand, deleteBrand };
