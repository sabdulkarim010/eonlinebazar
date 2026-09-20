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

// ── Dual-Write Helpers (Stage 2 Step 3, Part 1.1) ─────────────────────────
// Safe wrappers — never throw, only log failures with [DUAL-WRITE-PRODUCT-FAIL].
const { mongoProductToPrismaShape } = require('../utils/productDualWriteHelpers');

/**
 * Create product in Postgres from Mongoose document.
 * Never throws — logs failure and returns silently.
 */
async function createProductInPG(mongoDoc) {
  try {
    const shape = mongoProductToPrismaShape(mongoDoc);
    const { main, variants, costHistory, embeddedReviews } = shape;

    // Create main product row
    const product = await prisma.product.create({
      data: {
        legacyId: main.legacyId,
        productId: main.productId,
        name: main.name,
        slug: main.slug,
        price: main.price,
        buyingPrice: main.buyingPrice,
        categoryName: main.categoryName,
        categoryId: main.categoryId,
        brandId: main.brandId,
        brandName: main.brandName,
        hasVariants: main.hasVariants,
        stockQuantity: main.stockQuantity,
        lowStockThreshold: main.lowStockThreshold,
        supplierId: main.supplierId,
        warehouseId: main.warehouseId,
        reorderPoint: main.reorderPoint,
        stock: main.stock,
        description: main.description,
        detailedDescription: main.detailedDescription,
        highlights: main.highlights,
        tags: main.tags,
        weight: main.weight,
        status: main.status,
        createdById: main.createdById,
        icon: main.icon,
        image: main.image,
        images: main.images,
        rating: main.rating,
        numOfReviews: main.numOfReviews
      }
    });

    // Create variants
    for (const v of variants) {
      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          legacyId: v.legacyId,
          name: v.name,
          sku: v.sku,
          price: v.price,
          buyingPrice: v.buyingPrice,
          stock: v.stock,
          image: v.image,
          attribute: v.attribute,
          value: v.value
        }
      });

      // Create variant attributes
      for (const attr of v.attributes) {
        await prisma.productVariantAttribute.create({
          data: {
            variantId: variant.id,
            name: attr.name,
            value: attr.value
          }
        });
      }
    }

    // Create cost history
    for (const entry of costHistory) {
      await prisma.productCostHistory.create({
        data: {
          productId: product.id,
          cost: entry.cost,
          date: entry.date,
          supplierId: entry.supplierId
        }
      });
    }

    // Create embedded reviews
    for (const review of embeddedReviews) {
      await prisma.productEmbeddedReview.create({
        data: {
          productId: product.id,
          legacyId: review.legacyId,
          userId: review.userId,
          name: review.name,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt
        }
      });
    }
  } catch (err) {
    console.error('[DUAL-WRITE-PRODUCT-FAIL]', {
      timestamp: new Date().toISOString(),
      operation: 'create',
      mongoId: String(mongoDoc._id || ''),
      error: err.message || String(err)
    });
  }
}

/**
 * Update product in Postgres by MongoDB _id.
 * Never throws — logs failure and returns silently.
 */
async function updateProductInPG(mongoId, updateData) {
  try {
    const legacyId = String(mongoId);
    const product = await prisma.product.findUnique({
      where: { legacyId }
    });

    if (!product) {
      console.error('[DUAL-WRITE-PRODUCT-FAIL]', {
        timestamp: new Date().toISOString(),
        operation: 'update',
        mongoId: legacyId,
        error: 'Product not found in Postgres'
      });
      return;
    }

    const fields = {};
    
    if (updateData.name !== undefined) fields.name = String(updateData.name).trim();
    if (updateData.slug !== undefined) fields.slug = String(updateData.slug).trim().toLowerCase();
    if (updateData.price !== undefined) fields.price = Number(updateData.price);
    if (updateData.buyingPrice !== undefined) fields.buyingPrice = Number(updateData.buyingPrice);
    if (updateData.category !== undefined) fields.categoryName = String(updateData.category).trim();
    if (updateData.categoryName !== undefined) fields.categoryName = String(updateData.categoryName).trim();
    if (updateData.categoryId !== undefined) fields.categoryId = updateData.categoryId;
    if (updateData.brand !== undefined) fields.brandId = updateData.brand;
    if (updateData.brandId !== undefined) fields.brandId = updateData.brandId;
    if (updateData.brandName !== undefined) fields.brandName = String(updateData.brandName).trim();
    if (updateData.hasVariants !== undefined) fields.hasVariants = Boolean(updateData.hasVariants);
    if (updateData.stockQuantity !== undefined) fields.stockQuantity = Number(updateData.stockQuantity);
    if (updateData.lowStockThreshold !== undefined) fields.lowStockThreshold = Number(updateData.lowStockThreshold);
    if (updateData.stock !== undefined) fields.stock = Number(updateData.stock);
    if (updateData.supplierId !== undefined) fields.supplierId = updateData.supplierId;
    if (updateData.warehouseId !== undefined) fields.warehouseId = updateData.warehouseId;
    if (updateData.reorderPoint !== undefined) fields.reorderPoint = Number(updateData.reorderPoint);
    if (updateData.description !== undefined) fields.description = String(updateData.description).trim();
    if (updateData.detailedDescription !== undefined) fields.detailedDescription = String(updateData.detailedDescription).trim();
    if (updateData.highlights !== undefined) fields.highlights = updateData.highlights;
    if (updateData.tags !== undefined) fields.tags = updateData.tags;
    if (updateData.weight !== undefined) fields.weight = updateData.weight;
    if (updateData.status !== undefined) {
      fields.status = String(updateData.status).toLowerCase() === 'inactive' ? 'INACTIVE' : 'ACTIVE';
    }
    if (updateData.icon !== undefined) fields.icon = String(updateData.icon).trim();
    if (updateData.image !== undefined) fields.image = String(updateData.image).trim();
    if (updateData.images !== undefined) fields.images = updateData.images;
    if (updateData.rating !== undefined) fields.rating = Number(updateData.rating);
    if (updateData.numOfReviews !== undefined) fields.numOfReviews = Number(updateData.numOfReviews);

    if (Object.keys(fields).length > 0) {
      await prisma.product.update({
        where: { legacyId },
        data: fields
      });
    }

    // Handle variants update if provided
    if (updateData.variants !== undefined) {
      // Delete existing variants and recreate (simpler than diff)
      await prisma.productVariant.deleteMany({
        where: { productId: product.id }
      });

      const variants = Array.isArray(updateData.variants) ? updateData.variants : [];
      for (const v of variants) {
        const vPlain = v.toObject ? v.toObject() : { ...v };
        const variant = await prisma.productVariant.create({
          data: {
            productId: product.id,
            legacyId: vPlain._id != null ? String(vPlain._id) : null,
            name: String(vPlain.name || '').trim(),
            sku: String(vPlain.sku || '').trim(),
            price: vPlain.price != null ? Number(vPlain.price) : 0,
            buyingPrice: vPlain.buyingPrice != null ? Number(vPlain.buyingPrice) : 0,
            stock: vPlain.stock != null ? Number(vPlain.stock) : 0,
            image: String(vPlain.image || '').trim(),
            attribute: String(vPlain.attribute || '').trim(),
            value: String(vPlain.value || '').trim()
          }
        });

        // Handle attributes Map
        const attrs = vPlain.attributes;
        if (attrs) {
          const attrEntries = attrs instanceof Map 
            ? Array.from(attrs.entries())
            : Object.entries(attrs || {});
          
          for (const [name, value] of attrEntries) {
            await prisma.productVariantAttribute.create({
              data: {
                variantId: variant.id,
                name: String(name),
                value: String(value ?? '')
              }
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[DUAL-WRITE-PRODUCT-FAIL]', {
      timestamp: new Date().toISOString(),
      operation: 'update',
      mongoId: String(mongoId),
      error: err.message || String(err)
    });
  }
}

/**
 * Delete product in Postgres by MongoDB _id.
 * Never throws — logs failure and returns silently.
 */
async function deleteProductInPG(mongoId) {
  try {
    const legacyId = String(mongoId);
    const product = await prisma.product.findUnique({
      where: { legacyId }
    });

    if (!product) {
      console.error('[DUAL-WRITE-PRODUCT-FAIL]', {
        timestamp: new Date().toISOString(),
        operation: 'delete',
        mongoId: legacyId,
        error: 'Product not found in Postgres'
      });
      return;
    }

    // Cascade deletes: ProductVariant (+ attributes), ProductCostHistory, ProductEmbeddedReview
    await prisma.product.delete({
      where: { legacyId }
    });
  } catch (err) {
    console.error('[DUAL-WRITE-PRODUCT-FAIL]', {
      timestamp: new Date().toISOString(),
      operation: 'delete',
      mongoId: String(mongoId),
      error: err.message || String(err)
    });
  }
}

/**
 * Update stock for a specific variant by SKU.
 * Never throws — logs failure and returns silently.
 */
async function updateStockInPG(mongoId, variantSku, newQty) {
  try {
    const legacyId = String(mongoId);
    const product = await prisma.product.findUnique({
      where: { legacyId },
      include: { variants: true }
    });

    if (!product) {
      console.error('[DUAL-WRITE-PRODUCT-FAIL]', {
        timestamp: new Date().toISOString(),
        operation: 'updateStock',
        mongoId: legacyId,
        variantSku: String(variantSku),
        error: 'Product not found in Postgres'
      });
      return;
    }

    const variant = product.variants.find(v => v.sku === String(variantSku));
    if (!variant) {
      console.error('[DUAL-WRITE-PRODUCT-FAIL]', {
        timestamp: new Date().toISOString(),
        operation: 'updateStock',
        mongoId: legacyId,
        variantSku: String(variantSku),
        error: 'Variant not found'
      });
      return;
    }

    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { stock: Number(newQty) }
    });

    // Recalculate total stock
    const allVariants = await prisma.productVariant.findMany({
      where: { productId: product.id }
    });
    const totalStock = allVariants.reduce((sum, v) => sum + Number(v.stock), 0);

    await prisma.product.update({
      where: { id: product.id },
      data: { stock: totalStock }
    });
  } catch (err) {
    console.error('[DUAL-WRITE-PRODUCT-FAIL]', {
      timestamp: new Date().toISOString(),
      operation: 'updateStock',
      mongoId: String(mongoId),
      variantSku: String(variantSku),
      error: err.message || String(err)
    });
  }
}

// ── Read Helpers for Stage 4 Cutover ──────────────────────────────────────
/**
 * Get product by MongoDB _id from Postgres (for read cutover).
 * Returns Mongo-shaped document or null.
 */
async function getProductByIdFromPG(mongoId) {
  try {
    const product = await prisma.product.findUnique({
      where: { legacyId: String(mongoId) },
      include: {
        variants: { include: { attributes: true } },
        costHistory: true,
        embeddedReviews: true
      }
    });

    if (!product) return null;

    // Map to Mongo shape
    return {
      _id: product.legacyId,
      productId: product.productId,
      name: product.name,
      slug: product.slug,
      price: Number(product.price),
      buyingPrice: Number(product.buyingPrice),
      category: product.categoryName,
      brand: product.brandId,
      brandName: product.brandName,
      hasVariants: product.hasVariants,
      stockQuantity: product.stockQuantity,
      lowStockThreshold: product.lowStockThreshold,
      supplierId: product.supplierId,
      warehouseId: product.warehouseId,
      reorderPoint: product.reorderPoint,
      stock: product.stock,
      description: product.description,
      detailedDescription: product.detailedDescription,
      highlights: product.highlights,
      tags: product.tags,
      weight: product.weight,
      status: product.status === 'INACTIVE' ? 'inactive' : 'active',
      createdBy: product.createdById,
      icon: product.icon,
      image: product.image,
      images: product.images,
      rating: Number(product.rating),
      numOfReviews: product.numOfReviews,
      variants: product.variants.map(v => ({
        _id: v.legacyId,
        name: v.name,
        sku: v.sku,
        price: Number(v.price),
        buyingPrice: Number(v.buyingPrice),
        stock: v.stock,
        image: v.image,
        attribute: v.attribute,
        value: v.value,
        attributes: v.attributes.reduce((map, attr) => {
          map[attr.name] = attr.value;
          return map;
        }, {})
      })),
      costHistory: product.costHistory.map(c => ({
        _id: c.id,
        cost: Number(c.cost),
        date: c.date,
        supplierId: c.supplierId
      })),
      reviews: product.embeddedReviews.map(r => ({
        _id: r.legacyId,
        user: r.userId,
        name: r.name,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt
      })),
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    };
  } catch (err) {
    console.error('[DUAL-READ-PRODUCT-FAIL]', {
      timestamp: new Date().toISOString(),
      operation: 'getById',
      mongoId: String(mongoId),
      error: err.message || String(err)
    });
    return null;
  }
}

/**
 * List products from Postgres with filters (for read cutover).
 * Returns array of Mongo-shaped documents.
 */
async function listProductsFromPG(filters = {}) {
  try {
    const where = {};
    
    if (filters.status !== undefined) {
      where.status = String(filters.status).toLowerCase() === 'inactive' ? 'INACTIVE' : 'ACTIVE';
    }
    if (filters.categoryName) where.categoryName = String(filters.categoryName);
    if (filters.categoryId) where.categoryId = filters.categoryId;
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

    const products = await prisma.product.findMany({
      ...query,
      include: {
        variants: { include: { attributes: true } }
      }
    });

    return products.map(product => ({
      _id: product.legacyId,
      productId: product.productId,
      name: product.name,
      slug: product.slug,
      price: Number(product.price),
      buyingPrice: Number(product.buyingPrice),
      category: product.categoryName,
      brand: product.brandId,
      brandName: product.brandName,
      hasVariants: product.hasVariants,
      stockQuantity: product.stockQuantity,
      lowStockThreshold: product.lowStockThreshold,
      stock: product.stock,
      description: product.description,
      detailedDescription: product.detailedDescription,
      highlights: product.highlights,
      tags: product.tags,
      weight: product.weight,
      status: product.status === 'INACTIVE' ? 'inactive' : 'active',
      icon: product.icon,
      image: product.image,
      images: product.images,
      rating: Number(product.rating),
      numOfReviews: product.numOfReviews,
      variants: product.variants.map(v => ({
        _id: v.legacyId,
        name: v.name,
        sku: v.sku,
        price: Number(v.price),
        buyingPrice: Number(v.buyingPrice),
        stock: v.stock,
        image: v.image,
        attribute: v.attribute,
        value: v.value,
        attributes: v.attributes.reduce((map, attr) => {
          map[attr.name] = attr.value;
          return map;
        }, {})
      })),
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    }));
  } catch (err) {
    console.error('[DUAL-READ-PRODUCT-FAIL]', {
      timestamp: new Date().toISOString(),
      operation: 'list',
      filters: JSON.stringify(filters),
      error: err.message || String(err)
    });
    return [];
  }
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
  UUID_PATTERN,
  // Dual-write functions (Stage 2 Step 3, Part 1.1)
  createProductInPG,
  updateProductInPG,
  deleteProductInPG,
  updateStockInPG,
  // Read cutover functions (Stage 4)
  getProductByIdFromPG,
  listProductsFromPG
};
