/********************************************************************
 * Project: EonlineBazar
 * File: backfillRunner.js
 * Location: backend/scripts/backfill/backfillRunner.js
 * Description: Shared idempotent backfill utility for Stage 3 migration.
 *   Reads MongoDB only; writes Postgres via repository create() functions.
 ********************************************************************/

'use strict';

/**
 * Backfill Mongo documents into Postgres using legacyId as the idempotent key.
 *
 * @param {object} options
 * @param {string} options.modelName - Human label for logs (e.g. "Category")
 * @param {import('mongoose').Model} options.mongoModel - Mongoose model to read
 * @param {function(string): Promise<object|null>} options.findByLegacyId
 * @param {function(object): Promise<object>} options.createInPostgres
 * @param {function(object): object} options.mapMongoToPostgres
 * @param {number} [options.batchSize=100]
 * @returns {Promise<{ modelName: string, totalFound: number, created: number, skipped: number, failed: number, failedIds: string[] }>}
 */
async function backfillModel({
  modelName,
  mongoModel,
  findByLegacyId,
  createInPostgres,
  mapMongoToPostgres,
  batchSize = 100
}) {
  const summary = {
    modelName,
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };

  let lastId = null;
  let processed = 0;

  console.log(`${modelName}: starting backfill…`);

  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await mongoModel
      .find(query)
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();

    if (!batch.length) break;

    summary.totalFound += batch.length;

    for (const doc of batch) {
      const legacyId = String(doc._id);

      try {
        const existing = await findByLegacyId(legacyId);
        if (existing) {
          summary.skipped += 1;
          continue;
        }

        const payload = mapMongoToPostgres(doc);
        await createInPostgres(payload);
        summary.created += 1;
      } catch (err) {
        summary.failed += 1;
        summary.failedIds.push(legacyId);
        console.error(`[BACKFILL-FAIL] ${modelName} legacyId=${legacyId}:`, err.message || err);
      }
    }

    processed += batch.length;
    lastId = batch[batch.length - 1]._id;
    console.log(`${modelName}: ${processed}/${summary.totalFound} processed (created=${summary.created}, skipped=${summary.skipped}, failed=${summary.failed})`);
  }

  if (summary.totalFound === 0) {
    console.log(`${modelName}: 0 documents in MongoDB (created=${summary.created}, skipped=${summary.skipped}, failed=${summary.failed})`);
  }

  return summary;
}

module.exports = { backfillModel };
