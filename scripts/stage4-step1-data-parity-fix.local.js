#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 1 — Postgres-only data parity fix (local run, not imported by app).
 * Writes to Neon ONLY. Mongo is read-only source of truth.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const prisma = require('../backend/src/config/prismaClient');

const DELETE_DESIGNATION_IDS = [
  '8bd50cd5-98a8-4344-a73f-e397ed7ce7ba',
  '9f6548f1-96b9-4f86-ba11-7b9b9a9d58e1'
];

const WAREHOUSE_LEGACY_ID = '6aa2c030b4f03cafedef7b4d';

function mongoEffectiveIsActive(doc) {
  return doc.isActive === true;
}

function toDate(value) {
  if (value == null) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function deleteTestDesignations() {
  const before = await prisma.designation.findMany({
    where: { id: { in: DELETE_DESIGNATION_IDS } },
    select: { id: true, name: true, legacyId: true }
  });
  if (before.length !== 2) {
    throw new Error(`Expected exactly 2 designation rows to delete, found ${before.length}: ${JSON.stringify(before)}`);
  }
  const result = await prisma.designation.deleteMany({
    where: { id: { in: DELETE_DESIGNATION_IDS } }
  });
  if (result.count !== 2) {
    throw new Error(`Delete count mismatch: expected 2, got ${result.count}`);
  }
  return before;
}

async function syncCategories(Category) {
  const pgRows = await prisma.category.findMany({ where: { legacyId: { not: null } } });
  const changes = { isActive: [], timestamps: [], unchanged: [] };

  for (const row of pgRows) {
    const mongo = await Category.findById(row.legacyId).lean();
    if (!mongo) {
      throw new Error(`Category mongo doc missing for legacyId ${row.legacyId}`);
    }

    const targetActive = mongoEffectiveIsActive(mongo);
    const mongoCreated = toDate(mongo.createdAt);
    const mongoUpdated = toDate(mongo.updatedAt);
    const data = {};

    if (row.isActive !== targetActive) {
      data.isActive = targetActive;
      changes.isActive.push({ legacyId: row.legacyId, name: row.name, from: row.isActive, to: targetActive });
    }
    if (mongoCreated && row.createdAt?.getTime() !== mongoCreated.getTime()) {
      data.createdAt = mongoCreated;
    }
    if (mongoUpdated && row.updatedAt?.getTime() !== mongoUpdated.getTime()) {
      data.updatedAt = mongoUpdated;
    }

    if (Object.keys(data).length) {
      await prisma.category.update({ where: { id: row.id }, data });
      if (data.createdAt || data.updatedAt) {
        changes.timestamps.push({ legacyId: row.legacyId, name: row.name, ...data });
      }
    } else {
      changes.unchanged.push(row.legacyId);
    }
  }

  return changes;
}

async function syncBrand(Brand) {
  const pg = await prisma.brand.findFirst({ where: { legacyId: { not: null } } });
  if (!pg) return { skipped: true };
  const mongo = await Brand.findById(pg.legacyId).lean();
  if (!mongo) throw new Error(`Brand mongo missing for ${pg.legacyId}`);

  const data = {};
  const mongoCreated = toDate(mongo.createdAt);
  const mongoUpdated = toDate(mongo.updatedAt);
  if (mongoCreated && pg.createdAt?.getTime() !== mongoCreated.getTime()) data.createdAt = mongoCreated;
  if (mongoUpdated != null && pg.updatedAt?.getTime() !== mongoUpdated.getTime()) {
    data.updatedAt = mongoUpdated;
  } else if (mongoUpdated == null && pg.updatedAt != null) {
    // Mongo has no updatedAt — leave PG updatedAt as-is per "do not invent"
  }

  if (Object.keys(data).length) {
    await prisma.brand.update({ where: { id: pg.id }, data });
  }
  return { legacyId: pg.legacyId, updated: data };
}

async function syncWarehouse(Warehouse) {
  const pg = await prisma.warehouse.findUnique({ where: { legacyId: WAREHOUSE_LEGACY_ID } });
  if (!pg) throw new Error('Main Warehouse not found in Postgres');
  const mongo = await Warehouse.findById(WAREHOUSE_LEGACY_ID).lean();
  if (!mongo) throw new Error('Main Warehouse not found in Mongo');

  const data = {};
  if (pg.isDefault !== true && mongo.isDefault === true) data.isDefault = true;
  const mongoCreated = toDate(mongo.createdAt);
  const mongoUpdated = toDate(mongo.updatedAt);
  if (mongoCreated && pg.createdAt?.getTime() !== mongoCreated.getTime()) data.createdAt = mongoCreated;
  if (mongoUpdated && pg.updatedAt?.getTime() !== mongoUpdated.getTime()) data.updatedAt = mongoUpdated;

  if (Object.keys(data).length) {
    await prisma.warehouse.update({ where: { id: pg.id }, data });
  }
  return { legacyId: WAREHOUSE_LEGACY_ID, updated: data };
}

async function syncDesignations(Designation) {
  const pgRows = await prisma.designation.findMany({
    where: { legacyId: { not: null } },
    orderBy: { name: 'asc' }
  });
  const updates = [];

  for (const row of pgRows) {
    const mongo = await Designation.findById(row.legacyId).lean();
    if (!mongo) throw new Error(`Designation mongo missing for ${row.legacyId}`);
    const data = {};
    const mongoCreated = toDate(mongo.createdAt);
    const mongoUpdated = toDate(mongo.updatedAt);
    if (mongoCreated && row.createdAt?.getTime() !== mongoCreated.getTime()) data.createdAt = mongoCreated;
    if (mongoUpdated && row.updatedAt?.getTime() !== mongoUpdated.getTime()) data.updatedAt = mongoUpdated;
    if (Object.keys(data).length) {
      await prisma.designation.update({ where: { id: row.id }, data });
      updates.push({ legacyId: row.legacyId, name: row.name, ...data });
    }
  }

  return { count: pgRows.length, updates };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Category = require('../backend/src/models/category');
  const Brand = require('../backend/src/models/brand');
  const Warehouse = require('../backend/src/models/warehouse');
  const Designation = require('../backend/src/models/designation');

  console.log('=== STEP 1: Delete 2 designation test artifacts ===');
  const deleted = await deleteTestDesignations();
  console.log(JSON.stringify({ deletedCount: 2, deleted }, null, 2));

  console.log('\n=== STEP 2: Sync Category isActive ===');
  const catChanges = await syncCategories(Category);
  console.log(JSON.stringify(catChanges, null, 2));

  console.log('\n=== STEP 3: Sync timestamps (Brand/Warehouse/Designation; Category included above) ===');
  const brand = await syncBrand(Brand);
  const warehouse = await syncWarehouse(Warehouse);
  const designations = await syncDesignations(Designation);
  console.log(JSON.stringify({ brand, warehouse, designations }, null, 2));

  console.log('\n=== STEP 4: Warehouse isDefault (included in warehouse sync) ===');
  console.log(JSON.stringify(warehouse, null, 2));

  await mongoose.disconnect();
  await prisma.$disconnect();
  console.log('\nDone.');
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) {}
  try { await prisma.$disconnect(); } catch (_) {}
  process.exit(1);
});
