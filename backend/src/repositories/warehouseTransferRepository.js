/********************************************************************
 * Project: EonlineBazar
 * File: warehouseTransferRepository.js
 * Location: backend/src/repositories/warehouseTransferRepository.js
 * Description: Prisma repository for inter-warehouse transfers.
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

function normaliseStatus(status) {
    const value = String(status || 'draft').toLowerCase();
    const map = {
        draft: 'DRAFT',
        in_transit: 'IN_TRANSIT',
        received: 'RECEIVED',
        discrepancy: 'DISCREPANCY'
    };
    return map[value] || 'DRAFT';
}

function denormaliseStatus(status) {
    const map = {
        DRAFT: 'draft',
        IN_TRANSIT: 'in_transit',
        RECEIVED: 'received',
        DISCREPANCY: 'discrepancy'
    };
    return map[status] || String(status || '').toLowerCase();
}

function toShape(record) {
    if (!record) return null;
    return {
        ...record,
        _id: record.id,
        status: denormaliseStatus(record.status),
        items: Array.isArray(record.items)
            ? record.items.map((item) => ({
                ...item,
                productId: item.legacyProductId || item.productId
            }))
            : []
    };
}

async function createFromMongo(mongoTransfer) {
    const plain = typeof mongoTransfer.toObject === 'function'
        ? mongoTransfer.toObject()
        : mongoTransfer;

    const record = await prisma.warehouseTransfer.create({
        data: {
            legacyId: String(plain._id),
            transferNumber: plain.transferNumber,
            sourceWarehouseId: plain.sourceWarehouseId ? String(plain.sourceWarehouseId) : null,
            destinationWarehouseId: plain.destinationWarehouseId ? String(plain.destinationWarehouseId) : null,
            legacySourceWarehouseId: plain.sourceWarehouseId ? String(plain.sourceWarehouseId) : null,
            legacyDestinationWarehouseId: plain.destinationWarehouseId ? String(plain.destinationWarehouseId) : null,
            status: normaliseStatus(plain.status),
            notes: String(plain.notes || ''),
            discrepancyDetails: plain.discrepancyDetails || null,
            shippedAt: plain.shippedAt ? new Date(plain.shippedAt) : null,
            receivedAt: plain.receivedAt ? new Date(plain.receivedAt) : null,
            createdById: plain.createdBy ? String(plain.createdBy) : null,
            createdByName: String(plain.createdByName || ''),
            items: {
                create: (plain.items || []).map((item) => ({
                    legacyProductId: item.productId ? String(item.productId) : null,
                    productName: String(item.productName || ''),
                    variantId: String(item.variantId || ''),
                    variantSku: String(item.variantSku || ''),
                    qty: Number(item.qty) || 0,
                    shippedQty: Number(item.shippedQty) || 0,
                    receivedQty: Number(item.receivedQty) || 0,
                    binLocation: String(item.binLocation || ''),
                    locationCode: String(item.locationCode || '')
                }))
            }
        },
        include: { items: true }
    });

    return toShape(record);
}

async function updateFromMongo(mongoTransfer) {
    const plain = typeof mongoTransfer.toObject === 'function'
        ? mongoTransfer.toObject()
        : mongoTransfer;

    const pgRow = await prisma.warehouseTransfer.findUnique({
        where: { legacyId: String(plain._id) },
        include: { items: true }
    });
    if (!pgRow) {
        return createFromMongo(mongoTransfer);
    }

    await prisma.warehouseTransferItem.deleteMany({
        where: { warehouseTransferId: pgRow.id }
    });

    const record = await prisma.warehouseTransfer.update({
        where: { id: pgRow.id },
        data: {
            status: normaliseStatus(plain.status),
            notes: String(plain.notes || ''),
            discrepancyDetails: plain.discrepancyDetails || null,
            shippedAt: plain.shippedAt ? new Date(plain.shippedAt) : null,
            receivedAt: plain.receivedAt ? new Date(plain.receivedAt) : null,
            items: {
                create: (plain.items || []).map((item) => ({
                    legacyProductId: item.productId ? String(item.productId) : null,
                    productName: String(item.productName || ''),
                    variantId: String(item.variantId || ''),
                    variantSku: String(item.variantSku || ''),
                    qty: Number(item.qty) || 0,
                    shippedQty: Number(item.shippedQty) || 0,
                    receivedQty: Number(item.receivedQty) || 0,
                    binLocation: String(item.binLocation || ''),
                    locationCode: String(item.locationCode || '')
                }))
            }
        },
        include: { items: true }
    });

    return toShape(record);
}

async function listFromPG(filters = {}) {
    const where = {};
    if (filters.status) where.status = normaliseStatus(filters.status);

    const records = await prisma.warehouseTransfer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(Number(filters.limit) || 50, 1), 200),
        include: { items: true }
    });

    return records.map(toShape);
}

async function findByIdFromPG(id) {
    const record = await prisma.warehouseTransfer.findFirst({
        where: {
            OR: [{ id: String(id) }, { legacyId: String(id) }]
        },
        include: { items: true }
    });
    return toShape(record);
}

module.exports = {
    createFromMongo,
    updateFromMongo,
    listFromPG,
    findByIdFromPG
};
