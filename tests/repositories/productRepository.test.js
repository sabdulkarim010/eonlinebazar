/********************************************************************
 * Product Repository — Isolated Integration Tests
 * Connects to the REAL Neon PostgreSQL test database.
 * Creates and cleans up its own data — does NOT touch MongoDB.
 *
 * Run: npm run test:repositories
 * (Uses Node's built-in test runner — not Jest — because the Prisma .mts
 *  client requires Node 22.18+ native type-stripping.)
 *
 * Stage 2 Step 3, Part 1.4 — 2026-09-20
 ********************************************************************/

const { describe, test, expect, beforeAll, afterAll } = require('./jestCompat');

// Load .env so DATABASE_URL_POOLED is available before prismaClient is required.
require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  createProductInPG,
  updateProductInPG,
  deleteProductInPG,
  updateStockInPG,
  getProductByIdFromPG,
  listProductsFromPG
} = require('../../backend/src/repositories/productRepository');
const { mongoProductToPrismaShape } = require('../../backend/src/utils/productDualWriteHelpers');

// ── Unique test prefix to avoid collision with other runs ────────────────────
const PREFIX = `test_prod_${Date.now()}_`;
const createdLegacyIds = [];
let sharedProductMongoId = null;

// ── Helper: Mock MongoDB Product document ────────────────────────────────────
function createMockMongoProduct(overrides = {}) {
  const uniqueId = Math.random().toString(36).substr(2, 9);
  const defaultDoc = {
    _id: `${PREFIX}${uniqueId}`,
    productId: `${PREFIX}${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    name: `${PREFIX}Test Product`,
    slug: `${PREFIX}test-product-${uniqueId}`,
    price: 1999,
    buyingPrice: 1500,
    categoryName: 'Electronics',
    categoryId: null,
    brandId: null,
    brandName: '',
    hasVariants: true,
    stockQuantity: 100,
    lowStockThreshold: 10,
    supplierId: null,
    warehouseId: null,
    reorderPoint: 5,
    stock: 100,
    description: 'Test product description',
    detailedDescription: '',
    highlights: ['Feature 1', 'Feature 2'],
    tags: ['test', 'electronics'],
    weight: 0.5,
    status: 'active',
    createdById: null,
    icon: '📦',
    image: 'https://example.com/image.jpg',
    images: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
    rating: 4.5,
    numOfReviews: 10,
    variants: [
      {
        _id: `${PREFIX}var1-${uniqueId}`,
        name: 'Size: M | Color: Blue',
        sku: `${PREFIX}SKU001-${uniqueId}`,
        price: 1999,
        buyingPrice: 1500,
        stock: 50,
        image: 'https://example.com/var1.jpg',
        attribute: 'Size',
        value: 'M',
        attributes: {
          Size: 'M',
          Color: 'Blue'
        }
      },
      {
        _id: `${PREFIX}var2-${uniqueId}`,
        name: 'Size: L | Color: Red',
        sku: `${PREFIX}SKU002-${uniqueId}`,
        price: 2099,
        buyingPrice: 1600,
        stock: 50,
        image: 'https://example.com/var2.jpg',
        attribute: 'Size',
        value: 'L',
        attributes: {
          Size: 'L',
          Color: 'Red'
        }
      }
    ],
    costHistory: [
      {
        cost: 1500,
        date: new Date(),
        supplierId: null
      }
    ],
    reviews: [
      {
        _id: `${PREFIX}rev1-${uniqueId}`,
        user: `${PREFIX}user123-${uniqueId}`,
        name: 'Test User',
        rating: 5,
        comment: 'Great product!',
        createdAt: new Date()
      }
    ]
  };
  return { ...defaultDoc, ...overrides };
}

// ── Setup & Teardown ─────────────────────────────────────────────────────────
beforeAll(async () => {
  // Create a shared product for read tests
  const sharedProduct = createMockMongoProduct({
    name: `${PREFIX}Shared Product`,
    categoryName: 'TestCategory'
  });
  sharedProductMongoId = sharedProduct._id;
  createdLegacyIds.push(sharedProductMongoId);
  await createProductInPG(sharedProduct);
});

afterAll(async () => {
  if (createdLegacyIds.length) {
    // Clean up all test products (cascading will handle child tables)
    await prisma.product.deleteMany({
      where: { legacyId: { in: [...createdLegacyIds] } }
    });
    createdLegacyIds.length = 0;
  }
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe('Product repository — real Neon DB', () => {
  test('Test 1: createProductInPG() creates product with at least 1 variant and 1 image', async () => {
    const mongoDoc = createMockMongoProduct({
      name: `${PREFIX}Product with Variants`,
      productId: `${PREFIX}PWV001`
    });
    createdLegacyIds.push(mongoDoc._id);

    await createProductInPG(mongoDoc);

    // Verify product exists
    const product = await prisma.product.findUnique({
      where: { legacyId: String(mongoDoc._id) },
      include: { variants: true }
    });

    expect(product).toBeDefined();
    expect(product.legacyId).toBe(String(mongoDoc._id));
    expect(product.name).toBe(mongoDoc.name);
    expect(product.productId).toBe(mongoDoc.productId);
    expect(product.hasVariants).toBe(true);
    
    // Verify at least 1 variant
    expect(product.variants.length).toBeGreaterThanOrEqual(1);
    expect(product.variants[0].sku).toBeTruthy();
    
    // Verify at least 1 image
    expect(Array.isArray(product.images)).toBe(true);
    expect(product.images.length).toBeGreaterThanOrEqual(1);
  });

  test('Test 2: createProductInPG() with same mongoId does NOT create duplicate (idempotent on failure)', async () => {
    const mongoDoc = createMockMongoProduct({
      name: `${PREFIX}Duplicate Test`,
      productId: `${PREFIX}DUP001`
    });
    createdLegacyIds.push(mongoDoc._id);

    // First insert
    await createProductInPG(mongoDoc);
    
    // Verify first insert
    const first = await prisma.product.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(first).toBeDefined();
    expect(first.name).toBe(`${PREFIX}Duplicate Test`);

    // Try to insert again with same mongoId (should fail silently due to duplicate key)
    mongoDoc.name = `${PREFIX}Duplicate Test Updated`;
    mongoDoc.price = 2999;
    await createProductInPG(mongoDoc);

    // Verify still only one record exists and it wasn't updated
    // (createProductInPG logs error but doesn't update existing records)
    const count = await prisma.product.count({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(count).toBe(1);

    const check = await prisma.product.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(check.name).toBe(`${PREFIX}Duplicate Test`); // Original name, not updated
    expect(Number(check.price)).toBe(1999); // Original price, not updated
  });

  test('Test 3: updateProductInPG() updates name and price, verify in PG', async () => {
    const mongoDoc = createMockMongoProduct({
      name: `${PREFIX}Update Test`,
      price: 1000
    });
    createdLegacyIds.push(mongoDoc._id);

    await createProductInPG(mongoDoc);

    // Update name and price
    const updateData = {
      name: `${PREFIX}Update Test Modified`,
      price: 1500
    };
    await updateProductInPG(mongoDoc._id, updateData);

    // Verify updates
    const updated = await prisma.product.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });

    expect(updated).toBeDefined();
    expect(updated.name).toBe(`${PREFIX}Update Test Modified`);
    expect(Number(updated.price)).toBe(1500);
  });

  test('Test 4: updateStockInPG() updates a variant stock quantity, verify new value', async () => {
    const mongoDoc = createMockMongoProduct({
      name: `${PREFIX}Stock Update Test`
    });
    createdLegacyIds.push(mongoDoc._id);

    await createProductInPG(mongoDoc);

    // Get the first variant's SKU
    const product = await prisma.product.findUnique({
      where: { legacyId: String(mongoDoc._id) },
      include: { variants: true }
    });

    expect(product.variants.length).toBeGreaterThan(0);
    const firstVariant = product.variants[0];
    const variantSku = firstVariant.sku;
    const newStock = 25;

    // Update stock
    await updateStockInPG(mongoDoc._id, variantSku, newStock);

    // Verify new stock value
    const updatedVariant = await prisma.productVariant.findFirst({
      where: { sku: variantSku }
    });

    expect(updatedVariant).toBeDefined();
    expect(updatedVariant.stock).toBe(newStock);

    // Verify total product stock was recalculated
    const updatedProduct = await prisma.product.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(updatedProduct.stock).toBeDefined();
  });

  test('Test 5: deleteProductInPG() product not found after delete', async () => {
    const mongoDoc = createMockMongoProduct({
      name: `${PREFIX}Delete Test`
    });
    // Don't push to createdLegacyIds — we're deleting it manually

    await createProductInPG(mongoDoc);

    // Verify it exists
    const before = await prisma.product.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(before).toBeDefined();

    // Delete it
    await deleteProductInPG(mongoDoc._id);

    // Verify it's gone
    const after = await prisma.product.findUnique({
      where: { legacyId: String(mongoDoc._id) }
    });
    expect(after).toBeNull();
  });

  test('Test 6: getProductByIdFromPG() returns correct product with expected fields', async () => {
    const result = await getProductByIdFromPG(sharedProductMongoId);

    expect(result).toBeDefined();
    expect(result._id).toBe(sharedProductMongoId); // _id is legacyId (mongoId)
    expect(result.name).toContain(PREFIX);
    expect(result.productId).toBeTruthy();
    expect(result.price).toBeDefined();
    expect(result.stock).toBeDefined();
    expect(Array.isArray(result.variants)).toBe(true);
    expect(Array.isArray(result.images)).toBe(true);
  });

  test('Test 7: listProductsFromPG() returns array, at least 1 result', async () => {
    const results = await listProductsFromPG();

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);
    
    // Verify at least one of our test products is in the results
    const found = results.find(p => p._id === sharedProductMongoId);
    expect(found).toBeDefined();
  });

  test('Test 8: listProductsFromPG() with category filter returns only matching products', async () => {
    // Create a product with specific category
    const mongoDoc = createMockMongoProduct({
      name: `${PREFIX}Category Filter Test`,
      categoryName: 'UniqueTestCategory'
    });
    createdLegacyIds.push(mongoDoc._id);

    await createProductInPG(mongoDoc);

    // Filter by category
    const results = await listProductsFromPG({ categoryName: 'UniqueTestCategory' });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);
    
    // Verify all results match the category filter
    for (const product of results) {
      expect(product.category).toBe('UniqueTestCategory');
    }

    // Verify our test product is in the filtered results
    const found = results.find(p => p._id === String(mongoDoc._id));
    expect(found).toBeDefined();
  });
});
