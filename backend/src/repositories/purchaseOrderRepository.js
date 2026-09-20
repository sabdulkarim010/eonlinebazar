/********************************************************************
 * Project: EonlineBazar — ERP Core
 * File: purchaseOrderRepository.js
 * Location: backend/src/repositories/purchaseOrderRepository.js
 * Description: Prisma repository for PurchaseOrder + PurchaseOrderItem
 *   dual-write pattern. Mirrors purchaseOrderController.js behaviour.
 *   All functions log failures but never throw — MongoDB stays authoritative
 *   during Stage 2.
 * Stage 2 Step 3, Part 2.4 — 2026-09-20
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PO_STATUSES = ['draft', 'sent', 'partial', 'received', 'cancelled'];

function toStatusEnum(value) {
  const key = String(value || 'draft').trim().toLowerCase();
  const map = {
    draft: 'DRAFT',
    sent: 'SENT',
    partial: 'PARTIAL',
    received: 'RECEIVED',
    cancelled: 'CANCELLED'
  };
  return map[key] || 'DRAFT';
}

function fromStatusEnum(status) {
  if (!status) return 'draft';
  return String(status).toLowerCase();
}

function toDecimalNumber(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toNumber === 'function') return value.toNumber();
  return parseFloat(String(value)) || 0;
}

function computeTotalCost(items) {
  return (items || []).reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitCost) || 0),
    0
  );
}

async function resolveByLegacyId(model, mongoRef) {
  if (mongoRef == null || mongoRef === '') return null;
  const ref = String(mongoRef);

  let row = await prisma[model].findUnique({ where: { legacyId: ref } });
  if (row) return row.id;

  if (UUID_PATTERN.test(ref)) {
    row = await prisma[model].findUnique({ where: { id: ref } });
    if (row) return row.id;
  }

  return null;
}

async function resolveSupplierId(mongoRef) {
  return resolveByLegacyId('supplier', mongoRef);
}

async function resolveWarehouseId(mongoRef) {
  if (mongoRef == null || mongoRef === '') return null;
  return resolveByLegacyId('warehouse', mongoRef);
}

async function resolveAdminId(mongoRef) {
  if (mongoRef == null || mongoRef === '') return null;
  return resolveByLegacyId('admin', mongoRef);
}

async function resolveProductId(mongoRef) {
  if (mongoRef == null || mongoRef === '') return null;
  return resolveByLegacyId('product', mongoRef);
}

function mapSupplierPopulated(supplier) {
  if (!supplier) return null;
  return {
    _id: supplier.legacyId || supplier.id,
    name: supplier.name,
    contactPerson: supplier.contactPerson || '',
    phone: supplier.phone || '',
    email: supplier.email || '',
    address: supplier.address || ''
  };
}

function mapWarehousePopulated(warehouse) {
  if (!warehouse) return null;
  return {
    _id: warehouse.legacyId || warehouse.id,
    name: warehouse.name,
    location: warehouse.location || '',
    address: warehouse.address || ''
  };
}

function mapProductPopulated(product) {
  if (!product) return null;
  return {
    _id: product.legacyId || product.id,
    name: product.name,
    productId: product.productId,
    stockQuantity: product.stockQuantity != null ? Number(product.stockQuantity) : 0
  };
}

function mapItemToMongo(item) {
  if (!item) return null;
  const productPopulated = item.product ? mapProductPopulated(item.product) : null;
  return {
    _id: item.legacyId || item.id,
    productId: productPopulated || (item.legacyProductId ? String(item.legacyProductId) : null),
    productName: item.productName || '',
    qty: item.qty,
    unitCost: toDecimalNumber(item.unitCost),
    receivedQty: item.receivedQty
  };
}

function toMongoListShape(record) {
  if (!record) return null;
  return {
    _id: record.legacyId || record.id,
    poNumber: record.poNumber,
    supplierId: mapSupplierPopulated(record.supplier),
    warehouseId: mapWarehousePopulated(record.warehouse),
    items: (record.items || []).map(mapItemToMongo),
    status: fromStatusEnum(record.status),
    totalCost: toDecimalNumber(record.totalCost),
    expectedDate: record.expectedDate,
    receivedDate: record.receivedDate,
    notes: record.notes || '',
    createdBy: record.createdBy?.legacyId || record.createdById || null,
    createdByName: record.createdByName || '',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function toMongoDetailShape(record) {
  return toMongoListShape(record);
}

async function syncPurchaseOrderItems(purchaseOrderId, mongoItems) {
  await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId } });

  for (const raw of mongoItems || []) {
    const item = typeof raw.toObject === 'function' ? raw.toObject() : raw;
    const productId = await resolveProductId(item.productId);
    // eslint-disable-next-line no-await-in-loop
    await prisma.purchaseOrderItem.create({
      data: {
        legacyId: item._id != null ? String(item._id) : null,
        purchaseOrderId,
        productId,
        legacyProductId: item.productId != null ? String(item.productId) : '',
        productName: String(item.productName || '').trim(),
        qty: Math.max(0, Math.round(Number(item.qty) || 0)),
        unitCost: Number(item.unitCost) || 0,
        receivedQty: Math.max(0, Math.round(Number(item.receivedQty) || 0))
      }
    });
  }
}

async function buildPurchaseOrderData(mongoDoc) {
  const supplierId = await resolveSupplierId(mongoDoc.supplierId);
  if (!supplierId) {
    throw new Error(`Supplier not found in PG for mongoId ${mongoDoc.supplierId}`);
  }

  const warehouseId = await resolveWarehouseId(mongoDoc.warehouseId);
  const createdById = await resolveAdminId(mongoDoc.createdBy);

  const items = Array.isArray(mongoDoc.items) ? mongoDoc.items : [];
  const totalCost = mongoDoc.totalCost != null
    ? Number(mongoDoc.totalCost)
    : computeTotalCost(items);

  return {
    poNumber: String(mongoDoc.poNumber || '').trim().toUpperCase(),
    supplierId,
    warehouseId,
    status: toStatusEnum(mongoDoc.status),
    totalCost,
    expectedDate: mongoDoc.expectedDate ? new Date(mongoDoc.expectedDate) : null,
    receivedDate: mongoDoc.receivedDate ? new Date(mongoDoc.receivedDate) : null,
    notes: String(mongoDoc.notes || '').trim(),
    createdById,
    createdByName: String(mongoDoc.createdByName || '').trim()
  };
}

// ── upsertPurchaseOrderInPG ───────────────────────────────────────────────────
async function upsertPurchaseOrderInPG(mongoDoc) {
  try {
    if (!mongoDoc || !mongoDoc._id) {
      console.error('[DUAL-WRITE-PURCHASEORDER-FAIL] Missing mongoDoc or _id');
      return null;
    }

    const legacyId = String(mongoDoc._id);
    const data = await buildPurchaseOrderData(mongoDoc);

    if (!data.poNumber) {
      console.error('[DUAL-WRITE-PURCHASEORDER-FAIL] Missing poNumber', legacyId);
      return null;
    }

    const record = await prisma.purchaseOrder.upsert({
      where: { legacyId },
      create: { legacyId, ...data },
      update: data
    });

    await syncPurchaseOrderItems(record.id, mongoDoc.items);

    const withItems = await prisma.purchaseOrder.findUnique({
      where: { id: record.id },
      include: {
        supplier: true,
        warehouse: true,
        items: { include: { product: true } }
      }
    });

    return toMongoDetailShape(withItems);
  } catch (err) {
    console.error('[DUAL-WRITE-PURCHASEORDER-FAIL]', err.message, mongoDoc?._id);
    return null;
  }
}

// ── getPurchaseOrderWithItems ─────────────────────────────────────────────────
async function getPurchaseOrderWithItems(mongoId) {
  try {
    if (!mongoId) return null;

    const record = await prisma.purchaseOrder.findUnique({
      where: { legacyId: String(mongoId) },
      include: {
        supplier: true,
        warehouse: true,
        createdBy: { select: { id: true, legacyId: true } },
        items: {
          orderBy: { id: 'asc' },
          include: {
            product: {
              select: {
                id: true,
                legacyId: true,
                name: true,
                productId: true,
                stockQuantity: true
              }
            }
          }
        }
      }
    });

    return toMongoDetailShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-PURCHASEORDER-FAIL] getWithItems:', err.message);
    return null;
  }
}

// ── listPurchaseOrdersFromPG ──────────────────────────────────────────────────
async function listPurchaseOrdersFromPG(filters = {}) {
  try {
    const where = {};

    const status = String(filters.status || '').trim().toLowerCase();
    if (status && PO_STATUSES.includes(status)) {
      where.status = toStatusEnum(status);
    }

    if (filters.supplierId) {
      const pgSupplierId = await resolveSupplierId(filters.supplierId);
      if (pgSupplierId) where.supplierId = pgSupplierId;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        from.setHours(0, 0, 0, 0);
        where.createdAt.gte = from;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    const records = await prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: true,
        warehouse: true,
        items: true
      }
    });

    return records.map(toMongoListShape);
  } catch (err) {
    console.error('[DUAL-WRITE-PURCHASEORDER-FAIL] list:', err.message);
    return [];
  }
}

// ── updatePurchaseOrderStatusInPG ─────────────────────────────────────────────
async function updatePurchaseOrderStatusInPG(mongoId, status) {
  try {
    if (!mongoId) return null;

    await prisma.purchaseOrder.update({
      where: { legacyId: String(mongoId) },
      data: { status: toStatusEnum(status) }
    });

    return getPurchaseOrderWithItems(mongoId);
  } catch (err) {
    console.error('[DUAL-WRITE-PURCHASEORDER-FAIL] updateStatus:', err.message, mongoId);
    return null;
  }
}

// ── sumOpenPurchaseOrderTotalFromPG ───────────────────────────────────────────
/**
 * Sum totalCost for open purchase orders (draft / sent / partial).
 * Replaces MongoDB PurchaseOrder.aggregate $match + $group $sum.
 * @param {string[]} [openStatuses]
 * @returns {Promise<number>}
 */
async function sumOpenPurchaseOrderTotalFromPG(openStatuses = ['draft', 'sent', 'partial']) {
  try {
    const statusEnums = openStatuses.map((s) => toStatusEnum(s));
    const result = await prisma.purchaseOrder.aggregate({
      where: { status: { in: statusEnums } },
      _sum: { totalCost: true }
    });
    return toDecimalNumber(result._sum.totalCost);
  } catch (err) {
    console.error('[DUAL-WRITE-PURCHASEORDER-FAIL] sumOpenTotal:', err.message);
    return 0;
  }
}

// ── countOpenPurchaseOrdersFromPG ─────────────────────────────────────────────
async function countOpenPurchaseOrdersFromPG(openStatuses = ['draft', 'sent', 'partial']) {
  try {
    const statusEnums = openStatuses.map((s) => toStatusEnum(s));
    return prisma.purchaseOrder.count({
      where: { status: { in: statusEnums } }
    });
  } catch (err) {
    console.error('[DUAL-WRITE-PURCHASEORDER-FAIL] countOpen:', err.message);
    return 0;
  }
}

// ── deletePurchaseOrderInPG ─────────────────────────────────────────────────
async function deletePurchaseOrderInPG(mongoId) {
  try {
    if (!mongoId) return false;

    await prisma.purchaseOrder.delete({
      where: { legacyId: String(mongoId) }
    });

    return true;
  } catch (err) {
    if (err.code === 'P2025') return true;
    console.error('[DUAL-WRITE-PURCHASEORDER-FAIL] delete:', err.message, mongoId);
    return false;
  }
}

module.exports = {
  upsertPurchaseOrderInPG,
  getPurchaseOrderWithItems,
  listPurchaseOrdersFromPG,
  updatePurchaseOrderStatusInPG,
  deletePurchaseOrderInPG,
  sumOpenPurchaseOrderTotalFromPG,
  countOpenPurchaseOrdersFromPG,
  PO_STATUSES
};
