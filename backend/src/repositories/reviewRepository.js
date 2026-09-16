/********************************************************************
 * Project: EonlineBazar
 * File: reviewRepository.js
 * Location: backend/src/repositories/reviewRepository.js
 * Description: Prisma repository for standalone Review rows.
 *   Cross-model FK resolution (User, Product) via legacyId with null fallback.
 *   Stage 2 Step 3, Part 6 — Marketing/Support dual-write (2026-09-14).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

function toShape(record) {
  if (!record) return null;
  return { ...record, _id: record.id };
}

function logFkMissing(field, mongoRefId) {
  console.error('[DUAL-WRITE-FK-MISSING]', {
    timestamp: new Date().toISOString(),
    model: 'Review',
    field,
    mongoRefId: String(mongoRefId),
    message: `${field === 'userId' ? 'User' : 'Product'} not yet in Postgres`
  });
}

async function resolveUserId(mongoUserId) {
  const ref = String(mongoUserId || '').trim();
  if (!ref) return null;

  const row = await prisma.user.findUnique({ where: { legacyId: ref } });
  if (!row) {
    logFkMissing('userId', ref);
    return null;
  }
  return row.id;
}

async function resolveProductId(mongoProductRef) {
  const ref = String(mongoProductRef || '').trim();
  if (!ref) return null;

  let row = await prisma.product.findUnique({ where: { legacyId: ref } });
  if (!row) row = await prisma.product.findUnique({ where: { productId: ref } });
  if (!row) {
    logFkMissing('productId', ref);
    return null;
  }
  return row.id;
}

async function mapMongoToWrite(mongoDoc) {
  const plain = mongoDoc.toObject ? mongoDoc.toObject() : mongoDoc;
  const userRef = plain.userId?._id || plain.userId || null;
  const productRef = plain.productId || null;

  return {
    userId: await resolveUserId(userRef),
    productId: await resolveProductId(productRef),
    legacyProductId: String(productRef || ''),
    legacyOrderId: String(plain.orderId || ''),
    rating: Number(plain.rating) || 0,
    comment: String(plain.comment || '').trim(),
    photo: String(plain.photo || ''),
    isSandbox: plain.isSandbox === true,
    isHidden: plain.isHidden === true,
    adminNote: String(plain.adminNote || ''),
    moderatedAt: plain.moderatedAt ? new Date(plain.moderatedAt) : null,
    legacyId: mongoDoc._id != null ? String(mongoDoc._id) : null
  };
}

async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.review.findUnique({
    where: { legacyId: String(legacyId) }
  });
  return toShape(record);
}

async function buildReviewWhere(filters = {}) {
  const where = {};
  if (filters.productId) where.legacyProductId = String(filters.productId);
  if (filters.orderId) where.legacyOrderId = String(filters.orderId);
  if (filters.userId) {
    const pgUser = await resolveUserId(filters.userId);
    if (pgUser) where.userId = pgUser;
    else where.legacyId = '__no_match__';
  }
  if (filters.isHidden === true) where.isHidden = true;
  else if (filters.isHidden === false) where.isHidden = false;
  if (filters.rating !== undefined && filters.rating !== '') {
    where.rating = Number(filters.rating);
  }
  if (filters.search) {
    where.comment = { contains: String(filters.search), mode: 'insensitive' };
  }
  return where;
}

async function count(filters = {}) {
  const where = await buildReviewWhere(filters);
  return prisma.review.count({ where });
}

async function findPaginated(filters = {}, { skip = 0, take = 20 } = {}) {
  const where = await buildReviewWhere(filters);
  const records = await prisma.review.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip,
    take
  });
  return records.map(toShape);
}

async function findAll(filters = {}) {
  const where = await buildReviewWhere(filters);
  const records = await prisma.review.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: filters.limit != null ? Number(filters.limit) : undefined
  });
  return records.map(toShape);
}

async function create(data) {
  const rating = Number(data.rating);
  const comment = String(data.comment || '').trim();
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error('Review rating must be between 1 and 5.');
  }
  if (!comment) throw new Error('Review comment is required.');

  const userRef = data.userId?._id || data.userId || null;
  const productRef = data.productId || data.legacyProductId || null;

  const record = await prisma.review.create({
    data: {
      userId: data.userId && !data.userIdRef
        ? data.userId
        : await resolveUserId(userRef),
      productId: data.productId && !data.productIdRef
        ? data.productId
        : await resolveProductId(productRef),
      legacyProductId: String(data.legacyProductId || productRef || ''),
      legacyOrderId: String(data.legacyOrderId || data.orderId || ''),
      rating,
      comment,
      photo: String(data.photo || ''),
      isSandbox: data.isSandbox === true,
      isHidden: data.isHidden === true,
      adminNote: String(data.adminNote || ''),
      moderatedAt: data.moderatedAt ? new Date(data.moderatedAt) : null,
      legacyId: data.legacyId != null ? String(data.legacyId) : null
    }
  });
  return toShape(record);
}

async function update(id, data) {
  const existing = await prisma.review.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Review not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  if (data.rating !== undefined) fields.rating = Number(data.rating);
  if (data.comment !== undefined) fields.comment = String(data.comment).trim();
  if (data.photo !== undefined) fields.photo = String(data.photo);
  if (data.isSandbox !== undefined) fields.isSandbox = Boolean(data.isSandbox);
  if (data.isHidden !== undefined) fields.isHidden = Boolean(data.isHidden);
  if (data.adminNote !== undefined) fields.adminNote = String(data.adminNote);
  if (data.moderatedAt !== undefined) {
    fields.moderatedAt = data.moderatedAt ? new Date(data.moderatedAt) : null;
  }

  const record = await prisma.review.update({ where: { id }, data: fields });
  return toShape(record);
}

async function upsertFromMongo(mongoDoc) {
  const mapped = await mapMongoToWrite(mongoDoc);
  const legacyId = mapped.legacyId;
  if (!legacyId) throw new Error('Review legacyId is required for upsert.');

  const existing = await prisma.review.findUnique({ where: { legacyId } });
  if (existing) {
    const record = await prisma.review.update({
      where: { id: existing.id },
      data: mapped
    });
    return toShape(record);
  }

  const record = await prisma.review.create({ data: mapped });
  return toShape(record);
}

async function remove(id) {
  const existing = await prisma.review.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Review not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await prisma.review.delete({ where: { id } });
  return { deleted: true, legacyProductId: existing.legacyProductId };
}

module.exports = {
  findByLegacyId,
  findAll,
  findPaginated,
  count,
  buildReviewWhere,
  create,
  update,
  upsertFromMongo,
  remove,
  mapMongoToWrite,
  resolveUserId,
  resolveProductId,
  logFkMissing
};
