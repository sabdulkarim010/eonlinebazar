/********************************************************************
 * ExpenseCategory Repository — Isolated Integration Tests
 * Connects to the REAL Neon PostgreSQL test database.
 * Creates and cleans up its own data — does NOT touch MongoDB.
 *
 * Run: node --test tests/repositories/expenseCategoryRepository.test.js
 *
 * Stage 2 Step 3, Part 2.3 — 2026-09-20
 ********************************************************************/

const { describe, test, expect, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  upsertExpenseCategoryInPG,
  getExpenseCategoryByMongoId,
  listExpenseCategoriesFromPG,
  deleteExpenseCategoryInPG
} = require('../../backend/src/repositories/expenseCategoryRepository');

const PREFIX = `test_expcat_${Date.now()}_`;
const createdLegacyIds = [];

function createMockMongoExpenseCategory(overrides = {}) {
  const uniqueId = Math.random().toString(36).substr(2, 9);
  const defaultDoc = {
    _id: `${PREFIX}${uniqueId}`,
    name: `${PREFIX}Office Rent`,
    slug: `${PREFIX}office-rent-${uniqueId}`,
    isActive: true,
    isSystemDefault: false,
    allowCustomInput: false
  };
  return { ...defaultDoc, ...overrides };
}

afterAll(async () => {
  if (createdLegacyIds.length) {
    await prisma.expenseCategory.deleteMany({
      where: { legacyId: { in: [...createdLegacyIds] } }
    });
    createdLegacyIds.length = 0;
  }
});

describe('ExpenseCategory repository — real Neon DB', () => {
  test('Test 1: upsertExpenseCategoryInPG() creates new record', async () => {
    const mongoDoc = createMockMongoExpenseCategory({
      name: `${PREFIX}Utilities`,
      slug: `${PREFIX}utilities`
    });
    createdLegacyIds.push(mongoDoc._id);

    const result = await upsertExpenseCategoryInPG(mongoDoc);

    expect(result).toBeDefined();
    expect(result.id).toBeTruthy();
    expect(result.legacyId).toBe(String(mongoDoc._id));
    expect(result.name).toBe(mongoDoc.name);
    expect(result.slug).toBe(mongoDoc.slug);
    expect(result.isActive).toBe(true);
  });

  test('Test 2: upsert same mongoId updates, no duplicate', async () => {
    const mongoDoc = createMockMongoExpenseCategory({
      name: `${PREFIX}Marketing`,
      slug: `${PREFIX}marketing`
    });
    createdLegacyIds.push(mongoDoc._id);

    const first = await upsertExpenseCategoryInPG(mongoDoc);
    expect(first).toBeDefined();

    mongoDoc.name = `${PREFIX}Marketing Updated`;
    mongoDoc.isActive = false;
    const second = await upsertExpenseCategoryInPG(mongoDoc);

    expect(second.id).toBe(first.id);
    expect(second.legacyId).toBe(first.legacyId);
    expect(second.name).toBe(`${PREFIX}Marketing Updated`);
    expect(second.isActive).toBe(false);

    const count = await prisma.expenseCategory.count({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(count).toBe(1);
  });

  test('Test 3: listExpenseCategoriesFromPG() returns array', async () => {
    const mongoDoc = createMockMongoExpenseCategory({
      name: `${PREFIX}List Category`,
      slug: `${PREFIX}list-category`
    });
    createdLegacyIds.push(mongoDoc._id);

    await upsertExpenseCategoryInPG(mongoDoc);
    const results = await listExpenseCategoriesFromPG();

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);

    const found = results.find((c) => c._id === String(mongoDoc._id));
    expect(found).toBeDefined();
  });

  test('Test 4: deleteExpenseCategoryInPG() removes record', async () => {
    const mongoDoc = createMockMongoExpenseCategory({
      name: `${PREFIX}Delete Me`,
      slug: `${PREFIX}delete-me`
    });

    await upsertExpenseCategoryInPG(mongoDoc);

    const before = await prisma.expenseCategory.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(before).toBeDefined();

    await deleteExpenseCategoryInPG(mongoDoc._id);

    const after = await prisma.expenseCategory.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(after).toBeNull();
  });
});
