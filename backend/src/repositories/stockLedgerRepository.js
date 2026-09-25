/********************************************************************
 * Project: EonlineBazar
 * File: stockLedgerRepository.js
 * Location: backend/src/repositories/stockLedgerRepository.js
 * Description: Prisma repository for immutable StockLedger rows.
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

function toMovementEnum(value) {
    const key = String(value || 'MANUAL_ADJUSTMENT').trim().toUpperCase();
    const allowed = new Set([
        'SALE', 'RETURN', 'PO_RECEIPT', 'DAMAGE_WRITE_OFF',
        'MANUAL_ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'RESERVATION'
    ]);
    return allowed.has(key) ? key : 'MANUAL_ADJUSTMENT';
}

function toShape(record) {
    if (!record) return null;
    return {
        ...record,
        _id: record.id
    };
}

async function createFromMongo(mongoLedger) {
    const plain = typeof mongoLedger.toObject === 'function'
        ? mongoLedger.toObject()
        : mongoLedger;

    const [productId, warehouseId, performedById] = await Promise.all([
        resolveByLegacyId('product', plain.productId),
        resolveByLegacyId('warehouse', plain.warehouseId),
        resolveByLegacyId('admin', plain.performedBy)
    ]);

    const record = await prisma.stockLedger.create({
        data: {
            legacyId: String(plain._id),
            productId,
            legacyProductId: plain.productId ? String(plain.productId) : null,
            variantId: String(plain.variantId || ''),
            variantSku: String(plain.variantSku || ''),
            warehouseId,
            legacyWarehouseId: plain.warehouseId ? String(plain.warehouseId) : null,
            changeQuantity: Number(plain.changeQuantity) || 0,
            previousQuantity: Number(plain.previousQuantity) || 0,
            newQuantity: Number(plain.newQuantity) || 0,
            movementType: toMovementEnum(plain.movementType),
            referenceId: String(plain.referenceId || ''),
            referenceType: String(plain.referenceType || ''),
            performedById,
            binLocation: String(plain.binLocation || ''),
            notes: String(plain.notes || ''),
            createdAt: plain.createdAt ? new Date(plain.createdAt) : new Date()
        }
    });

    return toShape(record);
}

async function findByReference(referenceId, movementType) {
    const where = { referenceId: String(referenceId || '') };
    if (movementType) where.movementType = String(movementType).toUpperCase();

    const records = await prisma.stockLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' }
    });
    return records.map(toShape);
}

module.exports = {
    createFromMongo,
    findByReference
};
