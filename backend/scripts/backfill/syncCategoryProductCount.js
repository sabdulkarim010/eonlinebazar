#!/usr/bin/env node
/********************************************************************
 * One-time Stage 4 correction — sync Category.productCount from Mongo to Postgres.
 * Read Mongo, write Postgres only. Idempotent re-run safe.
 *
 * Usage: node backend/scripts/backfill/syncCategoryProductCount.js
 ********************************************************************/

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const prisma = require('../../src/config/prismaClient');
const Category = require('../../src/models/category');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const pgRows = await prisma.category.findMany({
    where: { legacyId: { not: null } },
    orderBy: { name: 'asc' }
  });

  const withMongoCount = [];
  const withoutMongoCount = [];
  const updated = [];

  for (const row of pgRows) {
    const mongo = await Category.findById(row.legacyId).lean();
    if (!mongo) {
      console.warn(`[SKIP] No Mongo doc for legacyId ${row.legacyId} (${row.name})`);
      continue;
    }

    const hasKey = Object.prototype.hasOwnProperty.call(mongo, 'productCount');
    if (hasKey) {
      const target = Number(mongo.productCount) || 0;
      withMongoCount.push({ name: row.name, legacyId: row.legacyId, mongo: target, pgBefore: row.productCount });
      if (row.productCount !== target) {
        await prisma.category.update({
          where: { id: row.id },
          data: { productCount: target }
        });
        updated.push({ name: row.name, from: row.productCount, to: target });
      }
    } else {
      withoutMongoCount.push({ name: row.name, legacyId: row.legacyId, pgKept: row.productCount });
    }
  }

  console.log(JSON.stringify({ withMongoCount, withoutMongoCount, updated }, null, 2));
  console.log(`\nSummary: ${withMongoCount.length} with Mongo productCount, ${withoutMongoCount.length} without, ${updated.length} Postgres rows updated.`);

  await mongoose.disconnect();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) {}
  try { await prisma.$disconnect(); } catch (_) {}
  process.exit(1);
});
