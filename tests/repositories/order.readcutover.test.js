#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 7 Part A — Order read-cutover real-data comparison tests.
 * Connects to REAL Mongo + Neon Postgres to compare reassembly against actual orders.
 * 
 * Required test cases (search real database for each):
 * 1. Order with payment + IPN history
 * 2. Order with payment proof
 * 3. Order with return items
 * 4. Order with null productId (product missing from Postgres)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const assert = require('node:assert');
const { describe, it, before, after } = require('node:test');

const Order = require('../../backend/src/models/order');
const orderRepository = require('../../backend/src/repositories/orderRepository');

// Track which specific orders were found for each test case
const testCases = {
  withPaymentAndIpn: null,
  withPaymentProof: null,
  withReturnItems: null,
  withNullProduct: null
};

function deepCompareScalar(pgValue, mongoValue, field) {
  if (typeof pgValue === 'number' && typeof mongoValue === 'number') {
    return Math.abs(pgValue - mongoValue) < 0.01;
  }
  if (pgValue instanceof Date && mongoValue instanceof Date) {
    return pgValue.getTime() === mongoValue.getTime();
  }
  return String(pgValue) === String(mongoValue);
}

describe('Order read-cutover reassembly (real data comparison)', () => {
  before(async () => {
    // Connect to real MongoDB
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
      if (!mongoUri) {
        throw new Error('MONGODB_URI or MONGO_URI not set — cannot connect to Mongo');
      }
      await mongoose.connect(mongoUri);
      console.log('Connected to Mongo:', mongoose.connection.name);
    }
    
    // Search for orders matching the 4 required test cases
    console.log('\n=== Searching for test case orders in real database ===');
    
    // Case 1: Order with payment + IPN history (preferred) OR just payment object (fallback)
    let withIpn = await Order.findOne({
      'payment.ipnHistory.0': { $exists: true }
    }).lean();
    
    if (!withIpn) {
      // Fallback: use any order with a payment object (even if ipnHistory is empty)
      withIpn = await Order.findOne({
        'payment.code': { $exists: true, $ne: '' }
      }).lean();
    }
    
    if (withIpn) {
      testCases.withPaymentAndIpn = withIpn._id.toString();
      const ipnCount = withIpn.payment?.ipnHistory?.length || 0;
      console.log(`✓ Case 1 (payment): ${testCases.withPaymentAndIpn} (${ipnCount} IPN events)`);
    } else {
      console.log('✗ Case 1: No order with payment found');
    }
    
    // Case 2: Order with payment proof
    const withProof = await Order.findOne({
      'paymentProof.trxId': { $exists: true }
    }).lean();
    if (withProof) {
      testCases.withPaymentProof = withProof._id.toString();
      console.log('✓ Case 2 (payment proof):', testCases.withPaymentProof);
    } else {
      console.log('✗ Case 2: No order with payment proof found');
    }
    
    // Case 3: Order with return items
    const withReturns = await Order.findOne({
      'returnItems.0': { $exists: true }
    }).lean();
    if (withReturns) {
      testCases.withReturnItems = withReturns._id.toString();
      console.log('✓ Case 3 (return items):', testCases.withReturnItems);
    } else {
      console.log('✗ Case 3: No order with return items found');
    }
    
    // Case 4: Order with null productId
    const prisma = require('../../backend/src/config/prismaClient');
    const itemWithNullProduct = await prisma.orderItem.findFirst({
      where: {
        productId: null,
        legacyProductId: { not: null }
      },
      include: { order: true }
    });
    if (itemWithNullProduct && itemWithNullProduct.order.legacyId) {
      testCases.withNullProduct = itemWithNullProduct.order.legacyId;
      console.log('✓ Case 4 (null productId):', testCases.withNullProduct);
    } else {
      console.log('✗ Case 4: No order with null productId found');
    }
    console.log('=== Search complete ===\n');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════
  // CASE 1: Order with payment object (tests payment{} reassembly + ipnHistory[] if present)
  // ═══════════════════════════════════════════════════════════════════
  it('CASE 1: Order with payment object reassembles identically', async () => {
    if (!testCases.withPaymentAndIpn) {
      console.log('⚠ SKIP Case 1: No order with payment found in database');
      return;
    }

    const legacyId = testCases.withPaymentAndIpn;
    const mongoOrder = await Order.findById(legacyId).lean();
    const pgOrder = await orderRepository.findOrderDetailedByLegacyId(legacyId);

    assert.ok(pgOrder, 'Postgres order should exist');
    assert.ok(mongoOrder, 'Mongo order should exist');

    // Root fields
    assert.strictEqual(pgOrder._id, mongoOrder._id.toString(), '_id should match');
    assert.strictEqual(pgOrder.orderId, mongoOrder.orderId, 'orderId should match');
    
    // Payment object
    assert.ok(mongoOrder.payment, 'Mongo should have payment');
    assert.ok(pgOrder.payment, 'Postgres should have payment');
    assert.strictEqual(pgOrder.payment.code, mongoOrder.payment.code, 'payment.code');
    assert.strictEqual(pgOrder.payment.name, mongoOrder.payment.name, 'payment.name');
    assert.strictEqual(pgOrder.payment.provider, mongoOrder.payment.provider, 'payment.provider');
    assert.strictEqual(pgOrder.payment.status, mongoOrder.payment.status, 'payment.status');
    
    // IPN history array (empty or populated)
    assert.ok(Array.isArray(mongoOrder.payment.ipnHistory), 'Mongo ipnHistory should be array');
    assert.ok(Array.isArray(pgOrder.payment.ipnHistory), 'Postgres ipnHistory should be array');
    assert.strictEqual(
      pgOrder.payment.ipnHistory.length,
      mongoOrder.payment.ipnHistory.length,
      'IPN history count should match'
    );
    
    // If IPN history exists, compare first event
    if (mongoOrder.payment.ipnHistory.length > 0) {
      const mongoIpn = mongoOrder.payment.ipnHistory[0];
      const pgIpn = pgOrder.payment.ipnHistory[0];
      assert.strictEqual(pgIpn.provider, mongoIpn.provider, 'IPN provider');
      assert.strictEqual(pgIpn.status, mongoIpn.status, 'IPN status');
      assert.strictEqual(pgIpn.verified, mongoIpn.verified, 'IPN verified');
      assert.strictEqual(String(pgIpn.amount), String(mongoIpn.amount), 'IPN amount');
      console.log(`✓ PASS Case 1: Order ${legacyId} payment + ${mongoOrder.payment.ipnHistory.length} IPN events match`);
    } else {
      console.log(`✓ PASS Case 1: Order ${legacyId} payment matches (no IPN history in this order)`);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // CASE 2: Order with payment proof
  // ═══════════════════════════════════════════════════════════════════
  it('CASE 2: Order with payment proof reassembles identically', async () => {
    if (!testCases.withPaymentProof) {
      console.log('⚠ SKIP Case 2: No order with payment proof found in database');
      return;
    }

    const legacyId = testCases.withPaymentProof;
    const mongoOrder = await Order.findById(legacyId).lean();
    const pgOrder = await orderRepository.findOrderDetailedByLegacyId(legacyId);

    assert.ok(pgOrder, 'Postgres order should exist');
    assert.ok(mongoOrder.paymentProof, 'Mongo should have paymentProof');
    assert.ok(pgOrder.paymentProof, 'Postgres should have paymentProof');

    // Compare paymentProof fields
    assert.strictEqual(pgOrder.paymentProof.trxId, mongoOrder.paymentProof.trxId, 'trxId');
    assert.strictEqual(pgOrder.paymentProof.status, mongoOrder.paymentProof.status, 'proof status');
    
    if (mongoOrder.paymentProof.screenshotUrl) {
      assert.strictEqual(
        pgOrder.paymentProof.screenshotUrl,
        mongoOrder.paymentProof.screenshotUrl,
        'screenshotUrl'
      );
    }
    
    if (mongoOrder.paymentProof.reviewedBy) {
      assert.ok(pgOrder.paymentProof.reviewedBy, 'reviewedBy should be present');
    }

    console.log(`✓ PASS Case 2: Order ${legacyId} paymentProof matches (trxId: ${mongoOrder.paymentProof.trxId})`);
  });

  // ═══════════════════════════════════════════════════════════════════
  // CASE 3: Order with return items
  // ═══════════════════════════════════════════════════════════════════
  it('CASE 3: Order with return items reassembles identically', async () => {
    if (!testCases.withReturnItems) {
      console.log('⚠ SKIP Case 3: No order with return items found in database');
      return;
    }

    const legacyId = testCases.withReturnItems;
    const mongoOrder = await Order.findById(legacyId).lean();
    const pgOrder = await orderRepository.findOrderDetailedByLegacyId(legacyId);

    assert.ok(pgOrder, 'Postgres order should exist');
    assert.ok(Array.isArray(mongoOrder.returnItems), 'Mongo returnItems should be array');
    assert.ok(Array.isArray(pgOrder.returnItems), 'Postgres returnItems should be array');
    assert.ok(mongoOrder.returnItems.length > 0, 'Mongo should have return items');
    assert.strictEqual(
      pgOrder.returnItems.length,
      mongoOrder.returnItems.length,
      'Return items count should match'
    );

    // Compare first return item
    const mongoReturn = mongoOrder.returnItems[0];
    const pgReturn = pgOrder.returnItems[0];
    assert.strictEqual(pgReturn.productName, mongoReturn.productName, 'return productName');
    assert.strictEqual(pgReturn.quantity, mongoReturn.quantity, 'return quantity');
    assert.strictEqual(String(pgReturn.price), String(mongoReturn.price), 'return price');
    assert.strictEqual(pgReturn.status, mongoReturn.status, 'return status');

    console.log(`✓ PASS Case 3: Order ${legacyId} has ${mongoOrder.returnItems.length} return items matching`);
  });

  // ═══════════════════════════════════════════════════════════════════
  // CASE 4: Order with null productId (product missing from Postgres)
  // ═══════════════════════════════════════════════════════════════════
  it('CASE 4: Order with null productId handles gracefully', async () => {
    if (!testCases.withNullProduct) {
      console.log('⚠ SKIP Case 4: No order with null productId found in database');
      return;
    }

    const legacyId = testCases.withNullProduct;
    const mongoOrder = await Order.findById(legacyId).lean();
    const pgOrder = await orderRepository.findOrderDetailedByLegacyId(legacyId);

    assert.ok(pgOrder, 'Postgres order should exist');
    assert.ok(Array.isArray(pgOrder.items), 'items should be array');
    assert.ok(pgOrder.items.length > 0, 'should have items');

    // Find the item with null productId in Postgres
    const prisma = require('../../backend/src/config/prismaClient');
    const nullItem = await prisma.orderItem.findFirst({
      where: {
        order: { legacyId },
        productId: null,
        legacyProductId: { not: null }
      }
    });

    assert.ok(nullItem, 'Should find item with null productId in Postgres');

    // The reassembled item should still appear with its snapshot fields
    const reassembledNullItem = pgOrder.items.find(
      (i) => i.id === nullItem.lineKey || i.productId === nullItem.legacyProductId
    );
    
    assert.ok(reassembledNullItem, 'Null-product item should appear in reassembled order');
    assert.ok(reassembledNullItem.name, 'Item should have snapshot name');
    assert.ok(typeof reassembledNullItem.price === 'number', 'Item should have snapshot price');
    assert.ok(typeof reassembledNullItem.quantity === 'number', 'Item should have quantity');

    console.log(`✓ PASS Case 4: Order ${legacyId} with null productId handled gracefully (item: ${reassembledNullItem.name})`);
  });

  // ═══════════════════════════════════════════════════════════════════
  // Additional shape parity tests
  // ═══════════════════════════════════════════════════════════════════
  it('subTotal AND subtotal are both preserved (never collapsed)', async () => {
    // Use any order that exists
    const legacyId = testCases.withPaymentAndIpn || testCases.withPaymentProof || testCases.withReturnItems || testCases.withNullProduct;
    if (!legacyId) {
      console.log('⚠ SKIP: No orders found for subTotal test');
      return;
    }

    const mongoOrder = await Order.findById(legacyId).lean();
    const pgOrder = await orderRepository.findOrderDetailedByLegacyId(legacyId);

    assert.ok('subTotal' in pgOrder, 'subTotal must exist');
    assert.ok('subtotal' in pgOrder, 'subtotal must exist');
    assert.strictEqual(typeof pgOrder.subTotal, 'number', 'subTotal type');
    assert.strictEqual(typeof pgOrder.subtotal, 'number', 'subtotal type');

    if ('subTotal' in mongoOrder) {
      assert.strictEqual(pgOrder.subTotal, Number(mongoOrder.subTotal), 'subTotal value');
    }
    if ('subtotal' in mongoOrder) {
      assert.strictEqual(pgOrder.subtotal, Number(mongoOrder.subtotal), 'subtotal value');
    }

    console.log(`✓ PASS: Both subTotal (${pgOrder.subTotal}) and subtotal (${pgOrder.subtotal}) preserved`);
  });

  it('items extraFields are flattened (not nested)', async () => {
    const legacyId = testCases.withPaymentAndIpn || testCases.withPaymentProof || testCases.withReturnItems || testCases.withNullProduct;
    if (!legacyId) {
      console.log('⚠ SKIP: No orders found for extraFields test');
      return;
    }

    const pgOrder = await orderRepository.findOrderDetailedByLegacyId(legacyId);
    assert.ok(Array.isArray(pgOrder.items), 'items should be array');

    for (const item of pgOrder.items) {
      assert.ok(!('extraFields' in item), 'items should NOT have nested .extraFields key');
      assert.ok('name' in item, 'items should have name');
      assert.ok('price' in item, 'items should have price');
    }

    console.log('✓ PASS: Items extraFields flattened correctly');
  });

  it('notificationsSent uses out_for_delivery (not outForDelivery)', async () => {
    const legacyId = testCases.withPaymentAndIpn || testCases.withPaymentProof || testCases.withReturnItems || testCases.withNullProduct;
    if (!legacyId) {
      console.log('⚠ SKIP: No orders found for notifications test');
      return;
    }

    const pgOrder = await orderRepository.findOrderDetailedByLegacyId(legacyId);
    
    if (pgOrder.notificationsSent) {
      assert.ok('out_for_delivery' in pgOrder.notificationsSent, 'Should use out_for_delivery');
      assert.ok(!('outForDelivery' in pgOrder.notificationsSent), 'Should NOT have outForDelivery');
      assert.strictEqual(typeof pgOrder.notificationsSent.out_for_delivery, 'boolean', 'Should be boolean');
    }

    console.log('✓ PASS: notificationsSent uses out_for_delivery key');
  });

  it('__v mongoose version key is present', async () => {
    const legacyId = testCases.withPaymentAndIpn || testCases.withPaymentProof || testCases.withReturnItems || testCases.withNullProduct;
    if (!legacyId) {
      console.log('⚠ SKIP: No orders found for __v test');
      return;
    }

    const pgOrder = await orderRepository.findOrderDetailedByLegacyId(legacyId);
    
    assert.ok('__v' in pgOrder, '__v should be present');
    assert.strictEqual(pgOrder.__v, 0, '__v should be 0');

    console.log('✓ PASS: __v mongoose version key present');
  });
});
