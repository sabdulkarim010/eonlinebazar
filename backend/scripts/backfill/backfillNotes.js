// Run: cd backend && node scripts/backfill/backfillNotes.js

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const Note = require('../../src/models/note');
const { upsertNoteInPG } = require('../../src/repositories/noteRepository');

const BATCH_SIZE = 100;

async function backfillNotes() {
  const summary = { total: 0, success: 0, failed: 0, skipped: 0 };

  console.log('[BACKFILL-NOTE] Starting Note backfill from MongoDB → PostgreSQL…\n');

  if (mongoose.connection.readyState !== 1) {
    await connectDB();
    console.log('[BACKFILL-NOTE] Connected to MongoDB');
  }

  const totalMongo = await Note.countDocuments();
  summary.total = totalMongo;
  console.log(`[BACKFILL-NOTE] Total notes in MongoDB: ${totalMongo}`);

  if (totalMongo === 0) {
    console.log('[BACKFILL-NOTE] No notes found — nothing to backfill');
    return summary;
  }

  let lastId = null;
  let batchNumber = 0;
  const totalBatches = Math.ceil(totalMongo / BATCH_SIZE);

  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    // eslint-disable-next-line no-await-in-loop
    const batch = await Note.find(query).sort({ _id: 1 }).limit(BATCH_SIZE).lean();
    if (!batch.length) break;

    batchNumber += 1;
    console.log(`[BACKFILL-NOTE] Batch ${batchNumber}/${totalBatches} — ${batch.length} processed`);

    for (const doc of batch) {
      try {
        if (!doc._id) {
          summary.skipped += 1;
          continue;
        }
        const result = await upsertNoteInPG(doc);
        if (result) summary.success += 1;
        else {
          summary.failed += 1;
          console.error(`[BACKFILL-NOTE-FAIL] mongoId: ${doc._id} | error: Failed to upsert`);
        }
      } catch (err) {
        summary.failed += 1;
        console.error(`[BACKFILL-NOTE-FAIL] mongoId: ${doc._id} | error: ${err.message}`);
      }
    }

    lastId = batch[batch.length - 1]._id;
    if (batch.length < BATCH_SIZE) break;
  }

  console.log('\n[BACKFILL-NOTE] ========== SUMMARY ==========');
  console.log(`✅ Total: ${summary.total}`);
  console.log(`✅ Success: ${summary.success}`);
  console.log(`⚠️  Skipped: ${summary.skipped}`);
  console.log(`❌ Failed: ${summary.failed}`);

  return summary;
}

if (require.main === module) {
  backfillNotes()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[BACKFILL-NOTE] Script failed:', err);
      process.exit(1);
    });
}

module.exports = backfillNotes;
