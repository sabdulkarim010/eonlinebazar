const User = require('../models/user');

// ভবিষ্যতে ইউজার রেজিস্ট্রেশন, লগইন এর লজিক এখানে লিখবেন
exports.testUserRoute = (req, res) => {
    res.status(200).json({ message: "User Controller is ready!" });
};

