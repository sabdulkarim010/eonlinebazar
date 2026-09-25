/********************************************************************
 * Project: EonlineBazar
 * File: warehouseStockRepository.js
 * Location: backend/src/repositories/warehouseStockRepository.js
 * Description: Prisma repository for per-warehouse stock balances.
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveByLegacyId(model, mongoRef) {
    if (mongoRef == null || mongoRef === '') return null;
    const ref = String(mongoRef);

    let row = await prisma[model].findUnique({ where: { legacyId: ref } });
    if (row) return row.id;

    if (UUID_PATTERN.test(ref)) {
        row = await prisma[model].findUnique({ where: { id: ref } });
        if (row) return row.id;
    }

    return null;
}

function toShape(record) {
    if (!record) return null;
    return {
        ...record,
        _id: record.id
    };
}

async function upsertFromMongo(mongoStock) {
    const plain = typeof mongoStock.toObject === 'function'
        ? mongoStock.toObject()
        : mongoStock;

    const legacyWarehouseId = plain.warehouseId ? String(plain.warehouseId) : null;
    const legacyProductId = plain.productId ? String(plain.productId) : null;
    const variantSku = String(plain.variantSku || '');
    const variantId = String(plain.variantId || '');

    const [warehouseId, productId] = await Promise.all([
        resolveByLegacyId('warehouse', legacyWarehouseId),
        resolveByLegacyId('product', legacyProductId)
    ]);

    if (!warehouseId || !productId) {
        return null;
    }

    const data = {
        quantity: Number(plain.quantity) || 0,
        reservedStockQuantity: Number(plain.reservedStockQuantity) || 0,
        locationCode: String(plain.locationCode || ''),
        binLocation: String(plain.binLocation || ''),
        legacyId: String(plain._id)
    };

    const record = await prisma.warehouseStock.upsert({
        where: {
            warehouseId_productId_variantId_variantSku: {
                warehouseId,
                productId,
                variantId,
                variantSku
            }
        },
        create: {
            ...data,
            warehouseId,
            productId,
            legacyProductId,
            legacyWarehouseId,
            variantId,
            variantSku
        },
        update: data
    });

    return toShape(record);
}

async function findByWarehouseProduct(warehouseId, productId, variantSku = '', variantId = '') {
    const where = {
        warehouseId: String(warehouseId),
        productId: String(productId),
        variantSku: String(variantSku || ''),
        variantId: String(variantId || '')
    };

    const record = await prisma.warehouseStock.findFirst({ where });
    return toShape(record);
}

module.exports = {
    upsertFromMongo,
    findByWarehouseProduct
};
