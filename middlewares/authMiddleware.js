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
const UserSession = require('../models/userSession');

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

        // 🌟 সেশন ভ্যালিডেশন: টোকেনে sid থাকলে সেই সেশনটি এখনো UserSession কালেকশনে
        // আছে কিনা যাচাই করা হয়। কোনো ডিভাইস রিমোট লগআউট করা হলে রেকর্ডটি মুছে যায় →
        // তখন সেই ডিভাইসের টোকেন এই চেকে ব্যর্থ হয়ে 401 পাবে (forced logout)।
        // একই ক্যোয়ারিতে lastActiveAt আপডেট করা হয় (লাইটওয়েট, একটি DB কল)।
        // (পুরোনো টোকেনে sid না থাকলে ব্যাকওয়ার্ড কম্প্যাটিবিলিটির জন্য অনুমোদিত থাকবে)
        if (decoded.sid) {
            const session = await UserSession.findOneAndUpdate(
                { sessionId: decoded.sid },
                { $set: { lastActiveAt: new Date() } },
                { new: true }
            );
            if (!session) {
                return res.status(401).json({ success: false, message: "Session expired or logged out. Please log in again." });
            }
        }

        next(); 
    } catch (err) {
        return res.status(401).json({ success: false, message: "Unauthorized!" });
    }
};

// 🌟 আপডেট: requireSignIn নামে verifyUser কেই এক্সপোর্ট করা হলো 
// যাতে আগের কোডে কোনো সমস্যা না হয় এবং নতুন কোডও কাজ করে।
module.exports = { verifyAdmin, verifyUser, requireSignIn: verifyUser };



