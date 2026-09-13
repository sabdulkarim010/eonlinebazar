/********************************************************************
 * Project: EonlineBazar
 * File: productRepository.js
 * Location: backend/src/repositories/productRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for Product and decomposed child tables
 *   (ProductVariant, ProductVariantAttribute, ProductCostHistory,
 *   ProductEmbeddedReview). Mirrors productController.js behavior.
 *
 *   Text search: placeholder `contains` on name only — weighted MongoDB text
 *   index is deferred to tsvector/GIN migration (see DATABASE_MIGRATION_AUDIT.md).
 *
 *   NOT YET WIRED INTO THE APP — Stage 2 Step 2, Part 5 (2026-09-13).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');
const { slugifyBrand } = require('./brandRepository');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// productController.js slugify — same algorithm as brand.js (Bengali U+0980–U+09FF).
const slugifyProduct = slugifyBrand;

async function resolveUniqueSlug(source, excludeId = null) {
  const base = slugifyProduct(source);
  if (!base) return null;

  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const taken = await prisma.product.findUnique({ where: { slug: candidate } });
    if (!taken) return candidate;
    if (excludeId && taken.id === excludeId) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function toStatusEnum(value) {
  return String(value || '').toLowerCase() === 'inactive' ? 'INACTIVE' : 'ACTIVE';
}

function normaliseStatus(status) {
  return status === 'INACTIVE' ? 'inactive' : 'active';
}

function toShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.id,
    status: normaliseStatus(record.status),
    price: Number(record.price),
    buyingPrice: Number(record.buyingPrice),
    rating: Number(record.rating),
    category: record.categoryName
  };
}

function attributesToObject(rows) {
  const out = {};
  (rows || []).forEach((row) => {
    out[row.name] = row.value;
  });
  return out;
}

function variantToShape(variant, attributeRows) {
  if (!variant) return null;
  return {
    ...variant,
    _id: variant.id,
    price: Number(variant.price),
    buyingPrice: Number(variant.buyingPrice),
    attributes: attributesToObject(attributeRows)
  };
}

// ── findAll ──────────────────────────────────────────────────────────────────
// Placeholder search — no weighted full-text index yet.
async function findAll(filters = {}) {
  const where = { status: 'ACTIVE' };

  if (filters.status !== undefined) {
    where.status = toStatusEnum(filters.status);
  }
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.categoryName) where.categoryName = String(filters.categoryName);
  if (filters.brandId) where.brandId = filters.brandId;
  if (filters.supplierId) where.supplierId = filters.supplierId;

  const search = String(filters.search || filters.q || '').trim();
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  if (filters.minPrice != null || filters.maxPrice != null) {
    where.price = {};
    if (filters.minPrice != null) where.price.gte = filters.minPrice;
    if (filters.maxPrice != null) where.price.lte = filters.maxPrice;
  }

  const query = {
    where,
    orderBy: { createdAt: 'desc' }
  };

  const limit = Number(filters.limit);
  if (Number.isFinite(limit) && limit > 0) {
    const page = Math.max(1, Number(filters.page) || 1);
    query.skip = (page - 1) * limit;
    query.take = limit;
  }

  const records = await prisma.product.findMany(query);
  return records.map(toShape);
}

async function findById(id) {
  if (!id) return null;
  const record = await prisma.product.findUnique({ where: { id } });
  return toShape(record);
}

async function findByProductId(productId) {
  const code = String(productId || '').trim();
  if (!code) return null;
  const record = await prisma.product.findUnique({ where: { productId: code } });
  return toShape(record);
}

async function findBySlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return null;
  const record = await prisma.product.findUnique({ where: { slug: s } });
  return toShape(record);
}

// ── create / update / remove ───────────────────────────────────────────────────
async function create(data) {
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Product name is required.');
  if (data.price == null) throw new Error('Product price is required.');

  const productId = String(data.productId || `PROD-${Date.now()}`).trim();
  const slug = data.slug
    ? String(data.slug).trim().toLowerCase()
    : await resolveUniqueSlug(name);

  const record = await prisma.product.create({
    data: {
      productId,
      name,
      slug,
      price: data.price,
      buyingPrice: data.buyingPrice != null ? data.buyingPrice : 0,
      categoryName: String(data.categoryName ?? data.category ?? 'General').trim(),
      categoryId: data.categoryId ?? null,
      brandId: data.brandId ?? null,
      brandName: String(data.brandName ?? '').trim(),
      hasVariants: Boolean(data.hasVariants),
      stockQuantity: data.stockQuantity != null ? Number(data.stockQuantity) : 0,
      lowStockThreshold: data.lowStockThreshold != null ? Number(data.lowStockThreshold) : 10,
      supplierId: data.supplierId ?? null,
      warehouseId: data.warehouseId ?? null,
      reorderPoint: data.reorderPoint != null ? Number(data.reorderPoint) : 5,
      stock: data.stock != null ? Number(data.stock) : 0,
      description: String(data.description ?? '').trim(),
      detailedDescription: String(data.detailedDescription ?? '').trim(),
      highlights: Array.isArray(data.highlights) ? data.highlights : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
      weight: data.weight != null ? Number(data.weight) : null,
      status: data.status !== undefined ? toStatusEnum(data.status) : 'ACTIVE',
      createdById: data.createdById ?? data.createdBy ?? null,
      icon: String(data.icon ?? '📦').trim(),
      image: String(data.image ?? '').trim(),
      images: Array.isArray(data.images) ? data.images : []
    }
  });

  return toShape(record);
}

async function update(id, data) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Product not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  if (data.name !== undefined) {
    fields.name = String(data.name).trim();
    if (!data.slug && fields.name !== existing.name) {
      fields.slug = await resolveUniqueSlug(fields.name, id);
    }
  }
  if (data.slug !== undefined) fields.slug = String(data.slug).trim().toLowerCase();
  if (data.price !== undefined) fields.price = data.price;
  if (data.buyingPrice !== undefined) fields.buyingPrice = data.buyingPrice;
  if (data.categoryName !== undefined || data.category !== undefined) {
    fields.categoryName = String(data.categoryName ?? data.category).trim();
  }
  if (data.categoryId !== undefined) fields.categoryId = data.categoryId;
  if (data.brandId !== undefined) fields.brandId = data.brandId;
  if (data.brandName !== undefined) fields.brandName = String(data.brandName).trim();
  if (data.stockQuantity !== undefined) fields.stockQuantity = Number(data.stockQuantity);
  if (data.stock !== undefined) fields.stock = Number(data.stock);
  if (data.status !== undefined) fields.status = toStatusEnum(data.status);
  if (data.description !== undefined) fields.description = String(data.description).trim();
  if (data.tags !== undefined) fields.tags = data.tags;
  if (data.hasVariants !== undefined) fields.hasVariants = Boolean(data.hasVariants);

  const record = await prisma.product.update({ where: { id }, data: fields });
  return toShape(record);
}

async function remove(id) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    const err = new Error('Product not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  // Cascades: ProductVariant (+ attributes), ProductCostHistory, ProductEmbeddedReview.
  // OrderItem.productId → SetNull; CartItem.productId → Cascade (schema verified).
  await prisma.product.delete({ where: { id } });
  return { deleted: true, productId: product.productId };
}

// ── Variants (Map → ProductVariantAttribute rows) ────────────────────────────
// Update strategy: delete-all-then-recreate for attributes when data.attributes
// is supplied — simpler than diffing and guarantees no stale keys remain.
async function listVariants(productId) {
  const variants = await prisma.productVariant.findMany({
    where: { productId },
    include: { attributes: true },
    orderBy: { name: 'asc' }
  });
  return variants.map((v) => variantToShape(v, v.attributes));
}

async function addVariant(productId, variantData) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    const err = new Error('Product not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const variant = await prisma.productVariant.create({
    data: {
      productId,
      name: String(variantData.name ?? '').trim(),
      sku: String(variantData.sku ?? '').trim(),
      price: variantData.price != null ? variantData.price : 0,
      buyingPrice: variantData.buyingPrice != null ? variantData.buyingPrice : 0,
      stock: variantData.stock != null ? Number(variantData.stock) : 0,
      image: String(variantData.image ?? '').trim(),
      attribute: String(variantData.attribute ?? '').trim(),
      value: String(variantData.value ?? '').trim()
    }
  });

  const attrs = variantData.attributes && typeof variantData.attributes === 'object'
    ? variantData.attributes
    : {};
  const attrRows = [];
  for (const [name, value] of Object.entries(attrs)) {
    const row = await prisma.productVariantAttribute.create({
      data: {
        variantId: variant.id,
        name: String(name),
        value: String(value ?? '')
      }
    });
    attrRows.push(row);
  }

  if (Object.keys(attrs).length && !variant.attribute) {
    const firstKey = Object.keys(attrs)[0];
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: {
        attribute: firstKey,
        value: String(attrs[firstKey] ?? '')
      }
    });
  }

  return variantToShape(variant, attrRows);
}

async function updateVariant(variantId, data) {
  const existing = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!existing) {
    const err = new Error('Variant not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  if (data.name !== undefined) fields.name = String(data.name).trim();
  if (data.sku !== undefined) fields.sku = String(data.sku).trim();
  if (data.price !== undefined) fields.price = data.price;
  if (data.buyingPrice !== undefined) fields.buyingPrice = data.buyingPrice;
  if (data.stock !== undefined) fields.stock = Number(data.stock);
  if (data.image !== undefined) fields.image = String(data.image).trim();

  const variant = await prisma.productVariant.update({
    where: { id: variantId },
    data: fields
  });

  let attrRows;
  if (data.attributes !== undefined) {
    await prisma.productVariantAttribute.deleteMany({ where: { variantId } });
    attrRows = [];
    const attrs = data.attributes && typeof data.attributes === 'object' ? data.attributes : {};
    for (const [name, value] of Object.entries(attrs)) {
      const row = await prisma.productVariantAttribute.create({
        data: { variantId, name: String(name), value: String(value ?? '') }
      });
      attrRows.push(row);
    }
  } else {
    attrRows = await prisma.productVariantAttribute.findMany({ where: { variantId } });
  }

  return variantToShape(variant, attrRows);
}

async function removeVariant(variantId) {
  const existing = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!existing) {
    const err = new Error('Variant not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  // ProductVariantAttribute → Cascade on variant delete (schema.prisma).
  await prisma.productVariant.delete({ where: { id: variantId } });
  return { deleted: true, id: variantId };
}

// ── Cost history (append-only) ─────────────────────────────────────────────────
async function listCostHistory(productId) {
  const rows = await prisma.productCostHistory.findMany({
    where: { productId },
    orderBy: { date: 'desc' }
  });
  return rows.map((r) => ({ ...r, _id: r.id, cost: Number(r.cost) }));
}

async function addCostEntry(productId, cost, supplierId = null) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    const err = new Error('Product not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const row = await prisma.productCostHistory.create({
    data: {
      productId,
      supplierId: supplierId || null,
      cost: cost != null ? cost : 0
    }
  });
  return { ...row, _id: row.id, cost: Number(row.cost) };
}

// ── Embedded reviews (legacy in-document — NOT standalone Review model) ────────
async function listEmbeddedReviews(productId) {
  const rows = await prisma.productEmbeddedReview.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' }
  });
  return rows.map((r) => ({
    ...r,
    _id: r.id,
    user: r.userId
  }));
}

async function addEmbeddedReview(productId, reviewData) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    const err = new Error('Product not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const row = await prisma.productEmbeddedReview.create({
    data: {
      productId,
      userId: reviewData.userId ?? reviewData.user ?? null,
      name: String(reviewData.name || 'Anonymous').trim(),
      rating: Number(reviewData.rating) || 0,
      comment: String(reviewData.comment || '').trim()
    }
  });

  return { ...row, _id: row.id, user: row.userId };
}

module.exports = {
  slugifyProduct,
  resolveUniqueSlug,
  findAll,
  findById,
  findByProductId,
  findBySlug,
  create,
  update,
  remove,
  listVariants,
  addVariant,
  updateVariant,
  removeVariant,
  listCostHistory,
  addCostEntry,
  listEmbeddedReviews,
  addEmbeddedReview,
  UUID_PATTERN
};
