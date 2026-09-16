#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const prisma = require('../backend/src/config/prismaClient');
const { mapCategoriesToMongo } = require('../backend/src/services/readShapeHelpers');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const C = require('../backend/src/models/category');
  const all = await prisma.category.findMany({ where: { legacyId: { not: null } } });
  for (const pg of all) {
    if (pg.bannerImageUrl || pg.iconUrl) {
      console.log('PG non-null visual:', pg.name, { banner: pg.bannerImageUrl, icon: pg.iconUrl });
    }
  }
  for (const n of ['Mobile', 'Samsung', 'Walton Mobile', 'Fashion & Apparel']) {
    const m = await C.findOne({ name: n }).lean();
    const pg = await prisma.category.findUnique({ where: { legacyId: String(m._id) } });
    const shaped = mapCategoriesToMongo([pg])[0];
    const fields = ['bannerImageUrl', 'iconUrl', 'imageUrl', 'customCashback', 'slug'];
    console.log(n, {
      mongoKeys: fields.filter((f) => f in m),
      mongoVals: fields.reduce((o, f) => { if (f in m) o[f] = m[f]; return o; }, {}),
      pgVals: { banner: pg.bannerImageUrl, icon: pg.iconUrl, image: pg.imageUrl, cash: String(pg.customCashback), slug: pg.slug },
      shapedKeys: fields.filter((f) => f in shaped)
    });
  }
  await mongoose.disconnect();
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
