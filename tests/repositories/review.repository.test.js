/********************************************************************
 * Review Repository — FK resolution fallback tests
 * Stage 2 Step 3, Part 6 — 2026-09-14
 ********************************************************************/

const { describe, test, expect, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  upsertFromMongo,
  resolveUserId,
  resolveProductId
} = require('../../backend/src/repositories/reviewRepository');

const PREFIX = `__test_review_${Date.now()}_`;
const createdIds = [];

afterAll(async () => {
  if (createdIds.length) {
    await prisma.review.deleteMany({ where: { id: { in: [...createdIds] } } });
    createdIds.length = 0;
  }
});

describe('Review repository — cross-model FK fallback', () => {
  test('resolveUserId returns null when User not in Postgres', async () => {
    const missingUserMongoId = `${PREFIX}missing_user`;
    const userId = await resolveUserId(missingUserMongoId);
    expect(userId).toBeNull();
  });

  test('resolveProductId returns null when Product not in Postgres', async () => {
    const missingProductRef = `${PREFIX}missing_product`;
    const productId = await resolveProductId(missingProductRef);
    expect(productId).toBeNull();
  });

  test('upsertFromMongo succeeds with null userId/productId when FK targets missing', async () => {
    const legacyId = `${PREFIX}legacy`;
    const mongoDoc = {
      _id: legacyId,
      userId: `${PREFIX}no_such_user`,
      productId: `${PREFIX}no_such_product`,
      orderId: `${PREFIX}order_1`,
      rating: 4,
      comment: 'FK fallback smoke test',
      photo: '',
      isSandbox: false,
      isHidden: false,
      adminNote: '',
      moderatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const row = await upsertFromMongo(mongoDoc);
    createdIds.push(row.id);

    expect(row.userId).toBeNull();
    expect(row.productId).toBeNull();
    expect(row.legacyProductId).toBe(`${PREFIX}no_such_product`);
    expect(row.legacyOrderId).toBe(`${PREFIX}order_1`);
    expect(row.legacyId).toBe(legacyId);
    expect(row.rating).toBe(4);
    expect(row.comment).toBe('FK fallback smoke test');
  });
});
