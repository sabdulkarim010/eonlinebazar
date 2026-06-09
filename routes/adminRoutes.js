/********************************************************************
 * Project: EonlineBazar
 * File: adminRoutes.js
 * Location: routes/adminRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: Admin routes for handling customers data, admin login, 
 * and profile picture updates.
 ********************************************************************/

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController'); 
const upload = require('../middlewares/uploadMiddleware'); // 🌟 মাল্টার ইমপোর্ট

// ১. কাস্টমারদের ডাটা পাওয়ার রাস্তা (GET)
router.get('/customers', adminController.getAllCustomers);

// ২. অ্যাডমিন লগইন করার রাস্তা (POST)
router.post('/login', adminController.loginAdmin);

// ৩. প্রোফাইল পিকচার আপলোড করার রাস্তা (POST)
router.post('/update-profile-pic', upload.single('profilePic'), adminController.updateProfilePic);

// ৪. পেজ রিফ্রেশ করলে ডাটাবেজ থেকে প্রোফাইল ছবি তুলে আনার রাস্তা (GET)
router.get('/profile', adminController.getAdminProfile);

module.exports = router;


