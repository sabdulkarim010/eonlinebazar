/********************************************************************
 * Project: EonlineBazar
 * File: stockAlertRepository.js
 * Location: backend/src/repositories/stockAlertRepository.js
 * Description: Prisma repository for StockAlert + StockAlertItem children.
 *   lowStockProducts[] → kind LOW_STOCK with stock/threshold populated.
 *   outOfStockProducts[] → kind OUT_OF_STOCK with stock/threshold null.
 *   alertsSent{} → three parent booleans.
 *
 *   Stage 2 Step 3, Part 4 — Security/Audit dual-write (2026-09-14).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

function toShape(record) {
  if (!record) return null;
  return { ...record, _id: record.id };
}

function mapAlertsSent(alertsSent = {}) {
  return {
    alertSentEmail: alertsSent.email === true,
    alertSentSms: alertsSent.sms === true,
    alertSentWhatsapp: alertsSent.whatsapp === true
  };
}

async function resolveProductFk(productIdStr) {
  const code = String(productIdStr || '').trim();
  if (!code) return null;
  try {
    const { findByProductId } = require('./productRepository');
    const product = await findByProductId(code);
    return product ? product.id : null;
  } catch {
    return null;
  }
}

async function buildItemRows(lowStockProducts = [], outOfStockProducts = []) {
  const rows = [];

  for (const item of lowStockProducts) {
    const legacyProductId = String(item.productId || '').trim();
    rows.push({
      kind: 'LOW_STOCK',
      name: String(item.name || '').trim(),
      legacyProductId,
      productId: await resolveProductFk(legacyProductId),
      stock: item.stock != null ? Number(item.stock) : 0,
      threshold: item.threshold != null ? Number(item.threshold) : 0
    });
  }

  for (const item of outOfStockProducts) {
    const legacyProductId = String(item.productId || '').trim();
    rows.push({
      kind: 'OUT_OF_STOCK',
      name: String(item.name || '').trim(),
      legacyProductId,
      productId: await resolveProductFk(legacyProductId),
      stock: null,
      threshold: null
    });
  }

  return rows;
}

async function create(data) {
  const lowStockProducts = Array.isArray(data.lowStockProducts) ? data.lowStockProducts : [];
  const outOfStockProducts = Array.isArray(data.outOfStockProducts) ? data.outOfStockProducts : [];
  const itemRows = await buildItemRows(lowStockProducts, outOfStockProducts);

  // Sequential inserts — nested create uses transactions, which Neon HTTP mode rejects.
  const record = await prisma.stockAlert.create({
    data: {
      checkedAt: new Date(data.checkedAt || Date.now()),
      lowStockCount: data.lowStockCount != null
        ? Number(data.lowStockCount)
        : lowStockProducts.length,
      outOfStockCount: data.outOfStockCount != null
        ? Number(data.outOfStockCount)
        : outOfStockProducts.length,
      ...mapAlertsSent(data.alertsSent),
      legacyId: data.legacyId != null ? String(data.legacyId) : null,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined
    }
  });

  for (const item of itemRows) {
    await prisma.stockAlertItem.create({
      data: { ...item, stockAlertId: record.id }
    });
  }

  const loaded = await prisma.stockAlert.findUnique({
    where: { id: record.id },
    include: { items: true }
  });
  return toShape(loaded);
}

async function findPaginated({ skip = 0, limit = 25, includeItems = true } = {}) {
  const records = await prisma.stockAlert.findMany({
    orderBy: { checkedAt: 'desc' },
    skip,
    take: limit,
    include: includeItems ? { items: { orderBy: [{ kind: 'asc' }, { name: 'asc' }] } } : undefined
  });
  return records.map(toShape);
}

async function findByLegacyId(legacyId, includeItems = true) {
  if (!legacyId) return null;
  const record = await prisma.stockAlert.findUnique({
    where: { legacyId: String(legacyId) },
    include: includeItems ? { items: { orderBy: [{ kind: 'asc' }, { name: 'asc' }] } } : undefined
  });
  return toShape(record);
}

async function countAll() {
  return prisma.stockAlert.count();
}

module.exports = {
  create,
  findPaginated,
  findByLegacyId,
  countAll,
  buildItemRows,
  mapAlertsSent
};
