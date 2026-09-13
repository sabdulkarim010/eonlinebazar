/********************************************************************
 * Project: EonlineBazar
 * File: designationRepository.js
 * Location: backend/src/repositories/designationRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for the Designation model (Neon/PostgreSQL).
 *   Mirrors the behavior of designationController.js + designation.js.
 *
 *   Key restriction reimplemented:
 *     remove() rejects if any non-terminated Employee still holds a FK to
 *     this designation (Restrict relation in schema.prisma). The controller
 *     checks this explicitly before attempting the delete — we do the same
 *     here to return a friendly error with the employee count.
 *
 *   NOT YET WIRED INTO THE APP — Stage 2 Step 2, Part 1 (2026-09-13).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

// ── Shape normalisation ──────────────────────────────────────────────────────
function toShape(record) {
  if (!record) return null;
  return { ...record, _id: record.id };
}

// ── findAll ──────────────────────────────────────────────────────────────────
// options: { activeOnly?: boolean }
// Returns all designations sorted by name, with a live employeeCount attached,
// matching getAllDesignations in designationController.js.
async function findAll(options = {}) {
  const where = {};
  if (options.activeOnly === true) where.isActive = true;

  const designations = await prisma.designation.findMany({
    where,
    orderBy: { name: 'asc' }
  });

  // Count non-terminated employees per designation (mirrors countEmployeesByDesignation)
  const names = designations.map((d) => d.name);
  let countMap = {};
  if (names.length) {
    const rows = await prisma.employee.groupBy({
      by: ['designation'],
      where: {
        designation: { in: names },
        status: { not: 'TERMINATED' }
      },
      _count: { designation: true }
    });
    rows.forEach((r) => {
      if (r.designation) countMap[r.designation] = r._count.designation;
    });
  }

  return designations.map((d) => ({
    ...toShape(d),
    employeeCount: countMap[d.name] || 0
  }));
}

// ── findById ─────────────────────────────────────────────────────────────────
async function findById(id) {
  if (!id) return null;
  const record = await prisma.designation.findUnique({ where: { id } });
  return toShape(record);
}

// ── create ───────────────────────────────────────────────────────────────────
// data: { name*, department?, description?, isActive?, createdBy? }
async function create(data) {
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Designation name is required.');

  const record = await prisma.designation.create({
    data: {
      name,
      department: String(data.department || 'Operations').trim() || 'Operations',
      description: String(data.description || '').trim(),
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
      createdBy: String(data.createdBy || '').trim()
    }
  });
  return toShape(record);
}

// ── update ───────────────────────────────────────────────────────────────────
// data: { name?, department?, description?, isActive? }
// Partial update — only supplied keys are written.
async function update(id, data) {
  const existing = await prisma.designation.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Designation not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) throw new Error('Designation name cannot be empty.');
    fields.name = name;
  }
  if (data.department !== undefined) {
    fields.department = String(data.department).trim() || 'Operations';
  }
  if (data.description !== undefined) {
    fields.description = String(data.description).trim();
  }
  if (data.isActive !== undefined) {
    fields.isActive = Boolean(data.isActive);
  }

  const record = await prisma.designation.update({ where: { id }, data: fields });
  return toShape(record);
}

// ── remove ───────────────────────────────────────────────────────────────────
// Mirrors deleteDesignation: rejects while any non-terminated employee still
// references this designation via the FK column `designationId`.
// The Postgres FK is Restrict, so the database would also reject the delete,
// but we check first to return the same friendly message the controller sends.
async function remove(id) {
  const designation = await prisma.designation.findUnique({ where: { id } });
  if (!designation) {
    const err = new Error('Designation not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Count non-terminated employees whose designationId FK points at this row.
  // In Postgres the link is a real FK (not a name string like Mongoose uses).
  const inUse = await prisma.employee.count({
    where: {
      designationId: id,
      status: { not: 'TERMINATED' }
    }
  });

  if (inUse > 0) {
    const err = new Error(
      `${inUse} employee${inUse === 1 ? '' : 's'} still use this designation — reassign first.`
    );
    err.code = 'IN_USE';
    err.employeeCount = inUse;
    throw err;
  }

  await prisma.designation.delete({ where: { id } });
  return { deleted: true, name: designation.name };
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  remove
};
