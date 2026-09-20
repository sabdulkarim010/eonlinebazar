// Run: cd backend && node scripts/ops/cleanTestDataFromPG.js

/********************************************************************
 * Project: EonlineBazar — Database Migration Ops
 * File: cleanTestDataFromPG.js
 * Location: backend/scripts/ops/cleanTestDataFromPG.js
 * Description: Remove orphaned PostgreSQL rows (no Mongo legacyId match)
 *   and re-sync any missing Cart documents from MongoDB.
 ********************************************************************/

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const prisma = require('../../src/config/prismaClient');
const Category = require('../../src/models/category');
const Order = require('../../src/models/order');
const Cart = require('../../src/models/cart');
const cartRepo = require('../../src/repositories/cartRepository');

async function buildMongoLegacyIdSet(Model) {
  const docs = await Model.find({}, { _id: 1 }).lean();
  return new Set(docs.map((doc) => String(doc._id)));
}

function isOrphanLegacyId(legacyId, mongoIds) {
  if (!legacyId) return true;
  return !mongoIds.has(String(legacyId));
}

async function deleteOrphanedCategories(mongoIds) {
  const rows = await prisma.category.findMany({
    select: { id: true, legacyId: true, name: true }
  });

  let deleted = 0;
  for (const row of rows) {
    if (!isOrphanLegacyId(row.legacyId, mongoIds)) continue;

    try {
      await prisma.category.delete({ where: { id: row.id } });
      deleted += 1;
      console.log(`[CLEAN-PG] Deleted orphaned Category id=${row.id} legacyId=${row.legacyId || 'null'}`);
    } catch (err) {
      console.warn(`[CLEAN-PG] Category delete skipped id=${row.id}: ${err.message}`);
    }
  }

  return deleted;
}

async function deleteOrphanedOrders(mongoIds) {
  const rows = await prisma.order.findMany({
    select: { id: true, legacyId: true, orderId: true }
  });

  let deleted = 0;
  for (const row of rows) {
    if (!isOrphanLegacyId(row.legacyId, mongoIds)) continue;

    try {
      await prisma.order.delete({ where: { id: row.id } });
      deleted += 1;
      console.log(`[CLEAN-PG] Deleted orphaned Order id=${row.id} legacyId=${row.legacyId || 'null'}`);
    } catch (err) {
      console.warn(`[CLEAN-PG] Order delete skipped id=${row.id}: ${err.message}`);
    }
  }

  return deleted;
}

async function deleteOrphanedCarts(mongoIds) {
  const rows = await prisma.cart.findMany({
    select: { id: true, legacyId: true }
  });

  let deleted = 0;
  for (const row of rows) {
    if (!isOrphanLegacyId(row.legacyId, mongoIds)) continue;

    try {
      await prisma.cart.delete({ where: { id: row.id } });
      deleted += 1;
      console.log(`[CLEAN-PG] Deleted orphaned Cart id=${row.id} legacyId=${row.legacyId || 'null'}`);
    } catch (err) {
      console.warn(`[CLEAN-PG] Cart delete skipped id=${row.id}: ${err.message}`);
    }
  }

  return deleted;
}

async function resyncMissingCarts() {
  const mongoCarts = await Cart.find().lean();
  let synced = 0;

  for (const doc of mongoCarts) {
    const legacyId = String(doc._id);
    const existing = await prisma.cart.findUnique({ where: { legacyId } });
    if (existing) continue;

    try {
      await cartRepo.syncFromMongo(doc);
      synced += 1;
      console.log(`[CLEAN-PG] Re-synced Cart legacyId=${legacyId}`);
    } catch (err) {
      console.warn(`[CLEAN-PG] Cart re-sync failed legacyId=${legacyId}: ${err.message}`);
    }
  }

  return synced;
}

async function main() {
  console.log('[CLEAN-PG] Connecting to MongoDB and PostgreSQL...\n');
  await connectDB();

  try {
    const [categoryMongoIds, orderMongoIds, cartMongoIds] = await Promise.all([
      buildMongoLegacyIdSet(Category),
      buildMongoLegacyIdSet(Order),
      buildMongoLegacyIdSet(Cart)
    ]);

    console.log('[CLEAN-PG] Removing orphaned PostgreSQL rows...\n');

    const deletedCategories = await deleteOrphanedCategories(categoryMongoIds);
    const deletedOrders = await deleteOrphanedOrders(orderMongoIds);
    const deletedCarts = await deleteOrphanedCarts(cartMongoIds);

    console.log('\n[CLEAN-PG] Re-syncing missing carts from MongoDB...\n');
    const resyncedCarts = await resyncMissingCarts();

    console.log('\n=== CLEANUP SUMMARY ===');
    console.log(`Deleted orphaned Categories: ${deletedCategories}`);
    console.log(`Deleted orphaned Orders: ${deletedOrders}`);
    console.log(`Deleted orphaned Carts: ${deletedCarts}`);
    console.log(`Re-synced missing Carts: ${resyncedCarts}`);
    console.log('=======================\n');
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
    console.log('[CLEAN-PG] Disconnected from MongoDB and PostgreSQL.');
  }
}

main().catch((err) => {
  console.error('[CLEAN-PG] Fatal error:', err);
  process.exit(1);
});
