#!/usr/bin/env node
'use strict';
/**
 * Search for orders matching the 4 test cases needed for Order read-cutover tests.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Order = require('../backend/src/models/order');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('Connected to Mongo:', mongoose.connection.name);
  console.log('\nSearching for test case orders...\n');

  // Case 1: Payment with IPN history (non-empty array)
  const withIpn = await Order.findOne({
    'payment.ipnHistory': { $exists: true, $ne: [] }
  }).lean();
  console.log('Case 1 (payment + IPN):', withIpn ? `${withIpn._id} (${withIpn.payment.ipnHistory.length} events)` : 'NOT FOUND');

  // Alternative: Just any order with payment object
  const withPayment = await Order.findOne({
    'payment.code': { $exists: true, $ne: '' }
  }).lean();
  console.log('  Alternative (any payment):', withPayment ? withPayment._id : 'NOT FOUND');

  // Case 2: Payment proof
  const withProof = await Order.findOne({
    'paymentProof.trxId': { $exists: true }
  }).lean();
  console.log('Case 2 (payment proof):', withProof ? withProof._id : 'NOT FOUND');

  // Case 3: Return items
  const withReturns = await Order.findOne({
    returnItems: { $exists: true, $ne: [] }
  }).lean();
  console.log('Case 3 (return items):', withReturns ? `${withReturns._id} (${withReturns.returnItems.length} items)` : 'NOT FOUND');

  // Case 4: Check Postgres for null productId
  const prisma = require('../backend/src/config/prismaClient');
  const nullProductItem = await prisma.orderItem.findFirst({
    where: {
      productId: null,
      legacyProductId: { not: null }
    },
    include: { order: true }
  });
  console.log('Case 4 (null productId):', nullProductItem ? nullProductItem.order.legacyId : 'NOT FOUND');

  // Count total orders
  const totalOrders = await Order.countDocuments();
  console.log(`\nTotal orders in Mongo: ${totalOrders}`);

  await mongoose.disconnect();
}

main().catch(console.error);
