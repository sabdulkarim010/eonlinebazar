/********************************************************************
 * Project: EonlineBazar
 * File: attributeRepository.js
 * Location: backend/src/repositories/attributeRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for the Attribute model (PostgreSQL).
 *   Mirrors attributeController.js behavior for dual-write.
 *   Dual-write support — Stage 2 Step 3, Part 2.2 (2026-09-20).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

// ── Slug generation ───────────────────────────────────────────────────────────
// Replicates attribute.js slugify() exactly (same as brand)
function slugifyAttribute(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Status mapping ───────────────────────────────────────────────────────────
// Mongoose: 'active' | 'inactive'
// Prisma: ACTIVE | INACTIVE (ActiveStatus enum)
function toStatusEnum(value) {
  const v = String(value || '').toLowerCase();
  return v === 'inactive' ? 'INACTIVE' : 'ACTIVE';
}

function toMongoStatus(status) {
  return status === 'INACTIVE' ? 'inactive' : 'active';
}

// ── Shape normalisation ──────────────────────────────────────────────────────
// Returns a plain object shaped like Mongoose .lean() result
function toMongoShape(record) {
  if (!record) return null;
  return {
    _id: record.legacyId || record.id,
    id: record.id,
    legacyId: record.legacyId,
    name: record.name,
    slug: record.slug,
    values: record.values || [],
    status: toMongoStatus(record.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

// ── upsertAttributeInPG ──────────────────────────────────────────────────────
// Upserts by legacyId (MongoDB _id). Never throws.
async function upsertAttributeInPG(mongoDoc) {
  try {
    if (!mongoDoc || !mongoDoc._id) {
      console.error('[DUAL-WRITE-ATTRIBUTE-FAIL] Missing mongoDoc or _id');
      return null;
    }

    const legacyId = String(mongoDoc._id);

    const data = {
      name: String(mongoDoc.name || '').trim(),
      slug: mongoDoc.slug ? String(mongoDoc.slug).trim() : slugifyAttribute(mongoDoc.name),
      values: Array.isArray(mongoDoc.values) ? mongoDoc.values : [],
      status: toStatusEnum(mongoDoc.status),
      updatedAt: new Date()
    };

    const record = await prisma.attribute.upsert({
      where: { legacyId },
      create: { ...data, legacyId },
      update: data
    });

    return toMongoShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-ATTRIBUTE-FAIL]', {
      legacyId: String(mongoDoc?._id),
      name: mongoDoc?.name,
      error: err.message
    });
    return null;
  }
}

// ── getAttributeByMongoId ────────────────────────────────────────────────────
// Retrieves an attribute from PostgreSQL by its original MongoDB _id (legacyId).
// Returns null if not found. Never throws.
async function getAttributeByMongoId(mongoId) {
  try {
    if (!mongoId) return null;
    const record = await prisma.attribute.findUnique({
      where: { legacyId: String(mongoId) }
    });
    return toMongoShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-ATTRIBUTE-FAIL]', {
      operation: 'getAttributeByMongoId',
      mongoId: String(mongoId),
      error: err.message
    });
    return null;
  }
}

// ── listAttributesFromPG ─────────────────────────────────────────────────────
// Returns all attributes from PostgreSQL with optional filters.
// Returns empty array on error. Never throws.
async function listAttributesFromPG(filters = {}) {
  try {
    const where = {};
    if (filters.status !== undefined) {
      where.status = toStatusEnum(filters.status);
    }

    const records = await prisma.attribute.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }]
    });
    return records.map(toMongoShape);
  } catch (err) {
    console.error('[DUAL-WRITE-ATTRIBUTE-FAIL]', {
      operation: 'listAttributesFromPG',
      error: err.message
    });
    return [];
  }
}

// ── deleteAttributeInPG ──────────────────────────────────────────────────────
// Deletes an attribute from PostgreSQL by its original MongoDB _id (legacyId).
// Never throws — logs failure and returns silently (dual-write safety).
async function deleteAttributeInPG(mongoId) {
  try {
    if (!mongoId) return;
    await prisma.attribute.delete({
      where: { legacyId: String(mongoId) }
    });
  } catch (err) {
    // If not found, that's fine (idempotent delete)
    if (err.code === 'P2025') return;
    console.error('[DUAL-WRITE-ATTRIBUTE-FAIL]', {
      operation: 'delete',
      mongoId: String(mongoId),
      error: err.message
    });
  }
}

module.exports = {
  upsertAttributeInPG,
  getAttributeByMongoId,
  listAttributesFromPG,
  deleteAttributeInPG,
  slugifyAttribute
};
