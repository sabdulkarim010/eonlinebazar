/********************************************************************
 * Project: EonlineBazar
 * File: userRoutes.js
 * Location: routes/userRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: Defines public and token-protected private API endpoints 
 * for user authentication, registration, profiles, and image handling.
 ********************************************************************/

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const userProfileController = require('../controllers/userProfileController');
const userWishlistController = require('../controllers/userWishlistController');

// সিকিউরিটির জন্য মিডলওয়্যার ইমপোর্ট করা হলো
const { verifyUser } = require('../middlewares/authMiddleware'); 

// ফাইল (ছবি) আপলোডের জন্য Multer মিডলওয়্যার
const upload = require('../middlewares/uploadMiddleware'); 

// ================== পাবলিক রাউট (লগিন ছাড়াই ঢোকা যাবে) ==================
router.get('/test', authController.testUserRoute);
router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/verify/:token', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerification);

// ================== প্রোটেক্টেড রাউট (অবশ্যই লগিন থাকতে হবে) ==================
router.get('/profile', verifyUser, userProfileController.getUserProfile);
router.put('/update-profile', verifyUser, userProfileController.updateUserProfile);
router.put('/change-password', verifyUser, userProfileController.changePassword);
router.put('/profile/change-password', verifyUser, userProfileController.changePassword);
router.post('/profile/request-contact-otp', verifyUser, userProfileController.requestContactUpdateOtp);
router.post('/profile/verify-contact-otp', verifyUser, userProfileController.verifyContactUpdateOtp);

// ছবি আপলোডের রাউট
router.post('/update-avatar', verifyUser, upload.single('avatar'), userProfileController.updateUserAvatar);

// ================== উইশলিস্ট (My Wishlist) ==================
router.get('/wishlist', verifyUser, userWishlistController.getWishlist);
router.post('/wishlist', verifyUser, userWishlistController.addToWishlist);
router.delete('/wishlist/:productId', verifyUser, userWishlistController.removeFromWishlist);

// ================== ঠিকানা ম্যানেজমেন্ট (Addresses) ==================
router.get('/addresses', verifyUser, userProfileController.getAddresses);
router.post('/addresses', verifyUser, userProfileController.addAddress);
router.put('/addresses/:addressId', verifyUser, userProfileController.updateAddress);
router.delete('/addresses/:addressId', verifyUser, userProfileController.deleteAddress);

// ================== ওয়ালেট ও পয়েন্ট (Wallet & Loyalty Points) ==================
router.post('/convert-points', verifyUser, userProfileController.convertPoints);

router.delete('/account', verifyUser, authController.deleteAccount);

// নোট: অ্যাক্টিভ সেশন / রিমোট লগআউট এখন /api/auth/sessions রুটে
// (routes/authRoutes.js + controllers/authController.js) থেকে পরিচালিত হয়।

module.exports = router;



