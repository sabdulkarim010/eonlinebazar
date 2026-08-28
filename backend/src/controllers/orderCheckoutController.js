/********************************************************************
 * Project: EonlineBazar
 * File: orderCheckoutController.js
 * Location: backend/src/controllers/orderCheckoutController.js
 * Description: Customer checkout — order creation, pricing lock, stock deduction.
 ********************************************************************/

const mongoose = require('mongoose');
const Product = require('../models/product');
const Order = require('../models/order');
const User = require('../models/user');
const {
    validateCouponForCart,
    assertCouponActiveAndUnexpired,
    runCouponAutoExpiry,
    redeemCoupon,
    recordCouponUserUse,
    releaseCouponSlot
} = require('./couponController');
const { getApplicationNow, isExpiryReached } = require('../utils/applicationTime');
const Coupon = require('../models/coupon');
const {
    getDeliverySettings,
    resolveDistrictLabel,
    resolveDeliveryZone,
    toShippingLocationLabel,
    computeDeliveryCharge,
    buildLockedOrderTotals,
    roundMoney,
    isValidDistrict
} = require('../services/deliveryChargeService');
const { getDeliveryEstimate } = require('../services/deliveryEstimateService');
const { isSandboxMode } = require('../services/sandboxService');
const { syncCheckoutAddressToProfile } = require('../utils/savedAddress');
const { pickImageFromSources, pickEmojiFromSources } = require('../utils/orderItemImages');
const { notifyOrderPlaced } = require('../services/smsService');
const { notifyOrderConfirmationEmail } = require('../services/mailer');
const { findVariantIndex } = require('../utils/variantHelpers');
const { deductWalletForOrder } = require('../services/walletService');
const { loadFlashSaleSettings } = require('../services/flashSaleService');
const { invalidate, CACHE_KEYS } = require('../services/cacheService');
const { emitToAdmins } = require('../services/socketService');
const {
    resolvePaymentMethodForCheckout,
    computeProcessingFee,
    buildOrderPaymentSnapshot,
    WALLET_METHOD_CODE
} = require('../services/paymentMethodService');
const {
    dispatchAdminWhatsAppAlertSafely,
    resolveSellingPriceFromSettings,
    buildLockedPricingPayload
} = require('./orderControllerHelpers');

const FALLBACK_COD_METHOD = Object.freeze({
    _id: null,
    code: 'cod',
    name: 'Cash on Delivery',
    type: 'manual',
    provider: '',
    accountNumber: '',
    processingFee: 0,
    feeType: 'percentage',
    isActive: true,
    apiConfig: {}
});

function isCodPaymentRequest(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
    return normalized === 'cod'
        || normalized === 'cash on delivery'
        || normalized === 'cashondelivery';
}

function looksLikePersistedProductId(id) {
    return /^[a-fA-F0-9]{24}$/.test(String(id || '').trim());
}

function buildMockOrderLine(item, targetId, quantity) {
    if (looksLikePersistedProductId(targetId)) return null;

    const name = String(item.name || '').trim();
    const price = Number(item.price);
    if (!name || !Number.isFinite(price) || price < 0) return null;

    const image = String(item.image || item.imageUrl || '').trim();
    return {
        id: String(targetId),
        productId: String(item.productId || targetId),
        name,
        price: roundMoney(price),
        quantity,
        buyingPrice: 0,
        category: item.category || 'General',
        image,
        imageUrl: image,
        isMock: true
    };
}

// ১. নতুন অর্ডার তৈরি করা এবং স্টক কমানো
const createOrder = async (req, res) => {
    try {
        const customerName = String(req.body.customerName || req.body.name || '').trim();
        const customerPhone = String(req.body.customerPhone || req.body.phone || '').trim();
        const customerAddress = String(
            req.body.customerAddress || req.body.shippingAddress || req.body.address || ''
        ).trim();
        const items = req.body.items || req.body.orderItems || req.body.cart || [];
        const note = req.body.note || req.body.notes || '';
        const couponCode = String(req.body.couponCode || req.body.coupon || '').trim().toUpperCase();
        
        // 💳 চেকআউট থেকে PaymentMethod-এর _id আসে; code/name-ও গ্রহণ করা হয়
        // যাতে পুরোনো ক্যাশ করা স্টোরফ্রন্ট বান্ডল কাজ করে যায়।
        const requestedPaymentMethod = String(
            req.body.paymentMethodId
            || req.body.paymentMethod
            || req.body.method
            || ''
        ).trim();

        const orderId = req.body.orderId || 'ORD-' + Math.floor(100000 + Math.random() * 900000);

        if (!customerName || !customerPhone || !customerAddress) {
            return res.status(400).json({ success: false, message: "অনুগ্রহ করে নাম, phone নম্বর এবং সম্পূর্ণ ঠিকানা প্রদান করুন।" });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Your order must include at least one item.' });
        }

        const userId = req.user ? req.user.id : (req.body.userId || null);
        const shippingDistrict = resolveDistrictLabel(
            req.body.shippingDistrict || req.body.customerDistrict || req.body.district
        );

        if (!shippingDistrict || !isValidDistrict(shippingDistrict)) {
            return res.status(400).json({
                success: false,
                message: 'Please select a valid shipping district.'
            });
        }

        /*
         * পেমেন্ট মেথড ভ্যালিডেশন কুপন রিডিম করার আগেই — কারণ এর পরে রিটার্ন
         * করলে কুপনের ব্যবহৃত স্লট রোলব্যাক করতে হতো। 'Wallet' একটি স্পেশাল
         * সেন্টিনেল: ওয়ালেট ব্যালেন্স পুরো অর্ডার কভার করলে কোনো গেটওয়ে লাগে না,
         * তাই তখন ক্যাটালগে কোনো মেথড থাকার দরকার নেই।
         */
        const isWalletSettlementRequest = requestedPaymentMethod.toLowerCase() === WALLET_METHOD_CODE;
        let selectedPaymentMethod = null;

        if (!isWalletSettlementRequest) {
            if (!requestedPaymentMethod) {
                return res.status(400).json({
                    success: false,
                    message: 'Please select a payment method.'
                });
            }

            selectedPaymentMethod = await resolvePaymentMethodForCheckout(requestedPaymentMethod);
            if (!selectedPaymentMethod && isCodPaymentRequest(requestedPaymentMethod)) {
                selectedPaymentMethod = FALLBACK_COD_METHOD;
            }
            if (!selectedPaymentMethod) {
                return res.status(400).json({
                    success: false,
                    message: 'The selected payment method is no longer available. Please refresh the page and choose another one.'
                });
            }
        }

        // Never trust client-supplied totals or line prices — verified below from DB catalog + Settings.
        // 🌟 প্রতিটি আইটেমে প্রোডাক্টের বিক্রয় ও ক্রয়মূল্য (buyingPrice) স্ন্যাপশট হিসেবে যুক্ত করা।
        // ভবিষ্যতে প্রোডাক্টের দাম বদলালেও এই অর্ডারের প্রফিট/লস নির্ভুল থাকবে।
        let normalizedItems = [];
        let totalBuyingPrice = 0;
        let subtotal = 0;
        const flashSettings = await loadFlashSaleSettings();

        for (const rawItem of items) {
            const item = { ...rawItem };
            const targetId = item.id || item.productId || item._id;
            const quantity = Math.max(1, Number(item.quantity) || 1);

            if (!targetId) {
                return res.status(400).json({
                    success: false,
                    message: 'Each order item must include a valid product id.'
                });
            }

            const query = mongoose.Types.ObjectId.isValid(targetId)
                ? { $or: [{ _id: targetId }, { productId: targetId }] }
                : { productId: targetId };

            const prod = await Product.findOne(query).select('price buyingPrice variants name image images icon productId category');
            if (!prod) {
                const mockLine = buildMockOrderLine(item, targetId, quantity);
                if (!mockLine) {
                    return res.status(400).json({
                        success: false,
                        message: `Product not found: ${targetId}`
                    });
                }
                subtotal += mockLine.price * mockLine.quantity;
                normalizedItems.push(mockLine);
                continue;
            }

            const verifiedPrice = resolveSellingPriceFromSettings(prod, item, flashSettings);
            if (!Number.isFinite(verifiedPrice) || verifiedPrice < 0) {
                return res.status(400).json({
                    success: false,
                    message: `Unable to verify price for "${prod.name || targetId}".`
                });
            }

            item.price = verifiedPrice;
            item.quantity = quantity;
            if (!item.name) item.name = prod.name;
            if (!item.productId) item.productId = prod.productId || String(prod._id);
            item.category = prod.category || 'General';

            const vIdx = findVariantIndex(prod, item);
            let buyingPrice = 0;
            if (vIdx > -1) {
                const variantBuying = Number(prod.variants[vIdx].buyingPrice);
                buyingPrice = (Number.isFinite(variantBuying) && variantBuying > 0)
                    ? variantBuying
                    : (Number(prod.buyingPrice) || 0);
            } else {
                buyingPrice = Number(prod.buyingPrice) || 0;
            }

            item.buyingPrice = buyingPrice;

            const snapshotImage = pickImageFromSources(item, prod);
            const snapshotEmoji = pickEmojiFromSources(item, prod);
            if (snapshotImage) {
                item.image = snapshotImage;
                item.imageUrl = snapshotImage;
                item.products = snapshotImage;
            }
            if (snapshotEmoji) {
                item.emoji = snapshotEmoji;
                item.icon = snapshotEmoji;
            }

            subtotal += verifiedPrice * quantity;
            totalBuyingPrice += buyingPrice * quantity;
            normalizedItems.push(item);
        }

        subtotal = roundMoney(subtotal);
        const isMockOrder = normalizedItems.length > 0
            && normalizedItems.every((line) => line.isMock === true);

        // Server-side coupon re-validation (never trust client discount alone)
        let discountAmount = 0;
        let appliedCouponCode = '';
        let couponDocId = null;

        if (couponCode) {
            const now = getApplicationNow();
            await runCouponAutoExpiry(now);

            const couponRecord = await Coupon.findOne({ code: couponCode });
            if (!couponRecord) {
                return res.status(404).json({
                    success: false,
                    message: 'Invalid coupon code.'
                });
            }

            if (isExpiryReached(couponRecord.expiryDate, now) && couponRecord.status !== 'EXPIRED') {
                couponRecord.status = 'EXPIRED';
                couponRecord.isActive = false;
                await couponRecord.save();
            }

            const eligibility = assertCouponActiveAndUnexpired(couponRecord, now);
            if (!eligibility.ok) {
                return res.status(eligibility.status).json({
                    success: false,
                    message: eligibility.message
                });
            }

            const couponResult = await validateCouponForCart({
                code: couponCode,
                subtotal,
                userId,
                now
            });
            if (!couponResult.ok) {
                return res.status(couponResult.status).json({
                    success: false,
                    message: couponResult.message
                });
            }

            // Defense in depth — discount always from server breakdown, never req.body
            discountAmount = couponResult.breakdown.discountAmount;
            appliedCouponCode = couponResult.breakdown.code;
            couponDocId = couponResult.coupon._id;

            const redeemEligibility = assertCouponActiveAndUnexpired(couponResult.coupon, now);
            if (!redeemEligibility.ok) {
                return res.status(redeemEligibility.status).json({
                    success: false,
                    message: redeemEligibility.message
                });
            }

            // Atomically claim a usage slot before persisting the order (race-safe)
            const redeemed = await redeemCoupon(couponDocId, now);
            if (!redeemed) {
                return res.status(400).json({
                    success: false,
                    message: 'This coupon has reached its usage limit.'
                });
            }
        }

        const deliverySettings = await getDeliverySettings();
        const deliveryLocationType = resolveDeliveryZone(deliverySettings, shippingDistrict);
        const shippingLocationType = toShippingLocationLabel(deliveryLocationType);
        const deliveryEstimate = getDeliveryEstimate(deliveryLocationType);
        const deliveryCharge = computeDeliveryCharge(deliverySettings, {
            customerDistrict: shippingDistrict,
            subtotal
        });
        const lockedTotals = buildLockedOrderTotals({
            itemSubtotal: subtotal,
            discountAmount,
            deliveryCharge
        });
        const {
            subTotal,
            grandTotal,
            deliveryCharge: lockedDeliveryCharge,
            merchandisePayable
        } = lockedTotals;

        const wantsWallet = req.body.applyWallet === true
            || req.body.useWallet === true
            || req.body.applyWalletBalance === true;

        let availableWallet = 0;
        if (wantsWallet && userId) {
            const walletUser = await User.findById(userId).select('walletBalance');
            availableWallet = roundMoney(Number(walletUser?.walletBalance) || 0);
        }

        /*
         * ওয়ালেট ব্যালেন্স প্রসেসিং ফি হিসাবের আগেই পড়া হয়: ওয়ালেট পুরো
         * অর্ডার কভার করলে কোনো গেটওয়ে ব্যবহৃতই হয় না, তাই তখন গেটওয়ে ফি
         * নেওয়া হলে কাস্টমারের কাছ থেকে বেশি টাকা কাটা হতো।
         */
        const walletCoversOrder = availableWallet > 0 && availableWallet >= grandTotal;
        const processingFee = walletCoversOrder
            ? 0
            : computeProcessingFee(selectedPaymentMethod, grandTotal);

        const payableBeforeWallet = roundMoney(grandTotal + processingFee);
        const walletApplied = availableWallet > 0
            ? roundMoney(Math.min(availableWallet, payableBeforeWallet))
            : 0;
        const finalGrandTotal = roundMoney(Math.max(0, payableBeforeWallet - walletApplied));
        const settledFromWallet = finalGrandTotal <= 0 && walletApplied > 0;

        // স্টেল ক্লায়েন্ট 'Wallet' পাঠিয়েছে কিন্তু ব্যালেন্স আর যথেষ্ট নয় —
        // এখানে কুপন স্লট রিলিজ করে পরিষ্কার এরর ফেরত যায়।
        if (!selectedPaymentMethod && !settledFromWallet) {
            if (couponDocId) {
                try {
                    await releaseCouponSlot(couponDocId);
                } catch (rbErr) {
                    console.error('⚠️ Coupon rollback error:', rbErr.message);
                }
            }
            return res.status(400).json({
                success: false,
                message: 'Your wallet balance no longer covers this order. Please select a payment method.'
            });
        }

        const resolvedPaymentMethod = settledFromWallet
            ? 'Wallet'
            : selectedPaymentMethod.name;

        const paymentSnapshot = buildOrderPaymentSnapshot(selectedPaymentMethod, {
            amount: grandTotal,
            processingFee
        });

        if (settledFromWallet) {
            paymentSnapshot.settledFromWallet = true;
            paymentSnapshot.status = 'paid';
            paymentSnapshot.paidAt = new Date();
        }

        const lockedPricing = buildLockedPricingPayload({
            subTotal,
            discountAmount,
            deliveryCharge: lockedDeliveryCharge,
            merchandisePayable,
            grandTotal,
            processingFee,
            walletApplied,
            payableTotal: finalGrandTotal,
            paymentMethod: resolvedPaymentMethod,
            shippingDistrict,
            shippingLocationType,
            deliveryLocationType
        });

        const inSandbox = await isSandboxMode();

        const newOrder = new Order({
            orderId,
            user: userId,
            customerName,
            customerPhone,
            customerAddress,
            subTotal,
            deliveryCharge: lockedDeliveryCharge,
            grandTotal: finalGrandTotal,
            shippingLocationType,
            shippingDistrict,
            totalAmount: finalGrandTotal,
            subtotal: subTotal,
            discountAmount,
            walletApplied,
            couponCode: appliedCouponCode,
            deliveryLocationType,
            shippingFee: lockedDeliveryCharge,
            estimatedDelivery: deliveryEstimate.label,
            totalBuyingPrice: Math.round(totalBuyingPrice),
            paymentMethod: resolvedPaymentMethod,
            processingFee,
            payment: paymentSnapshot,
            items: normalizedItems,
            note,
            status: 'Pending',
            isDelivered: false,
            isSandbox: inSandbox || isMockOrder
        });

        try {
            await newOrder.save();
        } catch (saveErr) {
            if (couponDocId) {
                try {
                    await releaseCouponSlot(couponDocId);
                } catch (rbErr) {
                    console.error('⚠️ Coupon rollback error:', rbErr.message);
                }
            }
            throw saveErr;
        }

        if (walletApplied > 0 && userId) {
            try {
                const walletAfter = await deductWalletForOrder(
                    userId,
                    walletApplied,
                    newOrder.orderId,
                    'Used for Order placement'
                );
                if (!walletAfter) {
                    await Order.findByIdAndDelete(newOrder._id);
                    if (couponDocId) {
                        try {
                            await releaseCouponSlot(couponDocId);
                        } catch (rbErr) {
                            console.error('⚠️ Coupon rollback error:', rbErr.message);
                        }
                    }
                    return res.status(400).json({
                        success: false,
                        message: 'Insufficient wallet balance. Please refresh and try again.'
                    });
                }
            } catch (walletErr) {
                await Order.findByIdAndDelete(newOrder._id);
                if (couponDocId) {
                    try {
                        await releaseCouponSlot(couponDocId);
                    } catch (rbErr) {
                        console.error('⚠️ Coupon rollback error:', rbErr.message);
                    }
                }
                throw walletErr;
            }
        }

        // Track per-user usage only after a successful order save
        if (couponDocId && userId) {
            try {
                await recordCouponUserUse(couponDocId, userId);
            } catch (userUseErr) {
                console.error('⚠️ Coupon usedBy record error:', userUseErr.message);
            }
        }

        if (normalizedItems.length > 0) {
            for (const item of normalizedItems) {
                const targetId = item.id || item.productId || item._id;
                const quantityOrdered = Number(item.quantity) || 1; 

                if (!targetId || item.isMock) continue;

                let query = {};
                if (mongoose.Types.ObjectId.isValid(targetId)) {
                    query = { $or: [{ _id: targetId }, { productId: targetId }] };
                } else {
                    query = { productId: targetId };
                }

                const product = await Product.findOne(query);
                if (!product) continue;

                // 🌟 ভ্যারিয়েন্ট অর্ডার হলে ঐ নির্দিষ্ট ভ্যারিয়েন্টের স্টক কমানো হয়;
                // পাশাপাশি মূল stock ফিল্ডও সমান্তরালে কমে (aggregate সঠিক রাখতে)।
                const vIdx = findVariantIndex(product, item);
                if (vIdx > -1) {
                    const current = Number(product.variants[vIdx].stock) || 0;
                    product.variants[vIdx].stock = Math.max(0, current - quantityOrdered);
                    product.stock = Math.max(0, (Number(product.stock) || 0) - quantityOrdered);
                    product.markModified('variants');
                    await product.save();
                } else {
                    // সাধারণ প্রোডাক্ট (ভ্যারিয়েন্ট নেই) — মূল stock ফিল্ড কমানো
                    await Product.updateOne(query, { $inc: { stock: -quantityOrdered } });
                }
            }
        }

        if (userId) {
            const addressSyncResult = await syncCheckoutAddressToProfile(userId, req.body, {
                shippingDistrict,
                customerPhone
            });

            if (addressSyncResult.saved) {
                console.log('✅ Checkout address synced to user profile.');
            } else if (!addressSyncResult.skipped) {
                console.warn(
                    '⚠️ Checkout address profile sync skipped:',
                    addressSyncResult.reason || 'unknown'
                );
            }
        }

        let recipientEmail = String(req.body.customerEmail || req.body.email || '').trim();
        if (!recipientEmail && userId) {
            const orderUser = await User.findById(userId).select('email').lean();
            recipientEmail = String(orderUser?.email || '').trim();
        }

        if (!isMockOrder) {
            notifyOrderPlaced(newOrder);
            console.log(`[Order] ✓ Order #${newOrder.orderId} saved — scheduling background WhatsApp alert`);
            dispatchAdminWhatsAppAlertSafely(newOrder);
            notifyOrderConfirmationEmail({ to: recipientEmail, order: newOrder.toObject() });
            await invalidate(CACHE_KEYS.POPULAR_PRODUCTS);
        } else {
            console.log(`[Order] ✓ Mock order #${newOrder.orderId} saved (catalog ids not in MongoDB)`);
        }

        emitToAdmins('new_order', {
            orderId: newOrder.orderId,
            customerName: newOrder.customerName,
            total: newOrder.grandTotal,
            paymentMethod: newOrder.paymentMethod,
            createdAt: newOrder.createdAt
        });

        res.status(201).json({
            success: true,
            message: "Order placed successfully! ধন্যবাদ আব্দুল করিম ভাই।",
            data: newOrder.toObject(),
            lockedPricing: {
                ...lockedPricing,
                walletApplied,
                grandTotal: finalGrandTotal,
                totalAmount: finalGrandTotal,
                merchandisePayable,
                paymentMethod: resolvedPaymentMethod
            }
        });

    } catch (err) {
        console.error("🔴 Order Save Error:", err);
        res.status(500).json({ success: false, message: "অর্ডার প্রসেস করতে ব্যর্থ হয়েছে।", error: err.message });
    }
};

module.exports = { createOrder };

