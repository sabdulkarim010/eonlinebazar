const jwt = require('jsonwebtoken');

// ১. অ্যাডমিন ভেরিফাই করার জন্য (আপনার আগের কোড)
const verifyAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ success: false, message: "No token provided. Access denied!" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded; // পুরো ডিকোড করা অবজেক্টটি পাঠিয়ে দিন
        next(); 
    } catch (err) {
        return res.status(401).json({ success: false, message: "Unauthorized! Invalid token." });
    }
};

// ২. কাস্টমার/ইউজার ভেরিফাই করার জন্য (নতুন কোড)
const verifyUser = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ success: false, message: "No token provided. Please login first." });
    }

    const token = authHeader.split(" ")[1];

    try {
        // টোকেন ডিকোড করা (লগিন করার সময় যে সিক্রেট কী ব্যবহার করেছিলেন, সেটিই এখানে থাকবে)
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'eOnlineBazarSecretKey123'); 
        req.user = decoded; // ইউজারের ডিকোড করা আইডি এখানে সেভ হলো
        next(); 
    } catch (err) {
        return res.status(401).json({ success: false, message: "Unauthorized! Invalid or expired token." });
    }
};

module.exports = { verifyAdmin, verifyUser };





