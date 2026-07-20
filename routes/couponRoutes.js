/********************************************************************
 * Project: EonlineBazar
 * File: couponRoutes.js
 * Location: routes/couponRoutes.js
 * Author: Abdul Karim Sheikh
 * Description: Coupon REST API — admin CRUD + storefront apply.
 * GET/POST/PUT/DELETE (admin); POST /apply (optional customer auth).
 ********************************************************************/

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const UserSession = require('../models/userSession');
const { verifyAdmin } = require('../middlewares/authMiddleware');
const {
    getCoupons,
    getCouponById,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    toggleCouponStatus,
    checkActiveCoupons,
    applyCoupon
} = require('../controllers/couponController');

/**
 * Optional customer auth — attaches req.user when a valid token is present
 * so per-user limits can be enforced; guests can still preview/apply.
 */
async function optionalVerifyUser(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'eOnlineBazarSecretKey123');
        const userId = decoded.id || decoded._id || decoded.userId;
        if (!userId) {
            req.user = null;
            return next();
        }
        if (decoded.sid) {
            const session = await UserSession.findOneAndUpdate(
                { sessionId: decoded.sid },
                { $set: { lastActiveAt: new Date() } },
                { returnDocument: 'after' }
            );
            if (!session) {
                req.user = null;
                return next();
            }
        }
        req.user = { id: userId, sid: decoded.sid || null };
    } catch (_) {
        req.user = null;
    }
    next();
}

// Storefront — validate & price breakdown (must be before /:id)
router.post('/apply', optionalVerifyUser, applyCoupon);
router.get('/active-check', checkActiveCoupons);

// Admin — list / CRUD
router.get('/', verifyAdmin, getCoupons);
router.get('/:id', verifyAdmin, getCouponById);
router.post('/', verifyAdmin, createCoupon);
router.put('/:id', verifyAdmin, updateCoupon);
router.patch('/:id/toggle', verifyAdmin, toggleCouponStatus);
router.delete('/:id', verifyAdmin, deleteCoupon);

module.exports = router;
