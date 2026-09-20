// Run: cd backend && node scripts/backfill/backfillProducts.js

/********************************************************************
 * Project: EonlineBazar
 * File: backfillProducts.js
 * Location: backend/scripts/backfill/backfillProducts.js
 * Description: Stage 3 Step 1.1 — Product backfill (standalone).
 *   Fetches ALL products from MongoDB in batches of 100, creates each
 *   in Postgres using createProductInPG() (upsert — safe to re-run).
 * 
 *   Handles: Product, ProductVariant, ProductVariantAttribute,
 *            ProductCostHistory, ProductEmbeddedReview (5 tables total).
 * 
 * Usage: node backend/scripts/backfill/backfillProducts.js
 ********************************************************************/

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const prisma = require('../../src/config/prismaClient');
const Product = require('../../src/models/product');
const productRepo = require('../../src/repositories/productRepository');

const BATCH_SIZE = 100;

async function backfillProducts() {
  const summary = {
    totalFound: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    failedIds: []
  };

  console.log('[BACKFILL-PRODUCT] Starting Product backfill from MongoDB → PostgreSQL…\n');

  const totalMongo = await Product.countDocuments();
  console.log(`[BACKFILL-PRODUCT] Total products in MongoDB: ${totalMongo}`);

  if (totalMongo === 0) {
    console.log('[BACKFILL-PRODUCT] No products found in MongoDB — nothing to backfill.');
    return summary;
  }

  let lastId = null;
  let batchNumber = 0;
  const totalBatches = Math.ceil(totalMongo / BATCH_SIZE);

  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await Product.find(query).sort({ _id: 1 }).limit(BATCH_SIZE).lean();

    if (!batch.length) break;

    batchNumber += 1;
    summary.totalFound += batch.length;

    console.log(`[BACKFILL-PRODUCT] Batch ${batchNumber}/${totalBatches} — processing ${batch.length} products…`);

    for (const doc of batch) {
      const mongoId = String(doc._id);

      try {
        // Check if already exists (idempotency via legacyId)
        const existing = await prisma.product.findUnique({
          where: { legacyId: mongoId }
        });

        if (existing) {
          summary.skipped += 1;
          continue;
        }

        // Create product + all child tables via createProductInPG()
        await productRepo.createProductInPG(doc);
        summary.success += 1;
      } catch (err) {
        summary.failed += 1;
        summary.failedIds.push(mongoId);
        console.error(`[BACKFILL-PRODUCT-FAIL] mongoId: ${mongoId} | error: ${err.message || String(err)}`);
      }
    }

    lastId = batch[batch.length - 1]._id;
    console.log(`[BACKFILL-PRODUCT] Batch ${batchNumber}/${totalBatches} — processed ${summary.totalFound} products (success: ${summary.success}, skipped: ${summary.skipped}, failed: ${summary.failed})\n`);
  }

  return summary;
}

async function main() {
  await connectDB();

  try {
    const summary = await backfillProducts();

    console.log('\n=== PRODUCT BACKFILL COMPLETE ===\n');
    console.log(`✅ Total: ${summary.totalFound} | Success: ${summary.success} | Failed: ${summary.failed}`);
    console.log(`   Skipped (already in PG): ${summary.skipped}`);

    if (summary.failedIds.length > 0) {
      console.log(`\n❌ Failed product IDs (first 20):`);
      console.log(JSON.stringify(summary.failedIds.slice(0, 20), null, 2));
    }

    if (summary.failed > 0) {
      process.exit(1);
    }
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[BACKFILL-PRODUCT] Fatal error:', err);
  process.exit(1);
});
