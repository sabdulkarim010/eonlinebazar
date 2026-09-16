#!/usr/bin/env node
'use strict';
/** One-off: re-sync Main Warehouse updatedAt/isDefault from Mongo (Postgres write only). */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const prisma = require('../backend/src/config/prismaClient');

const WAREHOUSE_LEGACY_ID = '6aa2c030b4f03cafedef7b4d';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Warehouse = require('../backend/src/models/warehouse');
  const mongo = await Warehouse.findById(WAREHOUSE_LEGACY_ID).lean();
  if (!mongo) throw new Error('Main Warehouse not found in Mongo');

  const pg = await prisma.warehouse.findUnique({ where: { legacyId: WAREHOUSE_LEGACY_ID } });
  if (!pg) throw new Error('Main Warehouse not found in Postgres');

  const mongoUpdated = new Date(mongo.updatedAt);
  const mongoCreated = new Date(mongo.createdAt);
  const data = {};
  if (pg.isDefault !== (mongo.isDefault === true)) data.isDefault = mongo.isDefault === true;
  if (pg.createdAt?.getTime() !== mongoCreated.getTime()) data.createdAt = mongoCreated;
  if (pg.updatedAt?.getTime() !== mongoUpdated.getTime()) data.updatedAt = mongoUpdated;

  if (Object.keys(data).length) {
    await prisma.warehouse.update({ where: { id: pg.id }, data });
    console.log('Re-synced Main Warehouse:', data);
  } else {
    console.log('Main Warehouse already in sync');
  }

  await mongoose.disconnect();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) {}
  try { await prisma.$disconnect(); } catch (_) {}
  process.exit(1);
});
