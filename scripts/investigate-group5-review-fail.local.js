#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  require('../backend/src/models/user');
  const Review = require('../backend/src/models/review');
  const prisma = require('../backend/src/config/prismaClient');

  const sima = await Review.findById('6a9dc0eb68b35e6b83b62d53').populate('userId', 'name').lean();
  console.log('Sima review lean populated', JSON.stringify(sima, null, 2));

  const pgReview = await prisma.review.findUnique({ where: { legacyId: '6a9dc0eb68b35e6b83b62d53' } });
  const pgUser = pgReview?.userId
    ? await prisma.user.findUnique({ where: { id: pgReview.userId }, select: { id: true, legacyId: true, firstName: true, lastName: true } })
    : null;
  console.log('PG review userId FK', pgReview?.userId);
  console.log('PG user', pgUser);

  process.env.READ_PG_REVIEW = 'true';
  delete require.cache[require.resolve('../backend/src/config/readCutoverFlags')];
  const { fetchReviewsByProduct } = require('../backend/src/services/marketingSupportReadService');
  const shaped = await fetchReviewsByProduct(sima.productId);
  console.log('PG shaped reviews', JSON.stringify(shaped, null, 2));

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
