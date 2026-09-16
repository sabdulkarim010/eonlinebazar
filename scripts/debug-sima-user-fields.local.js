#!/usr/bin/env node
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  require('../backend/src/models/user');
  const User = mongoose.model('User');
  const u = await User.findById('6a8b5b609d67181414c2066e')
    .select('firstName lastName name')
    .lean();
  console.log('mongo user fields present:', {
    hasFirstName: Boolean(u?.firstName),
    hasLastName: Boolean(u?.lastName),
    hasName: Boolean(u?.name),
    firstNameLen: (u?.firstName || '').length,
    lastNameLen: (u?.lastName || '').length
  });
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
