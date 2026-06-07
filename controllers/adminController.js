const User = require('../models/user'); 
const Admin = require('../models/admin'); // অ্যাডমিন ডাটাবেজ মডেল
const jwt = require('jsonwebtoken');
const { cloudinary } = require('../middlewares/uploadMiddleware'); // ক্লাউডিনারি ইমপোর্ট

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

        if (!admin && username === "admin" && password === process.env.ADMIN_PASSWORD) {
            admin = new Admin({ username: "admin", password: process.env.ADMIN_PASSWORD });
            await admin.save(); 
        } else if (!admin || admin.password !== password) {
            return res.status(401).json({ success: false, message: "ভুল ইউজারনেম অথবা পাসওয়ার্ড দিয়েছেন!" });
        }

        const token = jwt.sign({ username: admin.username }, process.env.JWT_SECRET, { expiresIn: '24h' });

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
// ৩. প্রোফাইল ছবি আপলোড ফাংশন (Cloudinary)
// ==============================================================
const updateProfilePic = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "কোনো ছবি সিলেক্ট করা হয়নি!" });
        }

        const stream = cloudinary.uploader.upload_stream(
            { folder: 'EonlineBazar_Admin' }, 
            async (error, result) => {
                if (error) {
                    console.error("Cloudinary Error:", error);
                    return res.status(500).json({ success: false, message: "ছবি আপলোডে এরর!" });
                }

                const updatedAdmin = await Admin.findOneAndUpdate(
                    { username: 'admin' }, 
                    { image: result.secure_url },
                    { new: true, upsert: true }
                );

                res.status(200).json({
                    success: true,
                    imageUrl: result.secure_url
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
// ৪. 🌟 নতুন: ডাটাবেজ থেকে অ্যাডমিন প্রোফাইল ছবি নিয়ে আসার ফাংশন
// ==============================================================
const getAdminProfile = async (req, res) => {
    try {
        // ডাটাবেজ থেকে 'admin' ইউজারনেমের ডেটা খুঁজবে
        const admin = await Admin.findOne({ username: 'admin' });
        
        if (!admin) {
            return res.status(404).json({ success: false, message: "অ্যাডমিন পাওয়া যায়নি।" });
        }

        res.status(200).json({
            success: true,
            image: admin.image // ডাটাবেজে থাকা ছবিটা পাঠাবে
        });
    } catch (error) {
        console.error("Get Profile Error:", error);
        res.status(500).json({ success: false, message: "সার্ভার এরর" });
    }
};

module.exports = { getAllCustomers, loginAdmin, updateProfilePic, getAdminProfile };







