/********************************************************************
 * Project: EonlineBazar
 * File: reviewController.js
 * Location: controllers/reviewController.js
 * Author: Abdul Karim Sheikh
 * Description: Handles creating and updating product reviews. 
 * Uploads review photos to Cloudinary and auto-deletes old photos on update.
 ********************************************************************/

const mongoose = require('mongoose');
const Review = require('../models/review');
const Order = require('../models/order');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Cloudinary কনফিগারেশন
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// =======================================================
// ১. রিভিউ সেভ বা আপডেট করার ফাংশন (POST)
// =======================================================
exports.addOrUpdateReview = async (req, res) => {
    try {
        const { orderId, productId, rating, comment } = req.body;
        const userId = req.user.id || req.user._id; 

        // ---------------------------------------------------------------
        // 🔒 VERIFIED-PURCHASE GATE (anti-spam):
        // রিভিউ তখনই গ্রহণযোগ্য যখন—
        //   ১. orderId টি বৈধ এবং অর্ডারটি এই লগইন করা ইউজারের নিজের।
        //   ২. অর্ডারের স্ট্যাটাস "Delivered"।
        //   ৩. প্রোডাক্টটি ঐ অর্ডারের ভেতরে সত্যিই আছে।
        // এই চেক ফ্রন্টএন্ড বাটন লুকানোর ওপর নির্ভর না করে সার্ভার-সাইডেই
        // স্প্যাম/জাল রিভিউ প্রতিরোধ করে।
        // ---------------------------------------------------------------
        if (!orderId || !productId || rating === undefined || !comment) {
            return res.status(400).json({ success: false, message: 'Order, product, rating and comment are all required.' });
        }

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order reference.' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        // অর্ডারটি অবশ্যই এই ইউজারের হতে হবে
        if (!order.user || order.user.toString() !== String(userId)) {
            return res.status(403).json({ success: false, message: 'You can only review products from your own orders.' });
        }

        // অর্ডার অবশ্যই "Delivered" হতে হবে
        const isDelivered = order.isDelivered === true || String(order.status || '').toLowerCase() === 'delivered';
        if (!isDelivered) {
            return res.status(403).json({ success: false, message: 'You can only review a product after it has been delivered.' });
        }

        // প্রোডাক্টটি অবশ্যই এই অর্ডারের ভেতরে থাকতে হবে
        const productInOrder = Array.isArray(order.items) && order.items.some(item =>
            String(item.id) === String(productId) || String(item.productId) === String(productId)
        );
        if (!productInOrder) {
            return res.status(403).json({ success: false, message: 'This product was not part of the selected order.' });
        }

        // রেটিং রেঞ্জ ভ্যালিডেশন
        const numericRating = Number(rating);
        if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
        }

        let photoUrl = '';

        // ১. যদি ইউজার নতুন ছবি দেয়, তবে সেটি Cloudinary তে আপলোড করা
        if (req.file) {
            const uploadFromBuffer = (req) => {
                return new Promise((resolve, reject) => {
                    let cld_upload_stream = cloudinary.uploader.upload_stream(
                        { folder: "reviews" }, 
                        (error, result) => {
                            if (result) resolve(result);
                            else reject(error);
                        }
                    );
                    streamifier.createReadStream(req.file.buffer).pipe(cld_upload_stream);
                });
            };
            
            const result = await uploadFromBuffer(req);
            photoUrl = result.secure_url; 
        }

        // ২. চেক করা ইউজারের আগের রিভিউ আছে কি না
        let existingReview = await Review.findOne({ userId, productId, orderId });

        if (existingReview) {
            // 🟢 আপডেট লজিক (Edit)
            existingReview.rating = Number(rating);
            existingReview.comment = comment;
            
            // যদি নতুন ছবি আপলোড করা হয় এবং আগের কোনো ছবি ডাটাবেসে থাকে
            if (req.file && existingReview.photo) {
                try {
                    // Cloudinary URL থেকে Public ID বের করা (যাতে ডিলিট করা যায়)
                    const urlParts = existingReview.photo.split('/');
                    const filename = urlParts[urlParts.length - 1]; // ex: image123.jpg
                    const publicId = `reviews/${filename.split('.')[0]}`; // ex: reviews/image123

                    await cloudinary.uploader.destroy(publicId); // আগের ছবি Cloudinary থেকে রিমুভ
                    console.log("Old photo removed from Cloudinary successfully.");
                } catch (imgError) {
                    console.error("Error removing old photo:", imgError);
                }
            }

            // নতুন ছবির লিংক ডাটাবেসে আপডেট করা
            if (photoUrl) {
                existingReview.photo = photoUrl; 
            }
            
            await existingReview.save();

            return res.status(200).json({ 
                success: true, 
                message: 'Review updated successfully!', 
                review: existingReview 
            });
        } else {
            // 🟢 নতুন তৈরি লজিক (Create)
            const newReview = new Review({
                userId,
                productId,
                orderId,
                rating: Number(rating),
                comment,
                photo: photoUrl
            });
            await newReview.save();

            return res.status(201).json({ 
                success: true, 
                message: 'Review submitted successfully!', 
                review: newReview 
            });
        }

    } catch (error) {
        console.error('Review Save Error:', error);
        res.status(500).json({ success: false, message: 'Server error while saving review.' });
    }
};

// =======================================================
// 🌟 ২. প্রোডাক্টের রিভিউ ডাটাবেস থেকে আনার ফাংশন (GET) 
// (আপডেট: নির্দিষ্ট অর্ডার ও ইউজারের ডাটা নিখুঁতভাবে ফিল্টার করার কুয়েরি সাপোর্ট সহ)
// =======================================================
exports.getReviewsByProduct = async (req, res) => {
    try {
        const { orderId, userId } = req.query;
        let query = { productId: req.params.productId };

        // যদি কুয়েরি প্যারামিটারে অর্ডার আইডি এবং ইউজার আইডি পাঠানো হয়, তবে ফিল্টারিং আরও সুনির্দিষ্ট হবে
        if (orderId) query.orderId = orderId;
        if (userId) query.userId = userId;

        const reviews = await Review.find(query).populate('userId', 'name');
        res.status(200).json({ success: true, reviews });
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ success: false, message: 'Error fetching reviews.' });
    }
};

















