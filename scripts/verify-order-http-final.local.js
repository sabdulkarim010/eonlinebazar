#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 7 Part B — TRUE HTTP endpoint verification with flag comparison.
 * Uses the actual test orders from Part A unit tests.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('fs');

const Order = require('../backend/src/models/order');
const User = require('../backend/src/models/user');
const Admin = require('../backend/src/models/admin');

const BASE_URL = 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_SECRET || 'eonlinebazar-2024-secret-key';

// Test orders from Part A
const TEST_ORDER_PAYMENT = '6a6687538476921364dd1223'; // EOB352403 - payment order
const TEST_ORDER_PROOF = '6a64dce0add63607ba4535d1';   // EOB425345 - payment proof

function generateToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1h' });
}

async function httpRequest(method, path, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const body = res.headers['content-type']?.includes('json') 
            ? JSON.parse(data) 
            : data;
          resolve({ status: res.statusCode, headers: res.headers, body });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function compareFields(mongoResp, pgResp, fields) {
  const diffs = [];
  for (const field of fields) {
    const keys = field.split('.');
    let mongoVal = mongoResp;
    let pgVal = pgResp;
    
    for (const key of keys) {
      mongoVal = mongoVal?.[key];
      pgVal = pgVal?.[key];
    }
    
    if (JSON.stringify(mongoVal) !== JSON.stringify(pgVal)) {
      diffs.push({
        field,
        mongo: mongoVal,
        postgres: pgVal
      });
    }
  }
  return diffs;
}

async function main() {
  const flagState = process.env.READ_PG_ORDER === 'true' ? 'POSTGRES' : 'MONGO';
  const outputFile = `verify-results-${flagState.toLowerCase()}.json`;

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('LIVE HTTP ENDPOINT VERIFICATION — Order Read Cutover');
  console.log(`Current flag state: READ_PG_ORDER=${flagState}`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Connect to Mongo to find test data
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('Connected to Mongo:', mongoose.connection.name);

  // Find users who own the test orders
  const paymentOrder = await Order.findById(TEST_ORDER_PAYMENT).lean();
  const proofOrder = await Order.findById(TEST_ORDER_PROOF).lean();
  
  if (!paymentOrder || !proofOrder) {
    console.log('❌ Test orders not found in Mongo');
    console.log(`  Payment order ${TEST_ORDER_PAYMENT}:`, !!paymentOrder);
    console.log(`  Proof order ${TEST_ORDER_PROOF}:`, !!proofOrder);
    await mongoose.disconnect();
    process.exit(1);
  }

  const testUserId = paymentOrder.user?.toString() || proofOrder.user?.toString();
  const testUser = await User.findById(testUserId).lean();
  
  if (!testUser) {
    console.log('❌ Test order owner not found');
    await mongoose.disconnect();
    process.exit(1);
  }

  const userToken = generateToken(testUserId);
  console.log('Test user:', testUserId);
  console.log('Payment order:', TEST_ORDER_PAYMENT, paymentOrder.orderId);
  console.log('Proof order:', TEST_ORDER_PROOF, proofOrder.orderId);

  // Find trackable order
  const trackableOrder = await Order.findOne({ 
    orderId: { $exists: true, $ne: '' },
    customerPhone: { $exists: true, $ne: '' }
  }).lean();

  // Find admin
  const admin = await Admin.findOne({ role: 'superadmin' }).lean();
  const adminToken = admin ? generateToken(admin._id) : null;
  console.log('Admin found:', !!admin);
  console.log('');

  await mongoose.disconnect();

  // Check server
  try {
    await httpRequest('GET', '/api/health');
    console.log('✓ Server is responding\n');
  } catch (e) {
    console.log('❌ Server not responding on', BASE_URL);
    process.exit(1);
  }

  const results = {};

  // ═══════════════════════════════════════════════════════════════════
  // TEST 1: GET /api/orders/my-orders
  // ═══════════════════════════════════════════════════════════════════
  console.log('TEST 1: GET /api/orders/my-orders');
  try {
    const res = await httpRequest('GET', '/api/orders/my-orders?limit=10', userToken);
    results.myOrders = {
      status: res.status,
      count: Array.isArray(res.body.data) ? res.body.data.length : 0,
      data: res.body.data
    };
    console.log(`  Status: ${res.status}, Count: ${results.myOrders.count}`);
  } catch (err) {
    results.myOrders = { error: err.message };
    console.log(`  ERROR: ${err.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 2a: GET /api/orders/:id (payment order)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\nTEST 2a: GET /api/orders/:id (payment order)');
  try {
    const res = await httpRequest('GET', `/api/orders/${TEST_ORDER_PAYMENT}`, userToken);
    results.orderDetailPayment = {
      status: res.status,
      orderId: res.body.orderId,
      grandTotal: res.body.grandTotal,
      subTotal: res.body.subTotal,
      subtotal: res.body.subtotal,
      itemCount: res.body.items?.length,
      payment: res.body.payment?.status,
      data: res.body
    };
    console.log(`  Status: ${res.status}, OrderID: ${results.orderDetailPayment.orderId}`);
    console.log(`  Financials: grandTotal=${results.orderDetailPayment.grandTotal}, subTotal=${results.orderDetailPayment.subTotal}`);
  } catch (err) {
    results.orderDetailPayment = { error: err.message };
    console.log(`  ERROR: ${err.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 2b: GET /api/orders/:id (proof order)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\nTEST 2b: GET /api/orders/:id (proof order)');
  try {
    const res = await httpRequest('GET', `/api/orders/${TEST_ORDER_PROOF}`, userToken);
    results.orderDetailProof = {
      status: res.status,
      orderId: res.body.orderId,
      grandTotal: res.body.grandTotal,
      subTotal: res.body.subTotal,
      itemCount: res.body.items?.length,
      paymentProof: !!res.body.paymentProof,
      data: res.body
    };
    console.log(`  Status: ${res.status}, OrderID: ${results.orderDetailProof.orderId}`);
    console.log(`  Has paymentProof: ${results.orderDetailProof.paymentProof}`);
  } catch (err) {
    results.orderDetailProof = { error: err.message };
    console.log(`  ERROR: ${err.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 3: GET /api/orders/:id/invoice
  // ═══════════════════════════════════════════════════════════════════
  console.log('\nTEST 3: GET /api/orders/:id/invoice');
  try {
    const res = await httpRequest('GET', `/api/orders/${TEST_ORDER_PAYMENT}/invoice`, userToken);
    results.invoice = {
      status: res.status,
      contentType: res.headers['content-type'],
      isPdf: res.headers['content-type']?.includes('pdf')
    };
    console.log(`  Status: ${res.status}, Type: ${results.invoice.contentType}`);
  } catch (err) {
    results.invoice = { error: err.message };
    console.log(`  ERROR: ${err.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 4: GET /api/orders/track
  // ═══════════════════════════════════════════════════════════════════
  console.log('\nTEST 4: GET /api/orders/track');
  if (!trackableOrder) {
    results.track = { skipped: true };
    console.log('  SKIP: No trackable order');
  } else {
    try {
      const res = await httpRequest('GET', `/api/orders/track?orderId=${trackableOrder.orderId}&phone=${trackableOrder.customerPhone}`);
      results.track = {
        status: res.status,
        orderId: res.body.orderId,
        trackingStatus: res.body.status,
        data: res.body
      };
      console.log(`  Status: ${res.status}, OrderID: ${results.track.orderId}`);
    } catch (err) {
      results.track = { error: err.message };
      console.log(`  ERROR: ${err.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 5: GET /api/orders/dashboard-stats
  // ═══════════════════════════════════════════════════════════════════
  console.log('\nTEST 5: GET /api/orders/dashboard-stats');
  try {
    const res = await httpRequest('GET', '/api/orders/dashboard-stats', userToken);
    results.dashboardStats = {
      status: res.status,
      totalOrders: res.body.totalOrders,
      data: res.body
    };
    console.log(`  Status: ${res.status}, TotalOrders: ${results.dashboardStats.totalOrders}`);
  } catch (err) {
    results.dashboardStats = { error: err.message };
    console.log(`  ERROR: ${err.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 6: GET /api/orders/ (admin list)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\nTEST 6: GET /api/orders/ (admin list)');
  if (!admin) {
    results.adminList = { skipped: true };
    console.log('  SKIP: No admin found');
  } else {
    try {
      const res = await httpRequest('GET', '/api/orders/?limit=10', adminToken);
      results.adminList = {
        status: res.status,
        count: Array.isArray(res.body.data) ? res.body.data.length : 0,
        data: res.body.data
      };
      console.log(`  Status: ${res.status}, Count: ${results.adminList.count}`);
    } catch (err) {
      results.adminList = { error: err.message };
      console.log(`  ERROR: ${err.message}`);
    }
  }

  // Save results
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`Results saved to: ${outputFile}`);
  console.log('Run this script twice:');
  console.log('  1. With READ_PG_ORDER=false (or unset)');
  console.log('  2. With READ_PG_ORDER=true');
  console.log('Then compare the two JSON files.');
  console.log('═══════════════════════════════════════════════════════');

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
