/********************************************************************
 * Project: EonlineBazar
 * File: brandRepository.js
 * Location: backend/src/repositories/brandRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for the Brand model (Neon/PostgreSQL).
 *   Mirrors the behavior of brandController.js + brand.js Mongoose model.
 *   Reimplements the brand.js pre-save slug hook as a plain JS function.
 *
 *   Slug algorithm (from brand.js slugify(), NOT the same as category):
 *     .toLowerCase().trim()
 *     .replace(/[^a-z0-9\u0980-\u09FF]+/g, '-')   ← Bengali range included
 *     .replace(/^-+|-+$/g, '')
 *
 *   NOT YET WIRED INTO THE APP — Stage 2 Step 2, Part 1 (2026-09-13).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

// ── Slug generation ───────────────────────────────────────────────────────────
// Replicates brand.js slugify() exactly.
// Bengali Unicode range U+0980–U+09FF preserved so Bangla brand names are
// kept in the slug rather than collapsed to hyphens.
function slugifyBrand(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Status mapping ───────────────────────────────────────────────────────────
// Prisma enum ActiveStatus has keys ACTIVE/INACTIVE mapped to 'active'/'inactive'.
// To match the Mongoose return shape, map the enum key to its lowercase string.
function normaliseStatus(status) {
  if (status === 'ACTIVE') return 'active';
  if (status === 'INACTIVE') return 'inactive';
  return status ? String(status).toLowerCase() : status;
}

// Accepts 'active' | 'inactive' (Mongoose string) and returns the Prisma enum key.
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
// Default: newest first (matches getBrands in brandController.js).
async function findAll(filters = {}) {
  const where = {};
  if (filters.status !== undefined) {
    where.status = toStatusEnum(filters.status);
  }

  const records = await prisma.brand.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });
  return records.map(toShape);
}

// ── findById ─────────────────────────────────────────────────────────────────
async function findById(id) {
  if (!id) return null;
  const record = await prisma.brand.findUnique({ where: { id } });
  return toShape(record);
}

// ── findByLegacyId ───────────────────────────────────────────────────────────
async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.brand.findUnique({
    where: { legacyId: String(legacyId) }
  });
  return toShape(record);
}

// ── findBySlug ───────────────────────────────────────────────────────────────
// Note: The Prisma schema has `slug String @default("")` with an `@@index` but
// NOT @unique, matching the Mongoose model which also had no unique constraint on slug.
async function findBySlug(slug) {
  if (!slug) return null;
  const records = await prisma.brand.findMany({
    where: { slug: slug.toLowerCase() },
    take: 1
  });
  return toShape(records[0] ?? null);
}

// ── create ───────────────────────────────────────────────────────────────────
// Mirrors createBrand: generates slug from name before the DB write.
// data: { name*, description?, status? }
async function create(data) {
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Brand name is required.');

  // Slug is generated here (replaces the pre-save hook)
  const slug = slugifyBrand(name);

  const record = await prisma.brand.create({
    data: {
      name,
      slug,
      description: String(data.description || '').trim(),
      status: toStatusEnum(data.status),
      legacyId: data.legacyId != null ? String(data.legacyId) : null
    }
  });
  return toShape(record);
}

// ── update ───────────────────────────────────────────────────────────────────
// If name changes, regenerates the slug (mirrors brand.save() pre-save hook).
// data: { name?, description?, status? }  — partial update
async function update(id, data) {
  const existing = await prisma.brand.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Brand not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) throw new Error('Brand name cannot be empty.');
    fields.name = name;
    // Re-generate slug whenever name changes (pre-save hook behaviour)
    fields.slug = slugifyBrand(name);
  }
  if (data.description !== undefined) {
    fields.description = String(data.description).trim();
  }
  if (data.status !== undefined) {
    fields.status = toStatusEnum(data.status);
  }

  const record = await prisma.brand.update({ where: { id }, data: fields });
  return toShape(record);
}

// ── remove ───────────────────────────────────────────────────────────────────
// Mirrors deleteBrand. In Postgres, Product.brandId is SetNull, so the DB
// handles the unlink automatically (no need for a manual updateMany here).
async function remove(id) {
  const existing = await prisma.brand.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Brand not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  await prisma.brand.delete({ where: { id } });
  return { deleted: true, name: existing.name };
}

module.exports = {
  slugifyBrand,
  findAll,
  findById,
  findByLegacyId,
  findBySlug,
  create,
  update,
  remove
};
