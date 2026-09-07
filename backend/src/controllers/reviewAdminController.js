/********************************************************************
 * Admin review listing and moderation.
 ********************************************************************/

const mongoose = require('mongoose');
const Review = require('../models/review');
const Product = require('../models/product');
const { syncProductRating } = require('./reviewController');

const getAllReviews = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const { status, productId, rating, search } = req.query;

        const filter = {};
        if (status === 'hidden') filter.isHidden = true;
        if (status === 'visible') filter.isHidden = { $ne: true };
        if (productId) filter.productId = String(productId);
        if (rating) filter.rating = Number(rating);
        if (search) filter.comment = { $regex: String(search), $options: 'i' };

        const [reviews, total] = await Promise.all([
            Review.find(filter)
                .populate('userId', 'name email')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Review.countDocuments(filter)
        ]);

        const productIds = [...new Set(reviews.map((r) => String(r.productId || '')).filter(Boolean))];
        const products = productIds.length
            ? await Product.find({
                $or: [
                    { productId: { $in: productIds } },
                    ...(productIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => ({ _id: id })))
                ]
            }).select('name images image productId').lean()
            : [];

        const productMap = new Map();
        products.forEach((p) => {
            productMap.set(String(p._id), p);
            if (p.productId) productMap.set(String(p.productId), p);
        });

        const enriched = reviews.map((review) => ({
            ...review,
            product: productMap.get(String(review.productId)) || null
        }));

        res.json({
            success: true,
            reviews: enriched,
            total,
            pages: Math.ceil(total / limit),
            page: Number(page)
        });
    } catch (err) {
        console.error('getAllReviews error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

const moderateReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, adminNote } = req.body || {};

        if (!action || !['hide', 'show', 'delete'].includes(String(action))) {
            return res.status(400).json({
                success: false,
                message: 'Action must be hide, show, or delete'
            });
        }

        const review = await Review.findById(id);
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        const productId = review.productId;

        if (action === 'delete') {
            await review.deleteOne();
            await syncProductRating(productId);
            return res.json({ success: true, message: 'Review deleted' });
        }

        review.isHidden = action === 'hide';
        review.adminNote = String(adminNote || '').trim();
        review.moderatedAt = new Date();
        await review.save();
        await syncProductRating(productId);

        res.json({
            success: true,
            review,
            message: `Review ${action === 'hide' ? 'hidden' : 'restored'}`
        });
    } catch (err) {
        console.error('moderateReview error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

const deleteReview = async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        const productId = review.productId;
        await review.deleteOne();
        await syncProductRating(productId);

        res.json({ success: true, message: 'Review deleted' });
    } catch (err) {
        console.error('deleteReview error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    getAllReviews,
    moderateReview,
    deleteReview
};
