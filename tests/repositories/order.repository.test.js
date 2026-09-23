/********************************************************************
 * Order Repository — Isolated Integration Tests
 * Connects to the REAL Neon PostgreSQL test database.
 *
 * Run: npm run test:repositories
 *
 * Stage 2 Step 2, Part 5 — 2026-09-13
 ********************************************************************/

const { describe, test, expect, afterEach, afterAll } = require('./jestCompat');
const { mirrorOrderCreate } = require('../../backend/src/utils/orderDualWriteHelpers');
const { dualWrite } = require('../../backend/src/services/dualWriteService');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  create,
  createFromMongo,
  findById,
  findByLegacyId,
  addReturnItem,
  listReturnItems,
  resolveProductIdForOrderItem
} = require('../../backend/src/repositories/orderRepository');
const orderRepo = require('../../backend/src/repositories/orderRepository');
const { create: createUser } = require('../../backend/src/repositories/userRepository');

const PREFIX = `__test_ord_${Date.now()}_`;
const createdOrderIds = [];
const createdUserIds = [];
const createdProductIds = [];
let originalCreateFromMongo;

async function cleanup() {
  if (createdOrderIds.length) {
    // Order delete cascades OrderItem, OrderReturnItem, OrderPayment,
    // OrderPaymentProof, OrderNotification per schema.prisma.
    await prisma.order.deleteMany({ where: { id: { in: [...createdOrderIds] } } });
    createdOrderIds.length = 0;
  }
}

afterEach(async () => {
  if (originalCreateFromMongo) {
    orderRepo.createFromMongo = originalCreateFromMongo;
    originalCreateFromMongo = null;
  }
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  if (createdProductIds.length) {
    await prisma.product.deleteMany({ where: { id: { in: [...createdProductIds] } } });
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: [...createdUserIds] } } });
  }
});

function track(record) {
  if (record?.id) createdOrderIds.push(record.id);
  return record;
}

function fullOrderPayload(overrides = {}) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    orderId: `${PREFIX}ORD-${suffix}`,
    customerName: 'Test Customer',
    customerPhone: '01700000000',
    subTotal: 1500,
    subtotal: 1400,
    deliveryCharge: 60,
    grandTotal: 1560,
    paymentMethod: 'COD',
    items: [{
      id: 'line-1',
      productId: 'legacy-prod-123',
      name: 'Test Item',
      price: 1500,
      buyingPrice: 900,
      quantity: 1,
      icon: '📦',
      slug: 'test-item-slug'
    }],
    payment: {
      code: 'cod',
      name: 'Cash on Delivery',
      type: 'manual',
      status: 'unpaid',
      transactionId: 'TXN-001',
      ipnHistory: [{
        provider: 'bkash',
        status: 'completed',
        verified: true,
        transactionId: 'IPN-TXN-1',
        amount: 1560,
        message: 'OK',
        raw: { gateway: 'bkash', payload: { trxId: 'ABC123' } }
      }]
    },
    paymentProof: {
      trxId: 'TRX-999',
      screenshotUrl: 'https://example.com/proof.png',
      status: 'submitted',
      submittedAt: new Date()
    },
    notificationsSent: {
      processing: true,
      out_for_delivery: true
    },
    ...overrides
  };
}

// ── 1. create() full nested payload ────────────────────────────────────────────
describe('Order repository — create', () => {
  test('create() with nested items, payment+ipnHistory, paymentProof creates all child rows', async () => {
    const order = track(await create(fullOrderPayload()));

    expect(order.id).toBeTruthy();
    expect(order.items).toHaveLength(1);
    expect(order.payment).toBeTruthy();
    expect(order.payment.ipnHistory).toHaveLength(1);
    expect(order.paymentProof).toBeTruthy();
    expect(order.notificationsSent.processing).toBe(true);
    expect(order.notificationsSent.out_for_delivery).toBe(true);

    const itemRows = await prisma.orderItem.count({ where: { orderId: order.id } });
    const ipnRows = await prisma.orderPaymentIpnEvent.count({
      where: { orderPayment: { orderId: order.id } }
    });
    const proofRows = await prisma.orderPaymentProof.count({ where: { orderId: order.id } });
    const notifRows = await prisma.orderNotification.count({ where: { orderId: order.id } });

    expect(itemRows).toBe(1);
    expect(ipnRows).toBe(1);
    expect(proofRows).toBe(1);
    expect(notifRows).toBe(1);
  });

  test('undeclared item key (icon, slug) lands in extraFields JSON', async () => {
    const order = track(await create(fullOrderPayload()));
    const itemRow = await prisma.orderItem.findFirst({ where: { orderId: order.id } });

    expect(itemRow.extraFields).toBeTruthy();
    expect(itemRow.extraFields.icon).toBe('📦');
    expect(itemRow.extraFields.slug).toBe('test-item-slug');
  });

  test('subTotal and subtotal hold different values on the same row', async () => {
    const order = track(await create(fullOrderPayload({ subTotal: 2000, subtotal: 1750 })));

    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(Number(row.subTotal)).toBe(2000);
    expect(Number(row.subtotal)).toBe(1750);

    const order2 = track(await create(fullOrderPayload({
      orderId: `${PREFIX}ORD-DUAL2`,
      subTotal: 500,
      subtotal: 499
    })));
    const row2 = await prisma.order.findUnique({ where: { id: order2.id } });
    expect(Number(row2.subTotal)).toBe(500);
    expect(Number(row2.subtotal)).toBe(499);
  });
});

// ── 2. findById reassembly ─────────────────────────────────────────────────────
describe('Order repository — findById', () => {
  test('findById() reassembles nested Mongoose-like shape', async () => {
    const payload = fullOrderPayload();
    const created = track(await create(payload));
    const loaded = await findById(created.id);

    expect(loaded.status).toBe('Pending');
    expect(loaded.items[0].name).toBe('Test Item');
    expect(loaded.items[0].icon).toBe('📦');
    expect(loaded.items[0].slug).toBe('test-item-slug');
    expect(loaded.payment.transactionId).toBe('TXN-001');
    expect(loaded.payment.ipnHistory[0].raw.gateway).toBe('bkash');
    expect(loaded.paymentProof.trxId).toBe('TRX-999');
    expect(loaded.notificationsSent.out_for_delivery).toBe(true);
    expect(Number(loaded.subTotal)).toBe(1500);
    expect(Number(loaded.subtotal)).toBe(1400);
  });
});

// ── 3. Return items ────────────────────────────────────────────────────────────
describe('Order repository — return items', () => {
  test('addReturnItem() and listReturnItems() work correctly', async () => {
    const order = track(await create(fullOrderPayload({ items: [] })));

    const added = await addReturnItem(order.id, {
      productId: 'prod-legacy-1',
      productName: 'Returned Widget',
      quantity: 2,
      price: 500,
      reason: 'Defective',
      photos: ['https://example.com/photo.jpg'],
      status: 'pending'
    });

    expect(added.productName).toBe('Returned Widget');
    expect(added.status).toBe('pending');

    const listed = await listReturnItems(order.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].productName).toBe('Returned Widget');
    expect(listed[0].photos).toContain('https://example.com/photo.jpg');
  });
});

// ── 4. createFromMongo + FK resolution ─────────────────────────────────────────
describe('Order repository — createFromMongo', () => {
  test('createFromMongo resolves userId and productId via legacyId', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const mongoUserLegacyId = `${PREFIX}user_${suffix}`;
    const mongoProductLegacyId = `${PREFIX}prod_${suffix}`;

    const user = await createUser({
      firstName: 'Order',
      lastName: 'Buyer',
      email: `${PREFIX}${suffix}@example.com`,
      referralCode: `O${String(Date.now()).slice(-7)}`,
      legacyId: mongoUserLegacyId
    });
    createdUserIds.push(user.id);

    const product = await prisma.product.create({
      data: {
        legacyId: mongoProductLegacyId,
        productId: `${PREFIX}PID-${suffix}`,
        name: 'FK Test Product',
        slug: `${PREFIX}slug-${suffix}`,
        price: 500,
        categoryName: 'General'
      }
    });
    createdProductIds.push(product.id);

    const mongoOrderId = `${PREFIX}mongo_${suffix}`;
    const mongoDoc = {
      _id: mongoOrderId,
      orderId: `${PREFIX}ORD-FK-${suffix}`,
      user: mongoUserLegacyId,
      customerName: 'FK Customer',
      subTotal: 500,
      subtotal: 480,
      deliveryCharge: 60,
      grandTotal: 560,
      paymentMethod: 'COD',
      status: 'Pending',
      items: [{
        productId: mongoProductLegacyId,
        name: 'FK Test Product',
        price: 500,
        quantity: 1
      }],
      payment: {
        code: 'cod',
        name: 'Cash on Delivery',
        type: 'manual',
        status: 'unpaid'
      }
    };

    const order = track(await createFromMongo(mongoDoc));
    const row = await prisma.order.findUnique({
      where: { id: order.id },
      include: { items: true, payment: true }
    });

    expect(row.legacyId).toBe(mongoOrderId);
    expect(row.userId).toBe(user.id);
    expect(Number(row.subTotal)).toBe(500);
    expect(Number(row.subtotal)).toBe(480);
    expect(row.items).toHaveLength(1);
    expect(row.items[0].productId).toBe(product.id);
    expect(row.payment).toBeTruthy();

    const loaded = await findByLegacyId(mongoOrderId);
    expect(loaded.orderId).toBe(mongoDoc.orderId);
  });

  test('createFromMongo leaves userId null for guest/unmigrated user without failing', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const mongoOrderId = `${PREFIX}guest_${suffix}`;
    const mongoDoc = {
      _id: mongoOrderId,
      orderId: `${PREFIX}ORD-GUEST-${suffix}`,
      user: `${PREFIX}missing_user_${suffix}`,
      subTotal: 200,
      subtotal: 200,
      grandTotal: 200,
      items: [],
      payment: { code: 'cod', name: 'COD', type: 'manual', status: 'unpaid' }
    };

    const order = track(await createFromMongo(mongoDoc));
    const row = await prisma.order.findUnique({ where: { id: order.id } });
    expect(row.userId).toBeNull();
  });

  test('createFromMongo leaves productId null for missing product without failing the order', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const mongoOrderId = `${PREFIX}noprod_${suffix}`;
    const missingProductRef = `${PREFIX}ghost_prod_${suffix}`;

    const mongoDoc = {
      _id: mongoOrderId,
      orderId: `${PREFIX}ORD-NOPROD-${suffix}`,
      subTotal: 300,
      subtotal: 300,
      grandTotal: 300,
      items: [{
        productId: missingProductRef,
        name: 'Ghost Line',
        price: 300,
        quantity: 1
      }],
      payment: { code: 'cod', name: 'COD', type: 'manual', status: 'unpaid' }
    };

    const order = track(await createFromMongo(mongoDoc));
    const itemRow = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    expect(itemRow.productId).toBeNull();
    expect(itemRow.legacyProductId).toBe(missingProductRef);

    const resolved = await resolveProductIdForOrderItem(missingProductRef);
    expect(resolved).toBeNull();
  });
});

// ── 5. Partial-write logging + dualWrite isolation ─────────────────────────────
describe('Order dual-write — partial failure logging', () => {
  test('mirrorOrderCreate logs [DUAL-WRITE-ORDER-PARTIAL] with failedStage when Order row exists', async () => {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const legacyId = `${PREFIX}partial_${suffix}`;

    const orderRow = await prisma.order.create({
      data: {
        legacyId,
        orderId: `${PREFIX}ORD-PARTIAL-${suffix}`,
        subTotal: 100,
        subtotal: 99,
        grandTotal: 100
      }
    });
    createdOrderIds.push(orderRow.id);

    originalCreateFromMongo = orderRepo.createFromMongo;
    orderRepo.createFromMongo = async () => {
      const err = new Error('Simulated OrderPayment insert failure');
      err.dualWriteStage = 'OrderPayment';
      throw err;
    };

    const logs = [];
    const origError = console.error;
    console.error = (...args) => {
      logs.push(args);
      origError(...args);
    };

    await mirrorOrderCreate({
      _id: legacyId,
      orderId: orderRow.orderId,
      subTotal: 100,
      subtotal: 99,
      grandTotal: 100,
      items: [],
      payment: { code: 'cod', status: 'unpaid' }
    });

    console.error = origError;

    const partialLog = logs.find((entry) => entry[0] === '[DUAL-WRITE-ORDER-PARTIAL]');
    expect(partialLog).toBeTruthy();
    expect(partialLog[1].mongoId).toBe(legacyId);
    expect(partialLog[1].postgresOrderId).toBe(orderRow.id);
    expect(partialLog[1].failedStage).toBe('OrderPayment');
    expect(String(partialLog[1].error)).toContain('OrderPayment');
  });

  test('dualWrite swallows Postgres mirror failure without affecting mongo result', async () => {
    originalCreateFromMongo = orderRepo.createFromMongo;
    orderRepo.createFromMongo = async () => {
      throw new Error('Postgres unavailable');
    };

    const mongoResult = { _id: `${PREFIX}mongo_only`, orderId: 'ORD-MONGO-ONLY' };

    const result = await dualWrite(
      async () => mongoResult,
      async (saved) => { await mirrorOrderCreate(saved); },
      { model: 'Order', operation: 'createCheckoutTest', mongoId: mongoResult._id }
    );

    expect(result).toBe(mongoResult);
  });
});
