/********************************************************************
 * Coupon Repository — Isolated Integration Tests
 * Connects to the REAL Neon PostgreSQL test database.
 * Creates and cleans up its own data — does NOT touch MongoDB.
 *
 * Run: npm run test:repositories
 * (Uses Node's built-in test runner — not Jest — because the Prisma .mts
 *  client requires Node 22.18+ native type-stripping.)
 *
 * Stage 2 Step 3, Part 2.1 — 2026-09-20
 ********************************************************************/

const { describe, test, expect, beforeAll, afterAll } = require('./jestCompat');

// Load .env so DATABASE_URL_POOLED is available before prismaClient is required.
require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  upsertCouponInPG,
  getCouponByCode,
  getCouponByMongoId,
  listCouponsFromPG,
  deactivateCouponInPG,
  deleteCouponInPG
} = require('../../backend/src/repositories/couponRepository');

// ── Unique test prefix to avoid collision with other runs ────────────────────
const PREFIX = `test_coupon_${Date.now()}_`;
const createdLegacyIds = [];

// ── Helper: Mock MongoDB Coupon document ─────────────────────────────────────
function createMockMongoCoupon(overrides = {}) {
  const uniqueId = Math.random().toString(36).substr(2, 9);
  const defaultDoc = {
    _id: `${PREFIX}${uniqueId}`,
    code: `${PREFIX}${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    discountType: 'percentage',
    discountValue: 10,
    minOrderAmount: 100,
    maxDiscountAmount: 50,
    expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    status: 'ACTIVE',
    usageLimit: 100,
    usedCount: 0,
    perUserLimit: 1,
    isActive: true
  };
  return { ...defaultDoc, ...overrides };
}

// ── Setup & Teardown ─────────────────────────────────────────────────────────
afterAll(async () => {
  if (createdLegacyIds.length) {
    // Clean up all test coupons
    await prisma.coupon.deleteMany({
      where: { legacyId: { in: [...createdLegacyIds] } }
    });
    createdLegacyIds.length = 0;
  }
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe('Coupon repository — real Neon DB', () => {
  test('Test 1: upsertCouponInPG() creates new coupon', async () => {
    const mongoDoc = createMockMongoCoupon({
      code: `${PREFIX}SAVE10`,
      discountType: 'percentage',
      discountValue: 10
    });
    createdLegacyIds.push(mongoDoc._id);

    const result = await upsertCouponInPG(mongoDoc);

    expect(result).toBeDefined();
    expect(result.id).toBeTruthy();
    expect(result.legacyId).toBe(String(mongoDoc._id));
    expect(result.code).toBe(mongoDoc.code.toUpperCase()); // Codes are stored uppercase
    expect(result.discountType).toBe('percentage');
    expect(result.discountValue).toBe(10);
    expect(result.isActive).toBe(true);
    expect(result.status).toBe('ACTIVE');
  });

  test('Test 2: upsert with same mongoId updates, no duplicate', async () => {
    const mongoDoc = createMockMongoCoupon({
      code: `${PREFIX}UPDATE20`,
      discountValue: 20
    });
    createdLegacyIds.push(mongoDoc._id);

    // First insert
    const first = await upsertCouponInPG(mongoDoc);
    expect(first).toBeDefined();
    expect(first.discountValue).toBe(20);

    // Update the same document (same _id)
    mongoDoc.discountValue = 25;
    mongoDoc.usedCount = 5;
    const second = await upsertCouponInPG(mongoDoc);

    expect(second.id).toBe(first.id); // Same PostgreSQL id
    expect(second.legacyId).toBe(first.legacyId); // Same legacyId
    expect(second.discountValue).toBe(25);
    expect(second.usedCount).toBe(5);

    // Verify only one record exists
    const count = await prisma.coupon.count({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(count).toBe(1);
  });

  test('Test 3: getCouponByCode() returns correct coupon', async () => {
    const mongoDoc = createMockMongoCoupon({
      code: `${PREFIX}FINDME`
    });
    createdLegacyIds.push(mongoDoc._id);

    await upsertCouponInPG(mongoDoc);
    const found = await getCouponByCode(`${PREFIX}FINDME`);

    expect(found).toBeDefined();
    expect(found.code).toBe(`${PREFIX}FINDME`.toUpperCase()); // Codes are stored uppercase
    expect(found.legacyId).toBe(String(mongoDoc._id));
  });

  test('Test 4: getCouponByCode() returns null for non-existent code', async () => {
    const result = await getCouponByCode('NONEXISTENTCODE');
    expect(result).toBeNull();
  });

  test('Test 5: listCouponsFromPG() returns array', async () => {
    const mongoDoc = createMockMongoCoupon({
      code: `${PREFIX}LIST1`
    });
    createdLegacyIds.push(mongoDoc._id);

    await upsertCouponInPG(mongoDoc);
    const results = await listCouponsFromPG();

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);

    // Verify our test coupon is in the results
    const found = results.find(c => c.legacyId === String(mongoDoc._id));
    expect(found).toBeDefined();
  });

  test('Test 6: listCouponsFromPG() with isActive filter', async () => {
    const activeCoupon = createMockMongoCoupon({
      code: `${PREFIX}ACTIVE`,
      isActive: true,
      status: 'ACTIVE'
    });
    const inactiveCoupon = createMockMongoCoupon({
      code: `${PREFIX}INACTIVE`,
      isActive: false,
      status: 'EXPIRED'
    });
    createdLegacyIds.push(activeCoupon._id, inactiveCoupon._id);

    await upsertCouponInPG(activeCoupon);
    await upsertCouponInPG(inactiveCoupon);

    const activeResults = await listCouponsFromPG({ isActive: true });

    expect(Array.isArray(activeResults)).toBe(true);
    
    // Verify the active coupon is in results
    const foundActive = activeResults.find(c => c.legacyId === String(activeCoupon._id));
    expect(foundActive).toBeDefined();
    expect(foundActive.isActive).toBe(true);

    // Verify the inactive coupon is NOT in results
    const foundInactive = activeResults.find(c => c.legacyId === String(inactiveCoupon._id));
    expect(foundInactive).toBeUndefined();
  });

  test('Test 7: deactivateCouponInPG() sets isActive to false', async () => {
    const mongoDoc = createMockMongoCoupon({
      code: `${PREFIX}DEACTIVATE`,
      isActive: true,
      status: 'ACTIVE'
    });
    createdLegacyIds.push(mongoDoc._id);

    await upsertCouponInPG(mongoDoc);

    // Verify it's active
    const before = await prisma.coupon.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(before.isActive).toBe(true);
    expect(before.status).toBe('ACTIVE');

    // Deactivate it
    await deactivateCouponInPG(mongoDoc._id);

    // Verify it's now inactive
    const after = await prisma.coupon.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(after.isActive).toBe(false);
    expect(after.status).toBe('EXPIRED');
  });

  test('Test 8: deleteCouponInPG() removes record', async () => {
    const mongoDoc = createMockMongoCoupon({
      code: `${PREFIX}DELETE`
    });
    // Don't push to createdLegacyIds — we're deleting it manually

    await upsertCouponInPG(mongoDoc);

    // Verify it exists
    const before = await prisma.coupon.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(before).toBeDefined();

    // Delete it
    await deleteCouponInPG(mongoDoc._id);

    // Verify it's gone
    const after = await prisma.coupon.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(after).toBeNull();
  });
});
