/********************************************************************
 * Project: EonlineBazar
 * File: couponController.js
 * Location: controllers/couponController.js
 * Author: Abdul Karim Sheikh
 * Description: Admin CRUD + secure storefront coupon apply/validate.
 * Responses follow { success, message, data }. Apply never mutates
 * usage counters — redemption happens on successful order placement.
 ********************************************************************/

const Coupon = require('../models/coupon');

/** Compute discount for a cart subtotal given a coupon document. */
function calculateDiscount(coupon, subtotal) {
    const cartTotal = Math.max(0, Number(subtotal) || 0);
    let discountAmount = 0;

    if (coupon.discountType === 'percentage') {
        discountAmount = (cartTotal * Number(coupon.discountValue)) / 100;
        const cap = Number(coupon.maxDiscountAmount);
        if (Number.isFinite(cap) && cap > 0) {
            discountAmount = Math.min(discountAmount, cap);
        }
    } else {
        discountAmount = Number(coupon.discountValue) || 0;
    }

    discountAmount = Math.min(Math.max(0, discountAmount), cartTotal);
    discountAmount = Math.round(discountAmount * 100) / 100;

    return {
        discountAmount,
        finalTotal: Math.round((cartTotal - discountAmount) * 100) / 100
    };
}

/**
 * Shared validation (apply + order place). Returns { ok, status, message, coupon, breakdown }
 * or { ok: false, ... }. Does NOT increment usedCount.
 */
async function validateCouponForCart({ code, subtotal, userId }) {
    const normalizedCode = String(code || '').trim().toUpperCase();
    const cartSubtotal = Number(subtotal);

    if (!normalizedCode) {
        return { ok: false, status: 400, message: 'Please enter a coupon code.' };
    }
    if (!Number.isFinite(cartSubtotal) || cartSubtotal < 0) {
        return { ok: false, status: 400, message: 'Invalid cart subtotal.' };
    }

    const coupon = await Coupon.findOne({ code: normalizedCode });
    if (!coupon) {
        return { ok: false, status: 404, message: 'Invalid coupon code.' };
    }

    if (!coupon.isActive) {
        return { ok: false, status: 400, message: 'This coupon is currently inactive.' };
    }

    const now = new Date();
    const expiry = new Date(coupon.expiryDate);
    // End of expiry calendar day (inclusive)
    expiry.setHours(23, 59, 59, 999);
    if (now > expiry) {
        return { ok: false, status: 400, message: 'Coupon expired.' };
    }

    if (coupon.usedCount >= coupon.usageLimit) {
        return { ok: false, status: 400, message: 'This coupon has reached its usage limit.' };
    }

    if (cartSubtotal < (Number(coupon.minOrderAmount) || 0)) {
        return {
            ok: false,
            status: 400,
            message: `Minimum order amount of ৳${coupon.minOrderAmount} required for this coupon.`
        };
    }

    if (userId) {
        const userUses = (coupon.usedBy || []).filter(
            (id) => String(id) === String(userId)
        ).length;
        if (userUses >= (coupon.perUserLimit || 1)) {
            return {
                ok: false,
                status: 400,
                message: 'You have already used this coupon the maximum number of times.'
            };
        }
    }

    if (coupon.discountType === 'percentage' && Number(coupon.discountValue) > 100) {
        return { ok: false, status: 400, message: 'Invalid coupon configuration.' };
    }

    const { discountAmount, finalTotal } = calculateDiscount(coupon, cartSubtotal);

    return {
        ok: true,
        coupon,
        breakdown: {
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            subtotal: cartSubtotal,
            discountAmount,
            finalTotal
        }
    };
}

/** Atomically claim one global usage slot (race-safe). Call before order save. */
async function redeemCoupon(couponId) {
    if (!couponId) return null;

    return Coupon.findOneAndUpdate(
        {
            _id: couponId,
            isActive: true,
            $expr: { $lt: ['$usedCount', '$usageLimit'] }
        },
        { $inc: { usedCount: 1 } },
        { new: true }
    );
}

/** Record per-user redemption after the order is persisted. */
async function recordCouponUserUse(couponId, userId) {
    if (!couponId || !userId) return null;
    return Coupon.findByIdAndUpdate(
        couponId,
        { $push: { usedBy: userId } },
        { new: true }
    );
}

/** Undo a claimed usage slot if order persistence fails. */
async function releaseCouponSlot(couponId) {
    if (!couponId) return null;
    return Coupon.findOneAndUpdate(
        { _id: couponId, usedCount: { $gt: 0 } },
        { $inc: { usedCount: -1 } },
        { new: true }
    );
}

// ─── Admin CRUD ───────────────────────────────────────────────────────────

const getCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: coupons });
    } catch (error) {
        console.error('Coupon Fetch Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load coupons.' });
    }
};

const getCouponById = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found.' });
        }
        res.status(200).json({ success: true, data: coupon });
    } catch (error) {
        console.error('Coupon Fetch Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load coupon.' });
    }
};

function parseCouponBody(body) {
    const code = String(body.code || '').trim().toUpperCase();
    const discountType = body.discountType === 'flat' ? 'flat' : 'percentage';
    const discountValue = Number(body.discountValue);
    const minOrderAmount = Number(body.minOrderAmount) || 0;
    let maxDiscountAmount = body.maxDiscountAmount;
    if (maxDiscountAmount === '' || maxDiscountAmount === undefined || maxDiscountAmount === null) {
        maxDiscountAmount = null;
    } else {
        maxDiscountAmount = Number(maxDiscountAmount);
        if (!Number.isFinite(maxDiscountAmount) || maxDiscountAmount <= 0) maxDiscountAmount = null;
    }
    const expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;
    const usageLimit = Number(body.usageLimit);
    const perUserLimit = Number(body.perUserLimit) > 0 ? Number(body.perUserLimit) : 1;
    const isActive = body.isActive === false || body.isActive === 'false' ? false : true;

    return {
        code,
        discountType,
        discountValue,
        minOrderAmount,
        maxDiscountAmount,
        expiryDate,
        usageLimit,
        perUserLimit,
        isActive
    };
}

function validateCouponFields(fields, { isUpdate = false } = {}) {
    if (!isUpdate || fields.code !== undefined) {
        if (!fields.code || fields.code.length < 2) {
            return 'Coupon code must be at least 2 characters.';
        }
    }
    if (!Number.isFinite(fields.discountValue) || fields.discountValue <= 0) {
        return 'Discount value must be a positive number.';
    }
    if (fields.discountType === 'percentage' && fields.discountValue > 100) {
        return 'Percentage discount cannot exceed 100%.';
    }
    if (!fields.expiryDate || Number.isNaN(fields.expiryDate.getTime())) {
        return 'Please provide a valid expiry date.';
    }
    if (!Number.isFinite(fields.usageLimit) || fields.usageLimit < 1) {
        return 'Usage limit must be at least 1.';
    }
    return null;
}

const createCoupon = async (req, res) => {
    try {
        const fields = parseCouponBody(req.body);
        const errMsg = validateCouponFields(fields);
        if (errMsg) {
            return res.status(400).json({ success: false, message: errMsg });
        }

        const existing = await Coupon.findOne({ code: fields.code });
        if (existing) {
            return res.status(400).json({ success: false, message: 'A coupon with this code already exists.' });
        }

        const coupon = new Coupon(fields);
        await coupon.save();

        res.status(201).json({
            success: true,
            message: 'Coupon created successfully!',
            data: coupon
        });
    } catch (error) {
        console.error('Coupon Create Error:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'A coupon with this code already exists.' });
        }
        res.status(500).json({ success: false, message: 'Failed to create coupon.' });
    }
};

const updateCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found.' });
        }

        const fields = parseCouponBody({ ...coupon.toObject(), ...req.body });
        const errMsg = validateCouponFields(fields, { isUpdate: true });
        if (errMsg) {
            return res.status(400).json({ success: false, message: errMsg });
        }

        if (fields.code !== coupon.code) {
            const dup = await Coupon.findOne({ code: fields.code, _id: { $ne: coupon._id } });
            if (dup) {
                return res.status(400).json({ success: false, message: 'A coupon with this code already exists.' });
            }
        }

        Object.assign(coupon, {
            code: fields.code,
            discountType: fields.discountType,
            discountValue: fields.discountValue,
            minOrderAmount: fields.minOrderAmount,
            maxDiscountAmount: fields.maxDiscountAmount,
            expiryDate: fields.expiryDate,
            usageLimit: fields.usageLimit,
            perUserLimit: fields.perUserLimit,
            isActive: fields.isActive
        });

        await coupon.save();

        res.status(200).json({
            success: true,
            message: 'Coupon updated successfully!',
            data: coupon
        });
    } catch (error) {
        console.error('Coupon Update Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update coupon.' });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const deleted = await Coupon.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Coupon not found.' });
        }
        res.status(200).json({ success: true, message: 'Coupon deleted successfully!' });
    } catch (error) {
        console.error('Coupon Delete Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete coupon.' });
    }
};

const toggleCouponStatus = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found.' });
        }
        coupon.isActive = !coupon.isActive;
        await coupon.save();
        res.status(200).json({
            success: true,
            message: coupon.isActive ? 'Coupon activated.' : 'Coupon deactivated.',
            data: coupon
        });
    } catch (error) {
        console.error('Coupon Toggle Error:', error);
        res.status(500).json({ success: false, message: 'Failed to toggle coupon status.' });
    }
};

// ─── Storefront apply ─────────────────────────────────────────────────────

const applyCoupon = async (req, res) => {
    try {
        const code = req.body.code || req.body.couponCode;
        const subtotal = req.body.subtotal ?? req.body.cartSubtotal ?? req.body.total;
        const userId = req.user ? req.user.id : null;

        const result = await validateCouponForCart({ code, subtotal, userId });
        if (!result.ok) {
            return res.status(result.status).json({ success: false, message: result.message });
        }

        res.status(200).json({
            success: true,
            message: 'Coupon applied successfully!',
            data: {
                ...result.breakdown,
                couponId: result.coupon._id,
                maxDiscountAmount: result.coupon.maxDiscountAmount,
                minOrderAmount: result.coupon.minOrderAmount
            }
        });
    } catch (error) {
        console.error('Coupon Apply Error:', error);
        res.status(500).json({ success: false, message: 'Failed to apply coupon.' });
    }
};

module.exports = {
    getCoupons,
    getCouponById,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    toggleCouponStatus,
    applyCoupon,
    validateCouponForCart,
    calculateDiscount,
    redeemCoupon,
    recordCouponUserUse,
    releaseCouponSlot
};
