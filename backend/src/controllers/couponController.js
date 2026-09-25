/********************************************************************
 * Project: EonlineBazar
 * File: couponController.js
 * Location: controllers/couponController.js
 * Author: Abdul Karim Sheikh
 * Description: Admin CRUD + secure storefront coupon apply/validate.
 * Responses follow { success, message, data }. Apply never mutates
 * usage counters — redemption happens on successful order placement.
 ********************************************************************/

const mongoose = require('mongoose');
const Coupon = require('../models/coupon');
const {
    getApplicationNow,
    getApplicationTimeContext,
    isExpiryReached
} = require('../utils/applicationTime');
const couponRepo = require('../repositories/couponRepository');

/** Run time-based expiry sweep before coupon reads / availability checks. */
async function runCouponAutoExpiry(now = getApplicationNow()) {
    return Coupon.expireDueCoupons(now);
}

/**
 * Strict time + status gate: coupon must be ACTIVE with expiryDate strictly after now.
 * Uses the centralized application server clock — never client device time.
 * Returns { ok: true } or { ok: false, status, message }.
 */
function assertCouponActiveAndUnexpired(coupon, now = getApplicationNow()) {
    if (!coupon) {
        return { ok: false, status: 404, message: 'Invalid coupon code.' };
    }

    const expiryMs = new Date(coupon.expiryDate).getTime();
    if (!Number.isFinite(expiryMs)) {
        return { ok: false, status: 400, message: 'Invalid coupon configuration.' };
    }

    if (isExpiryReached(coupon.expiryDate, now)) {
        return {
            ok: false,
            status: 400,
            message: 'Coupon expired. Your order total has been recalculated without the discount.'
        };
    }

    if (coupon.status !== 'ACTIVE') {
        return {
            ok: false,
            status: 400,
            message: 'This coupon is not active. Your order total has been recalculated without the discount.'
        };
    }

    return { ok: true };
}

function normalizePaymentCode(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function normalizeCategoryName(value) {
    return String(value || '').trim().toLowerCase();
}

function filterEligibleCartItems(cartItems, applicableCategories) {
    const items = Array.isArray(cartItems) ? cartItems : [];
    const allowed = (Array.isArray(applicableCategories) ? applicableCategories : [])
        .map(normalizeCategoryName)
        .filter(Boolean);
    if (!allowed.length) return items;
    return items.filter((item) => allowed.includes(normalizeCategoryName(item.category || 'General')));
}

function sumCartSubtotal(items) {
    return (Array.isArray(items) ? items : []).reduce((sum, item) => {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const price = Math.max(0, Number(item.price) || 0);
        return sum + price * qty;
    }, 0);
}

function validateAdvancedCouponRules(coupon, { paymentMethodCode, cartItems, subtotal }) {
    const allowedMethods = (Array.isArray(coupon.allowedPaymentMethods) ? coupon.allowedPaymentMethods : [])
        .map(normalizePaymentCode)
        .filter(Boolean);

    if (allowedMethods.length > 0) {
        const methodCode = normalizePaymentCode(paymentMethodCode);
        if (!methodCode || !allowedMethods.includes(methodCode)) {
            return {
                ok: false,
                status: 400,
                message: 'This coupon is not valid for the selected payment method.'
            };
        }
    }

    const applicableCategories = Array.isArray(coupon.applicableCategories)
        ? coupon.applicableCategories
        : [];
    const eligibleItems = filterEligibleCartItems(cartItems, applicableCategories);
    const categorySpend = sumCartSubtotal(eligibleItems);

    if (applicableCategories.length > 0 && eligibleItems.length === 0) {
        return {
            ok: false,
            status: 400,
            message: 'This coupon requires products from specific categories.'
        };
    }

    const minCategorySpend = Number(coupon.minCategorySpend);
    if (applicableCategories.length > 0 && Number.isFinite(minCategorySpend) && minCategorySpend > 0) {
        if (categorySpend < minCategorySpend) {
            return {
                ok: false,
                status: 400,
                message: `Minimum spend of ৳${minCategorySpend} in eligible categories required for this coupon.`
            };
        }
    }

    if (coupon.discountType === 'buy_x_get_y') {
        const meta = coupon.ruleMetadata && typeof coupon.ruleMetadata === 'object' ? coupon.ruleMetadata : {};
        const buyQty = Math.max(1, Number(meta.buyQuantity) || 2);
        const totalEligibleQty = eligibleItems.reduce(
            (sum, item) => sum + Math.max(1, Number(item.quantity) || 1),
            0
        );
        if (totalEligibleQty < buyQty) {
            return {
                ok: false,
                status: 400,
                message: `Add at least ${buyQty} eligible items to use this offer.`
            };
        }
    }

    if (coupon.discountType === 'tiered') {
        const tiers = Array.isArray(coupon.ruleMetadata?.tiers) ? coupon.ruleMetadata.tiers : [];
        const qualifying = tiers.some((tier) => Number(subtotal) >= Number(tier.minSpend || 0));
        if (tiers.length > 0 && !qualifying) {
            return {
                ok: false,
                status: 400,
                message: 'Your cart total does not qualify for any tier of this coupon.'
            };
        }
    }

    return { ok: true, categorySpend, eligibleItems };
}

/** Compute discount for a cart subtotal given a coupon document. */
function calculateDiscount(coupon, subtotal, cartItems = []) {
    const cartTotal = Math.max(0, Number(subtotal) || 0);
    let discountAmount = 0;
    const eligibleItems = filterEligibleCartItems(
        cartItems,
        coupon.applicableCategories
    );
    const discountBase = coupon.applicableCategories?.length
        ? sumCartSubtotal(eligibleItems)
        : cartTotal;

    if (coupon.discountType === 'percentage') {
        discountAmount = (discountBase * Number(coupon.discountValue)) / 100;
        const cap = Number(coupon.maxDiscountAmount);
        if (Number.isFinite(cap) && cap > 0) {
            discountAmount = Math.min(discountAmount, cap);
        }
    } else if (coupon.discountType === 'flat') {
        discountAmount = Number(coupon.discountValue) || 0;
    } else if (coupon.discountType === 'tiered') {
        const tiers = Array.isArray(coupon.ruleMetadata?.tiers) ? coupon.ruleMetadata.tiers : [];
        const sorted = [...tiers].sort((a, b) => Number(b.minSpend) - Number(a.minSpend));
        const tier = sorted.find((row) => cartTotal >= Number(row.minSpend || 0));
        if (tier) {
            const tierType = String(tier.discountType || 'percentage').toLowerCase();
            if (tierType === 'flat') {
                discountAmount = Number(tier.discountValue) || 0;
            } else {
                discountAmount = (cartTotal * Number(tier.discountValue || 0)) / 100;
                const tierCap = Number(tier.maxDiscount);
                if (Number.isFinite(tierCap) && tierCap > 0) {
                    discountAmount = Math.min(discountAmount, tierCap);
                }
            }
        }
    } else if (coupon.discountType === 'buy_x_get_y') {
        const meta = coupon.ruleMetadata && typeof coupon.ruleMetadata === 'object'
            ? coupon.ruleMetadata
            : {};
        const buyQty = Math.max(1, Number(meta.buyQuantity) || 2);
        const getQty = Math.max(1, Number(meta.getQuantity) || 1);
        const getPct = Math.min(100, Math.max(0, Number(meta.getDiscountPercent ?? 100)));
        const unitPrices = [];
        for (const item of eligibleItems) {
            const qty = Math.max(1, Number(item.quantity) || 1);
            const price = Math.max(0, Number(item.price) || 0);
            for (let i = 0; i < qty; i++) unitPrices.push(price);
        }
        unitPrices.sort((a, b) => a - b);
        const sets = Math.floor(unitPrices.length / buyQty);
        const freeUnits = Math.min(sets * getQty, unitPrices.length);
        for (let i = 0; i < freeUnits; i++) {
            discountAmount += unitPrices[i] * (getPct / 100);
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
async function validateCouponForCart({
    code,
    subtotal,
    userId,
    paymentMethodCode = null,
    cartItems = [],
    now = getApplicationNow()
}) {
    const normalizedCode = String(code || '').trim().toUpperCase();
    const cartSubtotal = Number(subtotal);

    if (!normalizedCode) {
        return { ok: false, status: 400, message: 'Please enter a coupon code.' };
    }
    if (!Number.isFinite(cartSubtotal) || cartSubtotal < 0) {
        return { ok: false, status: 400, message: 'Invalid cart subtotal.' };
    }

    await runCouponAutoExpiry(now);

    const coupon = await Coupon.findOne({ code: normalizedCode });
    if (!coupon) {
        return { ok: false, status: 404, message: 'Invalid coupon code.' };
    }

    if (isExpiryReached(coupon.expiryDate, now) && coupon.status !== 'EXPIRED') {
        coupon.status = 'EXPIRED';
        coupon.isActive = false;
        await coupon.save();
        
        // Dual-write: deactivate in PostgreSQL
        try {
            await couponRepo.deactivateCouponInPG(coupon._id);
        } catch (pgErr) {
            console.error('[DUAL-WRITE-COUPON-FAIL]', {
                operation: 'auto-expiry',
                couponId: String(coupon._id),
                error: pgErr.message
            });
        }
    }

    const eligibility = assertCouponActiveAndUnexpired(coupon, now);
    if (!eligibility.ok) {
        return eligibility;
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

    const rulesCheck = validateAdvancedCouponRules(coupon, {
        paymentMethodCode,
        cartItems,
        subtotal: cartSubtotal
    });
    if (!rulesCheck.ok) {
        return rulesCheck;
    }

    const { discountAmount, finalTotal } = calculateDiscount(coupon, cartSubtotal, cartItems);

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

function toObjectId(value) {
    if (!value) return null;
    const str = String(value);
    return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : null;
}

/** Atomically claim a global usage slot and optional per-user redemption (race-safe). */
async function redeemCoupon(couponId, userId = null, now = getApplicationNow()) {
    if (!couponId) return null;

    const uid = toObjectId(userId);
    const filter = {
        _id: couponId,
        status: 'ACTIVE',
        isActive: true,
        expiryDate: { $gt: now }
    };

    if (uid) {
        filter.$expr = {
            $and: [
                { $lt: ['$usedCount', '$usageLimit'] },
                {
                    $lt: [
                        {
                            $size: {
                                $filter: {
                                    input: { $ifNull: ['$usedBy', []] },
                                    as: 'entry',
                                    cond: { $eq: ['$$entry', uid] }
                                }
                            }
                        },
                        '$perUserLimit'
                    ]
                }
            ]
        };
    } else {
        filter.$expr = { $lt: ['$usedCount', '$usageLimit'] };
    }

    const update = { $inc: { usedCount: 1 } };
    if (uid) {
        update.$push = { usedBy: uid };
    }

    const updated = await Coupon.findOneAndUpdate(filter, update, { returnDocument: 'after' });

    if (!updated) {
        console.warn('[COUPON-REDEEM] Atomic reservation failed', {
            couponId: String(couponId),
            userId: uid ? String(uid) : 'guest'
        });
    } else {
        try {
            await couponRepo.upsertCouponInPG(updated);
        } catch (pgErr) {
            console.error('[DUAL-WRITE-COUPON-FAIL]', {
                operation: 'redeem',
                couponId: String(couponId),
                error: pgErr.message
            });
        }

        if (uid) {
            await couponRepo.upsertCouponRedemptionInPG({
                couponId,
                userId,
                isMongoId: true,
                isMongoUserId: true,
                redeemedAt: now
            });
        }
    }

    return updated;
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

/** Undo a claimed usage slot if order persistence fails (guest checkout — no usedBy entry). */
async function releaseCouponSlot(couponId) {
    return releaseCouponRedemption(couponId, null);
}

/**
 * Release one coupon redemption — decrements usedCount and removes one usedBy entry when userId given.
 */
async function releaseCouponRedemption(couponId, userId = null) {
    if (!couponId) return null;

    const uid = toObjectId(userId);
    let updated;

    if (uid) {
        updated = await Coupon.findOneAndUpdate(
            { _id: couponId, usedCount: { $gt: 0 } },
            [
                {
                    $set: {
                        usedCount: { $max: [0, { $subtract: ['$usedCount', 1] }] },
                        usedBy: {
                            $let: {
                                vars: {
                                    arr: { $ifNull: ['$usedBy', []] },
                                    idx: { $indexOfArray: [{ $ifNull: ['$usedBy', []] }, uid] }
                                },
                                in: {
                                    $cond: {
                                        if: { $gte: ['$$idx', 0] },
                                        then: {
                                            $concatArrays: [
                                                { $slice: ['$$arr', '$$idx'] },
                                                { $slice: ['$$arr', { $add: ['$$idx', 1] }, 99999] }
                                            ]
                                        },
                                        else: '$$arr'
                                    }
                                }
                            }
                        }
                    }
                }
            ],
            { returnDocument: 'after' }
        );
    } else {
        updated = await Coupon.findOneAndUpdate(
            { _id: couponId, usedCount: { $gt: 0 } },
            { $inc: { usedCount: -1 } },
            { returnDocument: 'after' }
        );
    }

    if (updated) {
        try {
            await couponRepo.upsertCouponInPG(updated);
        } catch (pgErr) {
            console.error('[DUAL-WRITE-COUPON-FAIL]', {
                operation: 'releaseRedemption',
                couponId: String(couponId),
                error: pgErr.message
            });
        }
    }

    return updated;
}

// ─── Admin CRUD ───────────────────────────────────────────────────────────

const getCoupons = async (req, res) => {
    try {
        const now = getApplicationNow();
        await runCouponAutoExpiry(now);

        const rawCoupons = await Coupon.find().sort({ createdAt: -1 }).lean();
        const coupons = rawCoupons.map((coupon) => ({
            ...coupon,
            displayStatus: Coupon.deriveDisplayStatus(coupon, now)
        }));

        res.status(200).json({ success: true, data: { coupons } });
    } catch (error) {
        console.error('Coupon Fetch Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load coupons.' });
    }
};

const getCouponById = async (req, res) => {
    try {
        const now = getApplicationNow();
        await runCouponAutoExpiry(now);
        const coupon = await Coupon.findById(req.params.id).lean();
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found.' });
        }
        res.status(200).json({
            success: true,
            data: {
                ...coupon,
                displayStatus: Coupon.deriveDisplayStatus(coupon, now)
            }
        });
    } catch (error) {
        console.error('Coupon Fetch Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load coupon.' });
    }
};

function parseStringArray(value) {
    if (Array.isArray(value)) {
        return value.map((v) => String(v || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(',').map((v) => v.trim()).filter(Boolean);
    }
    return [];
}

function parseRuleMetadata(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch (_) {
            return null;
        }
    }
    return null;
}

function parseCouponBody(body) {
    const code = String(body.code || '').trim().toUpperCase();
    const allowedTypes = ['percentage', 'flat', 'tiered', 'buy_x_get_y'];
    const discountType = allowedTypes.includes(body.discountType) ? body.discountType : 'percentage';
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
    let minCategorySpend = body.minCategorySpend;
    if (minCategorySpend === '' || minCategorySpend === undefined || minCategorySpend === null) {
        minCategorySpend = null;
    } else {
        minCategorySpend = Number(minCategorySpend);
        if (!Number.isFinite(minCategorySpend) || minCategorySpend <= 0) minCategorySpend = null;
    }

    return {
        code,
        discountType,
        discountValue,
        minOrderAmount,
        maxDiscountAmount,
        expiryDate,
        usageLimit,
        perUserLimit,
        allowedPaymentMethods: parseStringArray(body.allowedPaymentMethods),
        applicableCategories: parseStringArray(body.applicableCategories),
        minCategorySpend,
        ruleMetadata: parseRuleMetadata(body.ruleMetadata)
    };
}

function validateCouponFields(fields, { isUpdate = false } = {}) {
    if (!isUpdate || fields.code !== undefined) {
        if (!fields.code || fields.code.length < 2) {
            return 'Coupon code must be at least 2 characters.';
        }
    }
    const advancedType = ['tiered', 'buy_x_get_y'].includes(fields.discountType);
    if (!Number.isFinite(fields.discountValue) || (!advancedType && fields.discountValue <= 0)) {
        return 'Discount value must be a positive number.';
    }
    if (fields.discountType === 'percentage' && fields.discountValue > 100) {
        return 'Percentage discount cannot exceed 100%.';
    }
    if (fields.discountType === 'tiered') {
        const tiers = Array.isArray(fields.ruleMetadata?.tiers) ? fields.ruleMetadata.tiers : [];
        if (!tiers.length) {
            return 'Tiered coupons require at least one tier in ruleMetadata.tiers.';
        }
    }
    if (fields.discountType === 'buy_x_get_y') {
        const buyQty = Number(fields.ruleMetadata?.buyQuantity);
        const getQty = Number(fields.ruleMetadata?.getQuantity);
        if (!Number.isFinite(buyQty) || buyQty < 1 || !Number.isFinite(getQty) || getQty < 1) {
            return 'Buy-X-Get-Y coupons require buyQuantity and getQuantity in ruleMetadata.';
        }
    }
    if (!fields.expiryDate || Number.isNaN(fields.expiryDate.getTime())) {
        return 'Please provide a valid expiry date and time.';
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

        // Dual-write: mirror to PostgreSQL
        try {
            await couponRepo.upsertCouponInPG(coupon);
        } catch (pgErr) {
            console.error('[DUAL-WRITE-COUPON-FAIL]', {
                operation: 'create',
                couponId: String(coupon._id),
                error: pgErr.message
            });
        }

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
            allowedPaymentMethods: fields.allowedPaymentMethods,
            applicableCategories: fields.applicableCategories,
            minCategorySpend: fields.minCategorySpend,
            ruleMetadata: fields.ruleMetadata
        });

        await coupon.save();

        // Dual-write: mirror to PostgreSQL
        try {
            await couponRepo.upsertCouponInPG(coupon);
        } catch (pgErr) {
            console.error('[DUAL-WRITE-COUPON-FAIL]', {
                operation: 'update',
                couponId: String(coupon._id),
                error: pgErr.message
            });
        }

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
        
        // Dual-write: delete from PostgreSQL
        try {
            await couponRepo.deleteCouponInPG(deleted._id);
        } catch (pgErr) {
            console.error('[DUAL-WRITE-COUPON-FAIL]', {
                operation: 'delete',
                couponId: String(deleted._id),
                error: pgErr.message
            });
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

        const now = getApplicationNow();
        if (isExpiryReached(coupon.expiryDate, now)) {
            coupon.status = 'EXPIRED';
            coupon.isActive = false;
            await coupon.save();
            
            // Dual-write: deactivate in PostgreSQL
            try {
                await couponRepo.deactivateCouponInPG(coupon._id);
            } catch (pgErr) {
                console.error('[DUAL-WRITE-COUPON-FAIL]', {
                    operation: 'toggle-expired',
                    couponId: String(coupon._id),
                    error: pgErr.message
                });
            }
            
            return res.status(400).json({
                success: false,
                message: 'Cannot activate an expired coupon. Update the expiry date and time first.'
            });
        }

        coupon.status = coupon.status === 'ACTIVE' ? 'EXPIRED' : 'ACTIVE';
        coupon.isActive = coupon.status === 'ACTIVE';
        await coupon.save();

        // Dual-write: mirror toggle to PostgreSQL
        try {
            await couponRepo.upsertCouponInPG(coupon);
        } catch (pgErr) {
            console.error('[DUAL-WRITE-COUPON-FAIL]', {
                operation: 'toggle',
                couponId: String(coupon._id),
                error: pgErr.message
            });
        }

        res.status(200).json({
            success: true,
            message: coupon.status === 'ACTIVE' ? 'Coupon marked as ACTIVE.' : 'Coupon marked as EXPIRED.',
            data: coupon
        });
    } catch (error) {
        console.error('Coupon Toggle Error:', error);
        res.status(500).json({ success: false, message: 'Failed to toggle coupon status.' });
    }
};

// ─── Storefront availability ──────────────────────────────────────────────

/** Public check: at least one active, unexpired coupon exists (evaluates at server time). */
const checkActiveCoupons = async (req, res) => {
    try {
        const { now, timezone, iso } = await getApplicationTimeContext();

        await Coupon.expireDueCoupons(now);

        const activeCoupon = await Coupon.findOne({
            status: 'ACTIVE',
            expiryDate: { $gt: now }
        }).select('_id');

        res.status(200).json({
            hasActiveCoupon: Boolean(activeCoupon),
            serverTime: iso,
            timezone
        });
    } catch (error) {
        console.error('Coupon Active Check Error:', error);
        res.status(500).json({ success: false, message: 'Failed to check coupon availability.' });
    }
};

// ─── Storefront apply ─────────────────────────────────────────────────────

const applyCoupon = async (req, res) => {
    try {
        const code = req.body.code || req.body.couponCode;
        const subtotal = req.body.subtotal ?? req.body.cartSubtotal ?? req.body.total;
        const userId = req.user ? req.user.id : null;
        const paymentMethodCode = req.body.paymentMethodCode
            || req.body.paymentMethod
            || req.body.method
            || null;
        const cartItems = req.body.cartItems || req.body.items || [];

        const result = await validateCouponForCart({
            code,
            subtotal,
            userId,
            paymentMethodCode,
            cartItems
        });
        if (!result.ok) {
            return res.status(result.status).json({ success: false, message: result.message });
        }

        res.status(200).json({
            success: true,
            message: `Promo code applied! You saved ৳${result.breakdown.discountAmount}.`,
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
    checkActiveCoupons,
    applyCoupon,
    validateCouponForCart,
    assertCouponActiveAndUnexpired,
    runCouponAutoExpiry,
    calculateDiscount,
    validateAdvancedCouponRules,
    normalizePaymentCode,
    redeemCoupon,
    recordCouponUserUse,
    releaseCouponSlot,
    releaseCouponRedemption
};
