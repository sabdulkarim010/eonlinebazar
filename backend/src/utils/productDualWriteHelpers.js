/********************************************************************
 * Project: EonlineBazar
 * File: productDualWriteHelpers.js
 * Location: backend/src/utils/productDualWriteHelpers.js
 * Description: Shape transformer and dual-write mirrors for Product 
 *   (Stage 2 Step 3, Part 1.1 — Product Dual-Write). Handles Product,
 *   ProductVariant, ProductVariantAttribute, ProductCostHistory, and 
 *   ProductEmbeddedReview child tables.
 ********************************************************************/

'use strict';

function toPlain(doc) {
  return doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
}

function stringifyObjectId(value) {
  if (!value) return null;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

/**
 * Transform a Mongoose Product document into Prisma-compatible nested shape.
 * Returns { main, variants, images, attributes, costHistory, embeddedReviews }.
 * 
 * All MongoDB ObjectIds → String, all null/undefined → safe defaults.
 * Handles both simple and variant-based products.
 */
function mongoProductToPrismaShape(mongoDoc) {
  const plain = toPlain(mongoDoc);
  
  // ── Main Product Fields ────────────────────────────────────────────────
  const main = {
    legacyId: plain._id != null ? String(plain._id) : null,
    productId: String(plain.productId || '').trim(),
    name: String(plain.name || '').trim() || null,
    slug: plain.slug != null ? String(plain.slug).trim().toLowerCase() : null,
    
    price: plain.price != null ? Number(plain.price) : 0,
    buyingPrice: plain.buyingPrice != null ? Number(plain.buyingPrice) : 0,
    
    categoryName: String(plain.category || plain.categoryName || 'General').trim(),
    categoryId: stringifyObjectId(plain.categoryId),
    
    brandId: stringifyObjectId(plain.brand || plain.brandId),
    brandName: String(plain.brandName || '').trim(),
    
    hasVariants: Boolean(plain.hasVariants),
    stockQuantity: plain.stockQuantity != null ? Number(plain.stockQuantity) : 0,
    lowStockThreshold: plain.lowStockThreshold != null ? Number(plain.lowStockThreshold) : 10,
    
    supplierId: stringifyObjectId(plain.supplierId),
    warehouseId: stringifyObjectId(plain.warehouseId),
    reorderPoint: plain.reorderPoint != null ? Number(plain.reorderPoint) : 5,
    
    stock: plain.stock != null ? Number(plain.stock) : 0,
    
    description: String(plain.description || '').trim(),
    detailedDescription: String(plain.detailedDescription || '').trim(),
    highlights: Array.isArray(plain.highlights) ? plain.highlights : [],
    tags: Array.isArray(plain.tags) ? plain.tags : [],
    weight: plain.weight != null ? Number(plain.weight) : null,
    
    status: String(plain.status || 'active').toLowerCase() === 'inactive' ? 'INACTIVE' : 'ACTIVE',
    createdById: stringifyObjectId(plain.createdBy || plain.createdById),
    
    icon: String(plain.icon || '📦').trim(),
    image: String(plain.image || '').trim(),
    images: Array.isArray(plain.images) ? plain.images : [],
    
    rating: plain.rating != null ? Number(plain.rating) : 0,
    numOfReviews: plain.numOfReviews != null ? Number(plain.numOfReviews) : 0
  };
  
  // ── Variants ───────────────────────────────────────────────────────────
  const variants = [];
  const rawVariants = Array.isArray(plain.variants) ? plain.variants : [];
  
  for (const v of rawVariants) {
    const vPlain = toPlain(v);
    const variantRow = {
      legacyId: vPlain._id != null ? String(vPlain._id) : null,
      name: String(vPlain.name || '').trim(),
      sku: String(vPlain.sku || '').trim(),
      price: vPlain.price != null ? Number(vPlain.price) : 0,
      buyingPrice: vPlain.buyingPrice != null ? Number(vPlain.buyingPrice) : 0,
      stock: vPlain.stock != null ? Number(vPlain.stock) : 0,
      image: String(vPlain.image || '').trim(),
      // Legacy flat fields
      attribute: String(vPlain.attribute || '').trim(),
      value: String(vPlain.value || '').trim(),
      // Attributes Map → array of { name, value }
      attributes: []
    };
    
    // Handle attributes Map<String, String> → ProductVariantAttribute[]
    if (vPlain.attributes) {
      if (vPlain.attributes instanceof Map) {
        for (const [name, value] of vPlain.attributes.entries()) {
          variantRow.attributes.push({
            name: String(name),
            value: String(value ?? '')
          });
        }
      } else if (typeof vPlain.attributes === 'object') {
        for (const [name, value] of Object.entries(vPlain.attributes)) {
          variantRow.attributes.push({
            name: String(name),
            value: String(value ?? '')
          });
        }
      }
    }
    
    variants.push(variantRow);
  }
  
  // ── Images (already in main.images, kept here for symmetry) ────────────
  const images = Array.isArray(plain.images) ? plain.images : [];
  
  // ── Attributes (not used in product.js — reserved for future) ──────────
  const attributes = [];
  
  // ── Cost History ───────────────────────────────────────────────────────
  const costHistory = [];
  const rawCostHistory = Array.isArray(plain.costHistory) ? plain.costHistory : [];
  
  for (const entry of rawCostHistory) {
    const ePlain = toPlain(entry);
    costHistory.push({
      cost: ePlain.cost != null ? Number(ePlain.cost) : 0,
      date: ePlain.date ? new Date(ePlain.date) : new Date(),
      supplierId: stringifyObjectId(ePlain.supplierId)
    });
  }
  
  // ── Embedded Reviews ───────────────────────────────────────────────────
  const embeddedReviews = [];
  const rawReviews = Array.isArray(plain.reviews) ? plain.reviews : [];
  
  for (const review of rawReviews) {
    const rPlain = toPlain(review);
    embeddedReviews.push({
      legacyId: rPlain._id != null ? String(rPlain._id) : null,
      userId: stringifyObjectId(rPlain.user),
      name: String(rPlain.name || 'Anonymous').trim(),
      rating: rPlain.rating != null ? Number(rPlain.rating) : 0,
      comment: String(rPlain.comment || '').trim(),
      createdAt: rPlain.createdAt ? new Date(rPlain.createdAt) : new Date()
    });
  }
  
  return {
    main,
    variants,
    images,
    attributes,
    costHistory,
    embeddedReviews
  };
}

module.exports = {
  mongoProductToPrismaShape,
  stringifyObjectId,
  toPlain
};
