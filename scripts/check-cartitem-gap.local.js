#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 6 — Quantify Mongo cart items missing from Postgres (Part 7 FK failures).
 * Local diagnostic script — not committed to npm test suite.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const prisma = require('../backend/src/config/prismaClient');
const Cart = require('../backend/src/models/cart');

function extractProductRef(item) {
  const pid = item?.productId;
  if (pid && typeof pid === 'object' && pid._id) return String(pid._id);
  return pid ? String(pid) : '';
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const mongoCarts = await Cart.find({ 'items.0': { $exists: true } }).lean();
  let mongoItemCount = 0;
  let pgItemCount = 0;
  let missingItems = 0;
  const gapsByUser = [];

  for (const cart of mongoCarts) {
    const userLegacy = String(cart.userId);
    const pgUser = await prisma.user.findUnique({ where: { legacyId: userLegacy } });
    const mongoItems = cart.items || [];
    mongoItemCount += mongoItems.length;

    if (!pgUser) {
      missingItems += mongoItems.length;
      gapsByUser.push({ userLegacy, reason: 'user-not-in-pg', mongoItems: mongoItems.length, pgItems: 0 });
      continue;
    }

    const pgCart = await prisma.cart.findFirst({
      where: { userId: pgUser.id },
      orderBy: { updatedAt: 'desc' },
      include: { items: { include: { product: { select: { legacyId: true, productId: true } } } } }
    });

    const pgItems = pgCart?.items || [];
    pgItemCount += pgItems.length;

    const pgProductKeys = new Set(
      pgItems.map((row) => row.product?.legacyId || row.product?.productId || row.productId)
    );

    let userMissing = 0;
    for (const item of mongoItems) {
      const ref = extractProductRef(item);
      const productInPg = await prisma.product.findFirst({
        where: { OR: [{ legacyId: ref }, { productId: ref }] },
        select: { id: true, legacyId: true }
      });
      const represented = pgItems.some((pgRow) => {
        const pgRef = pgRow.product?.legacyId || pgRow.product?.productId;
        return pgRef === ref;
      });
      if (!represented) {
        userMissing += 1;
        missingItems += 1;
      }
      if (!productInPg && ref) {
        // product FK would fail Part 7 dual-write
      }
    }

    if (userMissing > 0) {
      gapsByUser.push({
        userLegacy,
        mongoItems: mongoItems.length,
        pgItems: pgItems.length,
        missing: userMissing
      });
    }
  }

  console.log(JSON.stringify({
    mongoCartsWithItems: mongoCarts.length,
    mongoItemCount,
    pgItemCount,
    totalMissingItems: missingItems,
    gapUsers: gapsByUser.length,
    gapsByUser: gapsByUser.slice(0, 20)
  }, null, 2));

  await mongoose.disconnect();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
