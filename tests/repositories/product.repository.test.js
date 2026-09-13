/********************************************************************
 * Product Repository — Isolated Integration Tests
 * Connects to the REAL Neon PostgreSQL test database.
 *
 * Run: npm run test:repositories
 *
 * Stage 2 Step 2, Part 5 — 2026-09-13
 ********************************************************************/

const { describe, test, expect, afterEach, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  slugifyProduct,
  create,
  remove,
  addVariant,
  updateVariant,
  listVariants,
  addCostEntry,
  listCostHistory,
  addEmbeddedReview,
  listEmbeddedReviews
} = require('../../backend/src/repositories/productRepository');
const { create: createOrder } = require('../../backend/src/repositories/orderRepository');

const PREFIX = `__test_prod_${Date.now()}_`;
const createdProductIds = [];
const createdOrderIds = [];
const createdUserIds = [];

async function cleanupProducts() {
  if (createdProductIds.length) {
    await prisma.product.deleteMany({ where: { id: { in: [...createdProductIds] } } });
    createdProductIds.length = 0;
  }
}

async function cleanupOrders() {
  if (createdOrderIds.length) {
    await prisma.order.deleteMany({ where: { id: { in: [...createdOrderIds] } } });
    createdOrderIds.length = 0;
  }
}

async function cleanupUsers() {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: [...createdUserIds] } } });
    createdUserIds.length = 0;
  }
}

async function cleanupAll() {
  await cleanupOrders();
  await cleanupProducts();
  await cleanupUsers();
}

afterEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await cleanupAll();
});

function trackProduct(record) {
  if (record?.id) createdProductIds.push(record.id);
  return record;
}

function trackOrder(record) {
  if (record?.id) createdOrderIds.push(record.id);
  return record;
}

async function createTestProduct(overrides = {}) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return trackProduct(await create({
    name: `${PREFIX}Product ${suffix}`,
    price: 999,
    productId: `${PREFIX}PROD-${suffix}`,
    ...overrides
  }));
}

// ── 1. Slug generation ───────────────────────────────────────────────────────
describe('slugifyProduct', () => {
  test('Latin name → lowercase hyphenated slug (brand.js algorithm)', () => {
    expect(slugifyProduct('Premium Cotton T-Shirt')).toBe('premium-cotton-t-shirt');
    expect(slugifyProduct('  Hello   World  ')).toBe('hello-world');
  });

  test('Bengali-script name → preserves Unicode range U+0980–U+09FF', () => {
    const bangla = 'ইলেকট্রনিক্স';
    const slug = slugifyProduct(bangla);
    expect(slug).toBe(bangla.toLowerCase());
    expect(slug.length).toBeGreaterThan(0);
  });
});

// ── 2. create() slug ───────────────────────────────────────────────────────────
describe('Product repository — create slug', () => {
  test('create() auto-generates slug from name', async () => {
    const name = `${PREFIX}Electronics Gadget`;
    const product = await createTestProduct({ name });
    expect(product.slug).toBe(slugifyProduct(name));
  });
});

// ── 3. Variants (Map → table) ──────────────────────────────────────────────────
describe('Product repository — variants', () => {
  test('addVariant() creates one ProductVariantAttribute row per key; listVariants() reassembles', async () => {
    const product = await createTestProduct();
    const attrs = { Color: 'Pink', Size: 'M', Material: 'Cotton' };

    const variant = await addVariant(product.id, {
      name: 'Size: M | Color: Pink',
      sku: 'SKU-001',
      price: 1200,
      stock: 5,
      attributes: attrs
    });

    expect(variant.attributes).toEqual(attrs);

    const listed = await listVariants(product.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].attributes).toEqual(attrs);

    const attrRows = await prisma.productVariantAttribute.findMany({
      where: { variantId: variant.id }
    });
    expect(attrRows).toHaveLength(3);
  });

  test('updateVariant() replacing attributes removes old entries (delete+recreate)', async () => {
    const product = await createTestProduct();
    const variant = await addVariant(product.id, {
      name: 'V1',
      attributes: { Color: 'Red', Size: 'S' }
    });

    await updateVariant(variant.id, {
      attributes: { Color: 'Blue' }
    });

    const attrRows = await prisma.productVariantAttribute.findMany({
      where: { variantId: variant.id }
    });
    expect(attrRows).toHaveLength(1);
    expect(attrRows[0].name).toBe('Color');
    expect(attrRows[0].value).toBe('Blue');

    const listed = await listVariants(product.id);
    expect(listed[0].attributes).toEqual({ Color: 'Blue' });
  });
});

// ── 4. Cascade on product delete ───────────────────────────────────────────────
describe('Product repository — cascade delete', () => {
  test('remove() cascades variants, cost history, and embedded reviews', async () => {
    const product = await createTestProduct();
    const variant = await addVariant(product.id, {
      name: 'V1',
      attributes: { Size: 'L' }
    });
    await addCostEntry(product.id, 500);
    await addEmbeddedReview(product.id, {
      name: 'Reviewer',
      rating: 5,
      comment: 'Great product'
    });

    expect((await listCostHistory(product.id)).length).toBe(1);
    expect((await listEmbeddedReviews(product.id)).length).toBe(1);

    await remove(product.id);

    const variantsLeft = await prisma.productVariant.count({ where: { productId: product.id } });
    const attrsLeft = await prisma.productVariantAttribute.count({ where: { variantId: variant.id } });
    const costLeft = await prisma.productCostHistory.count({ where: { productId: product.id } });
    const reviewsLeft = await prisma.productEmbeddedReview.count({ where: { productId: product.id } });

    expect(variantsLeft).toBe(0);
    expect(attrsLeft).toBe(0);
    expect(costLeft).toBe(0);
    expect(reviewsLeft).toBe(0);

    createdProductIds.length = 0;
  });

  test('remove() does NOT delete OrderItem — productId becomes null (SetNull)', async () => {
    const product = await createTestProduct({ price: 100 });
    const order = trackOrder(await createOrder({
      orderId: `${PREFIX}ORD-SETNULL`,
      subTotal: 100,
      subtotal: 90,
      grandTotal: 100,
      items: [{
        productId: product.id,
        name: product.name,
        price: 100,
        quantity: 1
      }]
    }));

    const itemBefore = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    expect(itemBefore.productId).toBe(product.id);

    await remove(product.id);

    const itemAfter = await prisma.orderItem.findUnique({ where: { id: itemBefore.id } });
    expect(itemAfter).toBeTruthy();
    expect(itemAfter.productId).toBeNull();

    createdProductIds.length = 0;
  });

  test('remove() DOES cascade-delete CartItem referencing the product', async () => {
    const product = await createTestProduct({ price: 50 });

    const user = await prisma.user.create({
      data: {
        firstName: 'Cart',
        lastName: 'Tester',
        email: `${PREFIX}cart_${Date.now()}@example.com`
      }
    });
    createdUserIds.push(user.id);

    const cart = await prisma.cart.create({ data: { userId: user.id } });
    const cartItem = await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: product.id,
        name: product.name,
        price: 50,
        quantity: 2
      }
    });

    await remove(product.id);

    const cartItemAfter = await prisma.cartItem.findUnique({ where: { id: cartItem.id } });
    expect(cartItemAfter).toBeNull();

    createdProductIds.length = 0;
  });
});
