/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: order.readcutover.test.js
 * Location: tests/repositories/order.readcutover.test.js
 * Description: Unit tests for Order read cutover (Step 7 Part A).
 *   Compares Postgres reassembly against real Mongo source for:
 *   - Full 7-table reassembly (items, payment+ipnHistory, proof, notifications, returns)
 *   - subTotal vs subtotal preservation
 *   - extraFields flattening in items
 *   - out_for_delivery vs outForDelivery mapping
 *   - userId as bare ObjectId (not populated)
 ********************************************************************/

const assert = require('node:assert');
const { describe, it, before, after } = require('node:test');
const mongoose = require('mongoose');
const Order = require('../../backend/src/models/order');
const orderRepository = require('../../backend/src/repositories/orderRepository');

describe('Order read-cutover reassembly', () => {
  let testOrderLegacyId = null;
  let testOrderWithPayment = null;

  before(async () => {
    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL;
      if (mongoUri) {
        await mongoose.connect(mongoUri);
      }
    }
    
    // Find a real order from Mongo with payment data
    const orderWithPayment = await Order.findOne({ 
      payment: { $exists: true }
    }).lean();
    
    if (orderWithPayment) {
      testOrderWithPayment = orderWithPayment._id.toString();
    }

    // Find any order for basic shape test
    const anyOrder = await Order.findOne().lean();
    if (anyOrder) {
      testOrderLegacyId = anyOrder._id.toString();
    }
  });

  after(async () => {
    // Clean up connections
    await mongoose.disconnect();
  });

  it('findOrderDetailedByLegacyId returns null for non-existent order', async () => {
    const result = await orderRepository.findOrderDetailedByLegacyId('000000000000000000000000');
    assert.strictEqual(result, null);
  });

  it('reassembled order matches Mongo shape for _id, user, subTotal, subtotal', async () => {
    if (!testOrderLegacyId) {
      console.log('SKIP: No orders in Mongo');
      return;
    }

    const mongoOrder = await Order.findById(testOrderLegacyId).lean();
    const pgOrder = await orderRepository.findOrderDetailedByLegacyId(testOrderLegacyId);

    assert.ok(pgOrder, 'Postgres order should exist');
    assert.strictEqual(pgOrder._id, mongoOrder._id.toString(), '_id should match legacyId');
    
    // User: Postgres returns userId as string, Mongo may have ObjectId or populated object
    if (mongoOrder.user) {
      const mongoUserId = typeof mongoOrder.user === 'object' && mongoOrder.user._id
        ? mongoOrder.user._id.toString()
        : mongoOrder.user.toString();
      assert.strictEqual(
        String(pgOrder.user || ''),
        mongoUserId,
        'user field should match (as ObjectId string, not populated)'
      );
    }

    // subTotal AND subtotal: both must exist and be distinct
    assert.ok('subTotal' in pgOrder, 'subTotal must be present');
    assert.ok('subtotal' in pgOrder, 'subtotal must be present');
    assert.strictEqual(typeof pgOrder.subTotal, 'number', 'subTotal should be number');
    assert.strictEqual(typeof pgOrder.subtotal, 'number', 'subtotal should be number');
    
    // If Mongo has both, they should match
    if ('subTotal' in mongoOrder && 'subtotal' in mongoOrder) {
      assert.strictEqual(
        pgOrder.subTotal,
        Number(mongoOrder.subTotal),
        'subTotal value should match Mongo'
      );
      assert.strictEqual(
        pgOrder.subtotal,
        Number(mongoOrder.subtotal),
        'subtotal value should match Mongo'
      );
    }
  });

  it('items array flattens extraFields correctly', async () => {
    if (!testOrderLegacyId) {
      console.log('SKIP: No orders in Mongo');
      return;
    }

    const mongoOrder = await Order.findById(testOrderLegacyId).lean();
    const pgOrder = await orderRepository.findOrderDetailedByLegacyId(testOrderLegacyId);

    assert.ok(Array.isArray(pgOrder.items), 'items should be an array');
    assert.strictEqual(
      pgOrder.items.length,
      (mongoOrder.items || []).length,
      'items count should match'
    );

    // Check that extraFields are flattened (not nested under .extraFields key)
    for (const item of pgOrder.items) {
      assert.ok(!('extraFields' in item), 'items should not have nested extraFields key');
      assert.ok('id' in item || 'productId' in item, 'items should have base fields');
      assert.ok('name' in item, 'items should have name');
      assert.ok('price' in item, 'items should have price');
      assert.ok('quantity' in item, 'items should have quantity');
    }
  });

  it('payment object includes ipnHistory array when present', async () => {
    if (!testOrderWithPayment) {
      console.log('SKIP: No orders with payment in Mongo');
      return;
    }

    const mongoOrder = await Order.findById(testOrderWithPayment).lean();
    const pgOrder = await orderRepository.findOrderDetailedByLegacyId(testOrderWithPayment);

    if (mongoOrder.payment) {
      assert.ok(pgOrder.payment, 'Postgres order should have payment');
      assert.ok('ipnHistory' in pgOrder.payment, 'payment should have ipnHistory');
      assert.ok(Array.isArray(pgOrder.payment.ipnHistory), 'ipnHistory should be array');
      assert.strictEqual(pgOrder.payment.code, mongoOrder.payment.code, 'payment.code should match');
      assert.strictEqual(pgOrder.payment.name, mongoOrder.payment.name, 'payment.name should match');
    }
  });

  it('notificationsSent maps outForDelivery to out_for_delivery', async () => {
    if (!testOrderLegacyId) {
      console.log('SKIP: No orders in Mongo');
      return;
    }

    const pgOrder = await orderRepository.findOrderDetailedByLegacyId(testOrderLegacyId);
    
    if (pgOrder.notificationsSent) {
      assert.ok('out_for_delivery' in pgOrder.notificationsSent, 'Should use out_for_delivery, not outForDelivery');
      assert.ok(!('outForDelivery' in pgOrder.notificationsSent), 'Should not have outForDelivery in Mongo shape');
      assert.strictEqual(typeof pgOrder.notificationsSent.out_for_delivery, 'boolean', 'out_for_delivery should be boolean');
    }
  });

  it('returnItems array is present (empty or with data)', async () => {
    if (!testOrderLegacyId) {
      console.log('SKIP: No orders in Mongo');
      return;
    }

    const pgOrder = await orderRepository.findOrderDetailedByLegacyId(testOrderLegacyId);
    
    assert.ok('returnItems' in pgOrder, 'returnItems should be present');
    assert.ok(Array.isArray(pgOrder.returnItems), 'returnItems should be array');
  });

  it('paymentProof is null or has correct shape', async () => {
    if (!testOrderLegacyId) {
      console.log('SKIP: No orders in Mongo');
      return;
    }

    const mongoOrder = await Order.findById(testOrderLegacyId).lean();
    const pgOrder = await orderRepository.findOrderDetailedByLegacyId(testOrderLegacyId);
    
    if (mongoOrder.paymentProof) {
      assert.ok(pgOrder.paymentProof, 'Postgres order should have paymentProof when Mongo does');
      assert.ok('trxId' in pgOrder.paymentProof, 'paymentProof should have trxId');
      assert.ok('status' in pgOrder.paymentProof, 'paymentProof should have status');
    } else {
      assert.ok(
        pgOrder.paymentProof === null || pgOrder.paymentProof === undefined,
        'paymentProof should be null when not present'
      );
    }
  });

  it('__v mongoose version key is present in reassembled shape', async () => {
    if (!testOrderLegacyId) {
      console.log('SKIP: No orders in Mongo');
      return;
    }

    const pgOrder = await orderRepository.findOrderDetailedByLegacyId(testOrderLegacyId);
    
    assert.ok('__v' in pgOrder, '__v should be present for Mongoose compatibility');
    assert.strictEqual(pgOrder.__v, 0, '__v should be 0 for read-cutover shape');
  });

  it('findAllDetailed returns list of orders with items', async () => {
    const orders = await orderRepository.findAllDetailed({ limit: 5 });
    
    assert.ok(Array.isArray(orders), 'Should return array');
    
    for (const order of orders) {
      assert.ok('_id' in order, 'Each order should have _id');
      assert.ok('orderId' in order, 'Each order should have orderId');
      assert.ok('items' in order, 'Each order should have items');
      assert.ok(Array.isArray(order.items), 'items should be array');
      assert.ok('subTotal' in order, 'Each order should have subTotal');
      assert.ok('subtotal' in order, 'Each order should have subtotal');
      assert.ok('__v' in order, 'Each order should have __v');
    }
  });
});
