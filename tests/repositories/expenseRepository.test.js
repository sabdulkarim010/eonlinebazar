/********************************************************************
 * Expense Repository — Isolated Integration Tests
 * Connects to the REAL Neon PostgreSQL test database.
 * Creates and cleans up its own data — does NOT touch MongoDB.
 *
 * Run: node --test tests/repositories/expenseRepository.test.js
 *
 * Stage 2 Step 3, Part 2.3 — 2026-09-20
 ********************************************************************/

const { describe, test, expect, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  upsertExpenseInPG,
  getExpenseByMongoId,
  listExpensesFromPG,
  getExpenseSummaryByCategory,
  getTotalExpensesByDateRange,
  deleteExpenseInPG
} = require('../../backend/src/repositories/expenseRepository');

const PREFIX = `test_exp_${Date.now()}_`;
const createdLegacyIds = [];

function createMockMongoExpense(overrides = {}) {
  const uniqueId = Math.random().toString(36).substr(2, 9);
  const defaultDoc = {
    _id: `${PREFIX}${uniqueId}`,
    category: `${PREFIX}office_rent`,
    customCategoryName: '',
    amount: 1500,
    description: `${PREFIX}Monthly rent`,
    date: new Date('2026-03-15T10:00:00.000Z'),
    reference: `REF-${uniqueId}`,
    recordedBy: 'test-admin',
    attachmentUrl: ''
  };
  return { ...defaultDoc, ...overrides };
}

afterAll(async () => {
  if (createdLegacyIds.length) {
    await prisma.expense.deleteMany({
      where: { legacyId: { in: [...createdLegacyIds] } }
    });
    createdLegacyIds.length = 0;
  }
});

describe('Expense repository — real Neon DB', () => {
  test('Test 1: upsertExpenseInPG() creates new expense', async () => {
    const mongoDoc = createMockMongoExpense({ amount: 2500 });
    createdLegacyIds.push(mongoDoc._id);

    const result = await upsertExpenseInPG(mongoDoc);

    expect(result).toBeDefined();
    expect(result._id).toBe(String(mongoDoc._id));
    expect(result.category).toBe(mongoDoc.category);
    expect(result.amount).toBe(2500);
    expect(result.description).toBe(mongoDoc.description);
  });

  test('Test 2: upsert same mongoId updates, no duplicate', async () => {
    const mongoDoc = createMockMongoExpense({ amount: 800 });
    createdLegacyIds.push(mongoDoc._id);

    const first = await upsertExpenseInPG(mongoDoc);
    expect(first).toBeDefined();
    expect(first.amount).toBe(800);

    mongoDoc.amount = 1200;
    mongoDoc.description = `${PREFIX}Updated description`;
    const second = await upsertExpenseInPG(mongoDoc);

    expect(second._id).toBe(first._id);
    expect(second.amount).toBe(1200);
    expect(second.description).toBe(`${PREFIX}Updated description`);

    const count = await prisma.expense.count({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(count).toBe(1);
  });

  test('Test 3: listExpensesFromPG() returns array', async () => {
    const mongoDoc = createMockMongoExpense();
    createdLegacyIds.push(mongoDoc._id);

    await upsertExpenseInPG(mongoDoc);
    const results = await listExpensesFromPG();

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);

    const found = results.find((e) => e._id === String(mongoDoc._id));
    expect(found).toBeDefined();
  });

  test('Test 4: listExpensesFromPG() with dateFrom/dateTo filter', async () => {
    const inRange = createMockMongoExpense({
      date: new Date('2026-04-10T12:00:00.000Z'),
      amount: 500
    });
    const outOfRange = createMockMongoExpense({
      date: new Date('2025-01-01T12:00:00.000Z'),
      amount: 999
    });
    createdLegacyIds.push(inRange._id, outOfRange._id);

    await upsertExpenseInPG(inRange);
    await upsertExpenseInPG(outOfRange);

    const results = await listExpensesFromPG({
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30'
    });

    const foundIn = results.find((e) => e._id === String(inRange._id));
    const foundOut = results.find((e) => e._id === String(outOfRange._id));

    expect(foundIn).toBeDefined();
    expect(foundOut).toBeUndefined();
  });

  test('Test 5: getExpenseSummaryByCategory() returns grouped data', async () => {
    const catA = `${PREFIX}cat_a`;
    const catB = `${PREFIX}cat_b`;

    const docA1 = createMockMongoExpense({
      category: catA,
      amount: 100,
      date: new Date('2026-05-01T12:00:00.000Z')
    });
    const docA2 = createMockMongoExpense({
      category: catA,
      amount: 200,
      date: new Date('2026-05-15T12:00:00.000Z')
    });
    const docB1 = createMockMongoExpense({
      category: catB,
      amount: 50,
      date: new Date('2026-05-20T12:00:00.000Z')
    });
    createdLegacyIds.push(docA1._id, docA2._id, docB1._id);

    await upsertExpenseInPG(docA1);
    await upsertExpenseInPG(docA2);
    await upsertExpenseInPG(docB1);

    const summary = await getExpenseSummaryByCategory(
      new Date('2026-05-01'),
      new Date('2026-05-31')
    );

    expect(Array.isArray(summary)).toBe(true);

    const rowA = summary.find((r) => r.category === catA);
    const rowB = summary.find((r) => r.category === catB);

    expect(rowA).toBeDefined();
    expect(rowA.total).toBe(300);
    expect(rowB).toBeDefined();
    expect(rowB.total).toBe(50);
  });

  test('Test 6: getTotalExpensesByDateRange() returns numeric total', async () => {
    const doc1 = createMockMongoExpense({
      amount: 400,
      date: new Date('2026-06-05T12:00:00.000Z')
    });
    const doc2 = createMockMongoExpense({
      amount: 600,
      date: new Date('2026-06-20T12:00:00.000Z')
    });
    createdLegacyIds.push(doc1._id, doc2._id);

    await upsertExpenseInPG(doc1);
    await upsertExpenseInPG(doc2);

    const total = await getTotalExpensesByDateRange(
      new Date('2026-06-01'),
      new Date('2026-06-30')
    );

    expect(typeof total).toBe('number');
    expect(total).toBeGreaterThanOrEqual(1000);
  });

  test('Test 7: deleteExpenseInPG() removes record', async () => {
    const mongoDoc = createMockMongoExpense();

    await upsertExpenseInPG(mongoDoc);

    const before = await prisma.expense.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(before).toBeDefined();

    await deleteExpenseInPG(mongoDoc._id);

    const after = await prisma.expense.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(after).toBeNull();
  });
});
