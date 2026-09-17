#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 7 Part B — Wider search for unverified test cases.
 * Searches the FULL Mongo collection for orders with return items or null productId.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const prisma = require('../backend/src/config/prismaClient');

const Order = require('../backend/src/models/order');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('Connected to Mongo:', mongoose.connection.name);
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('WIDER SEARCH FOR UNVERIFIED TEST CASES');
  console.log('Searching full database for return items and null productId');
  console.log('═══════════════════════════════════════════════════════\n');

  // Case 1: Search for orders with return items in Mongo
  console.log('CASE 1: Orders with return items in Mongo');
  const totalOrders = await Order.countDocuments();
  console.log(`Total orders in database: ${totalOrders}`);
  
  const ordersWithReturns = await Order.find({
    returnItems: { $exists: true, $ne: [] }
  }).lean();
  
  console.log(`Found: ${ordersWithReturns.length} orders with return items`);
  if (ordersWithReturns.length > 0) {
    console.log('Sample order IDs:');
    ordersWithReturns.slice(0, 5).forEach(o => {
      console.log(`  - ${o._id} (${o.orderId}): ${o.returnItems.length} return items`);
    });
  } else {
    console.log('✗ No orders with return items found in the entire collection');
  }
  console.log('');

  // Case 2: Search for OrderItems with null productId in Postgres
  console.log('CASE 2: OrderItems with null productId in Postgres');
  const totalItems = await prisma.orderItem.count();
  console.log(`Total order items in Postgres: ${totalItems}`);
  
  const itemsWithNullProduct = await prisma.orderItem.findMany({
    where: { productId: null },
    include: { order: true },
    take: 10
  });
  
  console.log(`Found: ${itemsWithNullProduct.length} items with null productId`);
  if (itemsWithNullProduct.length > 0) {
    console.log('Sample items:');
    itemsWithNullProduct.forEach(item => {
      console.log(`  - OrderItem ${item.id} in Order ${item.order.legacyId} (${item.order.orderId})`);
      console.log(`    legacyProductId: ${item.legacyProductId}`);
    });
  } else {
    console.log('✗ No order items with null productId found in Postgres');
  }
  console.log('');

  // Additional check: Search for mismatched products between Mongo and Postgres
  console.log('CASE 3: Check for product resolution gaps');
  const sampleOrders = await Order.find().limit(10).lean();
  let mismatchCount = 0;
  
  for (const order of sampleOrders) {
    if (!order.items || order.items.length === 0) continue;
    
    for (const mongoItem of order.items) {
      if (!mongoItem.product) continue;
      
      const mongoProductId = String(mongoItem.product._id || mongoItem.product);
      
      // Check if this product exists in Postgres
      const pgProduct = await prisma.product.findUnique({
        where: { legacyId: mongoProductId }
      });
      
      if (!pgProduct) {
        console.log(`  ⚠️  Order ${order._id}: Product ${mongoProductId} in Mongo but not in Postgres`);
        mismatchCount++;
      }
    }
  }
  
  if (mismatchCount === 0) {
    console.log('✓ All products in sampled orders exist in both Mongo and Postgres');
  } else {
    console.log(`Found ${mismatchCount} product resolution gaps in ${sampleOrders.length} sampled orders`);
  }
  console.log('');

  console.log('═══════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Return items: ${ordersWithReturns.length > 0 ? `${ordersWithReturns.length} found` : 'NOT FOUND (accepted gap)'}`);
  console.log(`Null productId: ${itemsWithNullProduct.length > 0 ? `${itemsWithNullProduct.length} found` : 'NOT FOUND (accepted gap)'}`);
  console.log('═══════════════════════════════════════════════════════');

  await mongoose.disconnect();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
