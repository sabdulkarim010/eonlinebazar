#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 5 — Postgres-only ContactMessage timestamp sync (local, not committed).
 * Copies createdAt/updatedAt from Mongo to Postgres by legacyId.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const ContactMessage = require('../backend/src/models/ContactMessage');
  const Review = require('../backend/src/models/review');
  const prisma = require('../backend/src/config/prismaClient');

  async function syncModel(label, mongoRows, table) {
    let updated = 0;
    for (const m of mongoRows) {
      const legacyId = String(m._id);
      const pg = await table.findUnique({ where: { legacyId } });
      if (!pg) {
        console.log(`SKIP missing PG ${label}`, legacyId);
        continue;
      }
      await table.update({
        where: { id: pg.id },
        data: {
          createdAt: new Date(m.createdAt),
          updatedAt: new Date(m.updatedAt || m.createdAt)
        }
      });
      updated += 1;
      console.log(`SYNC ${label}`, legacyId);
    }
    console.log(`${label}: ${updated}/${mongoRows.length} rows synced`);
  }

  await syncModel('ContactMessage', await ContactMessage.find().lean(), prisma.contactMessage);
  await syncModel('Review', await Review.find().lean(), prisma.review);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
