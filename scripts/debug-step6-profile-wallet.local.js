#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('../backend/src/models/user');
  const prisma = require('../backend/src/config/prismaClient');

  const sample = await User.findOne({
    addresses: { $exists: true, $not: { $size: 0 } },
    'walletHistory.0': { $exists: true }
  }).lean();
  if (!sample) return console.log('no sample');

  const pgUser = await prisma.user.findUnique({ where: { legacyId: String(sample._id) } });
  const pgTxns = pgUser
    ? await prisma.walletTransaction.findMany({
      where: { userId: pgUser.id },
      orderBy: [{ date: 'desc' }, { id: 'desc' }]
    })
    : [];

  console.log(JSON.stringify({
    mongoId: String(sample._id),
    mongoWallet: (sample.walletHistory || []).map((t, i) => ({
      i,
      referenceOrder: t.referenceOrder,
      amount: t.amount,
      date: t.date
    })),
    pgWallet: pgTxns.map((t, i) => ({
      i,
      referenceOrder: t.referenceOrder,
      amount: Number(t.amount),
      date: t.date
    })),
    mongoScalars: {
      googleId: sample.googleId,
      verificationToken: sample.verificationToken,
      referredBy: sample.referredBy
    },
    pgScalars: pgUser && {
      googleId: pgUser.googleId,
      verificationToken: pgUser.verificationToken,
      referredById: pgUser.referredById
    }
  }, null, 2));

  await mongoose.disconnect();
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
