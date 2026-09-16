#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('../backend/src/models/user');
  const prisma = require('../backend/src/config/prismaClient');

  const mongo = await User.find({}).select('-password').sort({ createdAt: -1, _id: -1 }).limit(5).lean();
  const pg = await prisma.user.findMany({
    orderBy: [{ createdAt: 'desc' }, { legacyId: 'desc' }],
    take: 5,
    select: { legacyId: true, email: true, createdAt: true }
  });

  console.log(JSON.stringify({
    mongoTop5: mongo.map((u) => ({ _id: String(u._id), email: u.email, createdAt: u.createdAt })),
    pgTop5: pg.map((u) => ({ legacyId: u.legacyId, email: u.email, createdAt: u.createdAt }))
  }, null, 2));

  await mongoose.disconnect();
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
