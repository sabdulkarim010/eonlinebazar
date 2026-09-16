#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 3 — Postgres-only sync for post-backfill SecurityLog + StockAlert gaps.
 * Read Mongo, write Postgres via repository create() — idempotent by legacyId.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const prisma = require('../backend/src/config/prismaClient');
const STAGE3_BACKFILL_COMPLETE = new Date('2026-09-15T01:21:47+03:00');

async function loadPgLegacyIds(model) {
  const rows = await prisma[model].findMany({
    where: { legacyId: { not: null } },
    select: { legacyId: true }
  });
  return new Set(rows.map((r) => String(r.legacyId)));
}

async function findMissing(modelName, mongoModel, pgLegacyIds, dateField = 'createdAt') {
  const post = await mongoModel.find({ [dateField]: { $gt: STAGE3_BACKFILL_COMPLETE } })
    .sort({ [dateField]: 1 })
    .lean();
  return post.filter((m) => !pgLegacyIds.has(String(m._id)));
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const SecurityLog = require('../backend/src/models/securityLog');
  const StockAlert = require('../backend/src/models/stockAlert');
  const securityLogRepo = require('../backend/src/repositories/securityLogRepository');
  const stockAlertRepo = require('../backend/src/repositories/stockAlertRepository');

  const [pgSec, pgStock] = await Promise.all([
    loadPgLegacyIds('securityLog'),
    loadPgLegacyIds('stockAlert')
  ]);

  const missingSec = await findMissing('SecurityLog', SecurityLog, pgSec);
  const missingStock = await findMissing('StockAlert', StockAlert, pgStock);

  console.log('=== Pre-sync gap (post-cutoff) ===');
  console.log(JSON.stringify({
    cutoff: STAGE3_BACKFILL_COMPLETE.toISOString(),
    securityLogMissing: missingSec.length,
    stockAlertMissing: missingStock.length,
    securityLogIds: missingSec.map((m) => String(m._id)),
    stockAlertIds: missingStock.map((m) => String(m._id))
  }, null, 2));

  const mapSecurityLog = (doc) => ({
    action: doc.action,
    actor: doc.actor,
    actorType: doc.actorType,
    ipAddress: doc.ipAddress,
    details: doc.details,
    resourceType: doc.resourceType,
    resourceId: doc.resourceId,
    legacyId: String(doc._id),
    createdAt: doc.createdAt
  });

  const mapStockAlert = (doc) => ({
    checkedAt: doc.checkedAt,
    lowStockCount: doc.lowStockCount,
    outOfStockCount: doc.outOfStockCount,
    lowStockProducts: doc.lowStockProducts,
    outOfStockProducts: doc.outOfStockProducts,
    alertsSent: doc.alertsSent,
    legacyId: String(doc._id),
    createdAt: doc.createdAt
  });

  async function findSecurityLogByLegacyId(legacyId) {
    if (!legacyId) return null;
    return prisma.securityLog.findUnique({ where: { legacyId: String(legacyId) } });
  }

  async function findStockAlertByLegacyId(legacyId) {
    if (!legacyId) return null;
    return prisma.stockAlert.findUnique({ where: { legacyId: String(legacyId) } });
  }

  const results = [];

  if (missingSec.length) {
    for (const doc of missingSec) {
      try {
        const existing = await findSecurityLogByLegacyId(String(doc._id));
        if (existing) continue;
        await securityLogRepo.create(mapSecurityLog(doc));
        results.push({ model: 'SecurityLog', legacyId: String(doc._id), ok: true });
      } catch (err) {
        results.push({ model: 'SecurityLog', legacyId: String(doc._id), ok: false, error: err.message });
        console.error('[SYNC-FAIL] SecurityLog', String(doc._id), err.message);
      }
    }
  }

  if (missingStock.length) {
    for (const doc of missingStock) {
      try {
        const existing = await findStockAlertByLegacyId(String(doc._id));
        if (existing) continue;
        await stockAlertRepo.create(mapStockAlert(doc));
        results.push({ model: 'StockAlert', legacyId: String(doc._id), ok: true });
      } catch (err) {
        results.push({ model: 'StockAlert', legacyId: String(doc._id), ok: false, error: err.message });
        console.error('[SYNC-FAIL] StockAlert', String(doc._id), err.message);
      }
    }
  }

  const failed = results.filter((r) => !r.ok);
  const created = results.filter((r) => r.ok);

  console.log('\n=== Sync results ===');
  console.log(JSON.stringify({ created: created.length, failed: failed.length, failed }, null, 2));

  const pgSecAfter = await loadPgLegacyIds('securityLog');
  const pgStockAfter = await loadPgLegacyIds('stockAlert');
  const missingSecAfter = await findMissing('SecurityLog', SecurityLog, pgSecAfter);
  const missingStockAfter = await findMissing('StockAlert', StockAlert, pgStockAfter);

  const totalMongoSec = await SecurityLog.countDocuments({});
  const totalMongoStock = await StockAlert.countDocuments({});
  const totalPgSec = await prisma.securityLog.count({ where: { legacyId: { not: null } } });
  const totalPgStock = await prisma.stockAlert.count({ where: { legacyId: { not: null } } });

  console.log('\n=== Post-sync verification ===');
  console.log(JSON.stringify({
    postCutoffGap: {
      securityLog: missingSecAfter.length,
      stockAlert: missingStockAfter.length
    },
    overall: {
      securityLog: { mongo: totalMongoSec, pgLegacy: totalPgSec, gap: totalMongoSec - totalPgSec },
      stockAlert: { mongo: totalMongoStock, pgLegacy: totalPgStock, gap: totalMongoStock - totalPgStock }
    }
  }, null, 2));

  await mongoose.disconnect();
  process.exit(failed.length || missingSecAfter.length || missingStockAfter.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
