/********************************************************************
 * Cart Repository — required FK failure tests
 * Stage 2 Step 3, Part 7 — 2026-09-14
 ********************************************************************/

const assert = require('node:assert/strict');
const { describe, test, expect, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const { create: createUser, remove: removeUser } = require('../../backend/src/repositories/userRepository');
const { syncFromMongo } = require('../../backend/src/repositories/cartRepository');

const PREFIX = `__test_cart_${Date.now()}_`;
const createdUserIds = [];
const createdCartIds = [];

afterAll(async () => {
  if (createdCartIds.length) {
    await prisma.cart.deleteMany({ where: { id: { in: [...createdCartIds] } } });
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: [...createdUserIds] } } });
  }
});

describe('Cart repository — required product FK', () => {
  test('syncFromMongo throws when Product not in Postgres (whole item write fails)', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const mongoUserLegacyId = `${PREFIX}user_${suffix}`;
    const user = await createUser({
      firstName: 'Cart',
      lastName: 'Tester',
      email: `${PREFIX}${suffix}@example.com`,
      referralCode: 'ABCD2345',
      legacyId: mongoUserLegacyId
    });
    createdUserIds.push(user.id);

    const mongoCart = {
      _id: `${PREFIX}cart_${suffix}`,
      userId: mongoUserLegacyId,
      items: [{
        productId: `${PREFIX}missing_product`,
        name: 'Ghost Product',
        price: 99,
        quantity: 1
      }],
      lastActivityAt: new Date(),
      abandonedNotifiedAt: null
    };

    await assert.rejects(
      () => syncFromMongo(mongoCart),
      (err) => /not yet in Postgres/i.test(err.message)
    );
  });
});
