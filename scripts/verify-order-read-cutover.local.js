#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 7 Part B — Order read-cutover verification.
 * Compares Mongo vs Postgres reassembly for real orders at the repository level.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const Order = require('../backend/src/models/order');
const { findOrderDetailedByLegacyId } = require('../backend/src/repositories/orderRepository');

function compareOrders(mongoOrder, pgOrder) {
  const issues = [];
  
  // Critical financial fields
  if (mongoOrder.grandTotal !== pgOrder.grandTotal) {
    issues.push(`❌ CRITICAL: grandTotal mismatch (${mongoOrder.grandTotal} vs ${pgOrder.grandTotal})`);
  }
  if (mongoOrder.subTotal !== pgOrder.subTotal) {
    issues.push(`❌ CRITICAL: subTotal mismatch (${mongoOrder.subTotal} vs ${pgOrder.subTotal})`);
  }
  if (mongoOrder.subtotal !== pgOrder.subtotal) {
    issues.push(`⚠️  subtotal mismatch (${mongoOrder.subtotal} vs ${pgOrder.subtotal})`);
  }
  if (mongoOrder.totalAmount !== pgOrder.totalAmount) {
    issues.push(`❌ CRITICAL: totalAmount mismatch (${mongoOrder.totalAmount} vs ${pgOrder.totalAmount})`);
  }
  
  // Order identity
  if (String(mongoOrder._id) !== String(pgOrder._id)) {
    issues.push(`❌ _id mismatch`);
  }
  if (mongoOrder.orderId !== pgOrder.orderId) {
    issues.push(`❌ orderId mismatch`);
  }
  if (mongoOrder.status !== pgOrder.status) {
    issues.push(`❌ status mismatch (${mongoOrder.status} vs ${pgOrder.status})`);
  }
  
  // Items count
  const mongoItemCount = (mongoOrder.items || []).length;
  const pgItemCount = (pgOrder.items || []).length;
  if (mongoItemCount !== pgItemCount) {
    issues.push(`❌ CRITICAL: items count mismatch (${mongoItemCount} vs ${pgItemCount})`);
  }
  
  // Payment status if present
  if (mongoOrder.payment && pgOrder.payment) {
    if (mongoOrder.payment.status !== pgOrder.payment.status) {
      issues.push(`❌ CRITICAL: payment.status mismatch (${mongoOrder.payment.status} vs ${pgOrder.payment.status})`);
    }
  }
  
  return issues;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('Connected to Mongo:', mongoose.connection.name);
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('REPOSITORY-LEVEL VERIFICATION — Order Read Cutover');
  console.log('Comparing Mongo vs Postgres reassembly for real orders');
  console.log('═══════════════════════════════════════════════════════\n');

  // Test orders from Part A + random samples
  const testOrderIds = [
    '6a6687538476921364dd1223', // payment order from Part A
    '6a64dce0add63607ba4535d1'  // payment proof order from Part A
  ];
  
  // Add 3 random orders
  const randomOrders = await Order.find().limit(5).lean();
  randomOrders.forEach(o => {
    if (!testOrderIds.includes(o._id.toString())) {
      testOrderIds.push(o._id.toString());
    }
  });
  
  console.log(`Testing ${testOrderIds.length} orders...\n`);

  let allPass = true;
  let testedCount = 0;

  for (const orderId of testOrderIds.slice(0, 5)) {
    try {
      const mongoOrder = await Order.findById(orderId).lean();
      if (!mongoOrder) {
        console.log(`⚠️  SKIP: Order ${orderId} not found in Mongo`);
        continue;
      }
      
      const pgOrder = await findOrderDetailedByLegacyId(orderId);
      if (!pgOrder) {
        console.log(`❌ FAIL: Order ${orderId} not found in Postgres`);
        allPass = false;
        continue;
      }
      
      const issues = compareOrders(mongoOrder, pgOrder);
      
      if (issues.length > 0) {
        console.log(`❌ FAIL: Order ${orderId} (${mongoOrder.orderId}):`);
        issues.forEach(i => console.log(`  ${i}`));
        allPass = false;
      } else {
        console.log(`✓ PASS: Order ${orderId} (${mongoOrder.orderId}) - all critical fields match`);
        testedCount++;
      }
    } catch (err) {
      console.log(`❌ FAIL: Order ${orderId} -`, err.message);
      allPass = false;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`Overall: ${allPass ? '✓ ALL PASS' : '❌ FAILURES DETECTED'}`);
  console.log(`Tested: ${testedCount}/${testOrderIds.length} orders`);
  console.log('═══════════════════════════════════════════════════════');

  await mongoose.disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
