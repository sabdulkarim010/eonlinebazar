#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const prisma = require('../backend/src/config/prismaClient');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Category = require('../backend/src/models/category');
  const Brand = require('../backend/src/models/brand');
  const cats = await Category.find().lean();
  const catKeys = {};
  for (const c of cats) {
    Object.keys(c).forEach((k) => { catKeys[k] = (catKeys[k] || 0) + 1; });
  }
  console.log('CATEGORY key counts (of 14):', JSON.stringify(catKeys, null, 2));
  for (const c of cats) {
    const pg = await prisma.category.findUnique({ where: { legacyId: String(c._id) } });
    const mk = new Set(Object.keys(c));
    const invented = [];
    if (!mk.has('slug') && pg?.slug) invented.push(`slug=${pg.slug}`);
    if (!mk.has('isActive')) invented.push(`isActive=${pg?.isActive}`);
    if (!mk.has('productCount') && pg?.productCount) invented.push(`productCount=${pg.productCount}`);
    if (!mk.has('description') && pg?.description) invented.push('description');
    if (!mk.has('color')) invented.push(`color=${pg?.color}`);
    if (!mk.has('isFeatured') && pg?.isFeatured) invented.push('isFeatured');
    if (!mk.has('showInNavbar') && pg?.showInNavbar) invented.push('showInNavbar');
    if (!mk.has('customCashback') && pg?.customCashback != null) invented.push('customCashback');
    if (!mk.has('imageUrl') && pg?.imageUrl) invented.push('imageUrl');
    console.log(`  ${c.name}: mongoKeys=${Object.keys(c).length} invented=[${invented.join(', ')}]`);
  }
  const brand = await Brand.findOne().lean();
  console.log('\nBRAND keys:', Object.keys(brand).sort());
  console.log('BRAND doc:', brand);
  const pgBrand = await prisma.brand.findFirst({ where: { legacyId: String(brand._id) } });
  console.log('PG brand:', { slug: pgBrand.slug, status: pgBrand.status, description: pgBrand.description, updatedAt: pgBrand.updatedAt });
  await mongoose.disconnect();
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
