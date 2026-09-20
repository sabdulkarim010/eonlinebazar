// Run: cd backend && node scripts/backfill/backfillExpenses.js

/********************************************************************
 * Backfill Script: Expenses (MongoDB → PostgreSQL)
 * Stage 2 Step 3, Part 2.3 — 2026-09-20
 *
 * Idempotent batch upsert of all Expense records from MongoDB
 * into Neon Postgres using legacyId as the reconciliation key.
 ********************************************************************/

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const prisma = require('../../src/config/prismaClient');
const Expense = require('../../src/models/expense');
const { upsertExpenseInPG } = require('../../src/repositories/expenseRepository');

const BATCH_SIZE = 100;

async function backfillExpenses() {
  console.log('[BACKFILL-EXPENSE] Starting backfill...');

  try {
    // Connect to MongoDB
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
      console.log('[BACKFILL-EXPENSE] Connected to MongoDB');
    }

    const total = await Expense.countDocuments();
    console.log(`[BACKFILL-EXPENSE] Total expenses in MongoDB: ${total}`);

    if (total === 0) {
      console.log('[BACKFILL-EXPENSE] No expenses found — nothing to backfill');
      return { total: 0, success: 0, failed: 0, skipped: 0 };
    }

    let processed = 0;
    let success = 0;
    let failed = 0;
    let skipped = 0;
    let batchNum = 0;

    const cursor = Expense.find().lean().cursor();

    let batch = [];
    for await (const doc of cursor) {
      batch.push(doc);

      if (batch.length >= BATCH_SIZE) {
        batchNum++;
        const result = await processBatch(batch, batchNum, total);
        processed += result.processed;
        success += result.success;
        failed += result.failed;
        skipped += result.skipped;
        batch = [];
      }
    }

    // Process remaining
    if (batch.length > 0) {
      batchNum++;
      const result = await processBatch(batch, batchNum, total);
      processed += result.processed;
      success += result.success;
      failed += result.failed;
      skipped += result.skipped;
    }

    console.log('\n[BACKFILL-EXPENSE] ========== SUMMARY ==========');
    console.log(`✅ Total: ${total}`);
    console.log(`✅ Success: ${success}`);
    console.log(`⚠️  Skipped: ${skipped}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('[BACKFILL-EXPENSE] Backfill complete!');

    return { total, success, failed, skipped };
  } catch (err) {
    console.error('[BACKFILL-EXPENSE] Fatal error:', err);
    throw err;
  }
}

async function processBatch(docs, batchNum, total) {
  console.log(`[BACKFILL-EXPENSE] Batch ${batchNum} — Processing ${docs.length} records...`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const doc of docs) {
    try {
      if (!doc._id) {
        skipped++;
        continue;
      }

      const result = await upsertExpenseInPG(doc);
      if (result) {
        success++;
      } else {
        failed++;
        console.error(`[BACKFILL-EXPENSE-FAIL] mongoId: ${doc._id} | Failed to upsert`);
      }
    } catch (err) {
      failed++;
      console.error(`[BACKFILL-EXPENSE-FAIL] mongoId: ${doc._id} | error: ${err.message}`);
    }
  }

  console.log(`[BACKFILL-EXPENSE] Batch ${batchNum} complete — Success: ${success}, Failed: ${failed}, Skipped: ${skipped}`);

  return { processed: docs.length, success, failed, skipped };
}

// ── Main ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  backfillExpenses()
    .then(() => {
      console.log('[BACKFILL-EXPENSE] Script finished successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[BACKFILL-EXPENSE] Script failed:', err);
      process.exit(1);
    });
}

module.exports = backfillExpenses;
