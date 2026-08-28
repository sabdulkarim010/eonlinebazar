/********************************************************************
 * Project: EonlineBazar
 * File: orderAdminController.js
 * Location: backend/src/controllers/orderAdminController.js
 * Description: Admin order list, status, shipping, bulk ops, manual POS, return refunds.
 ********************************************************************/

const mongoose = require('mongoose');
const Product = require('../models/product');
const Order = require('../models/order');
const User = require('../models/user');
const {
    getDeliverySettings,
    resolveDistrictLabel,
    resolveDeliveryZone,
    toShippingLocationLabel,
    buildLockedOrderTotals,
    roundMoney,
    isValidDistrict
} = require('../services/deliveryChargeService');
const { getDeliveryEstimate } = require('../services/deliveryEstimateService');
const { isSandboxMode } = require('../services/sandboxService');
const {
    loadRewardSettings,
    creditOrderDeliveryRewards,
    isWithinRefundUndoWindow
} = require('../utils/rewardSettings');
const { pickImageFromSources, pickEmojiFromSources } = require('../utils/orderItemImages');
const { computeProcessingFee } = require('../services/paymentMethodService');
const { notifyOrderStatusUpdated } = require('../services/smsService');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');
const { findVariantIndex } = require('../utils/variantHelpers');
const { creditWalletForUser, reverseWalletCredit } = require('../services/walletService');
const { loadFlashSaleSettings } = require('../services/flashSaleService');
const { invalidate, CACHE_KEYS } = require('../services/cacheService');
const { emitToAdmins } = require('../services/socketService');
const {
    resolvePaymentMethodForCheckout,
    buildOrderPaymentSnapshot
} = require('../services/paymentMethodService');
const {
    dispatchAdminWhatsAppAlertSafely,
    resolveSellingPriceFromSettings,
    buildLockedPricingPayload,
    buildVariantSnapshot,
    resolveAvailableStock,
    deductOrderStock,
    getOrderItemStockKey,
    qtyMapFromOrderItems,
    findProductForOrderItem,
    applyOrderItemStockDeltas,
    normalizeOrderStatus,
    getOrderRefundAmount,
    getOrderDisplayId
} = require('./orderControllerHelpers');

const ITEM_EDIT_BLOCKED_STATUSES = ['cancelled', 'canceled', 'returned', 'refunded', 'return requested'];

function toPlainOrderItem(item) {
    if (!item) return {};
    if (typeof item.toObject === 'function') return item.toObject();
    return { ...item };
}

function findExistingOrderLine(existingItems, incoming) {
    const incomingKey = getOrderItemStockKey(incoming);
    const incomingIds = new Set(
        [incoming.productId, incoming.id, incoming._id]
            .map((value) => String(value || '').trim().toLowerCase())
            .filter(Boolean)
    );
    const incomingVariant = String(incoming.variantId || incoming.variantSku || '').trim().toLowerCase();

    return existingItems.find((item) => {
        if (incomingKey && incomingKey !== '::' && getOrderItemStockKey(item) === incomingKey) return true;
        const itemVariant = String(item.variantId || item.variantSku || '').trim().toLowerCase();
        if (itemVariant !== incomingVariant) return false;
        return [item.productId, item.id, item._id]
            .map((value) => String(value || '').trim().toLowerCase())
            .some((id) => id && incomingIds.has(id));
    }) || null;
}

function hasShippingUpdateFields(body = {}) {
    const nested = body.shipping && typeof body.shipping === 'object' && !Array.isArray(body.shipping)
        ? body.shipping
        : {};
    const src = { ...body, ...nested };
    return Boolean(
        String(src.customerName || '').trim()
        || String(src.customerPhone || '').trim()
        || String(src.shippingDistrict || '').trim()
        || String(src.customerAddress || '').trim()
        || String(src.shippingStreetAddress || src.streetAddress || '').trim()
        || String(src.shippingUpazila || src.upazila || '').trim()
        || src.note !== undefined
    );
}

async function applyOrderShippingFields(order, body = {}) {
    const nested = body.shipping && typeof body.shipping === 'object' && !Array.isArray(body.shipping)
        ? body.shipping
        : {};
    const src = { ...body, ...nested };

    const trimmedName = String(src.customerName || '').trim();
    const trimmedPhone = String(src.customerPhone || '').replace(/\D/g, '');
    const district = resolveDistrictLabel(String(src.shippingDistrict || '').trim());
    const resolvedUpazila = String(src.shippingUpazila || src.upazila || '').trim();
    const street = String(src.shippingStreetAddress || src.streetAddress || '').trim();
    const directAddress = String(src.customerAddress || '').trim();
    const compositeAddress = directAddress
        || [street, resolvedUpazila, district].filter(Boolean).join(', ');

    if (!trimmedName) {
        return { status: 400, message: 'Customer name is required.' };
    }
    if (!/^01[3-9]\d{8}$/.test(trimmedPhone)) {
        return { status: 400, message: 'Phone must be a valid 11-digit Bangladeshi mobile number.' };
    }
    if (!district || !isValidDistrict(district)) {
        return { status: 400, message: 'Please select a valid district.' };
    }
    if (!resolvedUpazila) {
        return { status: 400, message: 'Upazila / thana is required.' };
    }
    if (!compositeAddress) {
        return { status: 400, message: 'Delivery address is required.' };
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
    if (src.note !== undefined) {
        order.note = String(src.note || '').trim();
    }

    return null;
}

function recalculateMasterOrderTotals(order, normalizedItems) {
    const subtotal = roundMoney(
        normalizedItems.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0)
    );
    const totalBuyingPrice = roundMoney(
        normalizedItems.reduce((sum, item) => sum + ((Number(item.buyingPrice) || 0) * (Number(item.quantity) || 0)), 0)
    );
    const discountAmount = roundMoney(Math.min(Math.max(0, Number(order.discountAmount) || 0), subtotal));
    const deliveryCharge = roundMoney(Number(order.deliveryCharge ?? order.shippingFee) || 0);
    const lockedTotals = buildLockedOrderTotals({
        itemSubtotal: subtotal,
        discountAmount,
        deliveryCharge
    });

    const merchandiseGrand = lockedTotals.grandTotal;
    const feeType = String(order.payment?.feeType || '').trim().toLowerCase();
    const feeRate = Number(order.payment?.feeRate);
    let processingFee = roundMoney(Number(order.processingFee ?? order.payment?.processingFee) || 0);

    if (feeType === 'percentage' && Number.isFinite(feeRate) && feeRate > 0) {
        processingFee = computeProcessingFee({ processingFee: feeRate, feeType: 'percentage' }, merchandiseGrand);
    } else if (feeType === 'flat' && Number.isFinite(feeRate) && feeRate >= 0) {
        processingFee = computeProcessingFee({ processingFee: feeRate, feeType: 'flat' }, merchandiseGrand);
    }

    const walletApplied = roundMoney(Math.min(
        Math.max(0, Number(order.walletApplied) || 0),
        roundMoney(merchandiseGrand + processingFee)
    ));
    const grandTotal = roundMoney(Math.max(0, merchandiseGrand + processingFee - walletApplied));

    order.items = normalizedItems;
    order.markModified('items');
    order.subTotal = lockedTotals.subTotal;
    order.subtotal = lockedTotals.subTotal;
    order.discountAmount = discountAmount;
    order.deliveryCharge = lockedTotals.deliveryCharge;
    order.shippingFee = lockedTotals.deliveryCharge;
    order.processingFee = processingFee;
    order.walletApplied = walletApplied;
    order.grandTotal = grandTotal;
    order.totalAmount = grandTotal;
    order.totalBuyingPrice = totalBuyingPrice;

    if (order.payment && typeof order.payment === 'object') {
        order.payment.processingFee = processingFee;
        order.payment.feeBaseAmount = merchandiseGrand;
        order.markModified('payment');
    }

    return lockedTotals;
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
        const inSandbox = await isSandboxMode();

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
            createdByAdmin: req.admin?.username || req.admin?.displayName || 'admin',
            isSandbox: inSandbox
        });

        await newOrder.save();
        await deductOrderStock(normalizedItems);

        emitToAdmins('new_order', {
            orderId: newOrder.orderId,
            customerName: newOrder.customerName,
            total: newOrder.grandTotal,
            paymentMethod: newOrder.paymentMethod,
            createdAt: newOrder.createdAt
        });

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

/**
 * Admin: update shipping / customer contact fields on an existing order.
 * Does not recalculate totals — only corrects delivery identity data.
 */
const updateOrderShippingAddress = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        const shippingError = await applyOrderShippingFields(order, req.body);
        if (shippingError) {
            return res.status(shippingError.status).json({ success: false, message: shippingError.message });
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

/**
 * Admin master editor — shipping and/or order items in one request.
 * PUT /api/admin/orders/:id/master-update
 */
const masterUpdateOrder = async (req, res) => {
    try {
        const body = req.body || {};
        const incomingItems = Array.isArray(body.items)
            ? body.items
            : (Array.isArray(body.orderItems) ? body.orderItems : null);
        const wantsItems = incomingItems !== null;
        const wantsShipping = hasShippingUpdateFields(body);

        if (!wantsItems && !wantsShipping) {
            return res.status(400).json({
                success: false,
                message: 'Provide shipping details and/or order items to update.'
            });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (wantsShipping) {
            const shippingError = await applyOrderShippingFields(order, body);
            if (shippingError) {
                return res.status(shippingError.status).json({ success: false, message: shippingError.message });
            }
        }

        let lockedTotals = null;

        if (wantsItems) {
            const status = normalizeOrderStatus(order.status);
            if (ITEM_EDIT_BLOCKED_STATUSES.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: `Order items cannot be edited while status is "${order.status}".`
                });
            }

            if (incomingItems.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Add at least one product line to the order.'
                });
            }

            const existingItems = Array.isArray(order.items) ? order.items.map(toPlainOrderItem) : [];
            const oldQtyMap = qtyMapFromOrderItems(existingItems);
            const flashSettings = await loadFlashSaleSettings();
            const mergedByKey = new Map();
            const normalizedItems = [];

            for (const rawItem of incomingItems) {
                const item = { ...rawItem };
                const targetId = item.id || item.productId || item._id;
                const quantity = Math.max(1, Number(item.quantity) || 1);

                if (!targetId) {
                    return res.status(400).json({
                        success: false,
                        message: 'Each line item must include a valid product id.'
                    });
                }

                const lineKey = getOrderItemStockKey({ ...item, quantity });
                if (mergedByKey.has(lineKey)) {
                    const existingIdx = mergedByKey.get(lineKey);
                    normalizedItems[existingIdx].quantity += quantity;
                    continue;
                }

                const existingLine = findExistingOrderLine(existingItems, item);
                const prod = await findProductForOrderItem(item);

                if (!prod) {
                    if (!existingLine) {
                        return res.status(400).json({
                            success: false,
                            message: `Product not found: ${targetId}`
                        });
                    }
                    if (quantity > (Number(existingLine.quantity) || 0)) {
                        return res.status(400).json({
                            success: false,
                            message: `Cannot increase quantity for "${existingLine.name || targetId}" because the product is no longer in the catalog.`
                        });
                    }
                    const kept = {
                        ...existingLine,
                        quantity,
                        price: Number(existingLine.price) || 0,
                        buyingPrice: Number(existingLine.buyingPrice) || 0
                    };
                    mergedByKey.set(lineKey, normalizedItems.length);
                    normalizedItems.push(kept);
                    continue;
                }

                const vIdx = findVariantIndex(prod, item);
                const hasVariants = Array.isArray(prod.variants) && prod.variants.length > 0;

                if (hasVariants && vIdx <= -1) {
                    return res.status(400).json({
                        success: false,
                        message: `Select a valid Size/Color variant for "${prod.name}".`
                    });
                }

                const previousQty = oldQtyMap.get(lineKey)
                    || (existingLine ? Number(existingLine.quantity) || 0 : 0);
                const availableStock = resolveAvailableStock(prod, vIdx) + previousQty;

                if (quantity > availableStock) {
                    const variantHint = vIdx > -1 ? buildVariantSnapshot(prod, vIdx).variantLabel : 'default';
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient stock for "${prod.name}" (${variantHint || 'default'}). Available: ${availableStock}, requested: ${quantity}.`
                    });
                }

                let nextItem = existingLine ? { ...existingLine } : {};
                nextItem.quantity = quantity;
                nextItem.name = prod.name;
                nextItem.productId = existingLine?.productId || prod.productId || String(prod._id);
                nextItem.id = existingLine?.id || existingLine?.productId || String(prod._id);
                nextItem.category = prod.category || existingLine?.category || 'General';

                if (vIdx > -1) {
                    Object.assign(nextItem, buildVariantSnapshot(prod, vIdx));
                }

                if (existingLine) {
                    nextItem.price = Number(existingLine.price) || 0;
                    nextItem.buyingPrice = Number(existingLine.buyingPrice) || 0;
                } else {
                    const verifiedPrice = resolveSellingPriceFromSettings(prod, item, flashSettings);
                    if (!Number.isFinite(verifiedPrice) || verifiedPrice < 0) {
                        return res.status(400).json({
                            success: false,
                            message: `Unable to verify price for "${prod.name || targetId}".`
                        });
                    }
                    nextItem.price = verifiedPrice;
                    let buyingPrice = Number(prod.buyingPrice) || 0;
                    if (vIdx > -1) {
                        const variantBuying = Number(prod.variants[vIdx].buyingPrice);
                        buyingPrice = (Number.isFinite(variantBuying) && variantBuying > 0)
                            ? variantBuying
                            : buyingPrice;
                    }
                    nextItem.buyingPrice = buyingPrice;
                }

                const snapshotImage = pickImageFromSources(nextItem, prod) || pickImageFromSources(item, prod);
                const snapshotEmoji = pickEmojiFromSources(nextItem, prod) || pickEmojiFromSources(item, prod);
                if (snapshotImage) {
                    nextItem.image = snapshotImage;
                    nextItem.imageUrl = snapshotImage;
                    nextItem.products = snapshotImage;
                }
                if (snapshotEmoji) {
                    nextItem.emoji = snapshotEmoji;
                    nextItem.icon = snapshotEmoji;
                }

                mergedByKey.set(lineKey, normalizedItems.length);
                const canonicalKey = getOrderItemStockKey(nextItem);
                if (canonicalKey && canonicalKey !== lineKey) mergedByKey.set(canonicalKey, normalizedItems.length);
                normalizedItems.push(nextItem);
            }

            for (const line of normalizedItems) {
                const prod = await findProductForOrderItem(line);
                if (!prod) continue;
                const vIdx = findVariantIndex(prod, line);
                const previousQty = oldQtyMap.get(getOrderItemStockKey(line))
                    || Number(findExistingOrderLine(existingItems, line)?.quantity)
                    || 0;
                const availableStock = resolveAvailableStock(prod, vIdx) + previousQty;
                if (Number(line.quantity) > availableStock) {
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient stock for "${line.name}". Available: ${availableStock}, requested: ${line.quantity}.`
                    });
                }
            }

            await applyOrderItemStockDeltas(existingItems, normalizedItems);
            lockedTotals = recalculateMasterOrderTotals(order, normalizedItems);
            await invalidate(CACHE_KEYS.POPULAR_PRODUCTS);
        }

        await order.save();

        const changed = [
            wantsShipping ? 'shipping' : null,
            wantsItems ? 'items' : null
        ].filter(Boolean).join(' + ');

        await logSecurityEvent({
            action: 'Order Master Updated',
            actor: req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${order.orderId || order._id} master update (${changed})`
        });

        return res.status(200).json({
            success: true,
            message: wantsItems
                ? 'Order details updated. Totals recalculated.'
                : 'Shipping details updated successfully.',
            data: order,
            lockedPricing: lockedTotals
                ? buildLockedPricingPayload({
                    ...lockedTotals,
                    processingFee: order.processingFee,
                    walletApplied: order.walletApplied,
                    payableTotal: order.grandTotal,
                    paymentMethod: order.paymentMethod,
                    shippingDistrict: order.shippingDistrict,
                    shippingLocationType: order.shippingLocationType,
                    deliveryLocationType: order.deliveryLocationType
                })
                : undefined
        });
    } catch (error) {
        console.error('Master Update Order Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update order details.' });
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

/**
 * Bulk delete orders (admin reconciliation / live orders).
 * POST /api/admin/orders/bulk-delete
 */
const bulkDeleteOrders = async (req, res) => {
    try {
        const { orderIds } = req.body || {};

        if (!Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'orderIds array is required.'
            });
        }

        if (orderIds.length > 50) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 50 orders can be deleted at once.'
            });
        }

        const validIds = orderIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
        if (validIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid order IDs provided.'
            });
        }

        const result = await Order.deleteMany({ _id: { $in: validIds } });

        return res.json({
            success: true,
            deleted: result.deletedCount,
            message: `${result.deletedCount} order(s) deleted.`
        });
    } catch (err) {
        console.error('Bulk delete orders error:', err);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete orders.'
        });
    }
};

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

module.exports = {
    createManualOrder,
    getOrders,
    updateOrderShippingAddress,
    masterUpdateOrder,
    updateOrderStatus,
    deleteOrder,
    bulkDeleteOrders,
    approveOrderReturn,
    undoOrderRefund
};

