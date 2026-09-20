/********************************************************************
 * PurchaseOrder Repository — Isolated Integration Tests
 * Connects to the REAL Neon PostgreSQL test database.
 * Creates and cleans up its own data — does NOT touch MongoDB.
 *
 * Run: node --test --test-concurrency=1 tests/repositories/purchaseOrderRepository.test.js
 *
 * Stage 2 Step 3, Part 2.4 — 2026-09-20
 ********************************************************************/

const { describe, test, expect, beforeAll, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  upsertPurchaseOrderInPG,
  getPurchaseOrderWithItems,
  listPurchaseOrdersFromPG,
  updatePurchaseOrderStatusInPG,
  deletePurchaseOrderInPG
} = require('../../backend/src/repositories/purchaseOrderRepository');

const PREFIX = `test_po_${Date.now()}_`;
const createdPoLegacyIds = [];
const createdSupplierIds = [];
const createdProductIds = [];

let testSupplierLegacyId;
let testProductLegacyId;

function createMockMongoPurchaseOrder(overrides = {}) {
  const uniqueId = Math.random().toString(36).substr(2, 9);
  const itemId = `${PREFIX}item_${uniqueId}`;
  const defaultDoc = {
    _id: `${PREFIX}${uniqueId}`,
    poNumber: `${PREFIX}PO-${uniqueId}`.toUpperCase(),
    supplierId: testSupplierLegacyId,
    warehouseId: null,
    items: [
      {
        _id: itemId,
        productId: testProductLegacyId,
        productName: `${PREFIX}Widget`,
        qty: 10,
        unitCost: 25,
        receivedQty: 0
      }
    ],
    status: 'draft',
    totalCost: 250,
    expectedDate: new Date('2026-07-01T00:00:00.000Z'),
    receivedDate: null,
    notes: `${PREFIX}Test PO`,
    createdBy: null,
    createdByName: 'test-admin',
    createdAt: new Date('2026-06-15T10:00:00.000Z')
  };
  return { ...defaultDoc, ...overrides };
}

beforeAll(async () => {
  const supplierLegacyId = `${PREFIX}supplier`;
  const productLegacyId = `${PREFIX}product`;

  const supplier = await prisma.supplier.create({
    data: {
      legacyId: supplierLegacyId,
      name: `${PREFIX}Test Supplier`,
      contactPerson: 'Test Contact',
      phone: '01700000000'
    }
  });
  createdSupplierIds.push(supplier.id);
  testSupplierLegacyId = supplierLegacyId;

  const product = await prisma.product.create({
    data: {
      legacyId: productLegacyId,
      productId: `${PREFIX}PROD-001`,
      name: `${PREFIX}Test Product`,
      slug: `${PREFIX}test-product-${Date.now()}`,
      price: 100,
      buyingPrice: 50,
      categoryName: 'Test',
      stockQuantity: 5
    }
  });
  createdProductIds.push(product.id);
  testProductLegacyId = productLegacyId;
});

afterAll(async () => {
  if (createdPoLegacyIds.length) {
    await prisma.purchaseOrder.deleteMany({
      where: { legacyId: { in: [...createdPoLegacyIds] } }
    });
    createdPoLegacyIds.length = 0;
  }

  if (createdProductIds.length) {
    await prisma.product.deleteMany({ where: { id: { in: [...createdProductIds] } } });
    createdProductIds.length = 0;
  }

  if (createdSupplierIds.length) {
    await prisma.supplier.deleteMany({ where: { id: { in: [...createdSupplierIds] } } });
    createdSupplierIds.length = 0;
  }
});

describe('PurchaseOrder repository — real Neon DB', () => {
  test('Test 1: upsertPurchaseOrderInPG() creates order with items', async () => {
    const mongoDoc = createMockMongoPurchaseOrder();
    createdPoLegacyIds.push(mongoDoc._id);

    const result = await upsertPurchaseOrderInPG(mongoDoc);

    expect(result).toBeDefined();
    expect(result._id).toBe(String(mongoDoc._id));
    expect(result.poNumber).toBe(mongoDoc.poNumber);
    expect(result.status).toBe('draft');
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBe(1);
    expect(result.items[0].productName).toBe(mongoDoc.items[0].productName);
    expect(result.items[0].qty).toBe(10);
  });

  test('Test 2: upsert same mongoId updates, no duplicate', async () => {
    const mongoDoc = createMockMongoPurchaseOrder({ status: 'draft' });
    createdPoLegacyIds.push(mongoDoc._id);

    const first = await upsertPurchaseOrderInPG(mongoDoc);
    expect(first).toBeDefined();
    expect(first.notes).toBe(mongoDoc.notes);

    mongoDoc.notes = `${PREFIX}Updated notes`;
    mongoDoc.status = 'sent';
    mongoDoc.items[0].qty = 15;
    mongoDoc.items[0].unitCost = 30;

    const second = await upsertPurchaseOrderInPG(mongoDoc);

    expect(second._id).toBe(first._id);
    expect(second.notes).toBe(`${PREFIX}Updated notes`);
    expect(second.status).toBe('sent');
    expect(second.items[0].qty).toBe(15);

    const count = await prisma.purchaseOrder.count({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(count).toBe(1);

    const itemCount = await prisma.purchaseOrderItem.count({
      where: { purchaseOrder: { legacyId: String(mongoDoc._id) } }
    });
    expect(itemCount).toBe(1);
  });

  test('Test 3: getPurchaseOrderWithItems() returns order with items array', async () => {
    const mongoDoc = createMockMongoPurchaseOrder();
    createdPoLegacyIds.push(mongoDoc._id);

    await upsertPurchaseOrderInPG(mongoDoc);
    const found = await getPurchaseOrderWithItems(mongoDoc._id);

    expect(found).toBeDefined();
    expect(found._id).toBe(String(mongoDoc._id));
    expect(Array.isArray(found.items)).toBe(true);
    expect(found.items.length).toBeGreaterThanOrEqual(1);
    expect(found.supplierId).toBeDefined();
    expect(found.supplierId.name).toContain(PREFIX);
  });

  test('Test 4: listPurchaseOrdersFromPG() returns array', async () => {
    const mongoDoc = createMockMongoPurchaseOrder();
    createdPoLegacyIds.push(mongoDoc._id);

    await upsertPurchaseOrderInPG(mongoDoc);
    const results = await listPurchaseOrdersFromPG();

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);

    const found = results.find((po) => po._id === String(mongoDoc._id));
    expect(found).toBeDefined();
  });

  test('Test 5: listPurchaseOrdersFromPG() with status filter', async () => {
    const draftPo = createMockMongoPurchaseOrder({ status: 'draft' });
    const sentPo = createMockMongoPurchaseOrder({ status: 'sent' });
    createdPoLegacyIds.push(draftPo._id, sentPo._id);

    await upsertPurchaseOrderInPG(draftPo);
    await upsertPurchaseOrderInPG(sentPo);

    const sentResults = await listPurchaseOrdersFromPG({ status: 'sent' });

    expect(Array.isArray(sentResults)).toBe(true);
    const foundSent = sentResults.find((po) => po._id === String(sentPo._id));
    const foundDraft = sentResults.find((po) => po._id === String(draftPo._id));

    expect(foundSent).toBeDefined();
    expect(foundSent.status).toBe('sent');
    expect(foundDraft).toBeUndefined();
  });

  test('Test 6: updatePurchaseOrderStatusInPG() changes status correctly', async () => {
    const mongoDoc = createMockMongoPurchaseOrder({ status: 'draft' });
    createdPoLegacyIds.push(mongoDoc._id);

    await upsertPurchaseOrderInPG(mongoDoc);

    const updated = await updatePurchaseOrderStatusInPG(mongoDoc._id, 'sent');
    expect(updated).toBeDefined();
    expect(updated.status).toBe('sent');

    const fromDb = await getPurchaseOrderWithItems(mongoDoc._id);
    expect(fromDb.status).toBe('sent');
  });

  test('Test 7: deletePurchaseOrderInPG() removes record and items', async () => {
    const mongoDoc = createMockMongoPurchaseOrder();

    await upsertPurchaseOrderInPG(mongoDoc);

    const before = await prisma.purchaseOrder.findUnique({
      where: { legacyId: String(mongoDoc._id) },
      include: { items: true }
    });
    expect(before).toBeDefined();
    expect(before.items.length).toBeGreaterThanOrEqual(1);

    await deletePurchaseOrderInPG(mongoDoc._id);

    const after = await prisma.purchaseOrder.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(after).toBeNull();

    const itemsAfter = await prisma.purchaseOrderItem.count({
      where: { purchaseOrderId: before.id }
    });
    expect(itemsAfter).toBe(0);
  });
});
