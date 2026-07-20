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
const twoFactorController = require('../controllers/twoFactorController');
const settingsController = require('../controllers/settingsController');
const upload = require('../middlewares/uploadMiddleware');
const { brandingUpload } = upload;
const { verifyAdmin } = require('../middlewares/authMiddleware');
const { checkBlacklist, adminLoginLimiter } = require('../middlewares/adminSecurity');
const { geoFence } = require('../middlewares/geoFencing');

// ১. কাস্টমারদের ডাটা পাওয়ার রাস্তা (GET)
router.get('/customers', verifyAdmin, adminController.getAllCustomers);

// ১ক. নির্দিষ্ট কাস্টমার, আপডেট, স্ট্যাটাস ও অর্ডার হিস্ট্রি
router.get('/customers/:id/orders', verifyAdmin, adminController.getCustomerOrders);
router.get('/customers/:id', verifyAdmin, adminController.getCustomerById);
router.put('/customers/:id', verifyAdmin, adminController.updateCustomer);
router.patch('/customers/:id/status', verifyAdmin, adminController.updateCustomerStatus);

// ২. অ্যাডমিন লগইন করার রাস্তা (POST)
// পাইপলাইন: ব্ল্যাকলিস্ট গেট → জিও-ফেন্স (রিজিয়ন লক) → রেট-লিমিট → কন্ট্রোলার
router.post('/login', checkBlacklist, geoFence, adminLoginLimiter, adminSecurityController.loginAdmin);

// 🔐 অ্যাডমিন লগইন — Step 2 (OTP / TOTP → final JWT + AdminSession)
router.post('/verify-otp', checkBlacklist, adminLoginLimiter, adminSecurityController.verifyOtp);

// 🔐 Multi-Option 2FA Manager (Email / Google Authenticator / SMS)
router.get('/2fa/status', verifyAdmin, twoFactorController.getTwoFactorStatus);
router.post('/2fa/totp/setup', verifyAdmin, twoFactorController.setupTotp);
router.post('/2fa/totp/verify', verifyAdmin, twoFactorController.verifyTotpSetup);
router.post('/2fa/totp/disable', verifyAdmin, twoFactorController.disableTotp);
router.post('/2fa/sms/send', verifyAdmin, twoFactorController.sendSmsSetupOtp);
router.post('/2fa/sms/verify', verifyAdmin, twoFactorController.verifySmsSetupOtp);
router.put('/2fa/method', verifyAdmin, twoFactorController.updateMethod);

// 🚪 Full admin sign-out (revokes current AdminSession + clears cookies)
router.post('/logout', verifyAdmin, adminSecurityController.logoutCurrent);

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

// ৫. সিস্টেম ডেলিভারি সেটিংস (GET / PUT / POST)
router.get('/settings', verifyAdmin, settingsController.getSettings);
router.put('/settings', verifyAdmin, settingsController.updateSettings);
router.post('/settings', verifyAdmin, settingsController.updateSettings);

// ৫ক. অ্যাডমিন প্ল্যাটফর্ম সেটিংস (GET / PUT)
router.get('/platform-settings', verifyAdmin, adminController.getAdminSettings);
router.put('/platform-settings', verifyAdmin, adminController.updateAdminSettings);

// ৬. স্টোর লোগো / ফ্যাভিকন আপলোড (POST — multipart logo + favicon)
router.post(
    '/upload-branding',
    verifyAdmin,
    brandingUpload.fields([
        { name: 'logo', maxCount: 1 },
        { name: 'favicon', maxCount: 1 }
    ]),
    adminController.uploadStoreBranding
);

// ৭. প্রোফাইল পিকচার আপলোড করার রাস্তা (POST)
router.post('/update-profile-pic', verifyAdmin, upload.single('profilePic'), adminController.updateProfilePic);

// ৮. অ্যাডমিন প্রোফাইল (GET ছবি / PUT প্রোফাইল ডিটেইলস)
router.get('/profile', verifyAdmin, adminController.getAdminProfile);
router.put('/profile', verifyAdmin, adminController.updateAdminProfile);

module.exports = router;
