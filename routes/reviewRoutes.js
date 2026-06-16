/********************************************************************
 * File: reviewRoutes.js
 * Location: routes/reviewRoutes.js
 * Description: API endpoints for review system.
 ********************************************************************/

const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { requireSignIn } = require('../middlewares/authMiddleware'); 
const upload = require('../middlewares/uploadMiddleware'); 

// 🟢 নতুন যোগ করা হলো: নির্দিষ্ট প্রোডাক্টের সব রিভিউ ডাটাবেস থেকে আনার জন্য
router.get('/:productId', reviewController.getReviewsByProduct);

// 🌟 POST /api/reviews (রিভিউ সেভ বা আপডেট করার জন্য)
router.post(
    '/', 
    requireSignIn, 
    upload.single('photo'), 
    reviewController.addOrUpdateReview
);

module.exports = router;

