/********************************************************************
 * Project: EonlineBazar
 * File: warehouseRepository.js
 * Location: backend/src/repositories/warehouseRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for the Warehouse model (Neon/PostgreSQL).
 *   Mirrors the behavior of warehouseController.js + warehouse.js.
 *
 *   Key behaviours reimplemented:
 *     1. setDefault(id): two sequential writes (unset others → set target),
 *        matching the Mongoose controller's demoteOtherDefaults() pattern.
 *        (PrismaNeonHttp does not support $transaction over HTTP.)
 *     2. remove(): rejects if the target warehouse carries isDefault=true, matching
 *        the controller's "default location cannot be deleted" guard.
 *     3. create(): first warehouse auto-becomes default (no existing locations).
 *     4. Status mapping: Prisma enum ACTIVE/INACTIVE → Mongoose 'active'/'inactive'.
 *
 *   NOT YET WIRED INTO THE APP — Stage 2 Step 2, Part 1 (2026-09-13).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

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
// filters: { status?: 'active' | 'inactive' }
// Default first, then newest — matches getAllWarehouses in warehouseController.js.
async function findAll(filters = {}) {
  const where = {};
  if (filters.status !== undefined) {
    where.status = toStatusEnum(filters.status);
  }

  const records = await prisma.warehouse.findMany({
    where,
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
  });
  return records.map(toShape);
}

// ── findById ─────────────────────────────────────────────────────────────────
async function findById(id) {
  if (!id) return null;
  const record = await prisma.warehouse.findUnique({ where: { id } });
  return toShape(record);
}

// ── findByLegacyId ───────────────────────────────────────────────────────────
async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.warehouse.findUnique({
    where: { legacyId: String(legacyId) }
  });
  return toShape(record);
}

// ── create ───────────────────────────────────────────────────────────────────
// Mirrors createWarehouse:
//   - First warehouse (existingCount === 0) automatically becomes the default.
//   - If isDefault is explicitly true, the new warehouse becomes default and
//     all other defaults are demoted (via setDefault).
// data: { name*, location?, address?, managerName?, phone?, status?, isDefault? }
async function create(data) {
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Warehouse name is required.');

  const existingCount = await prisma.warehouse.count();
  const wantsDefault = data.isDefault === true || data.isDefault === 'true';

  const isDefault = existingCount === 0 ? true : wantsDefault;

  const record = await prisma.warehouse.create({
    data: {
      name,
      location: String(data.location || '').trim(),
      address: String(data.address || '').trim(),
      managerName: String(data.managerName || '').trim(),
      phone: String(data.phone || '').trim(),
      isDefault,
      status: toStatusEnum(data.status),
      createdById: data.createdById ?? null,
      legacyId: data.legacyId != null ? String(data.legacyId) : null
    }
  });

  // Demote any other defaults if this one just claimed the flag
  if (record.isDefault) {
    await prisma.warehouse.updateMany({
      where: { id: { not: record.id }, isDefault: true },
      data: { isDefault: false }
    });
    const refreshed = await prisma.warehouse.findUnique({ where: { id: record.id } });
    return toShape(refreshed || record);
  }

  return toShape(record);
}

// ── update ───────────────────────────────────────────────────────────────────
// Mirrors updateWarehouse:
//   - Promoting to default triggers demotion of all others (via setDefault).
//   - Attempting to explicitly un-default the current default is rejected (user
//     must promote another location first — same error as the controller).
//   - Deactivating the default warehouse is also rejected.
// data: { name?, location?, address?, managerName?, phone?, status?, isDefault? }
async function update(id, data) {
  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Warehouse not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) throw new Error('Warehouse name cannot be empty.');
    fields.name = name;
  }
  if (data.location !== undefined) fields.location = String(data.location).trim();
  if (data.address !== undefined) fields.address = String(data.address).trim();
  if (data.managerName !== undefined) fields.managerName = String(data.managerName).trim();
  if (data.phone !== undefined) fields.phone = String(data.phone).trim();
  if (data.status !== undefined) {
    const status = toStatusEnum(data.status);
    // Deactivating the default is blocked (matches the controller)
    if (status === 'INACTIVE' && existing.isDefault) {
      const err = new Error(
        'The default warehouse must stay active. Promote another location first.'
      );
      err.code = 'DEFAULT_ACTIVE_REQUIRED';
      throw err;
    }
    fields.status = status;
  }

  // Handle isDefault promotion / demotion
  if (data.isDefault !== undefined) {
    const wantsDefault = data.isDefault === true || data.isDefault === 'true';
    if (wantsDefault) {
      fields.isDefault = true;
    } else if (!wantsDefault && existing.isDefault) {
      const err = new Error(
        'Promote another warehouse to default instead of un-setting this one.'
      );
      err.code = 'DEFAULT_MUST_EXIST';
      throw err;
    }
  }

  if (!Object.keys(fields).length) {
    const err = new Error('No changes supplied.');
    err.code = 'NO_CHANGES';
    throw err;
  }

  const record = await prisma.warehouse.update({ where: { id }, data: fields });

  // Demote all other defaults if this warehouse just claimed the flag
  if (fields.isDefault === true) {
    await prisma.warehouse.updateMany({
      where: { id: { not: id }, isDefault: true },
      data: { isDefault: false }
    });
  }

  return toShape(record);
}

// ── remove ───────────────────────────────────────────────────────────────────
// Mirrors deleteWarehouse: rejects if the target is the default location.
// In Postgres, Product.warehouseId and PurchaseOrder.warehouseId are SetNull,
// so the DB handles the unlink automatically on delete.
async function remove(id) {
  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Warehouse not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (existing.isDefault) {
    const err = new Error(
      'The default warehouse cannot be deleted. ' +
      'Promote another location to default first.'
    );
    err.code = 'IS_DEFAULT';
    throw err;
  }

  await prisma.warehouse.delete({ where: { id } });
  return { deleted: true, name: existing.name };
}

// ── setDefault ───────────────────────────────────────────────────────────────
// Exclusively sets one warehouse as the default and clears the flag on all others.
// Uses two sequential writes (demote others → promote target), matching the
// Mongoose controller's demoteOtherDefaults() + save() pattern.
//
// PrismaNeonHttp does not support $transaction — batch/interactive transactions
// require a WebSocket connection (PrismaNeon, not PrismaNeonHttp).
async function setDefault(id) {
  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Warehouse not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  await prisma.warehouse.updateMany({
    where: { id: { not: id }, isDefault: true },
    data: { isDefault: false }
  });
  const updated = await prisma.warehouse.update({
    where: { id },
    data: { isDefault: true }
  });

  return toShape(updated);
}

module.exports = {
  findAll,
  findById,
  findByLegacyId,
  create,
  update,
  remove,
  setDefault
};
