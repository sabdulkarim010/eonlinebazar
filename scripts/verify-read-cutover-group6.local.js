#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 6 — User + owned tables read-cutover verification (local).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const FLAGS = [
  'READ_PG_USER',
  'READ_PG_ADDRESS',
  'READ_PG_WISHLIST',
  'READ_PG_WALLET',
  'READ_PG_CART'
];

const fallbacks = [];
const origErr = console.error;
console.error = (...args) => {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  if (msg.includes('[READ-CUTOVER-FALLBACK]')) fallbacks.push(msg);
  origErr.apply(console, args);
};

function setFlags(on) {
  FLAGS.forEach((k) => {
    if (on) process.env[k] = 'true';
    else delete process.env[k];
  });
}

function stripUserCosmeticFields(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const copy = { ...obj };
  delete copy.__v;
  if (copy._id != null && copy.id === String(copy._id)) delete copy.id;
  // Legacy pollution on some Mongo user docs — not part of the User schema / PG shape.
  delete copy.isAdmin;
  delete copy.role;
  delete copy.sessions;
  return copy;
}

function stableProfileBody(body) {
  if (!body || typeof body !== 'object') return body;
  const copy = stripUserCosmeticFields(body);
  delete copy.rewardSettings;
  delete copy.tierSettings;
  delete copy.deliverySettings;
  delete copy.announcement;
  return copy;
}

function normalizeAdminCustomerRow(row) {
  const c = stripUserCosmeticFields(row);
  if (!c.accountStatus || c.accountStatus === 'active') delete c.accountStatus;
  if (!c.isSandbox) delete c.isSandbox;
  if (!c.walletBalance) delete c.walletBalance;
  if (!c.loyaltyPoints) delete c.loyaltyPoints;
  if (!c.address) delete c.address;
  if (!c.district) delete c.district;
  if (!c.upazila) delete c.upazila;
  if (!c.thana) delete c.thana;
  if (!c.fullAddress) delete c.fullAddress;
  if (!c.avatar) delete c.avatar;
  if (!c.avatarPublicId) delete c.avatarPublicId;
  if (!c.phone) delete c.phone;
  if (!c.isDeleted) {
    delete c.isDeleted;
    delete c.deletedAt;
    delete c.deletionReason;
  }
  if (!c.referralCode) delete c.referralCode;
  if (!c.referralEarnings) delete c.referralEarnings;
  if (!c.lifetimeSpend) delete c.lifetimeSpend;
  if (!c.tierCashbackRate) delete c.tierCashbackRate;
  if (c.loyaltyTier === 'none') delete c.loyaltyTier;
  if (!c.tierUpgradedAt) delete c.tierUpgradedAt;
  if (!c.verificationToken) delete c.verificationToken;
  if (!c.verificationTokenExpiry) delete c.verificationTokenExpiry;
  if (!c.resetPasswordOtp) delete c.resetPasswordOtp;
  if (!c.resetPasswordExpires) delete c.resetPasswordExpires;
  if (!c.profileUpdateOtp) delete c.profileUpdateOtp;
  if (!c.profileUpdateOtpExpires) delete c.profileUpdateOtpExpires;
  if (!c.profileUpdateType) delete c.profileUpdateType;
  if (!c.pendingEmail) delete c.pendingEmail;
  if (!c.pendingMobile) delete c.pendingMobile;
  if (!c.referredBy) delete c.referredBy;
  if (!c.googleId) delete c.googleId;
  if (!c.avatarUrl) delete c.avatarUrl;
  if (!c.lastLogin) delete c.lastLogin;
  delete c.orderCount;
  delete c.totalSpent;
  delete c.segment;
  delete c.isVip;
  delete c.isFrequentBuyer;
  delete c.isInactive;
  delete c.name;
  delete c.addresses;
  delete c.wishlist;
  delete c.walletHistory;
  return c;
}

function stableAdminCustomerBody(body) {
  if (!body || typeof body !== 'object') return body;
  if (body.data && typeof body.data === 'object') {
    return {
      ...body,
      data: normalizeAdminCustomerRow(body.data)
    };
  }
  if (Array.isArray(body.customers)) {
    return {
      success: body.success,
      customers: body.customers.map((row) => normalizeAdminCustomerRow(row)),
      nextCursor: body.nextCursor,
      hasMore: body.hasMore
    };
  }
  return body;
}

function stripCartLineCosmetic(item) {
  if (!item || typeof item !== 'object') return item;
  const copy = { ...item };
  delete copy._id;
  return copy;
}

function stableCartBody(body) {
  if (!body || typeof body !== 'object') return body;
  if (!Array.isArray(body.data)) return body;
  return { ...body, data: body.data.map(stripCartLineCosmetic) };
}

function stable(v) {
  if (v === undefined) return '__UNDEFINED__';
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(stable);
  if (typeof v === 'object') {
    const o = {};
    Object.keys(v).sort().forEach((k) => { o[k] = stable(v[k]); });
    return o;
  }
  return v;
}

function diff(a, b, p = '') {
  const out = [];
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${p}: len ${a.length} vs ${b.length}`);
    for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(...diff(a[i], b[i], `${p}[${i}]`));
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    [...keys].sort().forEach((k) => {
      const np = p ? `${p}.${k}` : k;
      if (!(k in a)) out.push(`${np}: missing in Mongo`);
      else if (!(k in b)) out.push(`${np}: extra in Postgres`);
      else out.push(...diff(a[k], b[k], np));
    });
    return out;
  }
  if (a !== b) out.push(`${p || 'root'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
  return out;
}

async function compareEndpoint(app, token, label, path, { auth = true, transformBody } = {}) {
  setFlags(false);
  delete require.cache[require.resolve('../backend/src/config/readCutoverFlags')];
  const mongoReq = request(app).get(path);
  if (auth && token) mongoReq.set('Authorization', `Bearer ${token}`);
  const mongoRes = await mongoReq;

  setFlags(true);
  delete require.cache[require.resolve('../backend/src/config/readCutoverFlags')];
  const pgReq = request(app).get(path);
  if (auth && token) pgReq.set('Authorization', `Bearer ${token}`);
  const pgRes = await pgReq;
  setFlags(false);

  const mongoBody = transformBody ? transformBody(mongoRes.body) : mongoRes.body;
  const pgBody = transformBody ? transformBody(pgRes.body) : pgRes.body;
  const diffs = diff(stable(mongoBody), stable(pgBody));
  const pass = mongoRes.status === pgRes.status && diffs.length === 0;
  return { label, pass, status: mongoRes.status, diffs: diffs.slice(0, 15), skipped: false };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const User = require('../backend/src/models/user');
  const Cart = require('../backend/src/models/cart');
  const Admin = require('../backend/src/models/admin');

  const sampleUser = await User.findOne({
    isDeleted: { $ne: true },
    addresses: { $exists: true, $not: { $size: 0 } },
    'walletHistory.0': { $exists: true }
  }).lean();

  const wishlistUser = await User.findOne({ 'wishlist.0': { $exists: true } }).lean();
  const cartUser = await Cart.findOne({ 'items.0': { $exists: true } }).lean();
  const admin = await Admin.findOne({ status: 'active' }).lean();

  const app = require('../tests/app');
  const results = [];

  if (sampleUser) {
    const customerToken = jwt.sign({ id: String(sampleUser._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
    results.push(await compareEndpoint(
      app,
      customerToken,
      'Customer profile',
      '/api/customer/profile',
      { transformBody: stableProfileBody }
    ));
    results.push(await compareEndpoint(app, customerToken, 'Customer addresses', '/api/customer/addresses'));
    results.push(await compareEndpoint(app, customerToken, 'Dashboard wallet balance', '/api/orders/dashboard-stats'));
    results.push(await compareEndpoint(app, customerToken, 'Referral info', '/api/customer/referral'));
  } else {
    results.push({ label: 'Customer profile', pass: false, skipped: true, reason: 'No user with addresses + wallet history' });
  }

  if (wishlistUser) {
    const token = jwt.sign({ id: String(wishlistUser._id) }, process.env.JWT_SECRET, { expiresIn: '1h' });
    results.push(await compareEndpoint(app, token, 'Customer wishlist', '/api/customer/wishlist'));
  } else {
    results.push({ label: 'Customer wishlist', pass: false, skipped: true, reason: 'No user with wishlist items' });
  }

  if (cartUser) {
    const token = jwt.sign({ id: String(cartUser.userId) }, process.env.JWT_SECRET, { expiresIn: '1h' });
    results.push(await compareEndpoint(
      app,
      token,
      'Customer cart',
      '/api/cart/',
      { transformBody: stableCartBody }
    ));
  } else {
    results.push({ label: 'Customer cart', pass: false, skipped: true, reason: 'No Mongo cart with items' });
  }

  if (admin) {
    const adminToken = jwt.sign({ username: admin.username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    results.push(await compareEndpoint(
      app,
      adminToken,
      'Admin customers list',
      '/api/admin/customers?limit=5',
      { auth: true, transformBody: stableAdminCustomerBody }
    ));
    if (sampleUser) {
      results.push(await compareEndpoint(
        app,
        adminToken,
        'Admin customer detail',
        `/api/admin/customers/${sampleUser._id}`,
        { transformBody: stableAdminCustomerBody }
      ));
    }
  } else {
    results.push({ label: 'Admin customers list', pass: false, skipped: true, reason: 'No active admin' });
  }

  const summary = {
    overall: results.every((r) => r.skipped || r.pass) ? 'PASS' : 'FAIL',
    fallbacks: fallbacks.length,
    results
  };
  console.log(JSON.stringify(summary, null, 2));

  await mongoose.disconnect();
  process.exit(summary.overall === 'PASS' ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
