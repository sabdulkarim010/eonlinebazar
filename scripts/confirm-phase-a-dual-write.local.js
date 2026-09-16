#!/usr/bin/env node
'use strict';
/** Phase A confirmation — read-only check + optional trigger (Mongo write via cron path). */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const prisma = require('../backend/src/config/prismaClient');

const TRIGGER = process.argv.includes('--trigger');

function iso(d) {
  return d ? new Date(d).toISOString() : null;
}

async function checkRecent(modelName, mongoModel, sortField) {
  const recent = await mongoModel.find({}).sort({ [sortField]: -1 }).limit(5).lean();
  const out = [];
  for (const m of recent) {
    const legacyId = String(m._id);
    const pg = await prisma[modelName].findUnique({ where: { legacyId }, select: { legacyId: true, createdAt: true } });
    out.push({
      legacyId,
      mongoCreatedAt: iso(m.createdAt || m[sortField]),
      inPostgres: Boolean(pg),
      pgCreatedAt: pg ? iso(pg.createdAt) : null
    });
  }
  return out;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const SecurityLog = require('../backend/src/models/securityLog');
  const StockAlert = require('../backend/src/models/stockAlert');

  if (TRIGGER) {
    console.log('Triggering checkAndAlertLowStock()...');
    const { checkAndAlertLowStock } = require('../backend/src/services/stockAlertService');
    await checkAndAlertLowStock();
    console.log('Done. Waiting 3s for Postgres mirror...');
    await new Promise((r) => setTimeout(r, 3000));
  }

  const stock = await checkRecent('stockAlert', StockAlert, 'createdAt');
  const sec = await checkRecent('securityLog', SecurityLog, 'createdAt');

  const stockOk = stock.some((r) => r.inPostgres);
  const secOk = sec.some((r) => r.inPostgres);

  console.log('\n=== Phase A — recent dual-write check (top 5 Mongo rows each) ===');
  console.log('StockAlert:', JSON.stringify(stock, null, 2));
  console.log('SecurityLog:', JSON.stringify(sec, null, 2));
  console.log('\nVerdict:', {
    stockAlertRecentInPg: stockOk,
    securityLogRecentInPg: secOk,
    phaseAConfirmed: stockOk
  });

  await mongoose.disconnect();
  process.exit(stockOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
