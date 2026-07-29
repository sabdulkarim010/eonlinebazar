/********************************************************************
 * Project: EonlineBazar
 * File: orderController.js
 * Location: controllers/orderController.js
 * Author: Abdul Karim Sheikh
 * Description: এই কন্ট্রোলারটি কাস্টমারের নতুন অর্ডার প্লেসমেন্ট, স্টক আপডেট, 
 * ইউজার ভিত্তিক অর্ডার হিস্ট্রি, পাবলিক অর্ডার ট্র্যাকিং এবং ড্যাশবোর্ডের 
 * রিয়েল-টাইম স্ট্যাটাস বা সামারি ডাটা প্রসেস করে।
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
} = require('../utils/deliveryChargeService');
const { getDeliveryEstimate } = require('../utils/deliveryEstimateService');
const { syncCheckoutAddressToProfile } = require('../utils/savedAddress');
const { generateOrderInvoicePdf, resolveInvoiceNumber } = require('../utils/invoicePdf');
const {
    loadRewardSettings,
    creditOrderDeliveryRewards,
    isWithinRefundUndoWindow
} = require('../utils/rewardSettings');
const {
    enrichOrderItemsWithImages,
    enrichOrdersWithImages,
    pickImageFromSources,
    pickEmojiFromSources
} = require('../utils/orderItemImages');
const { notifyOrderPlaced, notifyOrderStatusUpdated } = require('../utils/smsService');
const { notifyAdminOrderPlaced } = require('../utils/whatsappService');

/** Fire-and-forget WhatsApp alert — must never block or fail order placement. */
function dispatchAdminWhatsAppAlertSafely(order) {
    try {
        notifyAdminOrderPlaced(order);
    } catch (err) {
        console.error('[Order] WhatsApp alert scheduling failed (non-blocking):', err.message);
    }
}
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');
const { notifyOrderConfirmationEmail } = require('../utils/mailer');
const { findVariantIndex, getVariantAttributes, getVariantLineId } = require('../utils/variantHelpers');
const { deductWalletForOrder, creditWalletForUser, reverseWalletCredit } = require('../utils/walletService');
const { loadFlashSaleSettings, resolveProductFlashPrice } = require('../utils/flashSaleService');
const { invalidate, CACHE_KEYS } = require('../utils/cacheService');
const {
    resolvePaymentMethodForCheckout,
    computeProcessingFee,
    buildOrderPaymentSnapshot,
    WALLET_METHOD_CODE
} = require('../utils/paymentMethodService');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

/** Verified selling price from catalog — never trust client item.price. */
function resolveSellingPriceFromSettings(product, item, flashSettings) {
    if (!product) return NaN;

    const flashPrice = resolveProductFlashPrice(product, item, flashSettings);
    if (Number.isFinite(flashPrice) && flashPrice >= 0) return flashPrice;

    const vIdx = findVariantIndex(product, item);
    if (vIdx > -1) {
        const variantPrice = Number(product.variants[vIdx].price);
        if (Number.isFinite(variantPrice) && variantPrice >= 0) return variantPrice;
    }

    return Number(product.price);
}

function buildLockedPricingPayload({
    subTotal,
    discountAmount,
    deliveryCharge,
    merchandisePayable,
    grandTotal,
    processingFee = 0,
    walletApplied = 0,
    payableTotal,
    paymentMethod = '',
    shippingDistrict,
    shippingLocationType,
    deliveryLocationType
}) {
    const fee = roundMoney(processingFee);
    const total = roundMoney(payableTotal ?? grandTotal + fee);

    return {
        subTotal: roundMoney(subTotal),
        discountAmount: roundMoney(discountAmount),
        deliveryCharge: roundMoney(deliveryCharge),
        merchandisePayable: roundMoney(merchandisePayable),
        // grandTotal excludes the gateway surcharge so the merchandise + shipping
        // figure stays comparable across payment methods.
        grandTotal: roundMoney(grandTotal),
        processingFee: fee,
        walletApplied: roundMoney(walletApplied),
        totalAmount: total,
        payableTotal: total,
        paymentMethod,
        shippingDistrict,
        shippingLocationType,
        deliveryLocationType
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
                return res.status(400).json({
                    success: false,
                    message: `Product not found: ${targetId}`
                });
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
            isDelivered: false
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

                if (!targetId) continue;

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

        notifyOrderPlaced(newOrder);
        console.log(`[Order] ✓ Order #${newOrder.orderId} saved — scheduling background WhatsApp alert`);
        dispatchAdminWhatsAppAlertSafely(newOrder);
        notifyOrderConfirmationEmail({ to: recipientEmail, order: newOrder.toObject() });

        await invalidate(CACHE_KEYS.POPULAR_PRODUCTS);

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

function buildVariantSnapshot(product, vIdx) {
    if (!product || vIdx <= -1 || !Array.isArray(product.variants)) return {};

    const variant = product.variants[vIdx];
    const attrs = getVariantAttributes(variant);
    const label = Object.entries(attrs)
        .map(([key, value]) => `${key}: ${value}`)
        .join(' / ');

    return {
        variantId: getVariantLineId(variant),
        variantSku: String(variant.sku || '').trim(),
        variantLabel: label,
        variantAttribute: Object.keys(attrs).join(', '),
        variantValue: Object.values(attrs).join(', ')
    };
}

function resolveAvailableStock(product, vIdx) {
    if (!product) return 0;
    if (vIdx > -1 && Array.isArray(product.variants)) {
        return Math.max(0, Number(product.variants[vIdx].stock) || 0);
    }
    const stockQty = Number(product.stockQuantity);
    if (Number.isFinite(stockQty)) return Math.max(0, stockQty);
    return Math.max(0, Number(product.stock) || 0);
}

async function deductOrderStock(normalizedItems) {
    for (const item of normalizedItems) {
        const targetId = item.id || item.productId || item._id;
        const quantityOrdered = Number(item.quantity) || 1;
        if (!targetId) continue;

        const query = mongoose.Types.ObjectId.isValid(targetId)
            ? { $or: [{ _id: targetId }, { productId: targetId }] }
            : { productId: targetId };

        const product = await Product.findOne(query);
        if (!product) continue;

        const vIdx = findVariantIndex(product, item);
        if (vIdx > -1) {
            const current = Number(product.variants[vIdx].stock) || 0;
            product.variants[vIdx].stock = Math.max(0, current - quantityOrdered);
            product.stock = Math.max(0, (Number(product.stock) || 0) - quantityOrdered);
            product.markModified('variants');
            await product.save();
        } else {
            await Product.updateOne(query, { $inc: { stock: -quantityOrdered, stockQuantity: -quantityOrdered } });
        }
    }
}

/**
 * Staff POS / phone-order entry — admin creates orders with manual pricing,
 * variant-aware stock deduction, and finance-ready buyingPrice snapshots.
 */
const createManualOrder = async (req, res) => {
    try {
        const customerName = String(req.body.customerName || req.body.name || '').trim();
        const customerPhone = String(req.body.customerPhone || req.body.phone || '').trim();
        const customerAddress = String(
            req.body.customerAddress || req.body.shippingAddress || req.body.address || ''
        ).trim();
        const items = req.body.items || req.body.orderItems || [];
        const note = String(req.body.note || req.body.notes || '').trim();
        const manualDiscount = roundMoney(Number(req.body.manualDiscount ?? req.body.discountAmount) || 0);
        const shippingFee = roundMoney(Number(req.body.shippingFee ?? req.body.deliveryCharge) || 0);
        const paymentStatus = String(req.body.paymentStatus || req.body.paymentMethod || 'COD').trim();
        const deliveryAreaRaw = String(
            req.body.deliveryArea || req.body.shippingLocationType || req.body.deliveryLocationType || 'inside'
        ).trim().toLowerCase();

        if (!customerName || !customerPhone || !customerAddress) {
            return res.status(400).json({
                success: false,
                message: 'Customer name, phone, and delivery address are required.'
            });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Add at least one product line to the manual order.'
            });
        }

        const deliveryLocationType = deliveryAreaRaw.includes('outside') ? 'outside' : 'inside';
        const shippingLocationType = toShippingLocationLabel(deliveryLocationType);
        const shippingDistrict = deliveryLocationType === 'inside' ? 'Dhaka' : 'Outside Dhaka';
        const deliveryEstimate = getDeliveryEstimate(deliveryLocationType);

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
                    message: 'Each line item must include a valid product id.'
                });
            }

            const query = mongoose.Types.ObjectId.isValid(targetId)
                ? { $or: [{ _id: targetId }, { productId: targetId }] }
                : { productId: targetId };

            const prod = await Product.findOne(query).select(
                'price buyingPrice variants name image images icon productId category stock stockQuantity hasVariants'
            );
            if (!prod) {
                return res.status(400).json({
                    success: false,
                    message: `Product not found: ${targetId}`
                });
            }

            const vIdx = findVariantIndex(prod, item);
            const hasVariants = Array.isArray(prod.variants) && prod.variants.length > 0;

            if (hasVariants && vIdx <= -1) {
                return res.status(400).json({
                    success: false,
                    message: `Select a valid Size/Color variant for "${prod.name}".`
                });
            }

            const availableStock = resolveAvailableStock(prod, vIdx);
            if (quantity > availableStock) {
                const variantHint = vIdx > -1 ? buildVariantSnapshot(prod, vIdx).variantLabel : 'default';
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for "${prod.name}" (${variantHint || 'default'}). Available: ${availableStock}, requested: ${quantity}.`
                });
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
            item.name = prod.name;
            item.productId = prod.productId || String(prod._id);
            item.category = prod.category || 'General';

            let buyingPrice = 0;
            if (vIdx > -1) {
                Object.assign(item, buildVariantSnapshot(prod, vIdx));
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

        if (manualDiscount > subtotal) {
            return res.status(400).json({
                success: false,
                message: 'Manual discount cannot exceed the merchandise subtotal.'
            });
        }

        const lockedTotals = buildLockedOrderTotals({
            itemSubtotal: subtotal,
            discountAmount: manualDiscount,
            deliveryCharge: shippingFee
        });

        const {
            subTotal,
            grandTotal,
            deliveryCharge: lockedDeliveryCharge,
            discountAmount,
            merchandisePayable
        } = lockedTotals;

        const isPaid = paymentStatus.toLowerCase() === 'paid';
        const paymentMethod = isPaid ? 'Paid' : 'COD';
        const status = isPaid ? 'Processing' : 'Pending';

        // POS অর্ডারেও একই পেমেন্ট স্ন্যাপশট রাখা হয় (paymentMethodId পাঠানো
        // হলে), যাতে অনলাইন ও কাউন্টার — দুই চ্যানেলের লেজার একই কাঠামোয় থাকে।
        // স্টাফ কোনো মেথড না বাছলে COD/Paid লেবেলসহ খালি স্ন্যাপশট যায়।
        const posPaymentMethod = req.body.paymentMethodId
            ? await resolvePaymentMethodForCheckout(req.body.paymentMethodId)
            : null;
        const posPaymentSnapshot = buildOrderPaymentSnapshot(posPaymentMethod, { amount: grandTotal });
        posPaymentSnapshot.status = isPaid ? 'paid' : 'unpaid';
        if (isPaid) posPaymentSnapshot.paidAt = new Date();
        if (!posPaymentMethod) posPaymentSnapshot.name = paymentMethod;
        const orderId = req.body.orderId || `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
        const staffNote = note ? `[Manual POS] ${note}` : '[Manual POS] Staff phone / counter entry';

        const newOrder = new Order({
            orderId,
            user: null,
            customerName,
            customerPhone,
            customerAddress,
            subTotal,
            deliveryCharge: lockedDeliveryCharge,
            grandTotal,
            shippingLocationType,
            shippingDistrict,
            totalAmount: grandTotal,
            subtotal: subTotal,
            discountAmount,
            deliveryLocationType,
            shippingFee: lockedDeliveryCharge,
            estimatedDelivery: deliveryEstimate.label,
            totalBuyingPrice: Math.round(totalBuyingPrice),
            paymentMethod,
            payment: posPaymentSnapshot,
            items: normalizedItems,
            note: staffNote,
            status,
            isDelivered: false,
            orderSource: 'manual',
            createdByAdmin: req.admin?.username || req.admin?.displayName || 'admin'
        });

        await newOrder.save();
        await deductOrderStock(normalizedItems);

        console.log(`[Order] ✓ Manual order #${newOrder.orderId} saved — scheduling background WhatsApp alert`);
        dispatchAdminWhatsAppAlertSafely(newOrder);

        await logSecurityEvent({
            action: 'Manual Order Created',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${orderId} · ${customerName} · ৳${grandTotal} · ${normalizedItems.length} item(s) · ${paymentMethod}`
        });

        await invalidate(CACHE_KEYS.POPULAR_PRODUCTS);

        res.status(201).json({
            success: true,
            message: 'Manual order created successfully.',
            data: newOrder.toObject(),
            lockedPricing: buildLockedPricingPayload({
                subTotal,
                discountAmount,
                deliveryCharge: lockedDeliveryCharge,
                merchandisePayable,
                grandTotal,
                shippingDistrict,
                shippingLocationType,
                deliveryLocationType
            })
        });
    } catch (err) {
        console.error('Manual Order Error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to create manual order.',
            error: err.message
        });
    }
};

// ২. সব অর্ডার ডাটাবেজ থেকে নিয়ে আসা (অ্যাডমিন প্যানেলের জন্য)
const getOrders = async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 }); 
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ৩. লগইন করা নির্দিষ্ট ইউজারের নিজস্ব অর্ডারগুলো দেখা (My Orders সেকশন)
const getMyOrders = async (req, res) => {
    try {
        const myOrders = await Order.find({ user: req.user.id }).sort({ updatedAt: -1 });
        const enrichedOrders = await enrichOrdersWithImages(myOrders);
        res.json({ success: true, data: enrichedOrders });
    } catch (err) {
        console.error("Order Fetch Error:", err);
        res.status(500).json({ success: false, message: "অর্ডার হিস্ট্রি লোড করতে ব্যর্থ হয়েছে।" });
    }
};

// 🌟 ৪. নির্দিষ্ট একটি অর্ডারের বিস্তারিত দেখা (আপডেট: প্রোডাক্টের ছবি যুক্ত করার লজিক সহ)
const getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: "অর্ডারটি খুঁজে পাওয়া যায়নি!" });
        }
        
        // নিরাপত্তা চেক
        if (order.user && order.user.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: "দুঃখিত, আপনি অন্য কারো অর্ডারের বিবরণ দেখতে পারবেন না।" });
        }

        // 🟢 মঙ্গুজ ডকুমেন্টকে প্লেইন অবজেক্টে রূপান্তর করা, যাতে ডাইনামিকভাবে 'image' ফিল্ড পুশ করা যায়
        const orderObj = order.toObject();

        // আইটেমগুলোর ইমেজ ডাটাবেজের Product কালেকশন থেকে লাইভ খুঁজে নিয়ে আসা
        await enrichOrderItemsWithImages(orderObj);

        res.json({ success: true, data: orderObj });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Download order invoice as PDF (customer-owned orders only)
const downloadOrderInvoice = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (order.user && order.user.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'You cannot download this invoice.' });
        }

        const orderObj = order.toObject();
        await enrichOrderItemsWithImages(orderObj);

        const pdfBuffer = await generateOrderInvoicePdf(orderObj);
        const invoiceNo = resolveInvoiceNumber(orderObj);
        const filename = `Invoice-${invoiceNo}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        return res.send(pdfBuffer);
    } catch (err) {
        console.error('Invoice PDF Error:', err);
        return res.status(500).json({ success: false, message: 'Failed to generate invoice PDF.' });
    }
};

/**
 * Admin: update shipping / customer contact fields on an existing order.
 * Does not recalculate totals — only corrects delivery identity data.
 */
const updateOrderShippingAddress = async (req, res) => {
    try {
        const {
            customerName,
            customerPhone,
            customerAddress,
            shippingDistrict,
            shippingUpazila,
            upazila,
            shippingStreetAddress,
            streetAddress,
            note
        } = req.body;

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const trimmedName = String(customerName || '').trim();
        const trimmedPhone = String(customerPhone || '').replace(/\D/g, '');
        const district = resolveDistrictLabel(String(shippingDistrict || '').trim());
        const resolvedUpazila = String(shippingUpazila || upazila || '').trim();
        const street = String(shippingStreetAddress || streetAddress || '').trim();
        const directAddress = String(customerAddress || '').trim();
        const compositeAddress = directAddress
            || [street, resolvedUpazila, district].filter(Boolean).join(', ');

        if (!trimmedName) {
            return res.status(400).json({ success: false, message: 'Customer name is required.' });
        }
        if (!/^01[3-9]\d{8}$/.test(trimmedPhone)) {
            return res.status(400).json({
                success: false,
                message: 'Phone must be a valid 11-digit Bangladeshi mobile number.'
            });
        }
        if (!district || !isValidDistrict(district)) {
            return res.status(400).json({ success: false, message: 'Please select a valid district.' });
        }
        if (!resolvedUpazila) {
            return res.status(400).json({ success: false, message: 'Upazila / thana is required.' });
        }
        if (!compositeAddress) {
            return res.status(400).json({ success: false, message: 'Delivery address is required.' });
        }

        const deliverySettings = await getDeliverySettings();
        const deliveryLocationType = resolveDeliveryZone(deliverySettings, district);
        const shippingLocationType = toShippingLocationLabel(deliveryLocationType);

        order.customerName = trimmedName;
        order.customerPhone = trimmedPhone;
        order.customerAddress = compositeAddress;
        order.shippingDistrict = district;
        order.shippingLocationType = shippingLocationType;
        order.deliveryLocationType = deliveryLocationType;
        if (note !== undefined) {
            order.note = String(note || '').trim();
        }

        await order.save();

        await logSecurityEvent({
            action: 'Order Shipping Updated',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${order.orderId || order._id} shipping details edited by admin`
        });

        return res.status(200).json({
            success: true,
            message: 'Shipping details updated successfully.',
            data: order
        });
    } catch (error) {
        console.error('Update Order Shipping Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update shipping details.' });
    }
};

// ৫. অর্ডারের স্ট্যাটাস পরিবর্তন করা (অ্যাডমিন প্যানেল থেকে - Pending/Delivered)
const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ success: false, message: "Status is required" });
        }

        const isDelivered = status.toLowerCase() === 'delivered';
        const statusLower = status.toLowerCase();
        const updatePayload = { status, isDelivered };

        const paymentStatus = String(req.body.paymentStatus || '').trim().toLowerCase();
        if (paymentStatus) {
            updatePayload['payment.status'] = paymentStatus;
            if (paymentStatus === 'paid') {
                updatePayload['payment.paidAt'] = new Date();
            }
        }

        if (isDelivered) {
            updatePayload.deliveredAt = new Date();
        }

        if (statusLower === 'cancelled' || statusLower === 'canceled') {
            updatePayload.cancelledBy = 'Admin';
            updatePayload.isDelivered = false;
        }

        const existingOrder = await Order.findById(req.params.id);
        if (!existingOrder) {
            return res.status(404).json({ success: false, message: "Order not found!" });
        }

        if ((statusLower === 'cancelled' || statusLower === 'canceled') && !existingOrder.cancelReason) {
            updatePayload.cancelReason = String(req.body?.cancelReason || 'Cancelled by admin').trim();
        }

        const wasDelivered = existingOrder.isDelivered === true
            || String(existingOrder.status || '').trim().toLowerCase() === 'delivered';

        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id,
            { $set: updatePayload },
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(404).json({ success: false, message: "Order not found!" });
        }

        if (isDelivered && !wasDelivered && updatedOrder.user) {
            try {
                await creditOrderDeliveryRewards(updatedOrder);
            } catch (rewardErr) {
                console.error('⚠️ Reward credit error on delivery:', rewardErr.message);
            }
        }

        if (String(existingOrder.status || '') !== String(updatedOrder.status || '')) {
            notifyOrderStatusUpdated(updatedOrder, updatedOrder.status);
        }

        res.json({ success: true, message: "Order status updated successfully!", data: updatedOrder });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ৬. অর্ডার ডিলিট করা (অ্যাডমিন প্যানেল থেকে)
const deleteOrder = async (req, res) => {
    try {
        const deletedOrder = await Order.findByIdAndDelete(req.params.id);
        if (!deletedOrder) {
            return res.status(404).json({ success: false, message: "Order not found!" });
        }
        res.json({ success: true, message: "Order deleted successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ৭. অর্ডার ট্র্যাক করা (পাবলিক সার্চ)
const trackOrder = async (req, res) => {
    try {
        const { orderId, phone } = req.query;
        const order = await Order.findOne({ orderId: orderId, customerPhone: phone });
        
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        res.status(200).json(order);
    } catch (error) {
        console.error("Tracking Error:", error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeOrderStatus(status) {
    return String(status || '').trim().toLowerCase();
}

function getOrderDeliveryDate(order) {
    return order.deliveredAt || order.deliveryDate || order.updatedAt || null;
}

function isOrderWithinReturnWindow(order) {
    if (normalizeOrderStatus(order.status) !== 'delivered') return false;

    const deliveryDate = getOrderDeliveryDate(order);
    if (!deliveryDate) return false;

    const delivered = new Date(deliveryDate);
    if (Number.isNaN(delivered.getTime())) return false;

    const diffMs = Date.now() - delivered.getTime();
    return diffMs >= 0 && diffMs <= RETURN_WINDOW_MS;
}

function assertOrderOwnership(order, userId) {
    if (!order.user || order.user.toString() !== userId) {
        const err = new Error('You are not authorized to modify this order.');
        err.statusCode = 403;
        throw err;
    }
}

/** Resolve final reason text from dropdown + optional custom "Other" input */
function resolveSubmittedReason(body = {}) {
    const selected = String(body.selectedReason || body.reasonCode || '').trim();
    const custom = String(body.customReason || '').trim();
    const fallback = String(body.reason || '').trim();

    if (selected === 'Other') {
        return custom || fallback;
    }
    return selected || fallback;
}

// ৯. ইউজার অর্ডার বাতিল (Cancel Order)
const cancelUserOrder = async (req, res) => {
    try {
        const cancelReason = resolveSubmittedReason(req.body);
        if (!cancelReason) {
            return res.status(400).json({ success: false, message: 'Please provide a reason for cancellation.' });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        assertOrderOwnership(order, req.user.id);

        const status = normalizeOrderStatus(order.status);
        if (status === 'cancelled' || status === 'canceled') {
            return res.status(400).json({ success: false, message: 'This order is already cancelled.' });
        }
        if (status !== 'pending' && status !== 'processing') {
            return res.status(400).json({
                success: false,
                message: `Order cannot be cancelled while status is "${order.status}".`
            });
        }

        order.status = 'Cancelled';
        order.cancelReason = cancelReason;
        order.cancelledBy = 'Customer';
        order.actionReason = cancelReason;
        await order.save();

        res.json({
            success: true,
            message: 'Your order has been cancelled successfully.',
            data: order
        });
    } catch (err) {
        const statusCode = err.statusCode || 500;
        if (statusCode >= 500) console.error('Cancel Order Error:', err);
        res.status(statusCode).json({
            success: false,
            message: err.statusCode ? err.message : 'Failed to cancel order.'
        });
    }
};

// ১০. ইউজার রিটার্ন রিকোয়েস্ট (Return Order — admin approval required)
const returnUserOrder = async (req, res) => {
    try {
        const returnReason = resolveSubmittedReason(req.body);
        if (!returnReason) {
            return res.status(400).json({ success: false, message: 'Please provide a reason for the return request.' });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        assertOrderOwnership(order, req.user.id);

        const status = normalizeOrderStatus(order.status);
        if (status === 'return requested') {
            return res.status(400).json({ success: false, message: 'A return has already been requested for this order.' });
        }
        if (status !== 'delivered') {
            return res.status(400).json({
                success: false,
                message: `Return requests are only allowed for delivered orders. Current status: "${order.status}".`
            });
        }
        if (!isOrderWithinReturnWindow(order)) {
            return res.status(400).json({
                success: false,
                message: 'Return window has expired. Returns are only allowed within 7 days of delivery.'
            });
        }

        order.status = 'Return Requested';
        order.returnReason = returnReason;
        order.actionReason = returnReason;
        await order.save();

        res.json({
            success: true,
            message: 'Return request submitted successfully. Our team will review it shortly.',
            data: order
        });
    } catch (err) {
        const statusCode = err.statusCode || 500;
        if (statusCode >= 500) console.error('Return Order Error:', err);
        res.status(statusCode).json({
            success: false,
            message: err.statusCode ? err.message : 'Failed to submit return request.'
        });
    }
};

function getOrderRefundAmount(order) {
    const payable = Number(order?.grandTotal ?? order?.totalAmount) || 0;
    const walletUsed = Number(order?.walletApplied) || 0;
    return roundMoney(payable + walletUsed);
}

function getOrderDisplayId(order) {
    if (order.orderId) return order.orderId;
    if (order._id) return String(order._id).slice(-6).toUpperCase();
    return 'N/A';
}

// ১১. অ্যাডমিন: রিটার্ন রিকোয়েস্ট অনুমোদন ও ওয়ালেট রিফান্ড
const approveOrderReturn = async (req, res) => {
    const orderId = req.params.id;

    try {
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (normalizeOrderStatus(order.status) !== 'return requested') {
            return res.status(400).json({
                success: false,
                message: `Only orders with status "Return Requested" can be approved. Current status: "${order.status}".`
            });
        }

        if (!order.user) {
            return res.status(400).json({ success: false, message: 'This order is not linked to a registered user account.' });
        }

        const user = await User.findById(order.user);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Customer account not found for this order.' });
        }

        const refundAmount = getOrderRefundAmount(order);
        if (refundAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid refund amount for this order.' });
        }

        const displayOrderId = getOrderDisplayId(order);

        const updatedOrder = await Order.findOneAndUpdate(
            { _id: orderId, status: 'Return Requested' },
            {
                $set: {
                    status: 'Returned',
                    refundedAt: new Date(),
                    refundAmount,
                    statusBeforeRefund: order.status || 'Return Requested'
                }
            },
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(409).json({
                success: false,
                message: 'Return approval could not be completed. The order may have already been processed.'
            });
        }

        try {
            await creditWalletForUser(
                order.user,
                refundAmount,
                displayOrderId,
                'Refund for returned items'
            );
        } catch (walletErr) {
            await Order.findByIdAndUpdate(orderId, {
                $set: { status: 'Return Requested' },
                $unset: { refundedAt: '', refundAmount: '', statusBeforeRefund: '' }
            });
            throw walletErr;
        }

        const walletUser = await User.findById(order.user).select('walletBalance walletHistory');

        res.json({
            success: true,
            message: `Return approved. ৳${refundAmount.toLocaleString()} refunded to customer wallet.`,
            data: {
                order: updatedOrder,
                refundAmount,
                walletBalance: walletUser?.walletBalance || 0,
                walletHistoryEntry: walletUser?.walletHistory?.[0] || null
            }
        });
    } catch (err) {
        console.error('Approve Return Error:', err);
        res.status(500).json({ success: false, message: 'Failed to approve return and process refund.' });
    }
};

const SPENT_REFUND_FUNDS_MESSAGE = 'Cannot undo. Customer has already spent the refunded wallet funds.';

// ১২. অ্যাডমিন: ভুল রিফান্ড নিরাপদে উল্টানো (Safe Undo Refund)
const undoOrderRefund = async (req, res) => {
    const orderId = req.params.id;

    try {
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const status = normalizeOrderStatus(order.status);
        if (status !== 'returned' && status !== 'refunded') {
            return res.status(400).json({
                success: false,
                message: `Only returned or refunded orders can have their refund undone. Current status: "${order.status}".`
            });
        }

        const settings = await loadRewardSettings();
        if (settings.refundUndoWindowHours <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Refund undo is disabled in master settings.'
            });
        }

        const refundedAt = order.refundedAt || order.updatedAt;
        if (!isWithinRefundUndoWindow(refundedAt, settings.refundUndoWindowHours)) {
            return res.status(400).json({
                success: false,
                message: `Refund undo window has expired (${settings.refundUndoWindowHours} hours).`
            });
        }

        if (!order.user) {
            return res.status(400).json({ success: false, message: 'This order is not linked to a registered user account.' });
        }

        const refundAmount = Number(order.refundAmount) || getOrderRefundAmount(order);
        if (refundAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid refund amount for this order.' });
        }

        const user = await User.findById(order.user);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Customer account not found for this order.' });
        }

        if (Number(user.walletBalance || 0) < refundAmount) {
            return res.status(400).json({
                success: false,
                message: SPENT_REFUND_FUNDS_MESSAGE
            });
        }

        const revertStatus = order.statusBeforeRefund || 'Return Requested';
        const previousRefundMeta = {
            status: order.status,
            refundedAt: order.refundedAt,
            refundAmount: order.refundAmount,
            statusBeforeRefund: order.statusBeforeRefund
        };

        const updatedOrder = await Order.findOneAndUpdate(
            { _id: orderId, status: { $in: ['Returned', 'Refunded'] } },
            {
                $set: { status: revertStatus, refundedAt: null, refundAmount: 0 },
                $unset: { statusBeforeRefund: '' }
            },
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(409).json({
                success: false,
                message: 'Refund undo could not be completed. The order may have already been updated.'
            });
        }

        try {
            const userAfter = await reverseWalletCredit(order.user, refundAmount);

            if (!userAfter) {
                await Order.findByIdAndUpdate(orderId, { $set: previousRefundMeta });
                return res.status(400).json({
                    success: false,
                    message: SPENT_REFUND_FUNDS_MESSAGE
                });
            }

            res.json({
                success: true,
                message: `Refund reversed. ৳${refundAmount.toLocaleString()} deducted from customer wallet. Order status restored to "${revertStatus}".`,
                data: {
                    order: updatedOrder,
                    refundAmount,
                    walletBalance: userAfter.walletBalance,
                    walletHistoryEntry: userAfter.walletHistory[0]
                }
            });
        } catch (walletErr) {
            await Order.findByIdAndUpdate(orderId, { $set: previousRefundMeta });
            throw walletErr;
        }
    } catch (err) {
        console.error('Undo Refund Error:', err);
        res.status(500).json({ success: false, message: 'Failed to undo refund.' });
    }
};

// ৮. ড্যাশবোর্ড স্ট্যাটাস সামারি (ইউজার ভিত্তিক লাইভ কাউন্ট)
const getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const orders = await Order.find({ user: userId }).sort({ createdAt: -1 });
        
        const totalOrders = orders.length;
        const pendingOrders = orders.filter(o => 
            o.status && o.status.toLowerCase() === 'pending'
        ).length;
        
        const recentOrders = await enrichOrdersWithImages(orders.slice(0, 4));

        // 🌟 নতুন: ইউজারের আসল ওয়ালেট ব্যালেন্স ও লয়্যালটি পয়েন্ট ডাটাবেজ থেকে আনা
        const user = await User.findById(userId).select('walletBalance loyaltyPoints');
        const balance = user ? (user.walletBalance || 0) : 0;
        const loyaltyPoints = user ? (user.loyaltyPoints || 0) : 0;
        
        res.json({ 
            success: true, 
            totalOrders: totalOrders, 
            pendingOrders: pendingOrders, 
            balance: balance, 
            loyaltyPoints: loyaltyPoints,
            recentOrders: recentOrders, 
            data: {
                totalOrders: totalOrders,
                pendingOrders: pendingOrders,
                balance: balance,
                loyaltyPoints: loyaltyPoints,
                recentOrders: recentOrders 
            }
        });

    } catch (err) {
        console.error("Dashboard Stats Error:", err);
        res.status(500).json({ success: false, message: "Stats load failed" });
    }
};

function resolvePaymentProofStatus(order) {
    return String(order?.paymentProof?.status || 'none').toLowerCase();
}

function uploadPaymentProofScreenshot(file) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: 'payment-proofs' },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        streamifier.createReadStream(file.buffer).pipe(stream);
    });
}

/**
 * Customer submits TRX ID (+ optional screenshot) for a manual-payment order.
 */
const submitPaymentProof = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId || req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (!order.user || order.user.toString() !== String(req.user.id)) {
            return res.status(403).json({ success: false, message: 'You can only submit payment proof for your own orders.' });
        }

        if (String(order.payment?.type || '').toLowerCase() !== 'manual') {
            return res.status(400).json({ success: false, message: 'Payment proof is only required for manual payment orders.' });
        }

        const currentStatus = resolvePaymentProofStatus(order);
        if (currentStatus === 'submitted') {
            return res.status(400).json({ success: false, message: 'Payment proof is already submitted and awaiting admin review.' });
        }
        if (currentStatus === 'approved') {
            return res.status(400).json({ success: false, message: 'Payment proof has already been approved.' });
        }

        const trxId = String(req.body?.trxId || '').trim();
        if (!trxId) {
            return res.status(400).json({ success: false, message: 'Transaction ID (TRX ID) is required.' });
        }

        let screenshotUrl = order.paymentProof?.screenshotUrl || null;
        if (req.file) {
            const uploadResult = await uploadPaymentProofScreenshot(req.file);
            screenshotUrl = uploadResult.secure_url;
        }

        if (!order.paymentProof || typeof order.paymentProof !== 'object') {
            order.paymentProof = {};
        }

        order.paymentProof.trxId = trxId;
        order.paymentProof.screenshotUrl = screenshotUrl;
        order.paymentProof.submittedAt = new Date();
        order.paymentProof.status = 'submitted';
        order.paymentProof.reviewedAt = null;
        order.paymentProof.reviewedBy = null;
        order.paymentProof.adminNote = null;

        order.markModified('paymentProof');
        await order.save();

        return res.status(200).json({
            success: true,
            message: 'Payment proof submitted successfully'
        });
    } catch (err) {
        console.error('Submit payment proof error:', err);
        return res.status(500).json({ success: false, message: 'Failed to submit payment proof.' });
    }
};

/**
 * Admin: list orders with submitted payment proof awaiting review.
 */
const getPendingPaymentProofOrders = async (req, res) => {
    try {
        const orders = await Order.find({ 'paymentProof.status': 'submitted' })
            .populate('user', 'name phone')
            .sort({ 'paymentProof.submittedAt': -1 })
            .lean();

        const data = orders.map((order) => ({
            _id: order._id,
            orderId: order.orderId,
            customerName: order.customerName || order.user?.name || '',
            customerPhone: order.customerPhone || order.user?.phone || '',
            grandTotal: order.grandTotal ?? order.totalAmount ?? 0,
            paymentMethodName: order.payment?.name || order.paymentMethod || '',
            trxId: order.paymentProof?.trxId || '',
            screenshotUrl: order.paymentProof?.screenshotUrl || null,
            submittedAt: order.paymentProof?.submittedAt || null
        }));

        return res.json({ success: true, data });
    } catch (err) {
        console.error('Pending payment proof list error:', err);
        return res.status(500).json({ success: false, message: 'Failed to load pending payment proofs.' });
    }
};

/**
 * Admin approves or rejects submitted payment proof.
 */
const reviewPaymentProof = async (req, res) => {
    try {
        const { action, adminNote } = req.body || {};
        const normalizedAction = String(action || '').trim().toLowerCase();

        if (!['approve', 'reject'].includes(normalizedAction)) {
            return res.status(400).json({ success: false, message: 'Action must be "approve" or "reject".' });
        }

        const order = await Order.findById(req.params.orderId || req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (resolvePaymentProofStatus(order) !== 'submitted') {
            return res.status(400).json({ success: false, message: 'No submitted payment proof to review for this order.' });
        }

        if (!order.paymentProof || typeof order.paymentProof !== 'object') {
            order.paymentProof = {};
        }

        const now = new Date();
        order.paymentProof.reviewedAt = now;
        order.paymentProof.reviewedBy = req.admin?.id || null;

        if (normalizedAction === 'approve') {
            order.paymentProof.status = 'approved';
            order.paymentProof.adminNote = null;
            if (!order.payment) order.payment = {};
            order.payment.status = 'paid';
            order.payment.paidAt = now;
        } else {
            order.paymentProof.status = 'rejected';
            order.paymentProof.adminNote = String(adminNote || '').trim() || null;
        }

        order.markModified('paymentProof');
        order.markModified('payment');
        await order.save();

        return res.json({
            success: true,
            message: normalizedAction === 'approve'
                ? 'Payment proof approved. Order marked as paid.'
                : 'Payment proof rejected.',
            data: order.toObject()
        });
    } catch (err) {
        console.error('Review payment proof error:', err);
        return res.status(500).json({ success: false, message: 'Failed to review payment proof.' });
    }
};

module.exports = { 
    createOrder,
    createManualOrder,
    getOrders, 
    getMyOrders, 
    getOrderById, 
    downloadOrderInvoice,
    updateOrderStatus,
    updateOrderShippingAddress,
    deleteOrder, 
    trackOrder,
    getDashboardStats,
    cancelUserOrder,
    returnUserOrder,
    approveOrderReturn,
    undoOrderRefund,
    submitPaymentProof,
    getPendingPaymentProofOrders,
    reviewPaymentProof,
};





