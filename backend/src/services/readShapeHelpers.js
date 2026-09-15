/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: readShapeHelpers.js
 * Location: backend/src/services/readShapeHelpers.js
 * Description: Transform Postgres repository rows into the exact Mongoose
 *   .lean() shape API callers expect (_id = legacy Mongo ObjectId, etc.).
 ********************************************************************/

'use strict';

/** Replicates category.js / categoryRepository slug hook (no Prisma import). */
function slugifyCategory(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09FF\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/** Mongo _id from a backfilled Postgres row (legacyId holds the original _id). */
function mongoIdFromRow(row) {
  if (!row) return null;
  return row.legacyId != null ? String(row.legacyId) : String(row._id || row.id);
}

function normalisePoStatus(status) {
  if (!status) return status;
  const s = String(status).toLowerCase();
  if (s === 'partial_received') return 'partial';
  return s;
}

function decimalToNumber(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Mongoose __v on .lean() docs — verified 2026-09-15: all group-1 production rows are 0. */
const MONGOOSE_DOC_VERSION = 0;

// ── Category ────────────────────────────────────────────────────────────────

function buildCategoryIdMaps(rows) {
  const pgIdToLegacy = new Map();
  const pgIdToRow = new Map();
  (rows || []).forEach((row) => {
    pgIdToLegacy.set(row.id, mongoIdFromRow(row));
    pgIdToRow.set(row.id, row);
  });
  return { pgIdToLegacy, pgIdToRow };
}

function categoryToMongoShape(pgRow, maps, options = {}) {
  if (!pgRow) return null;

  const { pgIdToLegacy, pgIdToRow } = maps || buildCategoryIdMaps([pgRow]);
  const _id = mongoIdFromRow(pgRow);

  let parentCategory = null;
  const parentPgId = pgRow.parentCategoryId ?? pgRow.parentCategory ?? null;
  if (parentPgId) {
    if (options.populateParent) {
      const parentRow = pgIdToRow.get(parentPgId);
      parentCategory = parentRow
        ? { _id: mongoIdFromRow(parentRow), name: parentRow.name }
        : null;
    } else {
      parentCategory = pgIdToLegacy.get(parentPgId) || null;
    }
  }

  return {
    _id,
    name: pgRow.name,
    slug: pgRow.slug,
    description: pgRow.description ?? '',
    imageUrl: pgRow.imageUrl ?? null,
    iconUrl: pgRow.iconUrl ?? null,
    bannerImageUrl: pgRow.bannerImageUrl ?? null,
    color: pgRow.color ?? '#f97316',
    parentCategory,
    isActive: pgRow.isActive !== false,
    isFeatured: !!pgRow.isFeatured,
    showInNavbar: pgRow.showInNavbar !== false,
    showInHomepage: !!pgRow.showInHomepage,
    position: pgRow.position ?? 0,
    customCashback: decimalToNumber(pgRow.customCashback),
    metaTitle: pgRow.metaTitle ?? '',
    metaDescription: pgRow.metaDescription ?? '',
    productCount: pgRow.productCount ?? 0,
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };
}

function categoryTreeSelectFields(cat) {
  return {
    _id: cat._id,
    name: cat.name,
    slug: cat.slug,
    description: cat.description,
    imageUrl: cat.imageUrl,
    iconUrl: cat.iconUrl,
    color: cat.color,
    parentCategory: cat.parentCategory,
    position: cat.position,
    productCount: cat.productCount,
    showInNavbar: cat.showInNavbar,
    showInHomepage: cat.showInHomepage,
    isFeatured: cat.isFeatured
  };
}

function matchCategoryBySlugParam(categories, rawParam) {
  const slug = String(rawParam || '').trim().toLowerCase();
  if (!slug) return null;

  if (/^[a-f0-9]{24}$/i.test(rawParam)) {
    const byId = categories.find((c) => String(c._id) === String(rawParam));
    if (byId) return byId;
  }

  let category = categories.find((c) => String(c.slug || '').toLowerCase() === slug) || null;
  if (category) return category;

  return categories.find((cat) => {
    const catSlug = String(cat.slug || '').toLowerCase();
    if (catSlug && catSlug === slug) return true;
    const fromName = slugifyCategory(cat.name);
    return fromName === slug;
  }) || null;
}

function mapCategoriesToMongo(rows, options = {}) {
  const maps = buildCategoryIdMaps(rows);
  return rows.map((row) => categoryToMongoShape(row, maps, options));
}

function mapCategoriesToMongoPopulated(rows) {
  return mapCategoriesToMongo(rows, { populateParent: true });
}

// ── Brand ───────────────────────────────────────────────────────────────────

function brandToMongoShape(pgRow) {
  if (!pgRow) return null;
  return {
    _id: mongoIdFromRow(pgRow),
    name: pgRow.name,
    slug: pgRow.slug ?? '',
    description: pgRow.description ?? '',
    status: pgRow.status === 'INACTIVE' || pgRow.status === 'inactive' ? 'inactive' : 'active',
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };
}

function mapBrandsToMongo(rows) {
  return (rows || []).map(brandToMongoShape);
}

// ── Supplier ────────────────────────────────────────────────────────────────

function supplierToMongoShape(pgRow) {
  if (!pgRow) return null;
  const out = {
    _id: mongoIdFromRow(pgRow),
    name: pgRow.name,
    contactPerson: pgRow.contactPerson ?? '',
    phone: pgRow.phone ?? '',
    email: pgRow.email ?? '',
    address: pgRow.address ?? '',
    notes: pgRow.notes ?? '',
    status: pgRow.status === 'INACTIVE' || pgRow.status === 'inactive' ? 'inactive' : 'active',
    suppliedProducts: pgRow.suppliedProducts ?? [],
    createdBy: pgRow.createdById ?? pgRow.createdBy ?? null,
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };
  if (pgRow.purchaseOrders) {
    out.purchaseOrders = pgRow.purchaseOrders.map(purchaseOrderToMongoShape);
  }
  return out;
}

function purchaseOrderToMongoShape(pgPo) {
  if (!pgPo) return pgPo;
  return {
    _id: mongoIdFromRow(pgPo),
    poNumber: pgPo.poNumber,
    status: normalisePoStatus(pgPo.status),
    totalCost: decimalToNumber(pgPo.totalCost) ?? pgPo.totalCost,
    expectedDate: pgPo.expectedDate ?? null,
    receivedDate: pgPo.receivedDate ?? null,
    createdAt: pgPo.createdAt,
    __v: MONGOOSE_DOC_VERSION
  };
}

function mapSuppliersToMongo(rows) {
  return (rows || []).map(supplierToMongoShape);
}

// ── Warehouse ───────────────────────────────────────────────────────────────

function warehouseToMongoShape(pgRow) {
  if (!pgRow) return null;
  return {
    _id: mongoIdFromRow(pgRow),
    name: pgRow.name,
    location: pgRow.location ?? '',
    address: pgRow.address ?? '',
    managerName: pgRow.managerName ?? '',
    phone: pgRow.phone ?? '',
    isDefault: !!pgRow.isDefault,
    status: pgRow.status === 'INACTIVE' || pgRow.status === 'inactive' ? 'inactive' : 'active',
    createdBy: pgRow.createdById ?? pgRow.createdBy ?? null,
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };
}

function mapWarehousesToMongo(rows) {
  return (rows || []).map(warehouseToMongoShape);
}

// ── Designation ─────────────────────────────────────────────────────────────

function designationToMongoShape(pgRow) {
  if (!pgRow) return null;
  const out = {
    _id: mongoIdFromRow(pgRow),
    name: pgRow.name,
    department: pgRow.department ?? 'Operations',
    description: pgRow.description ?? '',
    isActive: pgRow.isActive !== false,
    createdBy: pgRow.createdBy ?? '',
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };
  if (pgRow.employeeCount !== undefined) {
    out.employeeCount = pgRow.employeeCount;
  }
  return out;
}

function mapDesignationsToMongo(rows) {
  return (rows || []).map(designationToMongoShape);
}

module.exports = {
  mongoIdFromRow,
  buildCategoryIdMaps,
  categoryToMongoShape,
  categoryTreeSelectFields,
  matchCategoryBySlugParam,
  mapCategoriesToMongo,
  mapCategoriesToMongoPopulated,
  brandToMongoShape,
  mapBrandsToMongo,
  supplierToMongoShape,
  mapSuppliersToMongo,
  purchaseOrderToMongoShape,
  warehouseToMongoShape,
  mapWarehousesToMongo,
  designationToMongoShape,
  mapDesignationsToMongo
};
