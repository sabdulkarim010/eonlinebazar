/********************************************************************
 * Project: EonlineBazar — WMS
 * File: wmsService.js
 * Location: services/wmsService.js
 * Description: Multi-warehouse transfers, reservations, and fulfillment.
 ********************************************************************/

'use strict';

const mongoose = require('mongoose');
const WarehouseTransfer = require('../models/WarehouseTransfer');
const Warehouse = require('../models/warehouse');
const Product = require('../models/product');
const Order = require('../models/order');
const StockLedger = require('../models/StockLedger');
const { getDefaultWarehouseId } = require('./warehouseService');
const {
    recordStockMovement,
    resolveVariantKeys
} = require('./stockLedgerService');

async function generateTransferNumber() {
    const prefix = `WT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const count = await WarehouseTransfer.countDocuments({
        transferNumber: new RegExp(`^${prefix}`)
    });
    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

async function resolveWarehouseId(rawId) {
    const id = String(rawId || '').trim();
    if (id && mongoose.Types.ObjectId.isValid(id)) {
        const exists = await Warehouse.exists({ _id: id });
        if (exists) return id;
    }
    return getDefaultWarehouseId();
}

async function normaliseTransferItems(rawItems) {
    if (!Array.isArray(rawItems) || !rawItems.length) {
        return { error: 'A transfer needs at least one item line.' };
    }

    const ids = rawItems
        .map((item) => String(item?.productId || '').trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (ids.length !== rawItems.length) {
        return { error: 'Every item line needs a valid productId.' };
    }

    const products = await Product.find({ _id: { $in: ids } })
        .select('_id name productId hasVariants variants')
        .lean();
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    const items = [];
    for (const raw of rawItems) {
        const product = productMap.get(String(raw.productId));
        if (!product) {
            return { error: `Product ${raw.productId} no longer exists.` };
        }

        const qty = Number(raw.qty);
        if (!Number.isFinite(qty) || qty <= 0) {
            return { error: `Quantity for "${product.name}" must be greater than zero.` };
        }

        items.push({
            productId: product._id,
            productName: product.name || '',
            variantId: String(raw.variantId || '').trim(),
            variantSku: String(raw.variantSku || raw.sku || '').trim(),
            qty,
            shippedQty: 0,
            receivedQty: 0,
            binLocation: String(raw.binLocation || '').trim(),
            locationCode: String(raw.locationCode || '').trim()
        });
    }

    return { items };
}

async function createTransferDraft({
    sourceWarehouseId,
    destinationWarehouseId,
    items,
    notes = '',
    createdBy = null,
    createdByName = ''
}) {
    const sourceId = await resolveWarehouseId(sourceWarehouseId);
    const destId = await resolveWarehouseId(destinationWarehouseId);

    if (!sourceId || !destId) {
        throw new Error('Source and destination warehouses are required.');
    }
    if (String(sourceId) === String(destId)) {
        throw new Error('Source and destination warehouses must differ.');
    }

    const normalised = await normaliseTransferItems(items);
    if (normalised.error) {
        throw new Error(normalised.error);
    }

    const transferNumber = await generateTransferNumber();
    const transfer = await WarehouseTransfer.create({
        transferNumber,
        sourceWarehouseId: sourceId,
        destinationWarehouseId: destId,
        status: 'draft',
        items: normalised.items,
        notes: String(notes || '').trim(),
        createdBy,
        createdByName: String(createdByName || '').trim()
    });

    return transfer;
}

/**
 * Draft → In-Transit: deduct stock at source and log TRANSFER_OUT entries.
 */
async function shipTransfer(transferId, performedBy = null) {
    const transfer = await WarehouseTransfer.findById(transferId);
    if (!transfer) {
        throw new Error('Transfer not found.');
    }
    if (transfer.status !== 'draft') {
        throw new Error(`Transfer cannot ship from status "${transfer.status}".`);
    }

    for (const item of transfer.items) {
        const product = await Product.findById(item.productId);
        if (!product) {
            throw new Error(`Product ${item.productId} no longer exists.`);
        }

        const keys = resolveVariantKeys(product, item);
        if (product.hasVariants && !keys.variantId && !keys.variantSku) {
            throw new Error(`"${product.name}" requires variantId or variantSku on the transfer line.`);
        }

        await recordStockMovement({
            productId: item.productId,
            variantId: keys.variantId,
            variantSku: keys.variantSku,
            warehouseId: transfer.sourceWarehouseId,
            changeQuantity: -item.qty,
            movementType: 'TRANSFER_OUT',
            referenceId: String(transfer._id),
            referenceType: 'WarehouseTransfer',
            performedBy,
            binLocation: item.binLocation,
            locationCode: item.locationCode,
            notes: `Shipped on transfer ${transfer.transferNumber}`
        });

        item.shippedQty = item.qty;
    }

    transfer.status = 'in_transit';
    transfer.shippedAt = new Date();
    transfer.markModified('items');
    await transfer.save();

    return transfer;
}

/**
 * In-Transit → Received | Discrepancy: accept stock at destination.
 *
 * @param {string} transferId
 * @param {Array<{ productId, variantId?, variantSku?, receivedQty, binLocation?, locationCode? }>} receivedLines
 */
async function receiveTransfer(transferId, receivedLines = [], performedBy = null) {
    const transfer = await WarehouseTransfer.findById(transferId);
    if (!transfer) {
        throw new Error('Transfer not found.');
    }
    if (transfer.status !== 'in_transit') {
        throw new Error(`Transfer cannot be received from status "${transfer.status}".`);
    }

    const lineMap = new Map();
    for (const line of receivedLines || []) {
        const key = `${String(line.productId)}::${String(line.variantId || '')}::${String(line.variantSku || line.sku || '')}`;
        lineMap.set(key, line);
    }

    let hasDiscrepancy = false;
    const discrepancyLines = [];

    for (const item of transfer.items) {
        const key = `${String(item.productId)}::${String(item.variantId || '')}::${String(item.variantSku || '')}`;
        const receivedMeta = lineMap.get(key) || {};
        const receivedQty = receivedMeta.receivedQty != null
            ? Number(receivedMeta.receivedQty)
            : item.shippedQty;

        if (!Number.isFinite(receivedQty) || receivedQty < 0) {
            throw new Error(`Invalid received quantity for "${item.productName}".`);
        }
        if (receivedQty > item.shippedQty) {
            throw new Error(`Received quantity cannot exceed shipped quantity for "${item.productName}".`);
        }

        item.receivedQty = receivedQty;
        if (receivedMeta.binLocation) item.binLocation = String(receivedMeta.binLocation).trim();
        if (receivedMeta.locationCode) item.locationCode = String(receivedMeta.locationCode).trim();

        if (receivedQty > 0) {
            await recordStockMovement({
                productId: item.productId,
                variantId: item.variantId,
                variantSku: item.variantSku,
                warehouseId: transfer.destinationWarehouseId,
                changeQuantity: receivedQty,
                movementType: 'TRANSFER_IN',
                referenceId: String(transfer._id),
                referenceType: 'WarehouseTransfer',
                performedBy,
                binLocation: item.binLocation,
                locationCode: item.locationCode,
                notes: `Received on transfer ${transfer.transferNumber}`
            });
        }

        const variance = item.shippedQty - receivedQty;
        if (variance > 0) {
            hasDiscrepancy = true;
            discrepancyLines.push({
                productId: String(item.productId),
                productName: item.productName,
                variantId: item.variantId,
                variantSku: item.variantSku,
                shippedQty: item.shippedQty,
                receivedQty,
                variance
            });

            await recordStockMovement({
                productId: item.productId,
                variantId: item.variantId,
                variantSku: item.variantSku,
                warehouseId: transfer.sourceWarehouseId,
                changeQuantity: -variance,
                movementType: 'DAMAGE_WRITE_OFF',
                referenceId: String(transfer._id),
                referenceType: 'WarehouseTransfer',
                performedBy,
                auditOnly: true,
                notes: `Transfer discrepancy: ${variance} unit(s) missing in transit on ${transfer.transferNumber}`
            });
        }
    }

    transfer.status = hasDiscrepancy ? 'discrepancy' : 'received';
    transfer.receivedAt = new Date();
    transfer.discrepancyDetails = hasDiscrepancy
        ? { lines: discrepancyLines, recordedAt: new Date() }
        : null;
    transfer.markModified('items');
    await transfer.save();

    return transfer;
}

async function resolveOrderWarehouseId(order, product) {
    if (product?.warehouseId) return product.warehouseId;
    return getDefaultWarehouseId();
}

async function findProductForOrderItem(item) {
    const targetId = item?.productId || item?.id || item?._id;
    if (!targetId) return null;

    const query = mongoose.Types.ObjectId.isValid(String(targetId))
        ? { $or: [{ _id: targetId }, { productId: targetId }] }
        : { productId: targetId };

    return Product.findOne(query);
}

/**
 * Soft-reserve stock for an order without deducting physical quantity.
 */
async function reserveStockForOrder(orderId, items, performedBy = null) {
    const order = await Order.findById(orderId).lean();
    if (!order) {
        throw new Error('Order not found.');
    }

    const lines = Array.isArray(items) && items.length ? items : order.items;
    if (!Array.isArray(lines) || !lines.length) {
        throw new Error('Order has no items to reserve.');
    }

    const existing = await StockLedger.countDocuments({
        referenceId: String(orderId),
        movementType: 'RESERVATION'
    });
    if (existing > 0) {
        throw new Error('Stock is already reserved for this order.');
    }

    const results = [];
    for (const item of lines) {
        const product = await findProductForOrderItem(item);
        if (!product) continue;

        const qty = Math.max(1, Number(item.quantity) || 1);
        const keys = resolveVariantKeys(product, item);
        const warehouseId = await resolveOrderWarehouseId(order, product);

        if (!warehouseId) {
            throw new Error('No warehouse available for stock reservation.');
        }

        const movement = await recordStockMovement({
            productId: product._id,
            variantId: keys.variantId,
            variantSku: keys.variantSku,
            warehouseId,
            changeQuantity: qty,
            movementType: 'RESERVATION',
            referenceId: String(orderId),
            referenceType: 'Order',
            performedBy,
            notes: `Reserved for order ${order.orderId || orderId}`
        });
        results.push(movement);
    }

    return { reserved: results.length, movements: results };
}

/**
 * Convert reserved stock to a physical SALE deduction on shipment.
 */
async function fulfillReservedStock(orderId, performedBy = null) {
    const order = await Order.findById(orderId).lean();
    if (!order) {
        throw new Error('Order not found.');
    }

    const reservations = await StockLedger.find({
        referenceId: String(orderId),
        movementType: 'RESERVATION'
    }).lean();

    if (!reservations.length) {
        throw new Error('No reservations found for this order.');
    }

    const saleExists = await StockLedger.exists({
        referenceId: String(orderId),
        movementType: 'SALE'
    });
    if (saleExists) {
        throw new Error('Order stock has already been fulfilled.');
    }

    const results = [];
    for (const reservation of reservations) {
        const qty = Math.abs(Number(reservation.changeQuantity) || 0);
        if (qty <= 0) continue;

        const movement = await recordStockMovement({
            productId: reservation.productId,
            variantId: reservation.variantId,
            variantSku: reservation.variantSku,
            warehouseId: reservation.warehouseId,
            changeQuantity: -qty,
            movementType: 'SALE',
            referenceId: String(orderId),
            referenceType: 'Order',
            performedBy,
            notes: `Fulfilled sale for order ${order.orderId || orderId}`
        });
        results.push(movement);
    }

    return { fulfilled: results.length, movements: results };
}

/**
 * Seed warehouse stock from a product's current global stock (bootstrap helper).
 */
async function seedWarehouseStockFromProduct(productId, warehouseId, quantity) {
    const qty = Math.max(0, Number(quantity) || 0);
    if (qty <= 0) return null;

    return recordStockMovement({
        productId,
        warehouseId,
        changeQuantity: qty,
        movementType: 'MANUAL_ADJUSTMENT',
        referenceType: 'Bootstrap',
        notes: 'Initial warehouse stock seed'
    });
}

module.exports = {
    createTransferDraft,
    shipTransfer,
    receiveTransfer,
    reserveStockForOrder,
    fulfillReservedStock,
    seedWarehouseStockFromProduct,
    generateTransferNumber,
    normaliseTransferItems
};
