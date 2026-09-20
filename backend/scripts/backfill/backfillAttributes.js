// Run: cd backend && node scripts/backfill/backfillAttributes.js

/********************************************************************
 * Project: EonlineBazar
 * File: backfillAttributes.js
 * Location: backend/scripts/backfill/backfillAttributes.js
 * Description: Stage 3 Step 2.2 — Attribute backfill (standalone).
 *   Fetches ALL attributes from MongoDB in batches of 100, upserts each
 *   to Postgres using upsertAttributeInPG() (idempotent — safe to re-run).
 *
 * Usage: node backend/scripts/backfill/backfillAttributes.js
 ********************************************************************/

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const prisma = require('../../src/config/prismaClient');
const Attribute = require('../../src/models/attribute');
const attributeRepo = require('../../src/repositories/attributeRepository');

const BATCH_SIZE = 100;

async function backfillAttributes() {
  const summary = {
    totalFound: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    failedIds: []
  };

  console.log('[BACKFILL-ATTRIBUTE] Starting Attribute backfill from MongoDB → PostgreSQL…\n');

  const totalMongo = await Attribute.countDocuments();
  console.log(`[BACKFILL-ATTRIBUTE] Total attributes in MongoDB: ${totalMongo}`);

  if (totalMongo === 0) {
    console.log('[BACKFILL-ATTRIBUTE] No attributes found in MongoDB — nothing to backfill.');
    return summary;
  }

  let lastId = null;
  let batchNumber = 0;
  const totalBatches = Math.ceil(totalMongo / BATCH_SIZE);

  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await Attribute.find(query).sort({ _id: 1 }).limit(BATCH_SIZE).lean();

    if (!batch.length) break;

    batchNumber += 1;
    summary.totalFound += batch.length;

    console.log(`[BACKFILL-ATTRIBUTE] Batch ${batchNumber}/${totalBatches} — processing ${batch.length} attribute(s)…`);

    for (const mongoDoc of batch) {
      try {
        const legacyId = String(mongoDoc._id);

        // Check if already exists in PostgreSQL (idempotency)
        const existing = await prisma.attribute.findUnique({
          where: { legacyId }
        });

        if (existing) {
          summary.skipped += 1;
          continue;
        }

        // Upsert to PostgreSQL
        await attributeRepo.upsertAttributeInPG(mongoDoc);
        summary.success += 1;
      } catch (err) {
        summary.failed += 1;
        summary.failedIds.push(String(mongoDoc._id));
        console.error('[BACKFILL-ATTRIBUTE-FAIL]', {
          mongoId: String(mongoDoc._id),
          name: mongoDoc.name,
          error: err.message
        });
      }
    }

    lastId = batch[batch.length - 1]._id;
  }

  console.log('\n[BACKFILL-ATTRIBUTE] Backfill complete.');
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
    console.log('[BACKFILL-ATTRIBUTE] Attribute Backfill');
    console.log('='.repeat(70));

    mongoConn = await connectDB();

    const backfillSummary = await backfillAttributes();

    console.log('\n' + '='.repeat(70));
    console.log('[BACKFILL-ATTRIBUTE] FINAL SUMMARY');
    console.log('='.repeat(70));
    console.log(`✅ Attributes: ${backfillSummary.success} upserted, ${backfillSummary.skipped} skipped, ${backfillSummary.failed} failed`);
    console.log('='.repeat(70));
  } catch (err) {
    console.error('\n[BACKFILL-ATTRIBUTE-FATAL]', err);
    process.exit(1);
  } finally {
    if (mongoConn) await mongoose.disconnect();
    await prisma.$disconnect();
  }
}

main();
