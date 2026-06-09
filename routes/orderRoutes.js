const express = require('express'); 
const router = express.Router();

const { 
    createOrder, 
    getOrders, 
    getOrderById, 
    updateOrderStatus,
    deleteOrder,
    trackOrder, 
    getMyOrders // 🌟 ফিক্স: ইউজারের নিজের অর্ডার দেখার কন্ট্রোলার ইমপোর্ট করা হলো
} = require('../controllers/orderController');

// অ্যাডমিন ও ইউজার ভেরিফিকেশন 
const { verifyAdmin, verifyUser } = require('../middlewares/authMiddleware');

/********************************************************************
 # ORDER ROUTES (অর্ডারের এপিআই রাস্তাসমূহ)
 ********************************************************************/

// ১. ট্র্যাকিং এর জন্য পাবলিক API রুট (🌟 এটি সবার উপরে রাখতে হবে)
// URL: GET /api/orders/track
router.get('/track', trackOrder);

// 🌟 ২. ইউজারের নিজের অর্ডার দেখার রুট (অবশ্যই /:id এর উপরে থাকতে হবে)
// URL: GET /api/orders/my-orders
router.get('/my-orders', verifyUser, getMyOrders);

// ৩. নতুন অর্ডার তৈরি করার রুট
// URL: POST /api/orders
router.post('/', verifyUser, createOrder); // ✅ সঠিক কোড!

// ৪. সব অর্ডার দেখার রুট (অ্যাডমিন প্যানেলের জন্য)
// URL: GET /api/orders
router.get('/', getOrders);

// ৫. নির্দিষ্ট একটি অর্ডারের বিস্তারিত দেখার রুট (🌟 এটি /track এবং /my-orders এর নিচে থাকতে হবে)
// URL: GET /api/orders/:id
router.get('/:id', getOrderById);

// ৬. অর্ডারের স্ট্যাটাস আপডেট করার রুট
// URL: PUT /api/orders/:id
router.put('/:id', updateOrderStatus);

// ৭. অর্ডার ডিলিট করার রুট
// URL: DELETE /api/orders/:id
router.delete('/:id', deleteOrder);

module.exports = router;





