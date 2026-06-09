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
const userController = require('../controllers/userController');

// সিকিউরিটির জন্য মিডলওয়্যার ইমপোর্ট করা হলো
const { verifyUser } = require('../middlewares/authMiddleware'); 

// ফাইল (ছবি) আপলোডের জন্য Multer মিডলওয়্যার
const upload = require('../middlewares/uploadMiddleware'); 

// ================== পাবলিক রাউট (লগিন ছাড়াই ঢোকা যাবে) ==================
router.get('/test', userController.testUserRoute);
router.post('/register', userController.registerUser);
router.post('/login', userController.loginUser);
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password', userController.resetPassword);

// ================== প্রোটেক্টেড রাউট (অবশ্যই লগিন থাকতে হবে) ==================
router.get('/profile', verifyUser, userController.getUserProfile);
router.put('/update-profile', verifyUser, userController.updateUserProfile);
router.put('/change-password', verifyUser, userController.changePassword);

// ছবি আপলোডের রাউট
router.post('/update-avatar', verifyUser, upload.single('avatar'), userController.updateUserAvatar);

module.exports = router;



