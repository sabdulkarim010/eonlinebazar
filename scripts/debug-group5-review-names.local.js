#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const request = require('supertest');

const FLAGS = ['READ_PG_REVIEW'];

function setFlags(on) {
  FLAGS.forEach((k) => {
    if (on) process.env[k] = 'true';
    else delete process.env[k];
  });
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Review = require('../backend/src/models/review');
  const sample = await Review.findOne({ isHidden: { $ne: true } }).select('productId').lean();
  const path = `/api/reviews/${encodeURIComponent(sample.productId)}`;
  const app = require('../tests/app');

  setFlags(false);
  delete require.cache[require.resolve('../backend/src/config/readCutoverFlags')];
  const mongoRes = await request(app).get(path);

  setFlags(true);
  delete require.cache[require.resolve('../backend/src/config/readCutoverFlags')];
  const pgRes = await request(app).get(path);

  const m0 = mongoRes.body.reviews?.[0]?.userId;
  const p0 = pgRes.body.reviews?.[0]?.userId;
  console.log('path', path);
  console.log('mongo userId keys', m0 && Object.keys(m0));
  console.log('pg userId keys', p0 && Object.keys(p0));
  console.log('mongo name', m0?.name);
  console.log('pg name', p0?.name);
  console.log('mongo status', mongoRes.status, 'pg status', pgRes.status);

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
