/********************************************************************
 * Project: EonlineBazar
 * File: runBackfill.js
 * Location: backend/scripts/backfill/runBackfill.js
 * Description: Stage 3 backfill entry point — dependency-ordered groups.
 *
 * Step 1 (this task): Designation, Brand, Warehouse, Supplier, Category
 *
 * TODO Stage 3 Step 2+: Attribute, Admin, Employee, Product, User, Order, …
 *   Extend runAll() below following DATABASE_MIGRATION_AUDIT.md Stage 3 order.
 *
 * Usage: node backend/scripts/backfill/runBackfill.js
 ********************************************************************/

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const prisma = require('../../src/config/prismaClient');
const { backfillModel } = require('./backfillRunner');

const Designation = require('../../src/models/designation');
const Brand = require('../../src/models/brand');
const Warehouse = require('../../src/models/warehouse');
const Supplier = require('../../src/models/supplier');
const Category = require('../../src/models/category');

const designationRepo = require('../../src/repositories/designationRepository');
const brandRepo = require('../../src/repositories/brandRepository');
const warehouseRepo = require('../../src/repositories/warehouseRepository');
const supplierRepo = require('../../src/repositories/supplierRepository');
const categoryRepo = require('../../src/repositories/categoryRepository');

// ── Mongo → Postgres mappers (shapes match each repository create() signature) ──

function mapDesignation(doc) {
  return {
    name: doc.name,
    department: doc.department,
    description: doc.description,
    isActive: doc.isActive,
    createdBy: doc.createdBy,
    legacyId: String(doc._id)
  };
}

function mapBrand(doc) {
  return {
    name: doc.name,
    description: doc.description,
    status: doc.status,
    legacyId: String(doc._id)
  };
}

function mapWarehouse(doc) {
  return {
    name: doc.name,
    location: doc.location,
    address: doc.address,
    managerName: doc.managerName,
    phone: doc.phone,
    status: doc.status,
    isDefault: doc.isDefault,
    // Admin not backfilled yet — FK resolved in a later Stage 3 step
    createdById: null,
    legacyId: String(doc._id)
  };
}

function mapSupplier(doc) {
  return {
    name: doc.name,
    contactPerson: doc.contactPerson,
    phone: doc.phone,
    email: doc.email,
    address: doc.address,
    notes: doc.notes,
    status: doc.status,
    createdById: null,
    legacyId: String(doc._id)
  };
}

/** Pass 1 — parentCategoryId intentionally omitted (null). */
function mapCategoryPass1(doc) {
  return {
    name: doc.name,
    description: doc.description,
    parentCategoryId: null,
    color: doc.color,
    isActive: doc.isActive,
    isFeatured: doc.isFeatured,
    showInNavbar: doc.showInNavbar,
    showInHomepage: doc.showInHomepage,
    position: doc.position,
    customCashback: doc.customCashback,
    metaTitle: doc.metaTitle,
    metaDescription: doc.metaDescription,
    imageUrl: doc.imageUrl,
    iconUrl: doc.iconUrl,
    bannerImageUrl: doc.bannerImageUrl,
    legacyId: String(doc._id)
  };
}

// ── Category Pass 2 — wire parentCategoryId via parent legacyId lookup ─────────

async function backfillCategoryParents(batchSize = 100) {
  const summary = {
    modelName: 'Category (parent pass)',
    totalFound: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };

  let lastId = null;
  let processed = 0;

  while (true) {
    const query = lastId
      ? { _id: { $gt: lastId }, parentCategory: { $ne: null } }
      : { parentCategory: { $ne: null } };

    const batch = await Category
      .find(query)
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();

    if (!batch.length) break;

    summary.totalFound += batch.length;

    for (const doc of batch) {
      const legacyId = String(doc._id);
      const parentLegacyId = doc.parentCategory ? String(doc.parentCategory) : null;

      try {
        const row = await categoryRepo.findByLegacyId(legacyId);
        if (!row) {
          summary.skipped += 1;
          continue;
        }

        if (row.parentCategoryId) {
          summary.skipped += 1;
          continue;
        }

        const parentRow = parentLegacyId
          ? await categoryRepo.findByLegacyId(parentLegacyId)
          : null;

        if (!parentRow) {
          summary.failed += 1;
          summary.failedIds.push(legacyId);
          console.error(
            `[BACKFILL-FAIL] Category parent pass legacyId=${legacyId}: parent ${parentLegacyId} not in Postgres`
          );
          continue;
        }

        await categoryRepo.update(row.id, { parentCategoryId: parentRow.id });
        summary.updated += 1;
      } catch (err) {
        summary.failed += 1;
        summary.failedIds.push(legacyId);
        console.error(`[BACKFILL-FAIL] Category parent pass legacyId=${legacyId}:`, err.message || err);
      }
    }

    processed += batch.length;
    lastId = batch[batch.length - 1]._id;
    console.log(
      `${summary.modelName}: ${processed}/${summary.totalFound} processed (updated=${summary.updated}, skipped=${summary.skipped}, failed=${summary.failed})`
    );
  }

  return summary;
}

async function runStep1Group() {
  const results = [];

  console.log('\n=== Stage 3 Step 1 — Backfill group: Designation, Brand, Warehouse, Supplier, Category ===\n');

  results.push(await backfillModel({
    modelName: 'Designation',
    mongoModel: Designation,
    findByLegacyId: designationRepo.findByLegacyId,
    createInPostgres: designationRepo.create,
    mapMongoToPostgres: mapDesignation
  }));

  results.push(await backfillModel({
    modelName: 'Brand',
    mongoModel: Brand,
    findByLegacyId: brandRepo.findByLegacyId,
    createInPostgres: brandRepo.create,
    mapMongoToPostgres: mapBrand
  }));

  results.push(await backfillModel({
    modelName: 'Warehouse',
    mongoModel: Warehouse,
    findByLegacyId: warehouseRepo.findByLegacyId,
    createInPostgres: warehouseRepo.create,
    mapMongoToPostgres: mapWarehouse
  }));

  results.push(await backfillModel({
    modelName: 'Supplier',
    mongoModel: Supplier,
    findByLegacyId: supplierRepo.findByLegacyId,
    createInPostgres: supplierRepo.create,
    mapMongoToPostgres: mapSupplier
  }));

  console.log('\n--- Category Pass 1 (create rows, parentCategoryId=null) ---\n');

  results.push(await backfillModel({
    modelName: 'Category',
    mongoModel: Category,
    findByLegacyId: categoryRepo.findByLegacyId,
    createInPostgres: categoryRepo.create,
    mapMongoToPostgres: mapCategoryPass1
  }));

  console.log('\n--- Category Pass 2 (wire parentCategoryId from parent legacyId) ---\n');

  const parentPass = await backfillCategoryParents();
  results.push(parentPass);

  return results;
}

// TODO Stage 3 Step 2+: Attribute group
// TODO Stage 3 Step 3+: Admin, Employee, …
// TODO Stage 3 Step N: Order, Product (last — most connected)

async function runAll() {
  const allResults = [];

  allResults.push(...(await runStep1Group()));

  return allResults;
}

async function main() {
  await connectDB();

  try {
    const results = await runAll();

    console.log('\n=== Backfill summary ===\n');
    for (const r of results) {
      if (r.updated !== undefined) {
        console.log(JSON.stringify({
          modelName: r.modelName,
          totalFound: r.totalFound,
          updated: r.updated,
          skipped: r.skipped,
          failed: r.failed,
          failedIds: r.failedIds
        }, null, 2));
      } else {
        console.log(JSON.stringify(r, null, 2));
      }
    }
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[BACKFILL] Fatal error:', err);
  process.exit(1);
});
