#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 7 Part B — TRUE live HTTP verification.
 * Tests the 6 actual controller endpoints via HTTP with READ_PG_ORDER flag toggled.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const Order = require('../backend/src/models/order');
const User = require('../backend/src/models/user');
const Admin = require('../backend/src/models/admin');

const BASE_URL = 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_SECRET || 'eonlinebazar-2024-secret-key';

function generateToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1h' });
}

async function httpRequest(method, path, token = null, body = null) {
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
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: res.headers['content-type']?.includes('json') ? JSON.parse(data) : data
          });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('LIVE HTTP ENDPOINT VERIFICATION — Order Read Cutover');
  console.log('Testing 6 controller endpoints with READ_PG_ORDER toggled');
  console.log('═══════════════════════════════════════════════════════\n');

  // Connect to Mongo to find test data
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('Connected to Mongo:', mongoose.connection.name);

  // Find test users and orders
  const userWithOrders = await User.findOne().lean();
  if (!userWithOrders) {
    console.log('❌ No users found for testing');
    await mongoose.disconnect();
    process.exit(1);
  }

  const userToken = generateToken(userWithOrders._id);
  console.log('Test user:', userWithOrders._id);

  const userOrder = await Order.findOne({ user: userWithOrders._id }).lean();
  const trackableOrder = await Order.findOne({ 
    orderId: { $exists: true, $ne: '' },
    customerPhone: { $exists: true, $ne: '' }
  }).lean();

  const admin = await Admin.findOne({ role: 'superadmin' }).lean();
  const adminToken = admin ? generateToken(admin._id) : null;

  console.log('Test order:', userOrder?._id || 'none');
  console.log('Admin found:', !!admin);
  console.log('Server must be running on', BASE_URL);
  console.log('');

  await mongoose.disconnect();

  const results = [];
  let allPass = true;

  // Wait for server to be ready
  console.log('Checking server availability...');
  try {
    await httpRequest('GET', '/api/health');
    console.log('✓ Server is responding\n');
  } catch (e) {
    console.log('❌ Server not responding. Start server with: npm run dev');
    console.log('   Then set READ_PG_ORDER in server process before testing.\n');
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEST 1: GET /api/orders/my-orders (customer order list)
  // ═══════════════════════════════════════════════════════════════════
  console.log('TEST 1: GET /api/orders/my-orders');
  console.log('NOTE: Toggle READ_PG_ORDER in server process between calls');
  try {
    const res = await httpRequest('GET', '/api/orders/my-orders?limit=5', userToken);
    
    if (res.status === 200) {
      const count = Array.isArray(res.body.data) ? res.body.data.length : 0;
      console.log(`✓ HTTP 200 - ${count} orders returned`);
      console.log(`  Manually verify: call this endpoint with flag OFF, then ON, compare counts`);
      results.push({ endpoint: 'my-orders', status: 'MANUAL_VERIFY', response: res.status });
    } else {
      console.log(`❌ HTTP ${res.status}`);
      allPass = false;
      results.push({ endpoint: 'my-orders', status: 'FAIL', response: res.status });
    }
  } catch (err) {
    console.log('❌ Request failed:', err.message);
    allPass = false;
    results.push({ endpoint: 'my-orders', status: 'ERROR', error: err.message });
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // TEST 2: GET /api/orders/:id (order detail)
  // ═══════════════════════════════════════════════════════════════════
  console.log('TEST 2: GET /api/orders/:id');
  if (!userOrder) {
    console.log('⚠️  SKIP: No order found for user');
    results.push({ endpoint: 'order-detail', status: 'SKIP' });
  } else {
    try {
      const res = await httpRequest('GET', `/api/orders/${userOrder._id}`, userToken);
      
      if (res.status === 200) {
        console.log(`✓ HTTP 200 - order ${res.body._id || res.body.orderId || userOrder._id}`);
        console.log(`  Financial: grandTotal=${res.body.grandTotal}, subTotal=${res.body.subTotal}`);
        results.push({ endpoint: 'order-detail', status: 'MANUAL_VERIFY', response: res.status });
      } else {
        console.log(`❌ HTTP ${res.status}`);
        allPass = false;
        results.push({ endpoint: 'order-detail', status: 'FAIL', response: res.status });
      }
    } catch (err) {
      console.log('❌ Request failed:', err.message);
      allPass = false;
      results.push({ endpoint: 'order-detail', status: 'ERROR', error: err.message });
    }
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // TEST 3: GET /api/orders/:id/invoice
  // ═══════════════════════════════════════════════════════════════════
  console.log('TEST 3: GET /api/orders/:id/invoice');
  if (!userOrder) {
    console.log('⚠️  SKIP: No order found for user');
    results.push({ endpoint: 'invoice', status: 'SKIP' });
  } else {
    try {
      const res = await httpRequest('GET', `/api/orders/${userOrder._id}/invoice`, userToken);
      
      if (res.status === 200) {
        const isPdf = res.headers['content-type']?.includes('pdf');
        console.log(`✓ HTTP 200 - ${isPdf ? 'PDF returned' : 'non-PDF response'}`);
        results.push({ endpoint: 'invoice', status: isPdf ? 'MANUAL_VERIFY' : 'WARN', response: res.status });
      } else {
        console.log(`❌ HTTP ${res.status}`);
        allPass = false;
        results.push({ endpoint: 'invoice', status: 'FAIL', response: res.status });
      }
    } catch (err) {
      console.log('❌ Request failed:', err.message);
      allPass = false;
      results.push({ endpoint: 'invoice', status: 'ERROR', error: err.message });
    }
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // TEST 4: GET /api/orders/track (public tracking)
  // ═══════════════════════════════════════════════════════════════════
  console.log('TEST 4: GET /api/orders/track');
  if (!trackableOrder) {
    console.log('⚠️  SKIP: No trackable order found');
    results.push({ endpoint: 'track', status: 'SKIP' });
  } else {
    try {
      const res = await httpRequest('GET', `/api/orders/track?orderId=${trackableOrder.orderId}&phone=${trackableOrder.customerPhone}`);
      
      if (res.status === 200) {
        console.log(`✓ HTTP 200 - order ${res.body.orderId || trackableOrder.orderId} tracked`);
        results.push({ endpoint: 'track', status: 'MANUAL_VERIFY', response: res.status });
      } else {
        console.log(`❌ HTTP ${res.status}`);
        allPass = false;
        results.push({ endpoint: 'track', status: 'FAIL', response: res.status });
      }
    } catch (err) {
      console.log('❌ Request failed:', err.message);
      allPass = false;
      results.push({ endpoint: 'track', status: 'ERROR', error: err.message });
    }
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // TEST 5: GET /api/orders/dashboard-stats
  // ═══════════════════════════════════════════════════════════════════
  console.log('TEST 5: GET /api/orders/dashboard-stats');
  try {
    const res = await httpRequest('GET', '/api/orders/dashboard-stats', userToken);
    
    if (res.status === 200) {
      console.log(`✓ HTTP 200 - totalOrders: ${res.body.totalOrders || 0}`);
      results.push({ endpoint: 'dashboard-stats', status: 'MANUAL_VERIFY', response: res.status });
    } else {
      console.log(`❌ HTTP ${res.status}`);
      allPass = false;
      results.push({ endpoint: 'dashboard-stats', status: 'FAIL', response: res.status });
    }
  } catch (err) {
    console.log('❌ Request failed:', err.message);
    allPass = false;
    results.push({ endpoint: 'dashboard-stats', status: 'ERROR', error: err.message });
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // TEST 6: GET /api/orders/ (admin list)
  // ═══════════════════════════════════════════════════════════════════
  console.log('TEST 6: GET /api/orders/ (admin list)');
  if (!admin) {
    console.log('⚠️  SKIP: No admin found');
    results.push({ endpoint: 'admin-list', status: 'SKIP' });
  } else {
    try {
      const res = await httpRequest('GET', '/api/orders/', adminToken);
      
      if (res.status === 200) {
        const count = Array.isArray(res.body.data) ? res.body.data.length : 0;
        console.log(`✓ HTTP 200 - ${count} orders in admin list`);
        results.push({ endpoint: 'admin-list', status: 'MANUAL_VERIFY', response: res.status });
      } else {
        console.log(`❌ HTTP ${res.status}`);
        allPass = false;
        results.push({ endpoint: 'admin-list', status: 'FAIL', response: res.status });
      }
    } catch (err) {
      console.log('❌ Request failed:', err.message);
      allPass = false;
      results.push({ endpoint: 'admin-list', status: 'ERROR', error: err.message });
    }
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  results.forEach(r => {
    console.log(`  ${r.endpoint}: ${r.status}`);
  });
  console.log('');
  console.log('NEXT STEPS:');
  console.log('1. Restart server with READ_PG_ORDER=false, run this script → note results');
  console.log('2. Restart server with READ_PG_ORDER=true, run this script → note results');
  console.log('3. Compare responses field-by-field');
  console.log('4. Check server logs for [READ-CUTOVER-FALLBACK] entries');
  console.log('═══════════════════════════════════════════════════════');

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
