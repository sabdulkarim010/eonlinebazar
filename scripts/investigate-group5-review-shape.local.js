#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  require('../backend/src/models/user');
  const Review = require('../backend/src/models/review');
  const prisma = require('../backend/src/config/prismaClient');
  const { fetchReviewsByProduct } = require('../backend/src/services/marketingSupportReadService');

  const sample = await Review.findOne({ productId: { $exists: true } }).lean();
  console.log('mongo review lean keys', sample && Object.keys(sample));
  console.log('mongo review lean', sample);

  const populated = await Review.findOne({ productId: sample.productId })
    .populate('userId', 'name');
  console.log('mongo populated json', JSON.parse(JSON.stringify(populated)));

  const pgUser = await prisma.user.findFirst({
    where: { legacyId: String(sample.userId) }
  });
  console.log('pg user by legacy', pgUser && {
    id: pgUser.id,
    legacyId: pgUser.legacyId,
    firstName: pgUser.firstName,
    lastName: pgUser.lastName
  });

  delete process.env.READ_PG_REVIEW;
  process.env.READ_PG_REVIEW = 'true';
  delete require.cache[require.resolve('../backend/src/config/readCutoverFlags')];
  const pgReviews = await fetchReviewsByProduct(sample.productId);
  console.log('pg shaped review', JSON.stringify(pgReviews[0], null, 2));

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
