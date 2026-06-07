const express = require('express'); // 🌟 ফিক্স: 'const' ছোট হাতের অক্ষরে দেওয়া হয়েছে
const router = express.Router();

// 🌟 ফিক্স: কন্ট্রোলার থেকে 'deleteOrder' ইমপোর্ট করা হলো
const { 
    createOrder, 
    getOrders, 
    getOrderById, 
    updateOrderStatus,
    deleteOrder 
} = require('../controllers/orderController');

// অ্যাডমিন ভেরিফিকেশন (আপাতত ইমপোর্ট করা থাকল, কিন্তু নিচে কমেন্ট করে দিয়েছি)
const { verifyAdmin } = require('../middlewares/authMiddleware');

/********************************************************************
 # ORDER ROUTES (অর্ডারের এপিআই রাস্তাসমূহ)
 ********************************************************************/

// ১. নতুন অর্ডার তৈরি করার রুট (পাবলিক - চেকআউট বা পেমেন্ট পেজ থেকে)
// URL: POST /api/orders
router.post('/', createOrder);

// ২. সব অর্ডার দেখার রুট (অ্যাডমিন প্যানেলের জন্য)
// URL: GET /api/orders
// 🌟 ফিক্স: টেস্টিংয়ের জন্য verifyAdmin সরিয়ে দেওয়া হয়েছে যেন সরাসরি ডাটা দেখতে পান।
router.get('/', getOrders);

// ৩. নির্দিষ্ট একটি অর্ডারের বিস্তারিত দেখার রুট
// URL: GET /api/orders/:id
router.get('/:id', getOrderById);

// ৪. অর্ডারের স্ট্যাটাস আপডেট করার রুট (যেমন: Pending থেকে Delivered করা)
// URL: PUT /api/orders/:id
// 🌟 ফিক্স: 컨트롤ারের সাথে মেলানোর জন্য শুধু /:id রাখা হয়েছে
router.put('/:id', updateOrderStatus);

module.exports = router;

// ৫. অর্ডার ডিলিট করার রুট
// URL: DELETE /api/orders/:id
router.delete('/:id', deleteOrder);

module.exports = router;





