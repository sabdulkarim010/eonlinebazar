/********************************************************************
 * Project: EonlineBazar — ERP Finance
 * File: expenseRepository.js
 * Location: backend/src/repositories/expenseRepository.js
 * Description: Prisma repository for Expense dual-write pattern.
 *   Mirrors Mongoose Expense model operations in PostgreSQL.
 *   Includes Prisma aggregate functions to replace MongoDB aggregations
 *   for expense reports and analytics.
 *   All functions log failures but never throw to ensure MongoDB
 *   operations remain authoritative during Stage 2.
 * Stage 2 Step 3, Part 2.3 — 2026-09-20
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

// ── Helper: Convert Prisma record to Mongoose-like shape ──────────────────────
function toShape(record) {
  if (!record) return null;
  const shaped = { ...record, _id: record.legacyId || record.id };
  // Convert Decimal to number for compatibility
  if (shaped.amount && typeof shaped.amount.toNumber === 'function') {
    shaped.amount = shaped.amount.toNumber();
  }
  return shaped;
}

// ── upsertExpenseInPG ─────────────────────────────────────────────────────────
/**
 * Upserts an Expense into PostgreSQL using the MongoDB _id as legacyId.
 * @param {Object} mongoDoc - Mongoose Expense document (.toObject() or .lean())
 * @returns {Promise<Object|null>} - Created/updated Prisma record or null on failure
 */
async function upsertExpenseInPG(mongoDoc) {
  try {
    if (!mongoDoc || !mongoDoc._id) {
      console.error('[DUAL-WRITE-EXPENSE-FAIL] Missing mongoDoc or _id');
      return null;
    }

    const legacyId = String(mongoDoc._id);
    const data = {
      category: mongoDoc.category || '',
      customCategoryName: mongoDoc.customCategoryName || '',
      amount: mongoDoc.amount != null ? Number(mongoDoc.amount) : 0,
      description: mongoDoc.description || '',
      date: mongoDoc.date ? new Date(mongoDoc.date) : new Date(),
      reference: mongoDoc.reference || '',
      recordedBy: mongoDoc.recordedBy || '',
      attachmentUrl: mongoDoc.attachmentUrl || ''
    };

    const record = await prisma.expense.upsert({
      where: { legacyId },
      create: { legacyId, ...data },
      update: data
    });

    return toShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-EXPENSE-FAIL]', err.message, mongoDoc._id);
    return null;
  }
}

// ── getExpenseByMongoId ───────────────────────────────────────────────────────
/**
 * Retrieves an Expense by its MongoDB _id (legacyId in PG).
 * @param {string} mongoId - MongoDB ObjectId string
 * @returns {Promise<Object|null>} - Mongoose-shaped record or null
 */
async function getExpenseByMongoId(mongoId) {
  try {
    if (!mongoId) return null;

    const record = await prisma.expense.findUnique({
      where: { legacyId: String(mongoId) }
    });

    return toShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-EXPENSE-FAIL] getByMongoId:', err.message);
    return null;
  }
}

// ── listExpensesFromPG ────────────────────────────────────────────────────────
/**
 * Lists expenses from PostgreSQL with optional filters.
 * @param {Object} filters - { dateFrom?, dateTo?, categoryId? }
 * @returns {Promise<Array>} - Array of Mongoose-shaped records
 */
async function listExpensesFromPG(filters = {}) {
  try {
    const where = {};

    // Date range filters
    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        from.setHours(0, 0, 0, 0);
        where.date.gte = from;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        where.date.lte = to;
      }
    }

    // Category filter (by slug)
    if (filters.category) {
      where.category = filters.category;
    }

    // ExpenseCategory FK filter
    if (filters.categoryId) {
      where.expenseCategoryId = filters.categoryId;
    }

    const records = await prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' }
    });

    return records.map(toShape);
  } catch (err) {
    console.error('[DUAL-WRITE-EXPENSE-FAIL] list:', err.message);
    return [];
  }
}

// ── getExpenseSummaryByCategory ───────────────────────────────────────────────
/**
 * Aggregates total expenses grouped by category for a date range.
 * Replaces MongoDB $group aggregation.
 * @param {Date} dateFrom - Start date (inclusive)
 * @param {Date} dateTo - End date (inclusive)
 * @returns {Promise<Array>} - [{ category, total }, ...]
 */
async function getExpenseSummaryByCategory(dateFrom, dateTo) {
  try {
    const where = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      where.date = { ...where.date, gte: from };
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      where.date = { ...where.date, lte: to };
    }

    const grouped = await prisma.expense.groupBy({
      by: ['category'],
      where,
      _sum: {
        amount: true
      }
    });

    // Transform to { category, total } shape matching MongoDB aggregate output
    return grouped.map(g => ({
      category: g.category,
      total: g._sum.amount ? parseFloat(g._sum.amount.toString()) : 0
    }));
  } catch (err) {
    console.error('[DUAL-WRITE-EXPENSE-FAIL] getExpenseSummaryByCategory:', err.message);
    return [];
  }
}

// ── getTotalExpensesByDateRange ───────────────────────────────────────────────
/**
 * Calculates total expenses for a date range.
 * Replaces MongoDB $sum aggregation.
 * @param {Date} dateFrom - Start date (inclusive)
 * @param {Date} dateTo - End date (inclusive)
 * @returns {Promise<number>} - Total amount
 */
async function getTotalExpensesByDateRange(dateFrom, dateTo) {
  try {
    const where = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      where.date = { ...where.date, gte: from };
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      where.date = { ...where.date, lte: to };
    }

    const result = await prisma.expense.aggregate({
      where,
      _sum: {
        amount: true
      }
    });

    return result._sum.amount ? parseFloat(result._sum.amount.toString()) : 0;
  } catch (err) {
    console.error('[DUAL-WRITE-EXPENSE-FAIL] getTotalExpensesByDateRange:', err.message);
    return 0;
  }
}

// ── getTotalExpensesAllFromPG ─────────────────────────────────────────────────
/**
 * Sum of all expense amounts (no date filter).
 * Replaces MongoDB Expense.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]).
 * @returns {Promise<number>}
 */
async function getTotalExpensesAllFromPG() {
  try {
    const result = await prisma.expense.aggregate({
      _sum: { amount: true }
    });
    return result._sum.amount ? parseFloat(result._sum.amount.toString()) : 0;
  } catch (err) {
    console.error('[DUAL-WRITE-EXPENSE-FAIL] getTotalExpensesAllFromPG:', err.message);
    return 0;
  }
}

// ── deleteExpenseInPG ─────────────────────────────────────────────────────────
/**
 * Deletes an Expense from PostgreSQL by MongoDB _id.
 * @param {string} mongoId - MongoDB ObjectId string
 * @returns {Promise<boolean>} - true if deleted, false on failure
 */
async function deleteExpenseInPG(mongoId) {
  try {
    if (!mongoId) return false;

    await prisma.expense.delete({
      where: { legacyId: String(mongoId) }
    });

    return true;
  } catch (err) {
    // Silently handle not-found cases (already deleted or never existed)
    if (err.code === 'P2025') {
      return true; // Idempotent: treat not-found as success
    }
    console.error('[DUAL-WRITE-EXPENSE-FAIL] delete:', err.message, mongoId);
    return false;
  }
}

module.exports = {
  upsertExpenseInPG,
  getExpenseByMongoId,
  listExpensesFromPG,
  getExpenseSummaryByCategory,
  getTotalExpensesByDateRange,
  getTotalExpensesAllFromPG,
  deleteExpenseInPG
};
