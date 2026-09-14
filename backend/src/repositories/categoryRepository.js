/********************************************************************
 * Project: EonlineBazar
 * File: categoryRepository.js
 * Location: backend/src/repositories/categoryRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for the Category model (Neon/PostgreSQL).
 *   Mirrors the behavior of categoryController.js + category.js Mongoose model.
 *   Reimplements the pre-save slug-generation hook as a plain JS function so
 *   every write (create & update) produces the same slug the Mongoose model would.
 *
 *   NOT YET WIRED INTO THE APP — Stage 2 Step 2, Part 1 (2026-09-13).
 *   The live database is still MongoDB; this file is additive / isolated.
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

// ── Slug generation ───────────────────────────────────────────────────────────
// Replicates category.js pre('save') hook exactly:
//   .toLowerCase()
//   .replace(/[^a-z0-9\u0980-\u09FF\s-]/g, '')   ← keep a-z, 0-9, Bengali, spaces, hyphens
//   .replace(/\s+/g, '-')
//   .replace(/-+/g, '-')
//   .trim()
//
// Bengali Unicode range U+0980–U+09FF is explicitly included so Bangla category
// names produce readable slugs rather than being stripped entirely.
function slugifyCategory(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09FF\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// ── Shape normalisation ──────────────────────────────────────────────────────
// Returns a plain object shaped as close as possible to the Mongoose .lean()
// result so a future controller swap is a drop-in replacement.
// Key differences bridged here:
//   • Adds `_id` alias for `id` (Mongoose uses _id throughout)
//   • Maps Prisma `parentCategoryId` FK to `parentCategory` to match Mongoose
function toShape(record) {
  if (!record) return null;
  const out = { ...record, _id: record.id };
  // Expose the FK under the Mongoose field name for controller compatibility
  if ('parentCategoryId' in out) {
    out.parentCategory = out.parentCategoryId;
  }
  return out;
}

// ── findAll ──────────────────────────────────────────────────────────────────
// filters: { isActive?, showInNavbar?, showInHomepage?, parentCategoryId? }
// Returns all matching categories sorted by position then name, as Mongoose does.
async function findAll(filters = {}) {
  const where = {};
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.showInNavbar !== undefined) where.showInNavbar = filters.showInNavbar;
  if (filters.showInHomepage !== undefined) where.showInHomepage = filters.showInHomepage;
  if (filters.parentCategoryId !== undefined) where.parentCategoryId = filters.parentCategoryId;

  const records = await prisma.category.findMany({
    where,
    orderBy: [{ position: 'asc' }, { name: 'asc' }]
  });
  return records.map(toShape);
}

// ── findById ─────────────────────────────────────────────────────────────────
async function findById(id) {
  if (!id) return null;
  const record = await prisma.category.findUnique({ where: { id } });
  return toShape(record);
}

// ── findBySlug ───────────────────────────────────────────────────────────────
async function findBySlug(slug) {
  if (!slug) return null;
  const record = await prisma.category.findUnique({ where: { slug: slug.toLowerCase() } });
  return toShape(record);
}

// ── findByLegacyId ───────────────────────────────────────────────────────────
// Looks up a Postgres row by the original MongoDB _id (Stage 2 dual-write /
// Stage 3 backfill reconciliation key).
async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.category.findUnique({
    where: { legacyId: String(legacyId) }
  });
  return toShape(record);
}

// ── create ───────────────────────────────────────────────────────────────────
// Mirrors adminCreateCategory: generates slug from name before the DB write.
// data fields: { name*, description, parentCategoryId, color, isActive,
//               isFeatured, showInNavbar, showInHomepage, position,
//               customCashback, metaTitle, metaDescription, imageUrl,
//               iconUrl, bannerImageUrl, legacyId }
async function create(data) {
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Category name is required.');

  // Slug must be generated here (replaces the pre-save hook)
  const slug = slugifyCategory(name);

  const record = await prisma.category.create({
    data: {
      name,
      slug,
      description: data.description ?? '',
      parentCategoryId: data.parentCategoryId ?? data.parentCategory ?? null,
      color: data.color ?? '#f97316',
      // undefined → false mirrors Mongo { isActive: true } query (absent field ≠ active)
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : false,
      isFeatured: data.isFeatured !== undefined ? Boolean(data.isFeatured) : false,
      showInNavbar: data.showInNavbar !== undefined ? Boolean(data.showInNavbar) : true,
      showInHomepage: data.showInHomepage !== undefined ? Boolean(data.showInHomepage) : false,
      position: data.position !== undefined ? Number(data.position) : 0,
      customCashback: data.customCashback != null ? data.customCashback : null,
      metaTitle: data.metaTitle ?? '',
      metaDescription: data.metaDescription ?? '',
      imageUrl: data.imageUrl ?? null,
      iconUrl: data.iconUrl ?? null,
      bannerImageUrl: data.bannerImageUrl ?? null,
      legacyId: data.legacyId != null ? String(data.legacyId) : null,
      productCount: 0
    }
  });
  return toShape(record);
}

// ── update ───────────────────────────────────────────────────────────────────
// If name is being changed, regenerates the slug (replicating pre-save hook).
// Only the keys present in `data` are written (partial update like PATCH).
async function update(id, data) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Category not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  const allowedText = [
    'description', 'color', 'metaTitle', 'metaDescription',
    'imageUrl', 'iconUrl', 'bannerImageUrl'
  ];
  const allowedBool = ['isActive', 'isFeatured', 'showInNavbar', 'showInHomepage'];

  if (data.name !== undefined) {
    fields.name = String(data.name).trim();
    // Re-generate slug whenever name changes (pre-save hook behaviour)
    if (fields.name !== existing.name) {
      fields.slug = slugifyCategory(fields.name);
    }
  }
  for (const k of allowedText) {
    if (data[k] !== undefined) fields[k] = data[k];
  }
  for (const k of allowedBool) {
    if (data[k] !== undefined) fields[k] = Boolean(data[k]);
  }
  if (data.position !== undefined) fields.position = Number(data.position);
  if (data.customCashback !== undefined) {
    fields.customCashback = data.customCashback != null ? data.customCashback : null;
  }
  if ('parentCategoryId' in data) {
    fields.parentCategoryId = data.parentCategoryId ?? null;
  } else if ('parentCategory' in data) {
    fields.parentCategoryId = data.parentCategory ?? null;
  }
  fields.updatedAt = new Date();

  const record = await prisma.category.update({ where: { id }, data: fields });
  return toShape(record);
}

// ── remove ───────────────────────────────────────────────────────────────────
// Mirrors adminDeleteCategory: collects the full descendant tree, checks for
// linked products (by name, matching the Mongoose string-based link), and
// deletes children before parents.
// NOTE: product link check queries Postgres products table. During Stage 2,
// the Postgres product table will be empty (products live in MongoDB), so
// this check always passes. Once Stage 3 backfill runs, it will behave as
// the Mongoose controller does today.
async function remove(id) {
  const root = await prisma.category.findUnique({ where: { id } });
  if (!root) {
    const err = new Error('Category not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Collect all descendant IDs (BFS, mirroring collectAllDescendantIds)
  const allIds = [];
  const queue = [id];
  while (queue.length) {
    const current = queue.shift();
    allIds.push(current);
    const children = await prisma.category.findMany({
      where: { parentCategoryId: current },
      select: { id: true }
    });
    children.forEach((c) => queue.push(c.id));
  }

  // Collect names for product count check
  const categories = await prisma.category.findMany({
    where: { id: { in: allIds } },
    select: { name: true }
  });
  const names = categories.map((c) => c.name);

  // Products in Postgres are linked by categoryId FK (not by name).
  // Check by categoryId membership rather than the Mongoose name-string approach.
  const productCount = await prisma.product.count({
    where: { categoryId: { in: allIds } }
  });
  if (productCount > 0) {
    const err = new Error(
      `Cannot delete: ${productCount} product(s) are assigned to this category ` +
      `or its sub-categories. Reassign them first.`
    );
    err.code = 'HAS_PRODUCTS';
    err.productCount = productCount;
    throw err;
  }

  // Delete children before parents (reverse BFS order)
  const idsToDelete = [...allIds].reverse();
  await prisma.category.deleteMany({ where: { id: { in: idsToDelete } } });

  return {
    deletedCount: idsToDelete.length,
    deletedNames: names
  };
}

module.exports = {
  slugifyCategory,
  findAll,
  findById,
  findBySlug,
  findByLegacyId,
  create,
  update,
  remove
};
