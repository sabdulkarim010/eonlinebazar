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

const { createOrder } = require('../controllers/orderCheckoutController');
const {
    getOrders,
    updateOrderStatus,
    deleteOrder
} = require('../controllers/orderAdminController');
const {
    trackOrder,
    getMyOrders,
    getOrderById,
    getDashboardStats,
    cancelUserOrder,
    cancelPendingOrder,
    returnUserOrder,
    downloadOrderInvoice
} = require('../controllers/orderCustomerController');
const { submitPaymentProof } = require('../controllers/orderPaymentProofController');

// অ্যাডমিন ও ইউজার ভেরিফিকেশন 
const { verifyAdmin, verifyUser, optionalVerifyUser } = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/rbac');
const upload = require('../middlewares/uploadMiddleware');

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
router.post('/', optionalVerifyUser, createOrder); 

// খ. সব অর্ডার দেখার রুট (অ্যাডমিন প্যানেলের জন্য)
// 🔒 আগে এটি সম্পূর্ণ অসুরক্ষিত ছিল — যে কেউ সব কাস্টমারের অর্ডার দেখতে পারত।
// এখন অ্যাডমিন টোকেন + manage_orders পারমিশন বাধ্যতামূলক।
// URL: GET /api/orders
router.get('/', verifyAdmin, checkPermission('manage_orders'), getOrders);


// =================================================================
// ৩. ডাইনামিক রাউটস (Dynamic Routes) - এগুলো সব সময় নিচে থাকবে
// =================================================================

// ক. ইউজার অর্ডার বাতিল / রিটার্ন রিকোয়েস্ট (/:id এর আগে রাখতে হবে)
// URL: POST /api/orders/:id/cancel — pending or processing (storefront)
router.post('/:id/cancel', verifyUser, cancelUserOrder);

// URL: PUT /api/orders/:id/cancel — Pending only (mobile)
router.put('/:id/cancel', verifyUser, cancelPendingOrder);

// URL: POST /api/orders/:id/return
router.post('/:id/return', verifyUser, returnUserOrder);

// URL: PATCH /api/orders/:orderId/payment-proof — manual payment TRX proof
router.patch('/:orderId/payment-proof', verifyUser, upload.single('screenshot'), submitPaymentProof);

// URL: GET /api/orders/:id/invoice
router.get('/:id/invoice', verifyUser, downloadOrderInvoice);

// খ. নির্দিষ্ট একটি অর্ডারের বিস্তারিত দেখার রুট (🌟 নিরাপত্তা নিশ্চিত করতে verifyUser যুক্ত করা হলো)
// URL: GET /api/orders/:id
router.get('/:id', verifyUser, getOrderById);

// খ. অর্ডারের স্ট্যাটাস আপডেট করার রুট (🔒 অ্যাডমিন + manage_orders)
// URL: PUT /api/orders/:id
// Admin master editor (shipping + items) lives at PUT /api/admin/orders/:id/master-update
router.put('/:id', verifyAdmin, checkPermission('manage_orders'), updateOrderStatus);

// গ. অর্ডার ডিলিট করার রুট (🔒 অ্যাডমিন + manage_orders)
// URL: DELETE /api/orders/:id
router.delete('/:id', verifyAdmin, checkPermission('manage_orders'), deleteOrder);

module.exports = router;





