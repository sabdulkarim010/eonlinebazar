/********************************************************************
 * Project: EonlineBazar
 * File: authMiddleware.js
 * Location: middlewares/authMiddleware.js
 * Author: Abdul Karim Sheikh
 * Description: Authentication and authorization middlewares for Admin 
 * (verifyAdmin) and Customer/User (verifyUser) using JWT.
 ********************************************************************/

const jwt = require('jsonwebtoken');

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

// ২. কাস্টমার/ইউজার ভেরিফাই করার জন্য
const verifyUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ success: false, message: "No token provided." });
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'eOnlineBazarSecretKey123'); 
        
        req.user = { id: decoded.id || decoded._id || decoded.userId }; 
        next(); 
    } catch (err) {
        return res.status(401).json({ success: false, message: "Unauthorized!" });
    }
};

// 🌟 আপডেট: requireSignIn নামে verifyUser কেই এক্সপোর্ট করা হলো 
// যাতে আগের কোডে কোনো সমস্যা না হয় এবং নতুন কোডও কাজ করে।
module.exports = { verifyAdmin, verifyUser, requireSignIn: verifyUser };



