/********************************************************************
 * Project: EonlineBazar
 * File: authMiddleware.js
 * Location: middlewares/authMiddleware.js
 * Author: Abdul Karim Sheikh
 * Description: Authentication and authorization middlewares for Admin 
 * (verifyAdmin) and Customer/User (verifyUser) using JWT.
 ********************************************************************/

const jwt = require('jsonwebtoken');
const User = require('../models/user');

// ১. অ্যাডমিন ভেরিফাই করার জন্য
const verifyAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ success: false, message: "No token provided. Access denied!" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded; 
        next(); 
    } catch (err) {
        return res.status(401).json({ success: false, message: "Unauthorized! Invalid token." });
    }
};

// ২. কাস্টমার/ইউজার ভেরিফাই করার জন্য (সেশন-অ্যাওয়্যার, রিমোট লগআউট সাপোর্ট সহ)
const verifyUser = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ success: false, message: "No token provided." });
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'eOnlineBazarSecretKey123'); 

        const userId = decoded.id || decoded._id || decoded.userId;
        req.user = { id: userId, sid: decoded.sid || null };

        // 🌟 সেশন ভ্যালিডেশন: টোকেনে sid থাকলে সেই সেশনটি এখনো ডাটাবেজে আছে কিনা যাচাই করা হয়।
        // রিমোট লগআউট করা হলে সেশনটি মুছে যায় → তখন এই টোকেনটি আর কাজ করবে না।
        // (পুরোনো টোকেনে sid না থাকলে ব্যাকওয়ার্ড কম্প্যাটিবিলিটির জন্য সেটি অনুমোদিত থাকবে)
        if (decoded.sid) {
            const user = await User.findById(userId).select('sessions');
            if (!user) {
                return res.status(401).json({ success: false, message: "Unauthorized! User not found." });
            }
            const sessionExists = user.sessions.id(decoded.sid);
            if (!sessionExists) {
                return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
            }
            // সেশনের শেষ অ্যাক্টিভ টাইম আপডেট করা (অপশনাল, লাইটওয়েট)
            sessionExists.lastActive = new Date();
            await user.save();
        }

        next(); 
    } catch (err) {
        return res.status(401).json({ success: false, message: "Unauthorized!" });
    }
};

// 🌟 আপডেট: requireSignIn নামে verifyUser কেই এক্সপোর্ট করা হলো 
// যাতে আগের কোডে কোনো সমস্যা না হয় এবং নতুন কোডও কাজ করে।
module.exports = { verifyAdmin, verifyUser, requireSignIn: verifyUser };



