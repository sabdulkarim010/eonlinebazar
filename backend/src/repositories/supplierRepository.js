/********************************************************************
 * Project: EonlineBazar
 * File: supplierRepository.js
 * Location: backend/src/repositories/supplierRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for the Supplier model (Neon/PostgreSQL).
 *   Mirrors the behavior of supplierController.js + supplier.js.
 *
 *   Key restriction reimplemented:
 *     remove(): rejects if any open Purchase Order still references this
 *     supplier (Restrict FK in schema.prisma). The controller checks first
 *     to give a readable error — we match that behaviour exactly. Open PO
 *     statuses: 'draft', 'sent', 'partial' (same as OPEN_PO_STATUSES in the
 *     controller, mapped to Prisma enum DRAFT, SENT, PARTIAL_RECEIVED).
 *
 *   NOT YET WIRED INTO THE APP — Stage 2 Step 2, Part 1 (2026-09-13).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

// ── Open PO statuses ─────────────────────────────────────────────────────────
// Matches OPEN_PO_STATUSES in supplierController.js: ['draft', 'sent', 'partial']
// Mapped to the Prisma PurchaseOrderStatus enum keys (values are @map'd to lowercase).
const OPEN_PO_STATUSES = ['DRAFT', 'SENT', 'PARTIAL'];

// ── Status mapping ───────────────────────────────────────────────────────────
function normaliseStatus(status) {
  if (status === 'ACTIVE') return 'active';
  if (status === 'INACTIVE') return 'inactive';
  return status ? String(status).toLowerCase() : status;
}

function toStatusEnum(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'inactive') return 'INACTIVE';
  return 'ACTIVE';
}

// ── Shape normalisation ──────────────────────────────────────────────────────
function toShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.id,
    status: normaliseStatus(record.status)
  };
}

// ── findAll ──────────────────────────────────────────────────────────────────
// filters: { status?: 'active' | 'inactive', search?: string }
// search: case-insensitive match on name, contactPerson, phone, or email —
// mirrors the $or filter in getAllSuppliers.
// Default sort: newest first (matches the controller).
async function findAll(filters = {}) {
  const where = {};

  if (filters.status !== undefined) {
    where.status = toStatusEnum(filters.status);
  }

  if (filters.search) {
    const search = String(filters.search).trim();
    if (search) {
      // Prisma doesn't have MongoDB-style $or with regex — use contains with mode
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }
  }

  const records = await prisma.supplier.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });
  return records.map(toShape);
}

// ── findById ─────────────────────────────────────────────────────────────────
// Returns the supplier with its recent purchase orders attached
// (matches getSupplierById: includes purchaseOrders last 10).
async function findById(id) {
  if (!id) return null;
  const record = await prisma.supplier.findUnique({
    where: { id },
    include: {
      purchaseOrders: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          poNumber: true,
          status: true,
          totalCost: true,
          expectedDate: true,
          receivedDate: true,
          createdAt: true
        }
      }
    }
  });
  if (!record) return null;
  return toShape(record);
}

// ── create ───────────────────────────────────────────────────────────────────
// data: { name*, contactPerson?, phone?, email?, address?, notes?, status?,
//         createdById? }
async function create(data) {
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Supplier name is required.');

  const record = await prisma.supplier.create({
    data: {
      name,
      contactPerson: String(data.contactPerson || '').trim(),
      phone: String(data.phone || '').trim(),
      email: String(data.email || '').trim().toLowerCase(),
      address: String(data.address || '').trim(),
      notes: String(data.notes || '').trim(),
      status: toStatusEnum(data.status),
      createdById: data.createdById ?? null
    }
  });
  return toShape(record);
}

// ── update ───────────────────────────────────────────────────────────────────
// Partial update — only supplied keys are written (mirrors PUT in the controller
// which only picks keys present on the body via pickSupplierFields).
// data: { name?, contactPerson?, phone?, email?, address?, notes?, status? }
async function update(id, data) {
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Supplier not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) throw new Error('Supplier name cannot be empty.');
    fields.name = name;
  }
  if (data.contactPerson !== undefined) fields.contactPerson = String(data.contactPerson).trim();
  if (data.phone !== undefined) fields.phone = String(data.phone).trim();
  if (data.email !== undefined) fields.email = String(data.email).trim().toLowerCase();
  if (data.address !== undefined) fields.address = String(data.address).trim();
  if (data.notes !== undefined) fields.notes = String(data.notes).trim();
  if (data.status !== undefined) fields.status = toStatusEnum(data.status);

  if (!Object.keys(fields).length) {
    const err = new Error('No changes supplied.');
    err.code = 'NO_CHANGES';
    throw err;
  }

  const record = await prisma.supplier.update({ where: { id }, data: fields });
  return toShape(record);
}

// ── remove ───────────────────────────────────────────────────────────────────
// Mirrors deleteSupplier: rejects while any open PO (draft/sent/partial) still
// references the vendor. The Postgres FK is Restrict (database would also block),
// but we check first to return the same message the controller sends.
// In Postgres, Product.supplierId is SetNull — the DB handles that automatically.
async function remove(id) {
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) {
    const err = new Error('Supplier not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const openPoCount = await prisma.purchaseOrder.count({
    where: {
      supplierId: id,
      status: { in: OPEN_PO_STATUSES }
    }
  });

  if (openPoCount > 0) {
    const err = new Error(
      `Cannot delete "${supplier.name}" — ${openPoCount} open purchase order(s) still reference it. ` +
      `Receive or cancel them first.`
    );
    err.code = 'HAS_OPEN_PO';
    err.openPoCount = openPoCount;
    throw err;
  }

  await prisma.supplier.delete({ where: { id } });
  return { deleted: true, name: supplier.name };
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  remove
};
