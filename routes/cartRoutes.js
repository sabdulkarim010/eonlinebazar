/********************************************************************
 * Project: EonlineBazar
 * Subject: Router Setup for Shopping Cart
 * File: cartRoutes.js
 * Location: routes/cartRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: Defines API endpoints for cart operations (Merge, Add,
 * Update, Delete, Toggle Selection) and secures them using verifyUser middleware.
 ********************************************************************/

const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');

// আপনার মিডলওয়্যার থেকে সঠিক ফাংশন 'verifyUser' ইমপোর্ট করা হলো
const { verifyUser } = require('../middlewares/authMiddleware'); 

// ==========================================
// ROUTES DEFINITIONS (ALL SECURED WITH verifyUser)
// ==========================================

// ১. গেস্ট কার্ট এবং ডাটাবেজ কার্ট মার্জ করার রাউট
router.post('/merge', verifyUser, cartController.mergeCart);

// ২. ডাটাবেজ থেকে ইউজারের লাইভ কার্ট ডাটা গেট করার রাউট
router.get('/', verifyUser, cartController.getCart);

// ৩. কার্টে নতুন প্রোডাক্ট যুক্ত করার রাউট
router.post('/add', verifyUser, cartController.addToCart);

// ৪. কার্টের কোনো প্রোডাক্টের পরিমাণ (Quantity) আপডেট করার রাউট
router.put('/update-quantity', verifyUser, cartController.updateQuantity);

// ৫. কার্টের প্রোডাক্ট সিলেক্ট বা আনসিলেক্ট (Toggle Selection) করার রাউট
router.put('/toggle-selection', verifyUser, cartController.toggleSelection);

// ৬. কার্ট থেকে নির্দিষ্ট প্রোডাক্ট মুছে ফেলার রাউট
router.delete('/remove/:productId', verifyUser, cartController.deleteCartItem);

// ৭. অর্ডার প্লেস করার পর সিলেক্টেড আইটেমগুলো ক্লিয়ার করার রাউট (নতুন)
router.delete('/clear-ordered', verifyUser, cartController.clearOrderedItems);

module.exports = router;


