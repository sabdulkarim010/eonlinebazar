// Run: cd backend && node scripts/backfill/backfillPaymentMethods.js

/********************************************************************
 * Project: EonlineBazar
 * File: backfillPaymentMethods.js
 * Location: backend/scripts/backfill/backfillPaymentMethods.js
 * Description: Stage 3 Step 1.3 — PaymentMethod backfill + OrderPayment FK resolution.
 *   Part 1: Fetches ALL PaymentMethods from MongoDB, upserts each to PostgreSQL.
 *   Part 2: Finds OrderPayments with NULL methodId, matches them by method name/code,
 *           and updates the FK where matched.
 *
 * Usage: node backend/scripts/backfill/backfillPaymentMethods.js
 ********************************************************************/

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const prisma = require('../../src/config/prismaClient');
const PaymentMethod = require('../../src/models/PaymentMethod');
const paymentMethodRepo = require('../../src/repositories/paymentMethodRepository');

const BATCH_SIZE = 100;

async function backfillPaymentMethods() {
  const summary = {
    totalFound: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    failedIds: []
  };

  console.log('[BACKFILL-PAYMENTMETHOD] Starting PaymentMethod backfill from MongoDB → PostgreSQL…\n');

  const totalMongo = await PaymentMethod.countDocuments();
  console.log(`[BACKFILL-PAYMENTMETHOD] Total payment methods in MongoDB: ${totalMongo}`);

  if (totalMongo === 0) {
    console.log('[BACKFILL-PAYMENTMETHOD] No payment methods found in MongoDB — nothing to backfill.');
    return summary;
  }

  let lastId = null;
  let batchNumber = 0;
  const totalBatches = Math.ceil(totalMongo / BATCH_SIZE);

  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await PaymentMethod.find(query).sort({ _id: 1 }).limit(BATCH_SIZE).lean();

    if (!batch.length) break;

    batchNumber += 1;
    summary.totalFound += batch.length;

    console.log(`[BACKFILL-PAYMENTMETHOD] Batch ${batchNumber}/${totalBatches} — processing ${batch.length} payment method(s)…`);

    for (const mongoDoc of batch) {
      try {
        const legacyId = String(mongoDoc._id);

        // Check if already exists in PostgreSQL (idempotency)
        const existing = await prisma.paymentMethod.findUnique({
          where: { legacyId }
        });

        if (existing) {
          summary.skipped += 1;
          continue;
        }

        // Upsert to PostgreSQL
        await paymentMethodRepo.upsertPaymentMethodInPG(mongoDoc);
        summary.success += 1;
      } catch (err) {
        summary.failed += 1;
        summary.failedIds.push(String(mongoDoc._id));
        console.error('[BACKFILL-PAYMENTMETHOD-FAIL]', {
          mongoId: String(mongoDoc._id),
          name: mongoDoc.name,
          code: mongoDoc.code,
          error: err.message
        });
      }
    }

    lastId = batch[batch.length - 1]._id;
  }

  console.log('\n[BACKFILL-PAYMENTMETHOD] Part 1 (PaymentMethod backfill) complete.');
  console.log(`✅ Total: ${summary.totalFound} | Success: ${summary.success} | Skipped: ${summary.skipped} | Failed: ${summary.failed}`);

  if (summary.failedIds.length > 0) {
    console.log(`❌ Failed IDs: ${summary.failedIds.join(', ')}`);
  }

  return summary;
}

async function resolveOrderPaymentMethodIds() {
  const summary = {
    totalNullMethodIds: 0,
    resolved: 0,
    unresolved: 0
  };

  console.log('\n[BACKFILL-PAYMENTMETHOD] Part 2: Resolving NULL methodId in OrderPayment…\n');

  // Find all OrderPayments with NULL methodId
  const nullMethodIdPayments = await prisma.orderPayment.findMany({
    where: { methodId: null },
    select: { id: true, code: true, name: true }
  });

  summary.totalNullMethodIds = nullMethodIdPayments.length;

  if (summary.totalNullMethodIds === 0) {
    console.log('[BACKFILL-PAYMENTMETHOD] No OrderPayments with NULL methodId found — nothing to resolve.');
    return summary;
  }

  console.log(`[BACKFILL-PAYMENTMETHOD] Found ${summary.totalNullMethodIds} OrderPayment(s) with NULL methodId.`);

  // Fetch all PaymentMethods from PostgreSQL for matching
  const allPaymentMethods = await prisma.paymentMethod.findMany({
    select: { id: true, code: true, name: true, legacyId: true }
  });

  console.log(`[BACKFILL-PAYMENTMETHOD] Loaded ${allPaymentMethods.length} PaymentMethod(s) from PostgreSQL for matching.\n`);

  for (const payment of nullMethodIdPayments) {
    try {
      // Try to match by code (most reliable)
      let matched = allPaymentMethods.find(pm => pm.code === payment.code);

      // Fallback: match by name (case-insensitive)
      if (!matched && payment.name) {
        matched = allPaymentMethods.find(
          pm => pm.name.toLowerCase() === payment.name.toLowerCase()
        );
      }

      if (matched) {
        await prisma.orderPayment.update({
          where: { id: payment.id },
          data: { methodId: matched.id }
        });
        summary.resolved += 1;
        console.log(`✅ Resolved OrderPayment ${payment.id}: matched "${payment.code || payment.name}" → PaymentMethod ${matched.id}`);
      } else {
        summary.unresolved += 1;
        console.log(`⚠️ OrderPayment ${payment.id}: no match for code="${payment.code}" name="${payment.name}"`);
      }
    } catch (err) {
      summary.unresolved += 1;
      console.error('[BACKFILL-PAYMENTMETHOD-FK-FAIL]', {
        orderPaymentId: payment.id,
        code: payment.code,
        name: payment.name,
        error: err.message
      });
    }
  }

  console.log('\n[BACKFILL-PAYMENTMETHOD] Part 2 (OrderPayment FK resolution) complete.');
  console.log(`✅ Null methodIds resolved: ${summary.resolved} of ${summary.totalNullMethodIds}`);

  if (summary.unresolved > 0) {
    console.log(`⚠️ Unresolved: ${summary.unresolved}`);
  }

  return summary;
}

async function main() {
  let mongoConn;
  try {
    console.log('='.repeat(70));
    console.log('[BACKFILL-PAYMENTMETHOD] PaymentMethod Backfill + FK Resolution');
    console.log('='.repeat(70));

    mongoConn = await connectDB();

    // Part 1: Backfill PaymentMethods
    const backfillSummary = await backfillPaymentMethods();

    // Part 2: Resolve OrderPayment.methodId FKs
    const fkSummary = await resolveOrderPaymentMethodIds();

    console.log('\n' + '='.repeat(70));
    console.log('[BACKFILL-PAYMENTMETHOD] FINAL SUMMARY');
    console.log('='.repeat(70));
    console.log(`✅ PaymentMethods: ${backfillSummary.success} upserted, ${backfillSummary.skipped} skipped, ${backfillSummary.failed} failed`);
    console.log(`✅ Null methodIds resolved: ${fkSummary.resolved} of ${fkSummary.totalNullMethodIds}`);
    console.log('='.repeat(70));
  } catch (err) {
    console.error('\n[BACKFILL-PAYMENTMETHOD-FATAL]', err);
    process.exit(1);
  } finally {
    if (mongoConn) await mongoose.disconnect();
    await prisma.$disconnect();
  }
}

main();
