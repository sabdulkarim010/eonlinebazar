/********************************************************************
 * POS offline order batch sync — idempotent replay on reconnect.
 ********************************************************************/

'use strict';

const mongoose = require('mongoose');
const Product = require('../models/product');
const Order = require('../models/order');
const { dualWrite } = require('./dualWriteService');
const { roundMoney, buildLockedOrderTotals } = require('./deliveryChargeService');
const { recordShiftSale } = require('./posShiftService');
const { deductWalletForOrder, getWalletBalance } = require('./walletService');
const {
    deductOrderStock,
    resolveSellingPriceFromSettings,
    buildVariantSnapshot,
    resolveAvailableStock
} = require('../controllers/orderControllerHelpers');
const { seedInitialStatusHistory } = require('../utils/orderStatusHistory');
const { findVariantIndex } = require('../utils/variantHelpers');
const { loadFlashSaleSettings } = require('./flashSaleService');
const { isSandboxMode } = require('./sandboxService');

function getOrderDualWriteHelpers() {
    return require('../utils/orderDualWriteHelpers');
}

function getOrderRepository() {
    return require('../repositories/orderRepository');
}

async function offlineOrderExists(offlineOrderId) {
    const key = String(offlineOrderId || '').trim();
    if (!key) return false;

    const mongoHit = await Order.findOne({ offlineOrderId: key }).select('_id').lean();
    if (mongoHit) return true;

    try {
        const repo = getOrderRepository();
        if (typeof repo.findByOfflineOrderId === 'function') {
            const pgHit = await repo.findByOfflineOrderId(key);
            if (pgHit) return true;
        }
    } catch (_err) {
        // PG lookup is best-effort during offline sync.
    }

    return false;
}

function normalizeOfflinePayments(orderPayload = {}, grandTotal = 0) {
    const payments = Array.isArray(orderPayload.payments) ? orderPayload.payments : null;
    if (payments && payments.length) {
        const normalized = payments
            .map((line) => ({
                method: String(line.method || line.paymentMethod || '').trim().toUpperCase(),
                amount: roundMoney(Number(line.amount))
            }))
            .filter((line) => line.method && line.amount > 0);

        const totalPaid = roundMoney(normalized.reduce((sum, line) => sum + line.amount, 0));
        if (totalPaid !== roundMoney(grandTotal)) {
            return { error: `Split payments total ৳${totalPaid} must equal order total ৳${roundMoney(grandTotal)}.` };
        }

        const walletApplied = roundMoney(
            normalized.filter((line) => line.method === 'WALLET').reduce((sum, line) => sum + line.amount, 0)
        );
        const hasCodOnly = normalized.length === 1 && normalized[0].method === 'COD';

        return {
            splitPayments: normalized,
            walletApplied,
            paymentMethod: normalized.length > 1 ? 'Split' : normalized[0].method,
            isPaid: !hasCodOnly
        };
    }

    const paymentMethod = String(orderPayload.paymentMethod || orderPayload.paymentType || 'CASH').trim().toUpperCase();
    const isPaid = paymentMethod !== 'COD';
    return {
        splitPayments: [{ method: paymentMethod, amount: roundMoney(grandTotal) }],
        walletApplied: roundMoney(Number(orderPayload.walletApplied) || 0),
        paymentMethod,
        isPaid
    };
}

async function normalizeOfflineItems(items = []) {
    const flashSettings = await loadFlashSaleSettings();
    const normalizedItems = [];
    let subtotal = 0;

    for (const rawItem of items) {
        const item = { ...rawItem };
        const targetId = item.id || item.productId || item._id;
        const quantity = Math.max(1, Number(item.quantity) || 1);
        if (!targetId) {
            return { error: 'Each offline line item must include a product id.' };
        }

        const query = mongoose.Types.ObjectId.isValid(targetId)
            ? { $or: [{ _id: targetId }, { productId: targetId }] }
            : { productId: targetId };

        const prod = await Product.findOne(query).select(
            'price buyingPrice variants name productId category stock stockQuantity'
        );
        if (!prod) {
            return { error: `Product not found: ${targetId}` };
        }

        const vIdx = findVariantIndex(prod, item);
        const availableStock = resolveAvailableStock(prod, vIdx);
        if (quantity > availableStock) {
            return { error: `Insufficient stock for "${prod.name}". Available: ${availableStock}.` };
        }

        const verifiedPrice = resolveSellingPriceFromSettings(prod, item, flashSettings);
        item.price = roundMoney(Number.isFinite(verifiedPrice) ? verifiedPrice : Number(item.price) || 0);
        item.quantity = quantity;
        item.name = prod.name;
        item.productId = prod.productId || String(prod._id);
        item.buyingPrice = Number(prod.buyingPrice) || 0;
        if (vIdx > -1) Object.assign(item, buildVariantSnapshot(prod, vIdx));

        subtotal += item.price * quantity;
        normalizedItems.push(item);
    }

    return { normalizedItems, subtotal: roundMoney(subtotal) };
}

async function syncSingleOfflineOrder(orderPayload = {}, adminMeta = {}) {
    const offlineOrderId = String(orderPayload.offlineOrderId || '').trim();
    if (!offlineOrderId) {
        return { status: 'error', message: 'offlineOrderId is required.' };
    }

    if (await offlineOrderExists(offlineOrderId)) {
        return { status: 'skipped', offlineOrderId, message: 'Already synced.' };
    }

    const customer = orderPayload.customer || {};
    const customerName = String(customer.name || customer.customerName || 'Walk-in Customer').trim();
    const customerPhone = String(customer.phone || customer.customerPhone || '').trim();
    const customerAddress = String(customer.address || customer.customerAddress || 'POS Counter').trim();
    const linkedUser = customer.userId && mongoose.Types.ObjectId.isValid(customer.userId)
        ? customer.userId
        : null;

    if (!customerName || !customerPhone) {
        return { status: 'error', offlineOrderId, message: 'Customer name and phone are required.' };
    }

    const itemResult = await normalizeOfflineItems(orderPayload.items || []);
    if (itemResult.error) {
        return { status: 'error', offlineOrderId, message: itemResult.error };
    }

    const shippingFee = roundMoney(Number(orderPayload.shippingFee || orderPayload.deliveryCharge) || 0);
    const lockedTotals = buildLockedOrderTotals({
        itemSubtotal: itemResult.subtotal,
        discountAmount: roundMoney(Number(orderPayload.discountAmount) || 0),
        deliveryCharge: shippingFee
    });
    const grandTotal = roundMoney(
        Number(orderPayload.totalAmount) > 0 ? orderPayload.totalAmount : lockedTotals.grandTotal
    );

    const payment = normalizeOfflinePayments(orderPayload, grandTotal);
    if (payment.error) {
        return { status: 'error', offlineOrderId, message: payment.error };
    }

    if (payment.walletApplied > 0) {
        if (!linkedUser) {
            return { status: 'error', offlineOrderId, message: 'Wallet payment requires linked customer userId.' };
        }
        const balance = await getWalletBalance(linkedUser);
        if (balance < payment.walletApplied) {
            return { status: 'error', offlineOrderId, message: 'Insufficient wallet balance for offline sync.' };
        }
    }

    const inSandbox = await isSandboxMode();
    const orderId = orderPayload.orderId || `ORD-OFF-${offlineOrderId.slice(-8).toUpperCase()}`;
    const posShiftId = orderPayload.posShiftId && mongoose.Types.ObjectId.isValid(orderPayload.posShiftId)
        ? orderPayload.posShiftId
        : null;

    const newOrder = new Order({
        orderId,
        offlineOrderId,
        user: linkedUser,
        customerName,
        customerPhone,
        customerAddress,
        subTotal: lockedTotals.subTotal,
        deliveryCharge: lockedTotals.deliveryCharge,
        grandTotal,
        discountAmount: lockedTotals.discountAmount,
        walletApplied: payment.walletApplied,
        paymentMethod: payment.paymentMethod,
        splitPayments: payment.splitPayments,
        posShiftId,
        items: itemResult.normalizedItems,
        status: payment.isPaid ? 'Processing' : 'Pending',
        isDelivered: false,
        orderSource: 'offline_pos',
        createdByAdmin: adminMeta.actor || 'pos-offline-sync',
        isSandbox: inSandbox
    });

    seedInitialStatusHistory(newOrder, adminMeta.actor || 'pos-offline-sync');

    await dualWrite(
        () => newOrder.save(),
        async (saved) => {
            await getOrderDualWriteHelpers().mirrorOrderCreate(saved);
            await getOrderDualWriteHelpers().mirrorOrderStatusHistory(saved);
        },
        {
            model: 'Order',
            operation: 'offlinePosSync',
            mongoId: (saved) => String(saved._id)
        }
    );

    await deductOrderStock(itemResult.normalizedItems);

    if (payment.walletApplied > 0 && linkedUser) {
        const walletAfter = await deductWalletForOrder(
            linkedUser,
            payment.walletApplied,
            newOrder.orderId,
            'Used for offline POS sync order'
        );
        if (!walletAfter) {
            await Order.findByIdAndDelete(newOrder._id);
            return { status: 'error', offlineOrderId, message: 'Wallet deduction failed during offline sync.' };
        }
    }

    if (posShiftId) {
        await recordShiftSale(posShiftId, payment.splitPayments, grandTotal);
    }

    return {
        status: 'synced',
        offlineOrderId,
        orderId: newOrder.orderId,
        mongoId: String(newOrder._id)
    };
}

async function syncOfflineOrdersBatch(orders = [], adminMeta = {}) {
    const list = Array.isArray(orders) ? orders : [];
    const report = {
        syncedCount: 0,
        skippedCount: 0,
        errors: []
    };

    for (const payload of list) {
        const result = await syncSingleOfflineOrder(payload, adminMeta);
        if (result.status === 'synced') {
            report.syncedCount += 1;
        } else if (result.status === 'skipped') {
            report.skippedCount += 1;
        } else {
            report.errors.push({
                offlineOrderId: result.offlineOrderId || payload?.offlineOrderId || null,
                message: result.message || 'Sync failed.'
            });
        }
    }

    return report;
}

module.exports = {
    offlineOrderExists,
    syncSingleOfflineOrder,
    syncOfflineOrdersBatch
};
