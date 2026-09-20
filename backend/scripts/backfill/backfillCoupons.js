// Run: cd backend && node scripts/backfill/backfillCoupons.js

/********************************************************************
 * Project: EonlineBazar
 * File: backfillCoupons.js
 * Location: backend/scripts/backfill/backfillCoupons.js
 * Description: Stage 3 Step 2.1 — Coupon backfill (standalone).
 *   Fetches ALL coupons from MongoDB in batches of 100, upserts each
 *   to Postgres using upsertCouponInPG() (idempotent — safe to re-run).
 *
 * Usage: node backend/scripts/backfill/backfillCoupons.js
 ********************************************************************/

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const prisma = require('../../src/config/prismaClient');
const Coupon = require('../../src/models/coupon');
const couponRepo = require('../../src/repositories/couponRepository');

const BATCH_SIZE = 100;

async function backfillCoupons() {
  const summary = {
    totalFound: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    failedIds: []
  };

  console.log('[BACKFILL-COUPON] Starting Coupon backfill from MongoDB → PostgreSQL…\n');

  const totalMongo = await Coupon.countDocuments();
  console.log(`[BACKFILL-COUPON] Total coupons in MongoDB: ${totalMongo}`);

  if (totalMongo === 0) {
    console.log('[BACKFILL-COUPON] No coupons found in MongoDB — nothing to backfill.');
    return summary;
  }

  let lastId = null;
  let batchNumber = 0;
  const totalBatches = Math.ceil(totalMongo / BATCH_SIZE);

  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await Coupon.find(query).sort({ _id: 1 }).limit(BATCH_SIZE).lean();

    if (!batch.length) break;

    batchNumber += 1;
    summary.totalFound += batch.length;

    console.log(`[BACKFILL-COUPON] Batch ${batchNumber}/${totalBatches} — processing ${batch.length} coupon(s)…`);

    for (const mongoDoc of batch) {
      try {
        const legacyId = String(mongoDoc._id);

        // Check if already exists in PostgreSQL (idempotency)
        const existing = await prisma.coupon.findUnique({
          where: { legacyId }
        });

        if (existing) {
          summary.skipped += 1;
          continue;
        }

        // Upsert to PostgreSQL
        await couponRepo.upsertCouponInPG(mongoDoc);
        summary.success += 1;
      } catch (err) {
        summary.failed += 1;
        summary.failedIds.push(String(mongoDoc._id));
        console.error('[BACKFILL-COUPON-FAIL]', {
          mongoId: String(mongoDoc._id),
          code: mongoDoc.code,
          error: err.message
        });
      }
    }

    lastId = batch[batch.length - 1]._id;
  }

  console.log('\n[BACKFILL-COUPON] Backfill complete.');
  console.log(`✅ Total: ${summary.totalFound} | Success: ${summary.success} | Skipped: ${summary.skipped} | Failed: ${summary.failed}`);

  if (summary.failedIds.length > 0) {
    console.log(`❌ Failed IDs: ${summary.failedIds.join(', ')}`);
  }

  return summary;
}

async function main() {
  let mongoConn;
  try {
    console.log('='.repeat(70));
    console.log('[BACKFILL-COUPON] Coupon Backfill');
    console.log('='.repeat(70));

    mongoConn = await connectDB();

    const backfillSummary = await backfillCoupons();

    console.log('\n' + '='.repeat(70));
    console.log('[BACKFILL-COUPON] FINAL SUMMARY');
    console.log('='.repeat(70));
    console.log(`✅ Coupons: ${backfillSummary.success} upserted, ${backfillSummary.skipped} skipped, ${backfillSummary.failed} failed`);
    console.log('='.repeat(70));
  } catch (err) {
    console.error('\n[BACKFILL-COUPON-FATAL]', err);
    process.exit(1);
  } finally {
    if (mongoConn) await mongoose.disconnect();
    await prisma.$disconnect();
  }
}

main();
