/********************************************************************
 * Project: EonlineBazar — WMS
 * File: stockLedgerService.js
 * Location: services/stockLedgerService.js
 * Description: Immutable stock movement ledger + atomic warehouse stock
 * updates with Mongo-first dual-write to PostgreSQL.
 ********************************************************************/

'use strict';

const mongoose = require('mongoose');
const StockLedger = require('../models/StockLedger');
const WarehouseStock = require('../models/WarehouseStock');
const Product = require('../models/product');
const { dualWrite } = require('./dualWriteService');
const { recordOutboxEvent } = require('./outboxService');
const { findVariantIndex, applyProductStockFields } = require('../utils/variantHelpers');

function getStockLedgerRepository() {
    return require('../repositories/stockLedgerRepository');
}

function getWarehouseStockRepository() {
    return require('../repositories/warehouseStockRepository');
}

function getProductRepository() {
    return require('../repositories/productRepository');
}

function normaliseVariantKey(variantId, variantSku) {
    return {
        variantId: String(variantId || '').trim(),
        variantSku: String(variantSku || '').trim()
    };
}

async function findOrCreateWarehouseStock({
    productId,
    warehouseId,
    variantId = '',
    variantSku = '',
    binLocation = '',
    locationCode = ''
}) {
    const keys = normaliseVariantKey(variantId, variantSku);
    const query = {
        warehouseId,
        productId,
        variantId: keys.variantId,
        variantSku: keys.variantSku
    };

    let row = await WarehouseStock.findOne(query);
    if (row) return row;

    row = await WarehouseStock.create({
        ...query,
        quantity: 0,
        reservedStockQuantity: 0,
        binLocation: String(binLocation || '').trim(),
        locationCode: String(locationCode || '').trim()
    });
    return row;
}

async function syncProductAggregateStock(productId) {
    const product = await Product.findById(productId);
    if (!product) return;

    const stocks = await WarehouseStock.find({ productId }).lean();
    if (!product.hasVariants || !Array.isArray(product.variants) || !product.variants.length) {
        const total = stocks
            .filter((s) => !s.variantId && !s.variantSku)
            .reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
        product.stockQuantity = total;
        product.stock = total;
    } else {
        for (const variant of product.variants) {
            const vid = String(variant._id || variant.id || '').trim();
            const sku = String(variant.sku || '').trim();
            const match = stocks.find((s) =>
                (vid && s.variantId === vid) || (sku && s.variantSku === sku)
            );
            variant.stock = match ? Number(match.quantity) || 0 : 0;
        }
        applyProductStockFields(product);
        product.markModified('variants');
    }

    await product.save();

    try {
        const plain = typeof product.toObject === 'function' ? product.toObject() : product;
        await getProductRepository().updateProductInPG(product._id, plain);
    } catch (pgErr) {
        console.error('[DUAL-WRITE-PRODUCT-FAIL] aggregate stock sync:', pgErr.message || pgErr);
    }
}

/**
 * Record an immutable ledger row and apply the warehouse stock change atomically.
 *
 * @param {object} params
 * @returns {Promise<{ ledger: object, warehouseStock: object }>}
 */
async function recordStockMovement(params) {
    const {
        productId,
        variantId = '',
        variantSku = '',
        warehouseId,
        changeQuantity,
        movementType,
        referenceId = '',
        referenceType = '',
        performedBy = null,
        binLocation = '',
        locationCode = '',
        notes = '',
        /** When true, append a ledger row without mutating warehouse stock (discrepancy audit). */
        auditOnly = false
    } = params;

    if (!productId || !warehouseId) {
        throw new Error('productId and warehouseId are required.');
    }
    if (!mongoose.Types.ObjectId.isValid(String(productId))) {
        throw new Error('Invalid productId.');
    }
    if (!mongoose.Types.ObjectId.isValid(String(warehouseId))) {
        throw new Error('Invalid warehouseId.');
    }

    const delta = Number(changeQuantity);
    if (!Number.isFinite(delta) || (delta === 0 && !auditOnly)) {
        throw new Error('changeQuantity must be a non-zero number.');
    }

    const stockRow = await findOrCreateWarehouseStock({
        productId,
        warehouseId,
        variantId,
        variantSku,
        binLocation,
        locationCode
    });

    let previousQuantity;
    let newQuantity;

    if (auditOnly) {
        previousQuantity = Number(stockRow.quantity) || 0;
        newQuantity = previousQuantity;

        const ledgerPayload = {
            productId,
            variantId: normaliseVariantKey(variantId, variantSku).variantId,
            variantSku: normaliseVariantKey(variantId, variantSku).variantSku,
            warehouseId,
            changeQuantity: delta,
            previousQuantity,
            newQuantity,
            movementType,
            referenceId: String(referenceId || '').trim(),
            referenceType: String(referenceType || '').trim(),
            performedBy: performedBy || null,
            binLocation: String(binLocation || stockRow.binLocation || '').trim(),
            notes: String(notes || '').trim()
        };

        const ledger = await StockLedger.create(ledgerPayload);
        try {
            await getStockLedgerRepository().createFromMongo(ledger);
        } catch (pgErr) {
            console.error('[DUAL-WRITE-STOCK-LEDGER-FAIL]', pgErr.message || pgErr);
        }
        return { ledger, warehouseStock: stockRow };
    }

    if (movementType === 'RESERVATION') {
        if (delta <= 0) {
            throw new Error('RESERVATION changeQuantity must be positive.');
        }
        const available = (Number(stockRow.quantity) || 0) - (Number(stockRow.reservedStockQuantity) || 0);
        if (delta > available) {
            throw new Error(`Insufficient available stock to reserve (${available} available).`);
        }
        previousQuantity = Number(stockRow.reservedStockQuantity) || 0;
        newQuantity = previousQuantity + delta;
        stockRow.reservedStockQuantity = newQuantity;
    } else {
        previousQuantity = Number(stockRow.quantity) || 0;
        newQuantity = previousQuantity + delta;

        if (newQuantity < 0) {
            throw new Error(`Stock cannot go negative (would be ${newQuantity}).`);
        }

        stockRow.quantity = newQuantity;

        if (movementType === 'SALE' && delta < 0) {
            const sold = Math.abs(delta);
            const reserved = Number(stockRow.reservedStockQuantity) || 0;
            stockRow.reservedStockQuantity = Math.max(0, reserved - sold);
        }

        if (binLocation) stockRow.binLocation = String(binLocation).trim();
        if (locationCode) stockRow.locationCode = String(locationCode).trim();
    }

    const ledgerPayload = {
        productId,
        variantId: normaliseVariantKey(variantId, variantSku).variantId,
        variantSku: normaliseVariantKey(variantId, variantSku).variantSku,
        warehouseId,
        changeQuantity: delta,
        previousQuantity,
        newQuantity,
        movementType,
        referenceId: String(referenceId || '').trim(),
        referenceType: String(referenceType || '').trim(),
        performedBy: performedBy || null,
        binLocation: String(binLocation || stockRow.binLocation || '').trim(),
        notes: String(notes || '').trim()
    };

    const result = await dualWrite(
        async () => {
            const ledger = await StockLedger.create(ledgerPayload);
            await stockRow.save();
            return { ledger, warehouseStock: stockRow };
        },
        async (mongoResult) => {
            const ledgerRepo = getStockLedgerRepository();
            const stockRepo = getWarehouseStockRepository();
            await ledgerRepo.createFromMongo(mongoResult.ledger);
            await stockRepo.upsertFromMongo(mongoResult.warehouseStock);
        },
        {
            model: 'StockLedger',
            operation: movementType,
            mongoId: (r) => String(r?.ledger?._id || '')
        }
    );

    await syncProductAggregateStock(productId);

    if (!auditOnly && movementType !== 'RESERVATION') {
        void recordOutboxEvent('STOCK_UPDATED', {
            productId: String(productId),
            warehouseId: String(warehouseId),
            movementType,
            changeQuantity: delta,
            newQuantity: result.warehouseStock?.quantity
        }).catch(() => {});
    }

    return result;
}

async function listLedgerEntries(filters = {}) {
    const query = {};
    if (filters.productId) query.productId = filters.productId;
    if (filters.warehouseId) query.warehouseId = filters.warehouseId;
    if (filters.movementType) query.movementType = filters.movementType;
    if (filters.referenceId) query.referenceId = String(filters.referenceId);

    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
    const entries = await StockLedger.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

    return entries;
}

/**
 * Resolve variant keys from a product document and line item metadata.
 */
function resolveVariantKeys(product, item = {}) {
    if (!product?.hasVariants) {
        return { variantId: '', variantSku: '' };
    }
    const idx = findVariantIndex(product, item);
    if (idx < 0) {
        return {
            variantId: String(item.variantId || '').trim(),
            variantSku: String(item.variantSku || item.sku || '').trim()
        };
    }
    const variant = product.variants[idx];
    return {
        variantId: String(variant._id || variant.id || item.variantId || '').trim(),
        variantSku: String(variant.sku || item.variantSku || item.sku || '').trim()
    };
}

module.exports = {
    recordStockMovement,
    listLedgerEntries,
    findOrCreateWarehouseStock,
    syncProductAggregateStock,
    resolveVariantKeys
};
