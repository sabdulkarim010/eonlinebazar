/********************************************************************
 * PaymentMethod Repository — Isolated Integration Tests
 * Connects to the REAL Neon PostgreSQL test database.
 * Creates and cleans up its own data — does NOT touch MongoDB.
 *
 * Run: npm run test:repositories
 * (Uses Node's built-in test runner — not Jest — because the Prisma .mts
 *  client requires Node 22.18+ native type-stripping.)
 *
 * Stage 2 Step 3, Part 1.3 — 2026-09-20
 ********************************************************************/

const { describe, test, expect, afterAll } = require('./jestCompat');

// Load .env so DATABASE_URL_POOLED is available before prismaClient is required.
require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  upsertPaymentMethodInPG,
  getPaymentMethodByMongoId,
  listPaymentMethodsFromPG,
  deletePaymentMethodInPG
} = require('../../backend/src/repositories/paymentMethodRepository');

// ── Unique test prefix to avoid collision with other runs ────────────────────
const PREFIX = `test_pm_${Date.now()}_`;
const createdLegacyIds = [];

async function cleanup() {
  if (createdLegacyIds.length) {
    await prisma.paymentMethod.deleteMany({ 
      where: { legacyId: { in: [...createdLegacyIds] } } 
    });
    createdLegacyIds.length = 0;
  }
}

afterAll(async () => {
  await cleanup();
});

// ── Helper: Mock MongoDB PaymentMethod document ──────────────────────────────
function createMockMongoDoc(overrides = {}) {
  const defaultDoc = {
    _id: `${PREFIX}${Math.random().toString(36).substr(2, 9)}`,
    name: `${PREFIX}Test Method`,
    code: `${PREFIX}test-method`,
    logoUrl: '',
    type: 'manual',
    provider: '',
    instructions: 'Test instructions',
    accountNumber: '1234567890',
    processingFee: 2.5,
    feeType: 'percentage',
    sortOrder: 0,
    isActive: true,
    description: 'Test payment method',
    createdByAdmin: 'test-admin',
    updatedByAdmin: 'test-admin',
    apiConfig: {
      storeId: '',
      storePassword: '',
      apiKey: '',
      isSandbox: true,
      webhookUrl: ''
    }
  };
  return { ...defaultDoc, ...overrides };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('PaymentMethod repository — real Neon DB', () => {
  test('upsertPaymentMethodInPG() creates a new record', async () => {
    const mongoDoc = createMockMongoDoc({
      name: `${PREFIX}bKash`,
      code: `${PREFIX}bkash`
    });
    createdLegacyIds.push(String(mongoDoc._id));

    const result = await upsertPaymentMethodInPG(mongoDoc);

    expect(result).toBeDefined();
    expect(result.id).toBeTruthy();
    expect(result._id).toBe(result.id); // _id alias present
    expect(result.legacyId).toBe(String(mongoDoc._id));
    expect(result.name).toBe(mongoDoc.name);
    expect(result.code).toBe(mongoDoc.code);
    expect(result.type).toBe('manual');
    expect(result.processingFee).toBe(2.5);
    expect(result.isActive).toBe(true);
  });

  test('upsertPaymentMethodInPG() with same legacyId updates existing (no duplicate)', async () => {
    const mongoDoc = createMockMongoDoc({
      name: `${PREFIX}Nagad`,
      code: `${PREFIX}nagad`
    });
    createdLegacyIds.push(String(mongoDoc._id));

    // First insert
    const first = await upsertPaymentMethodInPG(mongoDoc);
    expect(first.name).toBe(`${PREFIX}Nagad`);

    // Update the same document (same _id)
    mongoDoc.name = `${PREFIX}Nagad Updated`;
    mongoDoc.processingFee = 3.0;
    const second = await upsertPaymentMethodInPG(mongoDoc);

    expect(second.id).toBe(first.id); // Same PostgreSQL id
    expect(second.name).toBe(`${PREFIX}Nagad Updated`);
    expect(second.processingFee).toBe(3.0);

    // Verify only one record exists
    const count = await prisma.paymentMethod.count({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(count).toBe(1);
  });

  test('getPaymentMethodByMongoId() returns correct record', async () => {
    const mongoDoc = createMockMongoDoc({
      name: `${PREFIX}COD`,
      code: `${PREFIX}cod`
    });
    createdLegacyIds.push(String(mongoDoc._id));

    await upsertPaymentMethodInPG(mongoDoc);
    const found = await getPaymentMethodByMongoId(mongoDoc._id);

    expect(found).toBeDefined();
    expect(found.legacyId).toBe(String(mongoDoc._id));
    expect(found.name).toBe(mongoDoc.name);
    expect(found.code).toBe(mongoDoc.code);
  });

  test('getPaymentMethodByMongoId() returns null for non-existent mongoId', async () => {
    const result = await getPaymentMethodByMongoId('000000000000000000000000');
    expect(result).toBeNull();
  });

  test('listPaymentMethodsFromPG() returns array with created methods', async () => {
    const mongoDoc1 = createMockMongoDoc({
      name: `${PREFIX}Method1`,
      code: `${PREFIX}method1`,
      isActive: true
    });
    const mongoDoc2 = createMockMongoDoc({
      name: `${PREFIX}Method2`,
      code: `${PREFIX}method2`,
      isActive: false
    });
    createdLegacyIds.push(String(mongoDoc1._id), String(mongoDoc2._id));

    await upsertPaymentMethodInPG(mongoDoc1);
    await upsertPaymentMethodInPG(mongoDoc2);

    const allMethods = await listPaymentMethodsFromPG();
    expect(Array.isArray(allMethods)).toBe(true);
    
    const found1 = allMethods.find(m => m.legacyId === String(mongoDoc1._id));
    const found2 = allMethods.find(m => m.legacyId === String(mongoDoc2._id));
    expect(found1).toBeDefined();
    expect(found2).toBeDefined();
    expect(found1.isActive).toBe(true);
    expect(found2.isActive).toBe(false);
  });

  test('listPaymentMethodsFromPG() with isActive filter returns only active methods', async () => {
    const mongoDoc = createMockMongoDoc({
      name: `${PREFIX}ActiveMethod`,
      code: `${PREFIX}active-method`,
      isActive: true
    });
    createdLegacyIds.push(String(mongoDoc._id));

    await upsertPaymentMethodInPG(mongoDoc);
    const activeMethods = await listPaymentMethodsFromPG({ isActive: true });

    expect(Array.isArray(activeMethods)).toBe(true);
    const found = activeMethods.find(m => m.legacyId === String(mongoDoc._id));
    expect(found).toBeDefined();
    expect(found.isActive).toBe(true);
  });

  test('deletePaymentMethodInPG() removes record', async () => {
    const mongoDoc = createMockMongoDoc({
      name: `${PREFIX}ToDelete`,
      code: `${PREFIX}to-delete`
    });
    const legacyId = String(mongoDoc._id);
    // Don't push to createdLegacyIds — we're deleting it manually

    await upsertPaymentMethodInPG(mongoDoc);
    
    // Verify it exists
    const before = await getPaymentMethodByMongoId(mongoDoc._id);
    expect(before).toBeDefined();

    // Delete it
    await deletePaymentMethodInPG(mongoDoc._id);

    // Verify it's gone
    const after = await getPaymentMethodByMongoId(mongoDoc._id);
    expect(after).toBeNull();
  });

  test('deletePaymentMethodInPG() is idempotent (no error on double delete)', async () => {
    const mongoDoc = createMockMongoDoc({
      name: `${PREFIX}Idempotent`,
      code: `${PREFIX}idempotent`
    });

    await upsertPaymentMethodInPG(mongoDoc);
    await deletePaymentMethodInPG(mongoDoc._id);
    
    // Second delete should not throw (idempotent delete)
    let didThrow = false;
    try {
      await deletePaymentMethodInPG(mongoDoc._id);
    } catch (err) {
      didThrow = true;
    }
    expect(didThrow).toBe(false);
  });

  test('upsertPaymentMethodInPG() handles automated payment method with apiConfig', async () => {
    const mongoDoc = createMockMongoDoc({
      name: `${PREFIX}SSLCommerz`,
      code: `${PREFIX}sslcommerz`,
      type: 'automated',
      provider: 'sslcommerz',
      instructions: '',
      accountNumber: '',
      apiConfig: {
        storeId: 'test_store_id',
        storePassword: 'encrypted_password',
        apiKey: 'encrypted_api_key',
        isSandbox: true,
        webhookUrl: '/api/payments/ipn/sslcommerz'
      }
    });
    createdLegacyIds.push(String(mongoDoc._id));

    const result = await upsertPaymentMethodInPG(mongoDoc);

    expect(result.type).toBe('automated');
    expect(result.provider).toBe('sslcommerz');
    expect(result.apiConfig.storeId).toBe('test_store_id');
    expect(result.apiConfig.storePassword).toBe('encrypted_password');
    expect(result.apiConfig.apiKey).toBe('encrypted_api_key');
    expect(result.apiConfig.isSandbox).toBe(true);
    expect(result.apiConfig.webhookUrl).toBe('/api/payments/ipn/sslcommerz');
  });
});
