/********************************************************************
 * Project: EonlineBazar
 * File: productRoutes.js
 * Location: routes/productRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: Defines API endpoints for Product management including 
 * adding, updating, deleting products (Admin) and adding reviews (Customer).
 ********************************************************************/

const express = require('express');
const router = express.Router();

// কন্ট্রোলারগুলো ইমপোর্ট করা হলো (নতুন createProductReview সহ)
const { 
    getProducts, 
    createProduct, 
    updateProduct, 
    deleteProduct, 
    getProductById,
    createProductReview // 🌟 নতুন যোগ করা হলো
} = require('../controllers/productController');

// মিডলওয়্যার ইমপোর্ট করা হলো
const { verifyAdmin, verifyUser } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

/********************************************************************
 # PRODUCT ROUTES (প্রোডাক্টের এপিআই রাস্তাসমূহ)
 ********************************************************************/

// ১. সব প্রোডাক্ট দেখার রুট (পাবলিক)
// URL: GET /api/products
router.get('/', getProducts);

// ২. সিঙ্গেল প্রোডাক্টের ডিটেইলস দেখার রুট (পাবলিক)
// URL: GET /api/products/:id
router.get('/:id', getProductById);

// ৩. নতুন প্রোডাক্ট যোগ করার রুট (অ্যাডমিন অনলি + ১০টি ইমেজ লিমিট)
// URL: POST /api/products
router.post('/', verifyAdmin, upload.array('productImages', 10), createProduct, (error, req, res, next) => {
    if (error) {
        return res.status(400).json({ success: false, message: "Upload limit exceeded! Maximum 10 images allowed." });
    }
});

// ৪. প্রোডাক্ট এডিট বা আপডেট করার রুট (অ্যাডমিন অনলি + ১০টি ইমেজ লিমিট)
// URL: PUT /api/products/:id
router.put('/:id', verifyAdmin, upload.array('productImages', 10), updateProduct, (error, req, res, next) => {
    if (error) {
        return res.status(400).json({ success: false, message: "Upload limit exceeded! Maximum 10 images allowed." });
    }
});

// ৫. প্রোডাক্ট ডিলিট করার রুট (অ্যাডমিন অনলি)
// URL: DELETE /api/products/:id
router.delete('/:id', verifyAdmin, deleteProduct);

// ৬. 🌟 প্রোডাক্টে রিভিউ ও রেটিং দেওয়ার রুট (শুধুমাত্র লগইন করা কাস্টমারদের জন্য)
// URL: POST /api/products/:id/reviews
router.post('/:id/reviews', verifyUser, createProductReview);

module.exports = router;



