/********************************************************************
 * Attribute Repository — Isolated Integration Tests
 * Connects to the REAL Neon PostgreSQL test database.
 * Creates and cleans up its own data — does NOT touch MongoDB.
 *
 * Run: npm run test:repositories
 * (Uses Node's built-in test runner — not Jest — because the Prisma .mts
 *  client requires Node 22.18+ native type-stripping.)
 *
 * Stage 2 Step 3, Part 2.2 — 2026-09-20
 ********************************************************************/

const { describe, test, expect, beforeAll, afterAll } = require('./jestCompat');

// Load .env so DATABASE_URL_POOLED is available before prismaClient is required.
require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  upsertAttributeInPG,
  getAttributeByMongoId,
  listAttributesFromPG,
  deleteAttributeInPG
} = require('../../backend/src/repositories/attributeRepository');

// ── Unique test prefix to avoid collision with other runs ────────────────────
const PREFIX = `test_attr_${Date.now()}_`;
const createdLegacyIds = [];

// ── Helper: Mock MongoDB Attribute document ──────────────────────────────────
function createMockMongoAttribute(overrides = {}) {
  const uniqueId = Math.random().toString(36).substr(2, 9);
  const defaultDoc = {
    _id: `${PREFIX}${uniqueId}`,
    name: `${PREFIX}Test Attribute`,
    slug: `${PREFIX}test-attribute-${uniqueId}`,
    values: ['Value1', 'Value2', 'Value3'],
    status: 'active'
  };
  return { ...defaultDoc, ...overrides };
}

// ── Setup & Teardown ─────────────────────────────────────────────────────────
afterAll(async () => {
  if (createdLegacyIds.length) {
    // Clean up all test attributes
    await prisma.attribute.deleteMany({
      where: { legacyId: { in: [...createdLegacyIds] } }
    });
    createdLegacyIds.length = 0;
  }
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe('Attribute repository — real Neon DB', () => {
  test('Test 1: upsertAttributeInPG() creates new attribute', async () => {
    const mongoDoc = createMockMongoAttribute({
      name: `${PREFIX}Size`,
      values: ['S', 'M', 'L', 'XL']
    });
    createdLegacyIds.push(mongoDoc._id);

    const result = await upsertAttributeInPG(mongoDoc);

    expect(result).toBeDefined();
    expect(result.id).toBeTruthy();
    expect(result.legacyId).toBe(String(mongoDoc._id));
    expect(result.name).toBe(mongoDoc.name);
    expect(Array.isArray(result.values)).toBe(true);
    expect(result.values.length).toBe(4);
    expect(result.status).toBe('active');
  });

  test('Test 2: upsert with same mongoId updates, no duplicate', async () => {
    const mongoDoc = createMockMongoAttribute({
      name: `${PREFIX}Color`,
      values: ['Red', 'Blue']
    });
    createdLegacyIds.push(mongoDoc._id);

    // First insert
    const first = await upsertAttributeInPG(mongoDoc);
    expect(first).toBeDefined();
    expect(first.values.length).toBe(2);

    // Update the same document (same _id)
    mongoDoc.values = ['Red', 'Blue', 'Green', 'Yellow'];
    mongoDoc.status = 'inactive';
    const second = await upsertAttributeInPG(mongoDoc);

    expect(second.id).toBe(first.id); // Same PostgreSQL id
    expect(second.legacyId).toBe(first.legacyId); // Same legacyId
    expect(second.values.length).toBe(4);
    expect(second.status).toBe('inactive');

    // Verify only one record exists
    const count = await prisma.attribute.count({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(count).toBe(1);
  });

  test('Test 3: getAttributeByMongoId() returns correct record', async () => {
    const mongoDoc = createMockMongoAttribute({
      name: `${PREFIX}Material`
    });
    createdLegacyIds.push(mongoDoc._id);

    await upsertAttributeInPG(mongoDoc);
    const found = await getAttributeByMongoId(mongoDoc._id);

    expect(found).toBeDefined();
    expect(found.legacyId).toBe(String(mongoDoc._id));
    expect(found.name).toBe(mongoDoc.name);
    expect(Array.isArray(found.values)).toBe(true);
  });

  test('Test 4: getAttributeByMongoId() returns null for non-existent id', async () => {
    const result = await getAttributeByMongoId('000000000000000000000000');
    expect(result).toBeNull();
  });

  test('Test 5: listAttributesFromPG() returns array', async () => {
    const mongoDoc = createMockMongoAttribute({
      name: `${PREFIX}Pattern`,
      values: ['Solid', 'Striped', 'Dotted']
    });
    createdLegacyIds.push(mongoDoc._id);

    await upsertAttributeInPG(mongoDoc);
    const results = await listAttributesFromPG();

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);

    // Verify our test attribute is in the results
    const found = results.find(a => a.legacyId === String(mongoDoc._id));
    expect(found).toBeDefined();
  });

  test('Test 6: deleteAttributeInPG() removes record', async () => {
    const mongoDoc = createMockMongoAttribute({
      name: `${PREFIX}Delete`
    });
    // Don't push to createdLegacyIds — we're deleting it manually

    await upsertAttributeInPG(mongoDoc);

    // Verify it exists
    const before = await prisma.attribute.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(before).toBeDefined();

    // Delete it
    await deleteAttributeInPG(mongoDoc._id);

    // Verify it's gone
    const after = await prisma.attribute.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(after).toBeNull();
  });

  test('Test 7: deleteAttributeInPG() is idempotent (no error on double delete)', async () => {
    const mongoDoc = createMockMongoAttribute({
      name: `${PREFIX}Idempotent`
    });

    await upsertAttributeInPG(mongoDoc);
    await deleteAttributeInPG(mongoDoc._id);
    
    // Second delete should not throw (idempotent delete)
    let didThrow = false;
    try {
      await deleteAttributeInPG(mongoDoc._id);
    } catch (err) {
      didThrow = true;
    }
    expect(didThrow).toBe(false);
  });
});
