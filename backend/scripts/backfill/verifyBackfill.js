/********************************************************************
 * Project: EonlineBazar
 * File: verifyBackfill.js
 * Location: backend/scripts/backfill/verifyBackfill.js
 * Description: Compare MongoDB vs Postgres row counts after Stage 3 Step 1 backfill.
 *
 * Usage: node backend/scripts/backfill/verifyBackfill.js
 ********************************************************************/

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const prisma = require('../../src/config/prismaClient');

const Designation = require('../../src/models/designation');
const Brand = require('../../src/models/brand');
const Warehouse = require('../../src/models/warehouse');
const Supplier = require('../../src/models/supplier');
const Category = require('../../src/models/category');
const categoryRepo = require('../../src/repositories/categoryRepository');

const MODELS = [
  { name: 'Designation', mongoModel: Designation, postgresCount: () => prisma.designation.count() },
  { name: 'Brand', mongoModel: Brand, postgresCount: () => prisma.brand.count() },
  { name: 'Warehouse', mongoModel: Warehouse, postgresCount: () => prisma.warehouse.count() },
  { name: 'Supplier', mongoModel: Supplier, postgresCount: () => prisma.supplier.count() },
  { name: 'Category', mongoModel: Category, postgresCount: () => prisma.category.count() }
];

async function verifyCounts() {
  console.log('\n=== MongoDB vs Postgres row counts ===\n');

  const rows = [];

  for (const { name, mongoModel, postgresCount } of MODELS) {
    const mongoCount = await mongoModel.countDocuments();
    const pgCount = await postgresCount();
    const diff = pgCount - mongoCount;
    const match = mongoCount === pgCount;

    rows.push({ name, mongoCount, pgCount, diff, match });
    console.log(
      `${name}: Mongo=${mongoCount} Postgres=${pgCount} diff=${diff >= 0 ? '+' : ''}${diff} ${match ? '✓' : 'MISMATCH'}`
    );
  }

  return rows;
}

async function verifyCategoryParents() {
  console.log('\n=== Category parentCategoryId verification ===\n');

  const withParentInMongo = await Category.countDocuments({ parentCategory: { $ne: null } });
  console.log(`Mongo categories with parentCategory set: ${withParentInMongo}`);

  const mongoChildren = await Category.find({ parentCategory: { $ne: null } }).lean();
  let linked = 0;
  let missingPostgresRow = 0;
  let nullParentDespiteMongoParent = 0;
  const problemIds = [];

  for (const doc of mongoChildren) {
    const legacyId = String(doc._id);
    const row = await categoryRepo.findByLegacyId(legacyId);

    if (!row) {
      missingPostgresRow += 1;
      problemIds.push({ legacyId, issue: 'no_postgres_row' });
      continue;
    }

    if (row.parentCategoryId) {
      linked += 1;
    } else {
      nullParentDespiteMongoParent += 1;
      problemIds.push({
        legacyId,
        issue: 'null_parentCategoryId',
        mongoParentLegacyId: String(doc.parentCategory)
      });
    }
  }

  console.log(`Postgres rows with non-null parentCategoryId (among Mongo children): ${linked}`);
  console.log(`Mongo children with no Postgres row at all: ${missingPostgresRow}`);
  console.log(
    `Mongo children still null parentCategoryId in Postgres (parent likely failed backfill): ${nullParentDespiteMongoParent}`
  );

  if (problemIds.length) {
    console.log('\nProblem records (first 20):');
    console.log(JSON.stringify(problemIds.slice(0, 20), null, 2));
  }

  return {
    withParentInMongo,
    linked,
    missingPostgresRow,
    nullParentDespiteMongoParent,
    problemIds
  };
}

async function main() {
  await connectDB();

  try {
    const counts = await verifyCounts();
    const categoryParents = await verifyCategoryParents();

    console.log('\n=== Verification complete ===\n');
    const allMatch = counts.every((r) => r.match);
    const parentsOk = categoryParents.nullParentDespiteMongoParent === 0
      && categoryParents.missingPostgresRow === 0;

    console.log(`All counts match: ${allMatch ? 'YES' : 'NO (see diffs above — failed backfills are expected)'}`);
    console.log(`Category parent links complete: ${parentsOk ? 'YES' : 'NO (investigate problem records)'}`);
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[VERIFY] Fatal error:', err);
  process.exit(1);
});
