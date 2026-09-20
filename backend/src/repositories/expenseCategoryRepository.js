/********************************************************************
 * Project: EonlineBazar — ERP Finance
 * File: expenseCategoryRepository.js
 * Location: backend/src/repositories/expenseCategoryRepository.js
 * Description: Prisma repository for ExpenseCategory dual-write pattern.
 *   Mirrors Mongoose ExpenseCategory model operations in PostgreSQL.
 *   All functions log failures but never throw to ensure MongoDB
 *   operations remain authoritative during Stage 2.
 * Stage 2 Step 3, Part 2.3 — 2026-09-20
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

// ── Helper: Convert Prisma record to Mongoose-like shape ──────────────────────
function toShape(record) {
  if (!record) return null;
  return { ...record, _id: record.legacyId || record.id };
}

// ── upsertExpenseCategoryInPG ─────────────────────────────────────────────────
/**
 * Upserts an ExpenseCategory into PostgreSQL using the MongoDB _id as legacyId.
 * @param {Object} mongoDoc - Mongoose ExpenseCategory document (.toObject() or .lean())
 * @returns {Promise<Object|null>} - Created/updated Prisma record or null on failure
 */
async function upsertExpenseCategoryInPG(mongoDoc) {
  try {
    if (!mongoDoc || !mongoDoc._id) {
      console.error('[DUAL-WRITE-EXPENSECATEGORY-FAIL] Missing mongoDoc or _id');
      return null;
    }

    const legacyId = String(mongoDoc._id);
    const data = {
      name: mongoDoc.name || '',
      slug: mongoDoc.slug || '',
      isActive: Boolean(mongoDoc.isActive),
      isSystemDefault: Boolean(mongoDoc.isSystemDefault),
      allowCustomInput: Boolean(mongoDoc.allowCustomInput)
    };

    const record = await prisma.expenseCategory.upsert({
      where: { legacyId },
      create: { legacyId, ...data },
      update: data
    });

    return record;
  } catch (err) {
    console.error('[DUAL-WRITE-EXPENSECATEGORY-FAIL]', err.message, mongoDoc._id);
    return null;
  }
}

// ── getExpenseCategoryByMongoId ───────────────────────────────────────────────
/**
 * Retrieves an ExpenseCategory by its MongoDB _id (legacyId in PG).
 * @param {string} mongoId - MongoDB ObjectId string
 * @returns {Promise<Object|null>} - Mongoose-shaped record or null
 */
async function getExpenseCategoryByMongoId(mongoId) {
  try {
    if (!mongoId) return null;

    const record = await prisma.expenseCategory.findUnique({
      where: { legacyId: String(mongoId) }
    });

    return toShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-EXPENSECATEGORY-FAIL] getByMongoId:', err.message);
    return null;
  }
}

// ── listExpenseCategoriesFromPG ───────────────────────────────────────────────
/**
 * Lists all expense categories from PostgreSQL.
 * @returns {Promise<Array>} - Array of Mongoose-shaped records
 */
async function listExpenseCategoriesFromPG() {
  try {
    const records = await prisma.expenseCategory.findMany({
      orderBy: [
        { isSystemDefault: 'desc' },
        { name: 'asc' }
      ]
    });

    return records.map(toShape);
  } catch (err) {
    console.error('[DUAL-WRITE-EXPENSECATEGORY-FAIL] list:', err.message);
    return [];
  }
}

// ── deleteExpenseCategoryInPG ─────────────────────────────────────────────────
/**
 * Deletes an ExpenseCategory from PostgreSQL by MongoDB _id.
 * @param {string} mongoId - MongoDB ObjectId string
 * @returns {Promise<boolean>} - true if deleted, false on failure
 */
async function deleteExpenseCategoryInPG(mongoId) {
  try {
    if (!mongoId) return false;

    await prisma.expenseCategory.delete({
      where: { legacyId: String(mongoId) }
    });

    return true;
  } catch (err) {
    // Silently handle not-found cases (already deleted or never existed)
    if (err.code === 'P2025') {
      return true; // Idempotent: treat not-found as success
    }
    console.error('[DUAL-WRITE-EXPENSECATEGORY-FAIL] delete:', err.message, mongoId);
    return false;
  }
}

module.exports = {
  upsertExpenseCategoryInPG,
  getExpenseCategoryByMongoId,
  listExpenseCategoriesFromPG,
  deleteExpenseCategoryInPG
};
