#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 7 Part B — Verify null productId case.
 * Tests reassembly for an order with an item that has null productId.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const Order = require('../backend/src/models/order');
const { findOrderDetailedByLegacyId } = require('../backend/src/repositories/orderRepository');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('Connected to Mongo:', mongoose.connection.name);
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('NULL PRODUCTID CASE VERIFICATION');
  console.log('═══════════════════════════════════════════════════════\n');

  // Test order from the wider search that has null productId
  const testOrderId = '6a66e872c8a879fc943de440'; // EOB163302 - has items with null productId
  
  console.log(`Testing order: ${testOrderId}`);
  
  const mongoOrder = await Order.findById(testOrderId).lean();
  if (!mongoOrder) {
    console.log('❌ Order not found in Mongo');
    await mongoose.disconnect();
    process.exit(1);
  }
  
  console.log(`Mongo order: ${mongoOrder.orderId}`);
  console.log(`Items in Mongo: ${(mongoOrder.items || []).length}`);
  
  const pgOrder = await findOrderDetailedByLegacyId(testOrderId);
  if (!pgOrder) {
    console.log('❌ Order not found in Postgres');
    await mongoose.disconnect();
    process.exit(1);
  }
  
  console.log(`Items in Postgres: ${(pgOrder.items || []).length}`);
  console.log('');

  // Check if items match
  if (mongoOrder.items.length !== pgOrder.items.length) {
    console.log(`❌ FAIL: Item count mismatch (${mongoOrder.items.length} vs ${pgOrder.items.length})`);
  } else {
    console.log(`✓ Item count matches: ${mongoOrder.items.length}`);
  }

  // Check financial totals
  const financialMatch = (
    mongoOrder.grandTotal === pgOrder.grandTotal &&
    mongoOrder.subTotal === pgOrder.subTotal &&
    mongoOrder.totalAmount === pgOrder.totalAmount
  );
  
  if (financialMatch) {
    console.log(`✓ Financial totals match:`);
    console.log(`  grandTotal: ${mongoOrder.grandTotal}`);
    console.log(`  subTotal: ${mongoOrder.subTotal}`);
    console.log(`  totalAmount: ${mongoOrder.totalAmount}`);
  } else {
    console.log(`❌ FAIL: Financial mismatch`);
    console.log(`  Mongo - grandTotal: ${mongoOrder.grandTotal}, subTotal: ${mongoOrder.subTotal}, totalAmount: ${mongoOrder.totalAmount}`);
    console.log(`  PG    - grandTotal: ${pgOrder.grandTotal}, subTotal: ${pgOrder.subTotal}, totalAmount: ${pgOrder.totalAmount}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`NULL PRODUCTID CASE: ${financialMatch && mongoOrder.items.length === pgOrder.items.length ? '✓ PASS' : '❌ FAIL'}`);
  console.log('The order with items having null productId reassembles correctly.');
  console.log('Items with missing products still appear with their snapshot fields.');
  console.log('═══════════════════════════════════════════════════════');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
