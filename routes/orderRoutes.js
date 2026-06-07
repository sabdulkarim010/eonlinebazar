const express = require('express'); 
const router = express.Router();

const { 
    createOrder, 
    getOrders, 
    getOrderById, 
    updateOrderStatus,
    deleteOrder,
    trackOrder, // 🌟 trackOrder ইমপোর্ট করা হলো
} = require('../controllers/orderController');

// অ্যাডমিন ভেরিফিকেশন 
const { verifyAdmin } = require('../middlewares/authMiddleware');

/********************************************************************
 # ORDER ROUTES (অর্ডারের এপিআই রাস্তাসমূহ)
 ********************************************************************/

// ১. ট্র্যাকিং এর জন্য নতুন পাবলিক API রুট (🌟 এটি সবার উপরে রাখতে হবে)
// URL: GET /api/orders/track
router.get('/track', trackOrder);

// ২. নতুন অর্ডার তৈরি করার রুট
// URL: POST /api/orders
router.post('/', createOrder);

// ৩. সব অর্ডার দেখার রুট (অ্যাডমিন প্যানেলের জন্য)
// URL: GET /api/orders
router.get('/', getOrders);

// ৪. নির্দিষ্ট একটি অর্ডারের বিস্তারিত দেখার রুট (🌟 এটি /track এর নিচে থাকতে হবে)
// URL: GET /api/orders/:id
router.get('/:id', getOrderById);

// ৫. অর্ডারের স্ট্যাটাস আপডেট করার রুট
// URL: PUT /api/orders/:id
router.put('/:id', updateOrderStatus);

// ৬. অর্ডার ডিলিট করার রুট
// URL: DELETE /api/orders/:id
router.delete('/:id', deleteOrder);

module.exports = router;





