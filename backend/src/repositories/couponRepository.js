/********************************************************************
 * Project: EonlineBazar
 * File: couponRepository.js
 * Location: backend/src/repositories/couponRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for Coupon and CouponRedemption models (PostgreSQL).
 *   Mirrors couponController.js behavior for dual-write.
 *   Dual-write support — Stage 2 Step 3, Part 2.1 (2026-09-20).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

// ── Type mapping ─────────────────────────────────────────────────────────────
// Mongoose: 'percentage' | 'flat'
// Prisma: PERCENTAGE | FLAT
function toDiscountTypeEnum(mongoType) {
  const normalized = String(mongoType || 'percentage').toLowerCase();
  return normalized === 'flat' ? 'FLAT' : 'PERCENTAGE';
}

function toMongoDiscountType(prismaType) {
  return prismaType === 'FLAT' ? 'flat' : 'percentage';
}

// Mongoose: 'ACTIVE' | 'EXPIRED'
// Prisma: ACTIVE | EXPIRED
function toStatusEnum(mongoStatus) {
  const normalized = String(mongoStatus || 'ACTIVE').toUpperCase();
  return normalized === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE';
}

function toMongoStatus(prismaStatus) {
  return prismaStatus === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE';
}

// ── Shape normalisation ──────────────────────────────────────────────────────
// Returns a plain object shaped like Mongoose .lean() result
function toMongoShape(record) {
  if (!record) return null;
  return {
    _id: record.legacyId || record.id,
    id: record.id,
    legacyId: record.legacyId,
    code: record.code,
    discountType: toMongoDiscountType(record.discountType),
    discountValue: Number(record.discountValue),
    minOrderAmount: Number(record.minOrderAmount),
    maxDiscountAmount: record.maxDiscountAmount ? Number(record.maxDiscountAmount) : null,
    expiryDate: record.expiryDate,
    status: toMongoStatus(record.status),
    usageLimit: record.usageLimit,
    usedCount: record.usedCount,
    perUserLimit: record.perUserLimit,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

// ── upsertCouponInPG ─────────────────────────────────────────────────────────
// Upserts by legacyId (MongoDB _id). Never throws.
async function upsertCouponInPG(mongoDoc) {
  try {
    if (!mongoDoc || !mongoDoc._id) {
      console.error('[DUAL-WRITE-COUPON-FAIL] Missing mongoDoc or _id');
      return null;
    }

    const legacyId = String(mongoDoc._id);

    const data = {
      code: String(mongoDoc.code || '').trim().toUpperCase(),
      discountType: toDiscountTypeEnum(mongoDoc.discountType),
      discountValue: Number(mongoDoc.discountValue) || 0,
      minOrderAmount: Number(mongoDoc.minOrderAmount) || 0,
      maxDiscountAmount: mongoDoc.maxDiscountAmount != null ? Number(mongoDoc.maxDiscountAmount) : null,
      expiryDate: mongoDoc.expiryDate ? new Date(mongoDoc.expiryDate) : new Date(),
      status: toStatusEnum(mongoDoc.status),
      usageLimit: Number(mongoDoc.usageLimit) || 1,
      usedCount: Number(mongoDoc.usedCount) || 0,
      perUserLimit: Number(mongoDoc.perUserLimit) || 1,
      isActive: mongoDoc.isActive === true || mongoDoc.status === 'ACTIVE',
      updatedAt: new Date()
    };

    const record = await prisma.coupon.upsert({
      where: { legacyId },
      create: { ...data, legacyId },
      update: data
    });

    return toMongoShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-COUPON-FAIL]', {
      legacyId: String(mongoDoc?._id),
      code: mongoDoc?.code,
      error: err.message
    });
    return null;
  }
}

// ── getCouponByCode ──────────────────────────────────────────────────────────
// Retrieves an active coupon by code. Returns null if not found. Never throws.
async function getCouponByCode(code) {
  try {
    if (!code) return null;
    const normalizedCode = String(code).trim().toUpperCase();
    const record = await prisma.coupon.findUnique({
      where: { code: normalizedCode }
    });
    return toMongoShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-COUPON-FAIL]', {
      operation: 'getCouponByCode',
      code: String(code),
      error: err.message
    });
    return null;
  }
}

// ── getCouponByMongoId ───────────────────────────────────────────────────────
// Retrieves a coupon from PostgreSQL by its original MongoDB _id (legacyId).
// Returns null if not found. Never throws.
async function getCouponByMongoId(mongoId) {
  try {
    if (!mongoId) return null;
    const record = await prisma.coupon.findUnique({
      where: { legacyId: String(mongoId) }
    });
    return toMongoShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-COUPON-FAIL]', {
      operation: 'getCouponByMongoId',
      mongoId: String(mongoId),
      error: err.message
    });
    return null;
  }
}

// ── listCouponsFromPG ────────────────────────────────────────────────────────
// Returns all coupons from PostgreSQL with optional filters.
// Returns empty array on error. Never throws.
async function listCouponsFromPG(filters = {}) {
  try {
    const where = {};
    if (filters.isActive !== undefined) {
      where.isActive = Boolean(filters.isActive);
    }
    if (filters.status !== undefined) {
      where.status = toStatusEnum(filters.status);
    }

    const records = await prisma.coupon.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }]
    });
    return records.map(toMongoShape);
  } catch (err) {
    console.error('[DUAL-WRITE-COUPON-FAIL]', {
      operation: 'listCouponsFromPG',
      error: err.message
    });
    return [];
  }
}

// ── deactivateCouponInPG ─────────────────────────────────────────────────────
// Sets isActive to false and status to EXPIRED for a coupon.
// Never throws — logs failure and returns silently (dual-write safety).
async function deactivateCouponInPG(mongoId) {
  try {
    if (!mongoId) return;
    await prisma.coupon.update({
      where: { legacyId: String(mongoId) },
      data: {
        isActive: false,
        status: 'EXPIRED',
        updatedAt: new Date()
      }
    });
  } catch (err) {
    // If not found, that's fine (idempotent deactivate)
    if (err.code === 'P2025') return;
    console.error('[DUAL-WRITE-COUPON-FAIL]', {
      operation: 'deactivate',
      mongoId: String(mongoId),
      error: err.message
    });
  }
}

// ── deleteCouponInPG ─────────────────────────────────────────────────────────
// Deletes a coupon from PostgreSQL by its original MongoDB _id (legacyId).
// Never throws — logs failure and returns silently (dual-write safety).
async function deleteCouponInPG(mongoId) {
  try {
    if (!mongoId) return;
    await prisma.coupon.delete({
      where: { legacyId: String(mongoId) }
    });
  } catch (err) {
    // If not found, that's fine (idempotent delete)
    if (err.code === 'P2025') return;
    console.error('[DUAL-WRITE-COUPON-FAIL]', {
      operation: 'delete',
      mongoId: String(mongoId),
      error: err.message
    });
  }
}

// ── upsertCouponRedemptionInPG ───────────────────────────────────────────────
// Creates a CouponRedemption record tracking when a user redeems a coupon.
// This corresponds to Mongoose's usedBy[] array push.
// Never throws — logs failure and returns silently.
async function upsertCouponRedemptionInPG(redemptionData) {
  try {
    if (!redemptionData || !redemptionData.couponId || !redemptionData.userId) {
      console.error('[DUAL-WRITE-COUPON-FAIL] Missing redemption couponId or userId');
      return null;
    }

    // Find the PG coupon by legacyId (if mongoId is provided) or by PG id
    let couponId = redemptionData.couponId;
    if (redemptionData.isMongoId) {
      const coupon = await prisma.coupon.findUnique({
        where: { legacyId: String(redemptionData.couponId) },
        select: { id: true }
      });
      if (!coupon) {
        console.error('[DUAL-WRITE-COUPON-FAIL] Coupon not found for redemption', {
          mongoCouponId: redemptionData.couponId
        });
        return null;
      }
      couponId = coupon.id;
    }

    // Find the PG user by legacyId (if mongoId is provided) or by PG id
    let userId = redemptionData.userId;
    if (redemptionData.isMongoUserId) {
      const user = await prisma.user.findUnique({
        where: { legacyId: String(redemptionData.userId) },
        select: { id: true }
      });
      if (!user) {
        console.error('[DUAL-WRITE-COUPON-FAIL] User not found for redemption', {
          mongoUserId: redemptionData.userId
        });
        return null;
      }
      userId = user.id;
    }

    const record = await prisma.couponRedemption.create({
      data: {
        couponId,
        userId,
        redeemedAt: redemptionData.redeemedAt ? new Date(redemptionData.redeemedAt) : new Date()
      }
    });

    return record;
  } catch (err) {
    console.error('[DUAL-WRITE-COUPON-FAIL]', {
      operation: 'upsertRedemption',
      couponId: redemptionData?.couponId,
      userId: redemptionData?.userId,
      error: err.message
    });
    return null;
  }
}

module.exports = {
  upsertCouponInPG,
  getCouponByCode,
  getCouponByMongoId,
  listCouponsFromPG,
  deactivateCouponInPG,
  deleteCouponInPG,
  upsertCouponRedemptionInPG
};
