/********************************************************************
 * Project: EonlineBazar
 * File: orderRoutes.js
 * Location: routes/orderRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: এই ফাইলে EonlineBazar প্রজেক্টের অর্ডার তৈরি, ট্র্যাকিং, 
 * ইউজার ড্যাশবোর্ড স্ট্যাটাস এবং অ্যাডমিন প্যানেলের অর্ডার 
 * ম্যানেজমেন্টের সমস্ত API রাউট সুবিন্যস্তভাবে ডিফাইন করা হয়েছে।
 * ********************************************************************/

const express = require('express'); 
const router = express.Router();

const { 
    createOrder, 
    getOrders, 
    getOrderById, 
    updateOrderStatus,
    deleteOrder,
    trackOrder, 
    getMyOrders, 
    getDashboardStats,
    cancelUserOrder,
    returnUserOrder
} = require('../controllers/orderController');

// অ্যাডমিন ও ইউজার ভেরিফিকেশন 
const { verifyAdmin, verifyUser } = require('../middlewares/authMiddleware');

/********************************************************************
 # ORDER ROUTES (অর্ডারের এপিআই রাস্তাসমূহ)
 ********************************************************************/

// =================================================================
// ১. স্ট্যাটিক রাউটস (Static Routes) - এগুলো অবশ্যই /:id এর উপরে থাকবে
// =================================================================

// গ. ড্যাশবোর্ড স্ট্যাটাস রাউট
// URL: GET /api/orders/dashboard-stats
router.get('/dashboard-stats', verifyUser, getDashboardStats);

// খ. ইউজারের নিজের অর্ডার দেখার রুট
// URL: GET /api/orders/my-orders
router.get('/my-orders', verifyUser, getMyOrders);

// ক. ট্র্যাকিং এর জন্য পাবলিক API রুট
// URL: GET /api/orders/track
router.get('/track', trackOrder);


// =================================================================
// ২. জেনারেল রাউটস (General Routes)
// =================================================================

// ক. নতুন অর্ডার তৈরি করার রুট
// URL: POST /api/orders
router.post('/', verifyUser, createOrder); 

// খ. সব অর্ডার দেখার রুট (অ্যাডমিন প্যানেলের জন্য)
// URL: GET /api/orders
router.get('/', getOrders);


// =================================================================
// ৩. ডাইনামিক রাউটস (Dynamic Routes) - এগুলো সব সময় নিচে থাকবে
// =================================================================

// ক. ইউজার অর্ডার বাতিল / রিটার্ন রিকোয়েস্ট (/:id এর আগে রাখতে হবে)
// URL: POST /api/orders/:id/cancel
router.post('/:id/cancel', verifyUser, cancelUserOrder);

// URL: POST /api/orders/:id/return
router.post('/:id/return', verifyUser, returnUserOrder);

// খ. নির্দিষ্ট একটি অর্ডারের বিস্তারিত দেখার রুট (🌟 নিরাপত্তা নিশ্চিত করতে verifyUser যুক্ত করা হলো)
// URL: GET /api/orders/:id
router.get('/:id', verifyUser, getOrderById);

// খ. অর্ডারের স্ট্যাটাস আপডেট করার রুট
// URL: PUT /api/orders/:id
router.put('/:id', updateOrderStatus);

// গ. অর্ডার ডিলিট করার রুট
// URL: DELETE /api/orders/:id
router.delete('/:id', deleteOrder);

module.exports = router;





