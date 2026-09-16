#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 3 — READ-ONLY investigation: post-backfill dual-write gaps
 * for SecurityLog and StockAlert. No writes. No flag changes.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const prisma = require('../backend/src/config/prismaClient');

// Stage 3 Step 5 commit — Stage 3 backfill complete (git show -s 4e7353e)
const STAGE3_BACKFILL_COMPLETE = new Date('2026-09-15T01:21:47+03:00');

function iso(d) {
  if (d == null) return null;
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toISOString();
}

function hourBucket(d) {
  const x = d instanceof Date ? d : new Date(d);
  return x.toISOString().slice(0, 13) + ':00Z';
}

function summarizeDistribution(rows, dateField) {
  const buckets = new Map();
  for (const r of rows) {
    const b = hourBucket(r[dateField]);
    buckets.set(b, (buckets.get(b) || 0) + 1);
  }
  return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

async function loadPgLegacyIds(model) {
  const rows = await prisma[model].findMany({
    where: { legacyId: { not: null } },
    select: { legacyId: true }
  });
  return new Set(rows.map((r) => String(r.legacyId)));
}

async function investigateSecurityLog(pgLegacyIds) {
  const SecurityLog = require('../backend/src/models/securityLog');
  const postBackfill = await SecurityLog.find({ createdAt: { $gt: STAGE3_BACKFILL_COMPLETE } })
    .sort({ createdAt: 1 })
    .lean();

  const missing = postBackfill.filter((m) => !pgLegacyIds.has(String(m._id)));
  const present = postBackfill.filter((m) => pgLegacyIds.has(String(m._id)));

  const sample = missing.slice(0, 10).map((m) => ({
    legacyId: String(m._id),
    createdAt: iso(m.createdAt),
    action: m.action,
    actor: m.actor,
    actorType: m.actorType,
    resourceType: m.resourceType,
    resourceId: m.resourceId,
    detailsPreview: String(m.details || '').slice(0, 80)
  }));

  return {
    cutoff: iso(STAGE3_BACKFILL_COMPLETE),
    totalMongoPostBackfill: postBackfill.length,
    missingCount: missing.length,
    presentCount: present.length,
    presentSample: present.map((m) => ({
      legacyId: String(m._id),
      createdAt: iso(m.createdAt),
      action: m.action,
      resourceType: m.resourceType
    })),
    dateRange: missing.length
      ? { earliest: iso(missing[0].createdAt), latest: iso(missing[missing.length - 1].createdAt) }
      : null,
    hourlyDistribution: summarizeDistribution(missing, 'createdAt'),
    resourceTypeBreakdown: Object.fromEntries(
      [...missing.reduce((acc, m) => {
        const k = m.resourceType || '(null)';
        acc.set(k, (acc.get(k) || 0) + 1);
        return acc;
      }, new Map())].sort((a, b) => b[1] - a[1])
    ),
    actionBreakdown: Object.fromEntries(
      [...missing.reduce((acc, m) => {
        acc.set(m.action, (acc.get(m.action) || 0) + 1);
        return acc;
      }, new Map())].sort((a, b) => b[1] - a[1]).slice(0, 15)
    ),
    sample
  };
}

async function investigateStockAlert(pgLegacyIds) {
  const StockAlert = require('../backend/src/models/stockAlert');
  const postBackfill = await StockAlert.find({ createdAt: { $gt: STAGE3_BACKFILL_COMPLETE } })
    .sort({ createdAt: 1 })
    .lean();

  const missing = postBackfill.filter((m) => !pgLegacyIds.has(String(m._id)));

  const sample = missing.slice(0, 10).map((m) => ({
    legacyId: String(m._id),
    createdAt: iso(m.createdAt),
    checkedAt: iso(m.checkedAt),
    lowStockCount: m.lowStockCount,
    outOfStockCount: m.outOfStockCount,
    lowProductIds: (m.lowStockProducts || []).slice(0, 5).map((p) => p.productId),
    outProductIds: (m.outOfStockProducts || []).slice(0, 5).map((p) => p.productId)
  }));

  return {
    cutoff: iso(STAGE3_BACKFILL_COMPLETE),
    totalMongoPostBackfill: postBackfill.length,
    missingCount: missing.length,
    presentCount: postBackfill.length - missing.length,
    dateRange: missing.length
      ? { earliest: iso(missing[0].createdAt), latest: iso(missing[missing.length - 1].createdAt) }
      : null,
    hourlyDistribution: summarizeDistribution(missing, 'createdAt'),
    sample
  };
}

async function simulateFailedWrites() {
  const securityLogRepo = require('../backend/src/repositories/securityLogRepository');
  const stockAlertRepo = require('../backend/src/repositories/stockAlertRepository');
  const SecurityLog = require('../backend/src/models/securityLog');
  const StockAlert = require('../backend/src/models/stockAlert');

  const sim = { securityLog: [], stockAlert: [] };

  const recentLogs = await SecurityLog.find({ createdAt: { $gt: STAGE3_BACKFILL_COMPLETE } })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  for (const m of recentLogs) {
    try {
      await securityLogRepo.create({
        action: m.action,
        actor: m.actor,
        actorType: m.actorType,
        ipAddress: m.ipAddress,
        details: m.details,
        resourceType: m.resourceType,
        resourceId: m.resourceId,
        legacyId: `dry-run-${String(m._id)}`,
        createdAt: m.createdAt
      });
      sim.securityLog.push({ legacyId: String(m._id), ok: true });
    } catch (err) {
      sim.securityLog.push({ legacyId: String(m._id), ok: false, error: err.message });
    }
  }

  const recentAlerts = await StockAlert.find({ createdAt: { $gt: STAGE3_BACKFILL_COMPLETE } })
    .sort({ createdAt: -1 })
    .limit(3)
    .lean();
  for (const m of recentAlerts) {
    try {
      await stockAlertRepo.create({
        checkedAt: m.checkedAt,
        lowStockCount: m.lowStockCount,
        outOfStockCount: m.outOfStockCount,
        lowStockProducts: m.lowStockProducts,
        outOfStockProducts: m.outOfStockProducts,
        alertsSent: m.alertsSent,
        legacyId: `dry-run-${String(m._id)}`,
        createdAt: m.createdAt
      });
      sim.stockAlert.push({ legacyId: String(m._id), ok: true });
    } catch (err) {
      sim.stockAlert.push({ legacyId: String(m._id), ok: false, error: err.message });
    }
  }

  return sim;
}

async function investigateLoginAttempt(pgLegacyIds) {
  const LoginAttempt = require('../backend/src/models/loginAttempt');
  const postBackfill = await LoginAttempt.find({ createdAt: { $gt: STAGE3_BACKFILL_COMPLETE } })
    .sort({ createdAt: 1 })
    .lean();
  const missing = postBackfill.filter((m) => !pgLegacyIds.has(String(m._id)));
  return {
    totalMongoPostBackfill: postBackfill.length,
    missingCount: missing.length,
    presentCount: postBackfill.length - missing.length
  };
}

async function main() {
  console.log('=== Stage 4 Step 3 — Post-backfill dual-write gap investigation ===');
  console.log('Stage 3 backfill complete cutoff:', iso(STAGE3_BACKFILL_COMPLETE));
  console.log('READ-ONLY — no writes to Mongo or Postgres (dry-run uses fake legacyIds)\n');

  await mongoose.connect(process.env.MONGODB_URI);

  const [pgSecIds, pgStockIds, pgLoginIds] = await Promise.all([
    loadPgLegacyIds('securityLog'),
    loadPgLegacyIds('stockAlert'),
    loadPgLegacyIds('loginAttempt')
  ]);

  const securityLog = await investigateSecurityLog(pgSecIds);
  const stockAlert = await investigateStockAlert(pgStockIds);
  const loginAttempt = await investigateLoginAttempt(pgLoginIds);

  console.log('--- SecurityLog ---');
  console.log(JSON.stringify(securityLog, null, 2));
  console.log('\n--- StockAlert ---');
  console.log(JSON.stringify(stockAlert, null, 2));

  console.log('\n--- LoginAttempt (control — same dual-write group) ---');
  console.log(JSON.stringify(loginAttempt, null, 2));

  console.log('\n--- Dry-run PG create (fake legacyId — will leave orphan rows if ok) ---');
  console.log('SKIPPED: dry-run creates would write to Postgres. Code review only.\n');

  const totalMongoSec = await require('../backend/src/models/securityLog').countDocuments({});
  const totalMongoStock = await require('../backend/src/models/stockAlert').countDocuments({});
  const totalPgSec = await prisma.securityLog.count({ where: { legacyId: { not: null } } });
  const totalPgStock = await prisma.stockAlert.count({ where: { legacyId: { not: null } } });

  console.log('--- Totals ---');
  console.log(JSON.stringify({
    securityLog: { mongoTotal: totalMongoSec, pgWithLegacyId: totalPgSec, gap: totalMongoSec - totalPgSec },
    stockAlert: { mongoTotal: totalMongoStock, pgWithLegacyId: totalPgStock, gap: totalMongoStock - totalPgStock }
  }, null, 2));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
