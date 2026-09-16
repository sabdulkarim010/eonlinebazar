#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const prisma = require('../backend/src/config/prismaClient');
  const User = require('../backend/src/models/user');

  const mongoUsers = await User.find().select('_id email createdAt').sort({ createdAt: -1 }).lean();
  const pgUsers = await prisma.user.findMany({
    select: { id: true, legacyId: true, email: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });

  const mongoLegacy = new Set(mongoUsers.map((u) => String(u._id)));
  const pgLegacy = new Set(pgUsers.map((u) => u.legacyId).filter(Boolean));

  console.log(JSON.stringify({
    mongoCount: mongoUsers.length,
    pgCount: pgUsers.length,
    mongoOnly: mongoUsers.filter((u) => !pgLegacy.has(String(u._id))).map((u) => ({
      id: String(u._id), email: u.email, createdAt: u.createdAt
    })),
    pgOnly: pgUsers.filter((u) => u.legacyId && !mongoLegacy.has(u.legacyId)).map((u) => ({
      legacyId: u.legacyId, email: u.email, createdAt: u.createdAt
    }))
  }, null, 2));

  const sample = await User.findOne({
    addresses: { $exists: true, $not: { $size: 0 } },
    'walletHistory.0': { $exists: true }
  }).lean();
  if (sample) {
    console.log('sampleUserExtraKeys', Object.keys(sample).filter((k) =>
      ['isAdmin', 'role', 'sessions', 'id'].includes(k)
    ));
  }

  await mongoose.disconnect();
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
