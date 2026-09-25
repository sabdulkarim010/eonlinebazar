/********************************************************************
 * Project: EonlineBazar — Inventory Intelligence
 * File: inventoryIntelligenceService.js
 * Description: Sales velocity, dynamic reorder points (ROP), and
 * automated draft purchase order generation grouped by supplier.
 ********************************************************************/

'use strict';

const mongoose = require('mongoose');
const Order = require('../models/order');
const Product = require('../models/product');
const PurchaseOrder = require('../models/purchaseOrder');
const Supplier = require('../models/supplier');
const { getDefaultWarehouseId } = require('./warehouseService');
const poRepo = require('../repositories/purchaseOrderRepository');

const DEFAULT_VELOCITY_DAYS = Number(process.env.INVENTORY_VELOCITY_DAYS) || 30;
const DEFAULT_LEAD_TIME_DAYS = Number(process.env.SUPPLIER_DEFAULT_LEAD_TIME_DAYS) || 7;
const DEFAULT_THRESHOLD = Number(process.env.LOW_STOCK_DEFAULT_THRESHOLD) || 10;
const OPEN_PO_STATUSES = ['draft', 'sent', 'partial'];

/** Orders that count toward sales velocity (committed / fulfilled). */
const VELOCITY_ORDER_STATUSES = [
    'Delivered',
    'Shipped',
    'Out for Delivery',
    'Processing'
];

const ACTIVE_PRODUCT_FILTER = {
    $or: [
        { status: { $exists: false } },
        { status: { $nin: ['inactive', 'deleted'] } }
    ]
};

/** Latest computed intelligence snapshot (in-process cache). */
let latestIntelligenceCache = {
    computedAt: null,
    windowDays: DEFAULT_VELOCITY_DAYS,
    products: []
};

function getVelocityWindowDays(override) {
    const days = Number(override);
    if (Number.isFinite(days) && days > 0) return Math.min(Math.floor(days), 365);
    return DEFAULT_VELOCITY_DAYS;
}

function getDefaultLeadTimeDays(override) {
    const days = Number(override);
    if (Number.isFinite(days) && days >= 0) return Math.min(Math.floor(days), 90);
    return DEFAULT_LEAD_TIME_DAYS;
}

function resolveSafetyStock(product, variant = null) {
    const fromVariant = variant?.lowStockThreshold;
    const fromProduct = product?.lowStockThreshold ?? product?.reorderPoint;
    const value = Number(fromVariant ?? fromProduct);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_THRESHOLD;
}

function buildSalesKey(productMongoId, variantId = '', variantSku = '') {
    return `${String(productMongoId)}::${String(variantId || '').trim()}::${String(variantSku || '').trim()}`;
}

function parseSalesKey(key) {
    const [productMongoId, variantId, variantSku] = String(key).split('::');
    return { productMongoId, variantId, variantSku };
}

/**
 * Daily sales velocity = total units sold in window / window days.
 */
function calculateDailySalesVelocity(unitsSold, windowDays) {
    const sold = Math.max(0, Number(unitsSold) || 0);
    const days = Math.max(1, Number(windowDays) || DEFAULT_VELOCITY_DAYS);
    return sold / days;
}

/**
 * ROP = (daily velocity × lead time) + safety stock.
 * Falls back to static safety stock when velocity history is insufficient.
 */
function calculateDynamicRop({
    dailySalesVelocity,
    leadTimeDays,
    safetyStock,
    hasSalesHistory
}) {
    const safety = Math.max(0, Number(safetyStock) || DEFAULT_THRESHOLD);
    if (!hasSalesHistory || dailySalesVelocity <= 0) {
        return {
            calculatedRop: safety,
            usedDynamicRop: false,
            safetyStock: safety
        };
    }

    const lead = Math.max(0, Number(leadTimeDays) || DEFAULT_LEAD_TIME_DAYS);
    const velocity = Math.max(0, Number(dailySalesVelocity) || 0);
    const calculatedRop = Math.ceil((velocity * lead) + safety);

    return {
        calculatedRop: Math.max(calculatedRop, safety),
        usedDynamicRop: true,
        safetyStock: safety
    };
}

function calculateTargetBufferStock(calculatedRop, safetyStock) {
    const rop = Math.max(0, Number(calculatedRop) || 0);
    const safety = Math.max(0, Number(safetyStock) || DEFAULT_THRESHOLD);
    return rop + safety;
}

function calculateReorderSuggestedQuantity(currentStock, targetBufferStock) {
    const current = Math.max(0, Number(currentStock) || 0);
    const target = Math.max(0, Number(targetBufferStock) || 0);
    return Math.max(0, Math.ceil(target - current));
}

async function aggregateSalesFromOrders(windowDays = DEFAULT_VELOCITY_DAYS) {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const orders = await Order.find({
        status: { $in: VELOCITY_ORDER_STATUSES },
        createdAt: { $gte: since }
    })
        .select('items')
        .lean();

    const externalProductIds = new Set();
    for (const order of orders) {
        for (const item of order.items || []) {
            const productRef = item.productId || item.id || item._id;
            if (!productRef) continue;
            const ref = String(productRef);
            if (!mongoose.Types.ObjectId.isValid(ref)) externalProductIds.add(ref);
        }
    }

    const externalIdMap = new Map();
    if (externalProductIds.size) {
        const resolved = await Product.find({ productId: { $in: [...externalProductIds] } })
            .select('_id productId')
            .lean();
        for (const row of resolved) {
            externalIdMap.set(String(row.productId), String(row._id));
        }
    }

    const salesMap = new Map();

    for (const order of orders) {
        for (const item of order.items || []) {
            const qty = Math.max(0, Number(item.quantity) || 0);
            if (qty <= 0) continue;

            const productRef = item.productId || item.id || item._id;
            if (!productRef) continue;

            let productMongoId = String(productRef);
            if (!mongoose.Types.ObjectId.isValid(productMongoId)) {
                productMongoId = externalIdMap.get(productMongoId);
                if (!productMongoId) continue;
            }

            const key = buildSalesKey(
                productMongoId,
                item.variantId,
                item.variantSku || item.sku
            );
            salesMap.set(key, (salesMap.get(key) || 0) + qty);
        }
    }

    return salesMap;
}

function buildIntelligenceRow({
    product,
    variant = null,
    currentStock,
    unitsSold,
    windowDays,
    leadTimeDays
}) {
    const safetyStock = resolveSafetyStock(product, variant);
    const hasSalesHistory = unitsSold > 0;
    const salesVelocity = calculateDailySalesVelocity(unitsSold, windowDays);
    const { calculatedRop, usedDynamicRop } = calculateDynamicRop({
        dailySalesVelocity: salesVelocity,
        leadTimeDays,
        safetyStock,
        hasSalesHistory
    });

    const targetBufferStock = calculateTargetBufferStock(calculatedRop, safetyStock);
    const reorderSuggestedQuantity = calculateReorderSuggestedQuantity(currentStock, targetBufferStock);
    const reorderNeeded = currentStock <= calculatedRop;

    return {
        productMongoId: String(product._id),
        productId: product.productId || String(product._id),
        name: variant?.name || product.name || 'Unnamed',
        variantId: variant ? String(variant._id || variant.id || '').trim() : '',
        variantSku: variant ? String(variant.sku || '').trim() : '',
        supplierId: product.supplierId ? String(product.supplierId) : '',
        currentStock,
        unitsSoldWindow: unitsSold,
        windowDays,
        salesVelocity: Number(salesVelocity.toFixed(4)),
        leadTimeDays,
        safetyStock,
        calculatedRop,
        usedDynamicRop,
        targetBufferStock,
        reorderSuggestedQuantity,
        status: reorderNeeded ? 'REORDER_NEEDED' : 'OK'
    };
}

async function scanInventoryIntelligence(options = {}) {
    const windowDays = getVelocityWindowDays(options.windowDays);
    const leadTimeDays = getDefaultLeadTimeDays(options.leadTimeDays);
    const salesMap = await aggregateSalesFromOrders(windowDays);

    const products = await Product.find(ACTIVE_PRODUCT_FILTER)
        .select('name productId stockQuantity stock hasVariants variants supplierId lowStockThreshold reorderPoint buyingPrice')
        .lean();

    const rows = [];

    for (const product of products) {
        if (product.hasVariants && Array.isArray(product.variants) && product.variants.length) {
            for (const variant of product.variants) {
                const variantId = String(variant._id || variant.id || '').trim();
                const variantSku = String(variant.sku || '').trim();
                const key = buildSalesKey(product._id, variantId, variantSku);
                const unitsSold = salesMap.get(key) || 0;
                const currentStock = Math.max(0, Number(variant.stock) || 0);

                rows.push(buildIntelligenceRow({
                    product,
                    variant,
                    currentStock,
                    unitsSold,
                    windowDays,
                    leadTimeDays
                }));
            }
        } else {
            const key = buildSalesKey(product._id, '', '');
            const unitsSold = salesMap.get(key) || 0;
            const currentStock = Math.max(0, Number(product.stockQuantity ?? product.stock) || 0);

            rows.push(buildIntelligenceRow({
                product,
                currentStock,
                unitsSold,
                windowDays,
                leadTimeDays
            }));
        }
    }

    latestIntelligenceCache = {
        computedAt: new Date(),
        windowDays,
        leadTimeDays,
        products: rows
    };

    return latestIntelligenceCache;
}

function getCachedIntelligence() {
    return latestIntelligenceCache;
}

function getReorderNeededRows(snapshot = latestIntelligenceCache) {
    return (snapshot?.products || []).filter((row) => row.status === 'REORDER_NEEDED');
}

async function productHasOpenPoLine(supplierId, productMongoId, variantSku = '', variantId = '') {
    const openPos = await PurchaseOrder.find({
        supplierId,
        status: { $in: OPEN_PO_STATUSES }
    }).select('items').lean();

    const pid = String(productMongoId);
    const sku = String(variantSku || '').trim();
    const vid = String(variantId || '').trim();

    return openPos.some((po) => (po.items || []).some((item) => {
        if (String(item.productId) !== pid) return false;
        if (sku && String(item.variantSku || '').trim() === sku) return true;
        if (vid && String(item.variantId || '').trim() === vid) return true;
        return !sku && !vid;
    }));
}

async function resolveUnitCost(product) {
    const buying = Number(product.buyingPrice);
    if (Number.isFinite(buying) && buying >= 0) return buying;

    const history = Array.isArray(product.costHistory) ? product.costHistory : [];
    if (history.length) {
        const last = history[history.length - 1];
        const cost = Number(last?.cost);
        if (Number.isFinite(cost) && cost >= 0) return cost;
    }

    return Number(product.price) || 0;
}

async function appendItemsToDraftPo(draftPo, newItems) {
    const po = await PurchaseOrder.findById(draftPo._id);
    if (!po) return null;

    for (const item of newItems) {
        po.items.push(item);
    }
    po.totalCost = po.computeTotalCost();
    await po.save();

    try {
        await poRepo.upsertPurchaseOrderInPG(po);
    } catch (pgErr) {
        console.error('[DUAL-WRITE-PURCHASEORDER-FAIL] auto-po append:', pgErr.message || pgErr);
    }

    return po;
}

async function createDraftPoForSupplier(supplierId, items, meta = {}) {
    const supplier = await Supplier.findById(supplierId).select('name').lean();
    if (!supplier) {
        throw new Error(`Supplier ${supplierId} not found.`);
    }

    const warehouseId = await getDefaultWarehouseId();
    let purchaseOrder = null;

    for (let attempt = 0; attempt < 3 && !purchaseOrder; attempt += 1) {
        try {
            purchaseOrder = await PurchaseOrder.create({
                supplierId,
                warehouseId,
                items,
                status: 'draft',
                notes: String(meta.notes || 'Auto-generated from inventory intelligence.'),
                createdBy: meta.createdBy || null,
                createdByName: String(meta.createdByName || 'system'),
                poNumber: await PurchaseOrder.generatePoNumber()
            });
        } catch (err) {
            if (err?.code !== 11000 || attempt === 2) throw err;
        }
    }

    try {
        await poRepo.upsertPurchaseOrderInPG(purchaseOrder);
    } catch (pgErr) {
        console.error('[DUAL-WRITE-PURCHASEORDER-FAIL] auto-po create:', pgErr.message || pgErr);
    }

    return purchaseOrder;
}

/**
 * Group REORDER_NEEDED lines by supplier and create/extend draft POs.
 */
async function generateAutoDraftPurchaseOrders(options = {}) {
    const snapshot = options.snapshot || await scanInventoryIntelligence(options);
    const reorderRows = getReorderNeededRows(snapshot)
        .filter((row) => row.reorderSuggestedQuantity > 0);

    const grouped = new Map();
    for (const row of reorderRows) {
        if (!row.supplierId || !mongoose.Types.ObjectId.isValid(row.supplierId)) continue;
        if (!grouped.has(row.supplierId)) grouped.set(row.supplierId, []);
        grouped.get(row.supplierId).push(row);
    }

    const created = [];
    const skipped = [];
    const errors = [];

    for (const [supplierId, rows] of grouped.entries()) {
        const poItems = [];

        for (const row of rows) {
            const alreadyOpen = await productHasOpenPoLine(
                supplierId,
                row.productMongoId,
                row.variantSku,
                row.variantId
            );
            if (alreadyOpen) {
                skipped.push({
                    productMongoId: row.productMongoId,
                    productId: row.productId,
                    reason: 'open_po_exists'
                });
                continue;
            }

            const product = await Product.findById(row.productMongoId)
                .select('name buyingPrice price costHistory')
                .lean();
            if (!product) continue;

            const unitCost = await resolveUnitCost(product);
            poItems.push({
                productId: row.productMongoId,
                productName: row.name || product.name || '',
                qty: Math.max(1, row.reorderSuggestedQuantity),
                unitCost,
                receivedQty: 0,
                variantId: row.variantId || '',
                variantSku: row.variantSku || ''
            });
        }

        if (!poItems.length) continue;

        try {
            let existingDraft = await PurchaseOrder.findOne({
                supplierId,
                status: 'draft'
            }).sort({ createdAt: -1 });

            if (existingDraft) {
                const toAppend = [];
                for (const item of poItems) {
                    const dup = await productHasOpenPoLine(
                        supplierId,
                        item.productId,
                        item.variantSku,
                        item.variantId
                    );
                    if (!dup) toAppend.push(item);
                }

                if (toAppend.length) {
                    existingDraft = await appendItemsToDraftPo(existingDraft, toAppend);
                    created.push({
                        supplierId,
                        poId: String(existingDraft._id),
                        poNumber: existingDraft.poNumber,
                        mode: 'appended',
                        itemCount: toAppend.length
                    });
                }
            } else {
                const po = await createDraftPoForSupplier(supplierId, poItems, options);
                created.push({
                    supplierId,
                    poId: String(po._id),
                    poNumber: po.poNumber,
                    mode: 'created',
                    itemCount: poItems.length
                });
            }
        } catch (err) {
            errors.push({ supplierId, message: err.message || String(err) });
        }
    }

    return {
        computedAt: snapshot.computedAt,
        reorderNeededCount: reorderRows.length,
        purchaseOrders: created,
        skipped,
        errors
    };
}

module.exports = {
    DEFAULT_VELOCITY_DAYS,
    DEFAULT_LEAD_TIME_DAYS,
    OPEN_PO_STATUSES,
    calculateDailySalesVelocity,
    calculateDynamicRop,
    calculateTargetBufferStock,
    calculateReorderSuggestedQuantity,
    aggregateSalesFromOrders,
    scanInventoryIntelligence,
    getCachedIntelligence,
    getReorderNeededRows,
    generateAutoDraftPurchaseOrders,
    productHasOpenPoLine,
    buildSalesKey
};
