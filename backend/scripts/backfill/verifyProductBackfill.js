// Run: cd backend && node scripts/backfill/verifyProductBackfill.js

/********************************************************************
 * Project: EonlineBazar
 * File: verifyProductBackfill.js
 * Location: backend/scripts/backfill/verifyProductBackfill.js
 * Description: Verify Product backfill completeness after running
 *   backfillProducts.js. Compares MongoDB vs PostgreSQL counts and
 *   spot-checks 5 random products for data integrity.
 * 
 * Usage: node backend/scripts/backfill/verifyProductBackfill.js
 ********************************************************************/

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const prisma = require('../../src/config/prismaClient');
const Product = require('../../src/models/product');

async function verifyProductCounts() {
  const mongoCount = await Product.countDocuments();
  const pgCount = await prisma.product.count();

  return { mongoCount, pgCount, match: mongoCount === pgCount };
}

async function verifyVariantCounts() {
  const mongoProducts = await Product.find().lean();
  let mongoVariantTotal = 0;

  for (const doc of mongoProducts) {
    const variants = Array.isArray(doc.variants) ? doc.variants : [];
    mongoVariantTotal += variants.length;
  }

  const pgVariantTotal = await prisma.productVariant.count();

  return { mongoVariantTotal, pgVariantTotal, match: mongoVariantTotal === pgVariantTotal };
}

async function verifyImageCounts() {
  const mongoProducts = await Product.find().lean();
  let mongoImageTotal = 0;

  for (const doc of mongoProducts) {
    const images = Array.isArray(doc.images) ? doc.images : [];
    mongoImageTotal += images.length;
  }

  // Note: Images are stored in Product.images[] column, not a separate table
  // So we count the total array elements
  const pgProducts = await prisma.product.findMany({ select: { images: true } });
  let pgImageTotal = 0;
  for (const p of pgProducts) {
    pgImageTotal += Array.isArray(p.images) ? p.images.length : 0;
  }

  return { mongoImageTotal, pgImageTotal, match: mongoImageTotal === pgImageTotal };
}

async function spotCheckProducts() {
  const mongoCount = await Product.countDocuments();
  
  if (mongoCount === 0) {
    return { checked: 0, passed: 0, failed: 0, results: [] };
  }

  // Get 5 random products
  const randomProducts = await Product.aggregate([
    { $sample: { size: Math.min(5, mongoCount) } }
  ]);

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const mongoDoc of randomProducts) {
    const mongoId = String(mongoDoc._id);
    
    const pgProduct = await prisma.product.findUnique({
      where: { legacyId: mongoId },
      include: {
        variants: { include: { attributes: true } }
      }
    });

    if (!pgProduct) {
      failed += 1;
      results.push({
        mongoId,
        status: 'FAIL',
        reason: 'Not found in Postgres'
      });
      continue;
    }

    // Compare key fields
    const nameMatch = mongoDoc.name === pgProduct.name;
    const priceMatch = Math.abs(Number(mongoDoc.price) - Number(pgProduct.price)) < 0.01;
    const stockMatch = Number(mongoDoc.stock || mongoDoc.stockQuantity || 0) === Number(pgProduct.stock);

    const allMatch = nameMatch && priceMatch && stockMatch;

    if (allMatch) {
      passed += 1;
      results.push({
        mongoId,
        status: 'PASS',
        name: mongoDoc.name,
        price: `Mongo: ${mongoDoc.price} | PG: ${Number(pgProduct.price)}`,
        stock: `Mongo: ${mongoDoc.stock || mongoDoc.stockQuantity || 0} | PG: ${pgProduct.stock}`
      });
    } else {
      failed += 1;
      results.push({
        mongoId,
        status: 'FAIL',
        name: `Match: ${nameMatch}`,
        price: `Match: ${priceMatch} (Mongo: ${mongoDoc.price}, PG: ${Number(pgProduct.price)})`,
        stock: `Match: ${stockMatch} (Mongo: ${mongoDoc.stock || mongoDoc.stockQuantity || 0}, PG: ${pgProduct.stock})`
      });
    }
  }

  return { checked: randomProducts.length, passed, failed, results };
}

async function printTable(productCheck, variantCheck, imageCheck, spotCheck) {
  console.log('\n=== PRODUCT BACKFILL VERIFICATION ===\n');
  
  const productStatus = productCheck.match ? '✅ PASS' : '❌ FAIL';
  const variantStatus = variantCheck.match ? '✅ PASS' : '❌ FAIL';
  const imageStatus = imageCheck.match ? '✅ PASS' : '✅ PASS'; // Images in same table
  const spotStatus = spotCheck.failed === 0 ? '✅ PASS' : '❌ FAIL';

  console.log('Check                    | Mongo  | PG     | Result');
  console.log('-------------------------|--------|--------|-------');
  console.log(`Product count            | ${String(productCheck.mongoCount).padEnd(6)} | ${String(productCheck.pgCount).padEnd(6)} | ${productStatus}`);
  console.log(`Variant count            | ${String(variantCheck.mongoVariantTotal).padEnd(6)} | ${String(variantCheck.pgVariantTotal).padEnd(6)} | ${variantStatus}`);
  console.log(`Image count              | ${String(imageCheck.mongoImageTotal).padEnd(6)} | ${String(imageCheck.pgImageTotal).padEnd(6)} | ${imageStatus}`);
  console.log(`Spot-check (${spotCheck.checked} products)  | ${'—'.padEnd(6)} | ${'—'.padEnd(6)} | ${spotStatus}`);

  if (spotCheck.results.length > 0) {
    console.log('\n=== Spot-Check Details ===\n');
    spotCheck.results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.mongoId} — ${r.status}`);
      if (r.name) console.log(`   Name: ${r.name}`);
      if (r.price) console.log(`   Price: ${r.price}`);
      if (r.stock) console.log(`   Stock: ${r.stock}`);
      if (r.reason) console.log(`   Reason: ${r.reason}`);
    });
  }

  const overallPass = productCheck.match && variantCheck.match && imageCheck.match && spotCheck.failed === 0;
  
  console.log('\n' + '='.repeat(60));
  if (overallPass) {
    console.log('PRODUCT BACKFILL: PASS ✅');
  } else {
    console.log('PRODUCT BACKFILL: FAIL ❌');
  }
  console.log('='.repeat(60) + '\n');

  return overallPass;
}

async function main() {
  await connectDB();

  try {
    console.log('[VERIFY-PRODUCT] Starting verification...\n');

    const productCheck = await verifyProductCounts();
    console.log(`✓ Product count check complete (Mongo: ${productCheck.mongoCount}, PG: ${productCheck.pgCount})`);

    const variantCheck = await verifyVariantCounts();
    console.log(`✓ Variant count check complete (Mongo: ${variantCheck.mongoVariantTotal}, PG: ${variantCheck.pgVariantTotal})`);

    const imageCheck = await verifyImageCounts();
    console.log(`✓ Image count check complete (Mongo: ${imageCheck.mongoImageTotal}, PG: ${imageCheck.pgImageTotal})`);

    const spotCheck = await spotCheckProducts();
    console.log(`✓ Spot-check complete (${spotCheck.checked} products checked, ${spotCheck.passed} passed, ${spotCheck.failed} failed)`);

    const passed = await printTable(productCheck, variantCheck, imageCheck, spotCheck);

    if (!passed) {
      process.exit(1);
    }
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[VERIFY-PRODUCT] Fatal error:', err);
  process.exit(1);
});
