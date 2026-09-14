/********************************************************************
 * StockAlert Repository — kind discrimination integration test
 *
 * Verifies lowStockProducts[] → LOW_STOCK (stock/threshold populated)
 * and outOfStockProducts[] → OUT_OF_STOCK (stock/threshold null).
 *
 * Stage 2 Step 3, Part 4 — 2026-09-14
 ********************************************************************/

const { describe, test, expect, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const { create } = require('../../backend/src/repositories/stockAlertRepository');

const LEGACY_ID = `__test_stock_alert_${Date.now()}__`;
let createdId = null;

afterAll(async () => {
  if (createdId) {
    await prisma.stockAlert.delete({ where: { id: createdId } }).catch(() => {});
  }
});

describe('stockAlertRepository — StockAlertItem kind discrimination', () => {
  test('create() merges arrays into LOW_STOCK and OUT_OF_STOCK child rows', async () => {
    const row = await create({
      legacyId: LEGACY_ID,
      checkedAt: new Date(),
      lowStockCount: 1,
      outOfStockCount: 1,
      lowStockProducts: [{
        name: 'Low Widget',
        productId: 'TEST-LOW-001',
        stock: 3,
        threshold: 10
      }],
      outOfStockProducts: [{
        name: 'Out Widget',
        productId: 'TEST-OUT-001'
      }],
      alertsSent: { email: true, sms: false, whatsapp: false }
    });
    createdId = row.id;

    const items = await prisma.stockAlertItem.findMany({
      where: { stockAlertId: row.id },
      orderBy: { kind: 'asc' }
    });

    expect(items).toHaveLength(2);

    const lowItem = items.find((item) => item.kind === 'LOW_STOCK');
    const outItem = items.find((item) => item.kind === 'OUT_OF_STOCK');

    expect(lowItem).toBeDefined();
    expect(lowItem.name).toBe('Low Widget');
    expect(lowItem.legacyProductId).toBe('TEST-LOW-001');
    expect(lowItem.stock).toBe(3);
    expect(lowItem.threshold).toBe(10);

    expect(outItem).toBeDefined();
    expect(outItem.name).toBe('Out Widget');
    expect(outItem.legacyProductId).toBe('TEST-OUT-001');
    expect(outItem.stock).toBe(null);
    expect(outItem.threshold).toBe(null);

    expect(row.alertSentEmail).toBe(true);
    expect(row.alertSentSms).toBe(false);
    expect(row.alertSentWhatsapp).toBe(false);
  });
});
