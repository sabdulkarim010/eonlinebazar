const jwt = require('jsonwebtoken');

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

module.exports = { verifyAdmin };



