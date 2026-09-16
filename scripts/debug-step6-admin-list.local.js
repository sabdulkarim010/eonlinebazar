#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const FLAGS = ['READ_PG_USER', 'READ_PG_ADDRESS', 'READ_PG_WISHLIST', 'READ_PG_WALLET'];

async function withFlags(on, fn) {
  FLAGS.forEach((k) => { if (on) process.env[k] = 'true'; else delete process.env[k]; });
  delete require.cache[require.resolve('../backend/src/config/readCutoverFlags')];
  return fn();
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const { fetchAdminCustomersPage } = require('../backend/src/services/userReadService');

  const mongoRows = await withFlags(false, () => fetchAdminCustomersPage({ query: { limit: 5 }, limit: 5 }));
  const pgRows = await withFlags(true, () => fetchAdminCustomersPage({ query: { limit: 5 }, limit: 5 }));

  console.log(JSON.stringify({
    mongo: mongoRows.map((u) => ({ _id: String(u._id), email: u.email, googleId: u.googleId || null })),
    pg: pgRows.map((u) => ({ _id: String(u._id), email: u.email, googleId: u.googleId || null }))
  }, null, 2));

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
