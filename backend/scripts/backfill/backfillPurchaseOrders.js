// Run: cd backend && node scripts/backfill/backfillPurchaseOrders.js

/********************************************************************
 * Backfill Script: Purchase Orders (MongoDB → PostgreSQL)
 * Stage 2 Step 3, Part 2.4 — 2026-09-20
 *
 * Idempotent batch upsert of all PurchaseOrder records (with items)
 * from MongoDB into Neon Postgres using legacyId as the reconciliation key.
 ********************************************************************/

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const PurchaseOrder = require('../../src/models/purchaseOrder');
const { upsertPurchaseOrderInPG } = require('../../src/repositories/purchaseOrderRepository');

const BATCH_SIZE = 100;

async function backfillPurchaseOrders() {
  const summary = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    failedIds: []
  };

  console.log('[BACKFILL-PURCHASEORDER] Starting Purchase Order backfill from MongoDB → PostgreSQL…\n');

  if (mongoose.connection.readyState !== 1) {
    await connectDB();
    console.log('[BACKFILL-PURCHASEORDER] Connected to MongoDB');
  }

  const totalMongo = await PurchaseOrder.countDocuments();
  summary.total = totalMongo;
  console.log(`[BACKFILL-PURCHASEORDER] Total purchase orders in MongoDB: ${totalMongo}`);

  if (totalMongo === 0) {
    console.log('[BACKFILL-PURCHASEORDER] No purchase orders found — nothing to backfill');
    return summary;
  }

  let lastId = null;
  let batchNumber = 0;
  const totalBatches = Math.ceil(totalMongo / BATCH_SIZE);

  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    // eslint-disable-next-line no-await-in-loop
    const batch = await PurchaseOrder.find(query)
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean();

    if (!batch.length) break;

    batchNumber += 1;
    console.log(`[BACKFILL-PURCHASEORDER] Batch ${batchNumber}/${totalBatches} — ${batch.length} processed`);

    for (const doc of batch) {
      try {
        if (!doc._id) {
          summary.skipped += 1;
          continue;
        }

        const result = await upsertPurchaseOrderInPG(doc);
        if (result) {
          summary.success += 1;
        } else {
          summary.failed += 1;
          summary.failedIds.push(String(doc._id));
          console.error(`[BACKFILL-PURCHASEORDER-FAIL] mongoId: ${doc._id} | error: Failed to upsert`);
        }
      } catch (err) {
        summary.failed += 1;
        summary.failedIds.push(String(doc._id));
        console.error(`[BACKFILL-PURCHASEORDER-FAIL] mongoId: ${doc._id} | error: ${err.message}`);
      }
    }

    lastId = batch[batch.length - 1]._id;
    if (batch.length < BATCH_SIZE) break;
  }

  console.log('\n[BACKFILL-PURCHASEORDER] ========== SUMMARY ==========');
  console.log(`✅ Total: ${summary.total}`);
  console.log(`✅ Success: ${summary.success}`);
  console.log(`⚠️  Skipped: ${summary.skipped}`);
  console.log(`❌ Failed: ${summary.failed}`);
  if (summary.failedIds.length) {
    console.log(`Failed IDs: ${summary.failedIds.join(', ')}`);
  }
  console.log('[BACKFILL-PURCHASEORDER] Backfill complete!');

  return summary;
}

if (require.main === module) {
  backfillPurchaseOrders()
    .then(() => {
      console.log('[BACKFILL-PURCHASEORDER] Script finished successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[BACKFILL-PURCHASEORDER] Script failed:', err);
      process.exit(1);
    });
}

module.exports = backfillPurchaseOrders;
