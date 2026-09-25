/********************************************************************
 * Project: EonlineBazar
 * File: loyaltyLedgerRepository.js
 * Description: Prisma repository for immutable LoyaltyLedger entries.
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

const TYPE_MAP = {
    earned: 'EARNED',
    redeemed: 'REDEEMED',
    expired: 'EXPIRED',
    adjusted: 'ADJUSTED',
    cancelled_restored: 'CANCELLED_RESTORED'
};

const FROM_TYPE_MAP = Object.fromEntries(
    Object.entries(TYPE_MAP).map(([k, v]) => [v, k])
);

function toPrismaType(mongoType) {
    return TYPE_MAP[String(mongoType || '').toLowerCase()] || 'ADJUSTED';
}

function toMongoType(prismaType) {
    return FROM_TYPE_MAP[prismaType] || 'adjusted';
}

function toShape(record) {
    if (!record) return null;
    return {
        ...record,
        _id: record.legacyId || record.id,
        type: toMongoType(record.type),
        points: Number(record.points),
        balanceAfter: Number(record.balanceAfter)
    };
}

async function createFromMongo(mongoDoc) {
    try {
        if (!mongoDoc) return null;
        const plain = mongoDoc.toObject ? mongoDoc.toObject() : mongoDoc;

        const record = await prisma.loyaltyLedger.create({
            data: {
                userLegacyId: String(plain.userId),
                points: Number(plain.points) || 0,
                type: toPrismaType(plain.type),
                referenceId: plain.referenceId != null ? String(plain.referenceId) : null,
                description: String(plain.description || '').slice(0, 500),
                balanceAfter: Number(plain.balanceAfter) || 0,
                expiresAt: plain.expiresAt ? new Date(plain.expiresAt) : null,
                legacyId: plain._id != null ? String(plain._id) : null,
                createdAt: plain.createdAt ? new Date(plain.createdAt) : new Date()
            }
        });
        return toShape(record);
    } catch (err) {
        console.error('[DUAL-WRITE-LOYALTY-LEDGER-FAIL]', {
            legacyId: String(mongoDoc?._id),
            error: err.message
        });
        return null;
    }
}

async function findPaginatedByUserLegacyId(userLegacyId, { page = 1, limit = 20 } = {}) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const where = { userLegacyId: String(userLegacyId) };

    const [records, total] = await Promise.all([
        prisma.loyaltyLedger.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: safeLimit
        }),
        prisma.loyaltyLedger.count({ where })
    ]);

    return {
        data: records.map(toShape),
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            totalPages: Math.ceil(total / safeLimit) || 1
        }
    };
}

async function findExpiredEarnedEntries(cutoffDate, { limit = 100, skip = 0 } = {}) {
    const records = await prisma.loyaltyLedger.findMany({
        where: {
            type: 'EARNED',
            expiresAt: { lte: cutoffDate }
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit
    });
    return records.map(toShape);
}

async function hasExpiredEntryForReference(referenceId) {
    if (!referenceId) return false;
    const count = await prisma.loyaltyLedger.count({
        where: {
            type: 'EXPIRED',
            referenceId: String(referenceId)
        }
    });
    return count > 0;
}

module.exports = {
    createFromMongo,
    findPaginatedByUserLegacyId,
    findExpiredEarnedEntries,
    hasExpiredEntryForReference
};
