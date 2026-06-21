/********************************************************************
 * Project: EonlineBazar
 * File: adminController.js
 * Location: controllers/adminController.js
 * Author: Abdul Karim Sheikh
 * Description: Handles Admin authentication, profile image management 
 * (with Cloudinary cleanup), and fetching customer data.
 ********************************************************************/

const User = require('../models/user'); 
const Admin = require('../models/admin'); 
const { cloudinary } = require('../middlewares/uploadMiddleware'); 
const jwt = require('jsonwebtoken');

// ==============================================================
// ১. কাস্টমারদের তালিকা নিয়ে আসার ফাংশন 
// ==============================================================
const getAllCustomers = async (req, res) => {
    try {
        const customers = await User.find({}).select('-password').sort({ createdAt: -1 });
        res.status(200).json({ success: true, customers: customers });
    } catch (error) {
        console.error("🔴 কাস্টমার ডাটা ফেচ করতে এরর:", error);
        res.status(500).json({ success: false, message: 'সার্ভার এরর।' });
    }
};

// ==============================================================
// ২. অ্যাডমিন লগইন ফাংশন (ডাটাবেজ কানেক্টেড)
// ==============================================================
const loginAdmin = async (req, res) => {
    try {
        const { username, password } = req.body;
        
        let admin = await Admin.findOne({ username });

        // অ্যাডমিন না থাকলে এবং ক্রেডেনশিয়াল মিললে নতুন অ্যাডমিন তৈরি করা
        if (!admin && username === "admin" && password === process.env.ADMIN_PASSWORD) {
            admin = new Admin({ username: "admin", password: process.env.ADMIN_PASSWORD });
            await admin.save(); 
        } else if (!admin || admin.password !== password) {
            return res.status(401).json({ success: false, message: "ভুল ইউজারনেম অথবা পাসওয়ার্ড দিয়েছেন!" });
        }

        // 🌟 নিরাপত্তা ফিক্স: টোকেনে role: 'admin' যুক্ত করা হলো।
        // কাস্টমার টোকেন একই JWT_SECRET দিয়ে সাইন হয় বলে role ছাড়া verifyAdmin
        // যেকোনো লগইন করা কাস্টমারকেও অ্যাডমিন হিসেবে গ্রহণ করত — এই দুর্বলতা দূর হলো।
        const token = jwt.sign(
            { username: admin.username, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return res.status(200).json({
            success: true,
            message: "Login successful!",
            token: token,
            image: admin.image 
        });

    } catch (error) {
        console.error("Login Controller Error:", error);
        return res.status(500).json({ success: false, message: "সার্ভারে অভ্যন্তরীণ সমস্যা।" });
    }
};

// ==============================================================
// ৩. প্রোফাইল ছবি আপলোড ফাংশন (Cloudinary) - 🌟 ওল্ড ইমেজ ডিলিট ফিক্সসহ
// ==============================================================
const updateProfilePic = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "কোনো ছবি সিলেক্ট করা হয়নি!" });
        }

        // 🌟 ফিক্স: নতুন ছবি আপলোডের আগে পুরোনো ছবি ক্লাউডিনারি থেকে ডিলিট করা
        const existingAdmin = await Admin.findOne({ username: 'admin' });
        if (existingAdmin && existingAdmin.image) {
            const oldImageUrl = existingAdmin.image;
            if (oldImageUrl.includes('cloudinary.com')) {
                try {
                    const urlParts = oldImageUrl.split('/');
                    const filename = urlParts[urlParts.length - 1].split('.')[0];        
                    const folder = urlParts[urlParts.length - 2];      
                    const publicId = `${folder}/${filename}`;
                    await cloudinary.uploader.destroy(publicId);
                } catch (cloudinaryErr) {
                    console.error("Old Admin Image Delete Error:", cloudinaryErr);
                }
            }
        }

        // নতুন ছবি ক্লাউডিনারিতে আপলোড করা
        const stream = cloudinary.uploader.upload_stream(
            { folder: 'EonlineBazar_Admin' }, 
            async (error, result) => {
                if (error) {
                    console.error("Cloudinary Error:", error);
                    return res.status(500).json({ success: false, message: "ছবি আপলোডে এরর!" });
                }

                // ডাটাবেজে নতুন ছবির লিংক আপডেট করা
                const updatedAdmin = await Admin.findOneAndUpdate(
                    { username: 'admin' }, 
                    { image: result.secure_url },
                    { new: true, upsert: true } // না থাকলে তৈরি করবে (upsert)
                );

                res.status(200).json({
                    success: true,
                    imageUrl: result.secure_url,
                    message: "প্রোফাইল ছবি সফলভাবে আপডেট হয়েছে!"
                });
            }
        );

        stream.end(req.file.buffer);

    } catch (error) {
        console.error("Profile Upload Error:", error);
        res.status(500).json({ success: false, message: "সার্ভার এরর" });
    }
};

// ==============================================================
// ৪. ডাটাবেজ থেকে অ্যাডমিন প্রোফাইল ছবি নিয়ে আসার ফাংশন
// ==============================================================
const getAdminProfile = async (req, res) => {
    try {
        const admin = await Admin.findOne({ username: 'admin' });
        
        if (!admin) {
            return res.status(404).json({ success: false, message: "অ্যাডমিন পাওয়া যায়নি।" });
        }

        res.status(200).json({
            success: true,
            image: admin.image 
        });
    } catch (error) {
        console.error("Get Profile Error:", error);
        res.status(500).json({ success: false, message: "সার্ভার এরর" });
    }
};

module.exports = { getAllCustomers, loginAdmin, updateProfilePic, getAdminProfile };





