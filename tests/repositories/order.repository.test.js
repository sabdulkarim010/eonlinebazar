/********************************************************************
 * Order Repository — Isolated Integration Tests
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
  create,
  findById,
  addReturnItem,
  listReturnItems
} = require('../../backend/src/repositories/orderRepository');

const PREFIX = `__test_ord_${Date.now()}_`;
const createdOrderIds = [];

async function cleanup() {
  if (createdOrderIds.length) {
    // Order delete cascades OrderItem, OrderReturnItem, OrderPayment,
    // OrderPaymentProof, OrderNotification per schema.prisma.
    await prisma.order.deleteMany({ where: { id: { in: [...createdOrderIds] } } });
    createdOrderIds.length = 0;
  }
}

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
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
