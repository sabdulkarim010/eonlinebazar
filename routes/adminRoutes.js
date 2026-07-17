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
const adminSecurityController = require('../controllers/adminSecurityController');
const upload = require('../middlewares/uploadMiddleware');
const { verifyAdmin } = require('../middlewares/authMiddleware');
const { checkBlacklist, adminLoginLimiter } = require('../middlewares/adminSecurity');

// ১. কাস্টমারদের ডাটা পাওয়ার রাস্তা (GET)
router.get('/customers', verifyAdmin, adminController.getAllCustomers);

// ১ক. নির্দিষ্ট কাস্টমার, আপডেট, স্ট্যাটাস ও অর্ডার হিস্ট্রি
router.get('/customers/:id/orders', verifyAdmin, adminController.getCustomerOrders);
router.get('/customers/:id', verifyAdmin, adminController.getCustomerById);
router.put('/customers/:id', verifyAdmin, adminController.updateCustomer);
router.patch('/customers/:id/status', verifyAdmin, adminController.updateCustomerStatus);

// ২. অ্যাডমিন লগইন করার রাস্তা (POST)
router.post('/login', checkBlacklist, adminLoginLimiter, adminSecurityController.loginAdmin);

// 🔐 অ্যাডমিন লগইন — Step 2 (OTP → final JWT + AdminSession)
router.post('/verify-otp', checkBlacklist, adminLoginLimiter, adminSecurityController.verifyOtp);

// 🖥️ Active Devices & Sessions (remote logout)
router.get('/sessions', verifyAdmin, adminSecurityController.getAdminSessions);
router.post('/sessions/logout-others', verifyAdmin, adminSecurityController.logoutOtherSessions);
router.post('/sessions/logout/:id', verifyAdmin, adminSecurityController.logoutSession);

// 🛡️ IP Blacklist Manager + Login History
router.get('/blacklist', verifyAdmin, adminSecurityController.getBlacklist);
router.post('/blacklist', verifyAdmin, adminSecurityController.addBlacklist);
router.delete('/blacklist/:id', verifyAdmin, adminSecurityController.removeBlacklist);
router.get('/login-history', verifyAdmin, adminSecurityController.getLoginHistory);

// ৩. টোকেন ভেরিফিকেশন (GET)
router.get('/verify-token', verifyAdmin, adminController.verifyAdminToken);

// ৪. সিকিউরিটি লগস (GET)
router.get('/logs', verifyAdmin, adminController.getSecurityLogs);

// ৫. অ্যাডমিন সেটিংস (GET / PUT)
router.get('/settings', verifyAdmin, adminController.getAdminSettings);
router.put('/settings', verifyAdmin, adminController.updateAdminSettings);

// ৬. স্টোর লোগো / ফ্যাভিকন আপলোড (POST)
router.post('/upload-branding', verifyAdmin, upload.single('image'), adminController.uploadStoreBranding);

// ৭. প্রোফাইল পিকচার আপলোড করার রাস্তা (POST)
router.post('/update-profile-pic', verifyAdmin, upload.single('profilePic'), adminController.updateProfilePic);

// ৮. পেজ রিফ্রেশ করলে ডাটাবেজ থেকে প্রোফাইল ছবি তুলে আনার রাস্তা (GET)
router.get('/profile', verifyAdmin, adminController.getAdminProfile);

module.exports = router;
