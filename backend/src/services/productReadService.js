/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: productReadService.js
 * Location: backend/src/services/productReadService.js
 * Description: Routed reads for Product, ProductVariant, ProductCostHistory,
 *   ProductEmbeddedReview. Follows exact pattern of userReadService.js.
 ********************************************************************/

'use strict';

const mongoose = require('mongoose');
const Product = require('../models/product');
const Brand = require('../models/brand');
const Category = require('../models/category');
const Settings = require('../models/Settings');
const { routedRead } = require('./readRouter');

const FALLBACK_PRODUCTS_PER_PAGE = 24;
const MAX_PRODUCTS_PER_PAGE = 500;
const DEFAULT_LOW_STOCK_THRESHOLD = 10;

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveDefaultProductsPerPage() {
  try {
    const settings = await Settings.getOrCreate();
    const n = Number(settings.defaultProductsPerPage);
    if (Number.isFinite(n) && n >= 1) {
      return Math.min(MAX_PRODUCTS_PER_PAGE, Math.max(1, Math.floor(n)));
    }
  } catch (_err) { /* fall through */ }
  return FALLBACK_PRODUCTS_PER_PAGE;
}

async function resolveBrandFilterIds(brandParam) {
  if (!brandParam) return [];
  const tokens = String(brandParam).split(',').map((s) => s.trim()).filter(Boolean);
  const ids = [];

  for (const token of tokens) {
    if (mongoose.Types.ObjectId.isValid(token)) {
      ids.push(new mongoose.Types.ObjectId(token));
      continue;
    }
    const slug = token.toLowerCase();
    const brandDoc = await Brand.findOne({
      $or: [{ slug }, { name: new RegExp(`^${escapeRegex(token)}$`, 'i') }]
    }).select('_id');
    if (brandDoc) ids.push(brandDoc._id);
  }

  return ids;
}

async function resolveCategoryFilterNames(categoryParam) {
  if (!categoryParam) return [];
  const token = String(categoryParam).trim();
  if (!token) return [];

  const activeCats = await Category.find({ isActive: { $ne: false } })
    .select('_id name parentCategory slug')
    .lean();

  let matched = null;

  if (mongoose.Types.ObjectId.isValid(token)) {
    matched = activeCats.find((c) => String(c._id) === String(token)) || null;
  }

  if (!matched) {
    const slug = token.toLowerCase();
    const nameLower = token.toLowerCase();
    matched = activeCats.find((cat) => {
      const catSlug = String(cat.slug || '').toLowerCase();
      if (catSlug && catSlug === slug) return true;
      if (String(cat.name || '').toLowerCase() === nameLower) return true;
      const fromName = String(cat.name || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\u0980-\u09FF\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
      return fromName === slug;
    }) || null;
  }

  if (!matched) return [token];

  const byParent = new Map();
  activeCats.forEach((cat) => {
    const key = cat.parentCategory == null || cat.parentCategory === ''
      ? 'root'
      : String(cat.parentCategory._id || cat.parentCategory);
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(cat);
  });

  const names = [];
  const queue = [matched];
  const seen = new Set();
  while (queue.length) {
    const node = queue.shift();
    const id = String(node._id);
    if (seen.has(id)) continue;
    seen.add(id);
    if (node.name) names.push(node.name);
    (byParent.get(id) || []).forEach((child) => queue.push(child));
  }

  return names.length ? names : [matched.name];
}

async function buildTextSearchConditions(q) {
  const trimmed = String(q || '').trim();
  if (!trimmed) return null;

  const words = trimmed.split(/\s+/).filter(Boolean);
  const phraseRegex = new RegExp(escapeRegex(trimmed), 'i');
  const wordRegexes = words.map((w) => new RegExp(escapeRegex(w), 'i'));
  const brandIds = await Brand.find({ name: phraseRegex }).distinct('_id');

  const searchableFields = [
    'name', 'description', 'detailedDescription',
    'category', 'brandName', 'tags', 'highlights'
  ];

  const orConditions = [];
  searchableFields.forEach((field) => orConditions.push({ [field]: phraseRegex }));
  wordRegexes.forEach((re) => {
    searchableFields.forEach((field) => orConditions.push({ [field]: re }));
  });
  if (brandIds.length > 0) {
    orConditions.push({ brand: { $in: brandIds } });
  }

  return { $or: orConditions };
}

function buildSortOption(sortParam) {
  switch (String(sortParam || '').toLowerCase()) {
    case 'oldest': return { createdAt: 1 };
    case 'price_asc': return { price: 1 };
    case 'price_desc': return { price: -1 };
    case 'rating_desc':
    case 'rating':
    case 'top': return { rating: -1, numOfReviews: -1 };
    case 'popular':
    case 'sales': return { numOfReviews: -1, rating: -1 };
    case 'relevance': return { rating: -1, numOfReviews: -1, createdAt: -1 };
    case 'newest':
    default: return { createdAt: -1 };
  }
}

function buildPgSortOrder(sort) {
  switch (String(sort || '').toLowerCase()) {
    case 'oldest': return { createdAt: 'asc' };
    case 'price_asc': return { price: 'asc' };
    case 'price_desc': return { price: 'desc' };
    case 'rating':
    case 'rating_desc':
    case 'top':
    case 'relevance': return [{ rating: 'desc' }, { numOfReviews: 'desc' }];
    case 'popular':
    case 'sales': return [{ numOfReviews: 'desc' }, { rating: 'desc' }];
    case 'newest':
    default: return { createdAt: 'desc' };
  }
}

function mapPgProductRow(product) {
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
    stock: product.stock,
    reorderPoint: product.reorderPoint,
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
    supplierId: product.supplierId,
    warehouseId: product.warehouseId,
    variants: (product.variants || []).map((v) => ({
      _id: v.legacyId,
      name: v.name,
      sku: v.sku,
      price: Number(v.price),
      buyingPrice: Number(v.buyingPrice),
      stock: v.stock,
      image: v.image,
      attribute: v.attribute,
      value: v.value,
      attributes: (v.attributes || []).reduce((map, attr) => {
        map[attr.name] = attr.value;
        return map;
      }, {})
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

function buildMongoLowStockExpr() {
  return {
    $expr: {
      $and: [
        { $gt: [{ $ifNull: ['$stockQuantity', 0] }, 0] },
        {
          $lte: [
            { $ifNull: ['$stockQuantity', 0] },
            {
              $cond: {
                if: { $gt: [{ $ifNull: ['$lowStockThreshold', 0] }, 0] },
                then: '$lowStockThreshold',
                else: DEFAULT_LOW_STOCK_THRESHOLD
              }
            }
          ]
        }
      ]
    }
  };
}

async function buildMongoSearchFilter(options) {
  const clauses = [];

  const textFilter = await buildTextSearchConditions(options.q);
  if (textFilter) clauses.push(textFilter);

  const scalar = {};

  if (options.minPrice != null && !Number.isNaN(options.minPrice)) {
    scalar.price = scalar.price || {};
    scalar.price.$gte = options.minPrice;
  }
  if (options.maxPrice != null && !Number.isNaN(options.maxPrice)) {
    scalar.price = scalar.price || {};
    scalar.price.$lte = options.maxPrice;
  }

  if (options.brandIds.length === 1) scalar.brand = options.brandIds[0];
  else if (options.brandIds.length > 1) scalar.brand = { $in: options.brandIds };

  if (options.categoryNames.length > 0) {
    scalar.category = { $in: options.categoryNames };
  }

  if (options.rating != null && !Number.isNaN(options.rating) && options.rating >= 1 && options.rating <= 5) {
    scalar.rating = { $gte: options.rating };
  }

  if (Object.keys(scalar).length > 0) clauses.push(scalar);

  if (options.lowStock) {
    clauses.push(buildMongoLowStockExpr());
  } else if (options.inStock === 'true') {
    clauses.push({ stockQuantity: { $gt: 0 } });
  } else if (options.inStock === 'false') {
    clauses.push({ stockQuantity: 0 });
  }

  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

function buildPgSearchWhere(options) {
  const where = {};
  const q = String(options.q || '').trim();

  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { detailedDescription: { contains: q, mode: 'insensitive' } },
      { brandName: { contains: q, mode: 'insensitive' } }
    ];
  }

  if (options.minPrice != null && !Number.isNaN(options.minPrice)) {
    where.price = where.price || {};
    where.price.gte = options.minPrice;
  }
  if (options.maxPrice != null && !Number.isNaN(options.maxPrice)) {
    where.price = where.price || {};
    where.price.lte = options.maxPrice;
  }

  if (options.brandIds.length === 1) {
    where.brandId = String(options.brandIds[0]);
  } else if (options.brandIds.length > 1) {
    where.brandId = { in: options.brandIds.map(String) };
  }

  if (options.categoryNames.length === 1) {
    where.categoryName = options.categoryNames[0];
  } else if (options.categoryNames.length > 1) {
    where.categoryName = { in: options.categoryNames };
  }

  if (options.rating != null && !Number.isNaN(options.rating) && options.rating >= 1 && options.rating <= 5) {
    where.rating = { gte: options.rating };
  }

  if (options.inStock === 'true') {
    where.stockQuantity = { gt: 0 };
  } else if (options.inStock === 'false') {
    where.stockQuantity = 0;
  }

  return where;
}

function getPrismaSql() {
  return require('@prisma/client').Prisma;
}

function buildPgLowStockOrderSql(sort) {
  const Prisma = getPrismaSql();
  switch (String(sort || '').toLowerCase()) {
    case 'oldest': return Prisma.sql`p."createdAt" ASC`;
    case 'price_asc': return Prisma.sql`p.price ASC`;
    case 'price_desc': return Prisma.sql`p.price DESC`;
    case 'rating':
    case 'rating_desc':
    case 'top':
    case 'relevance': return Prisma.sql`p.rating DESC, p."numOfReviews" DESC`;
    case 'popular':
    case 'sales': return Prisma.sql`p."numOfReviews" DESC, p.rating DESC`;
    case 'newest':
    default: return Prisma.sql`p."createdAt" DESC`;
  }
}

function buildPgLowStockSearchConditions(options) {
  const Prisma = getPrismaSql();
  const conditions = [
    Prisma.sql`p."stockQuantity" > 0`,
    Prisma.sql`p."stockQuantity" <= CASE WHEN p."lowStockThreshold" > 0 THEN p."lowStockThreshold" ELSE ${DEFAULT_LOW_STOCK_THRESHOLD} END`
  ];

  const q = String(options.q || '').trim();
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(Prisma.sql`(
      p.name ILIKE ${pattern}
      OR COALESCE(p.description, '') ILIKE ${pattern}
      OR COALESCE(p."detailedDescription", '') ILIKE ${pattern}
      OR COALESCE(p."brandName", '') ILIKE ${pattern}
    )`);
  }

  if (options.minPrice != null && !Number.isNaN(options.minPrice)) {
    conditions.push(Prisma.sql`p.price >= ${options.minPrice}`);
  }
  if (options.maxPrice != null && !Number.isNaN(options.maxPrice)) {
    conditions.push(Prisma.sql`p.price <= ${options.maxPrice}`);
  }

  if (options.categoryNames.length === 1) {
    conditions.push(Prisma.sql`p."categoryName" = ${options.categoryNames[0]}`);
  } else if (options.categoryNames.length > 1) {
    conditions.push(Prisma.sql`p."categoryName" IN (${Prisma.join(options.categoryNames)})`);
  }

  if (options.brandIds.length === 1) {
    conditions.push(Prisma.sql`p."brandId" = ${String(options.brandIds[0])}`);
  } else if (options.brandIds.length > 1) {
    conditions.push(Prisma.sql`p."brandId" IN (${Prisma.join(options.brandIds.map(String))})`);
  }

  if (options.rating != null && !Number.isNaN(options.rating) && options.rating >= 1 && options.rating <= 5) {
    conditions.push(Prisma.sql`p.rating >= ${options.rating}`);
  }

  return conditions;
}

async function searchPgProductsLowStock(options, skip, limit) {
  const Prisma = getPrismaSql();
  const prisma = require('../config/prismaClient');
  const whereClause = Prisma.join(buildPgLowStockSearchConditions(options), ' AND ');
  const orderClause = buildPgLowStockOrderSql(options.sort);

  const [countRows, idRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM products p
      WHERE ${whereClause}
    `,
    prisma.$queryRaw`
      SELECT p."legacyId"
      FROM products p
      WHERE ${whereClause}
      ORDER BY ${orderClause}
      OFFSET ${skip}
      LIMIT ${limit}
    `
  ]);

  const total = Number(countRows[0]?.count || 0);
  const legacyIds = idRows.map((row) => row.legacyId).filter(Boolean);

  if (!legacyIds.length) {
    return { products: [], total };
  }

  const rows = await prisma.product.findMany({
    where: { legacyId: { in: legacyIds } },
    include: {
      variants: { include: { attributes: true } }
    }
  });

  const rowByLegacy = new Map(rows.map((row) => [row.legacyId, row]));
  const ordered = legacyIds.map((id) => rowByLegacy.get(id)).filter(Boolean);

  return {
    products: ordered.map(mapPgProductRow),
    total
  };
}

async function parseProductSearchRequest(req) {
  const q = String(req.query.q || '').trim();
  const minPrice = req.query.minPrice != null && req.query.minPrice !== ''
    ? Number(req.query.minPrice) : null;
  const maxPrice = req.query.maxPrice != null && req.query.maxPrice !== ''
    ? Number(req.query.maxPrice) : null;
  const rating = req.query.rating != null && req.query.rating !== ''
    ? Number(req.query.rating) : null;
  const inStock = String(req.query.inStock || '').toLowerCase();
  const lowStock = String(req.query.lowStock || '').toLowerCase() === 'true';
  const sort = String(req.query.sort || 'newest').toLowerCase();

  const rawLimit = parseInt(req.query.limit, 10);
  const defaultLimit = await resolveDefaultProductsPerPage();
  const limit = Math.min(
    MAX_PRODUCTS_PER_PAGE,
    Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit)
  );
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const [categoryNames, brandIds] = await Promise.all([
    resolveCategoryFilterNames(req.query.category),
    resolveBrandFilterIds(req.query.brand)
  ]);

  return {
    q,
    minPrice,
    maxPrice,
    rating,
    inStock,
    lowStock,
    sort,
    page,
    limit,
    categoryNames,
    brandIds
  };
}

function getProductRepository() {
  return require('../repositories/productRepository');
}

/**
 * Fetch single product by MongoDB _id.
 * Routes between Mongo and Postgres based on READ_PG_PRODUCT flag.
 */
async function fetchProductById(mongoProductId) {
  return routedRead(
    'product',
    async () => {
      const product = await Product.findById(mongoProductId).lean();
      return product;
    },
    async () => {
      const repo = getProductRepository();
      return repo.getProductByIdFromPG(mongoProductId);
    }
  );
}

/**
 * Fetch single product by productId string (e.g. "PROD-123").
 * Routes between Mongo and Postgres based on READ_PG_PRODUCT flag.
 */
async function fetchProductByProductId(productId) {
  return routedRead(
    'product',
    async () => {
      const product = await Product.findOne({ productId: String(productId) }).lean();
      return product;
    },
    async () => {
      // First find by productId in Postgres, then return full document
      const repo = getProductRepository();
      const pgProduct = await repo.findByProductId(String(productId));
      if (!pgProduct) return null;
      
      // pgProduct._id is the Mongo legacyId, use it to fetch full document
      return repo.getProductByIdFromPG(pgProduct._id);
    }
  );
}

/**
 * Fetch single product by slug.
 * Routes between Mongo and Postgres based on READ_PG_PRODUCT flag.
 */
async function fetchProductBySlug(slug) {
  return routedRead(
    'product',
    async () => {
      const product = await Product.findOne({ slug: String(slug).toLowerCase() }).lean();
      return product;
    },
    async () => {
      const repo = getProductRepository();
      const pgProduct = await repo.findBySlug(String(slug));
      if (!pgProduct) return null;
      
      // pgProduct._id is the Mongo legacyId, use it to fetch full document
      return repo.getProductByIdFromPG(pgProduct._id);
    }
  );
}

/**
 * List products with filters (search, category, brand, price range, etc.).
 * Routes between Mongo and Postgres based on READ_PG_PRODUCT flag.
 */
async function listProducts(filters = {}) {
  return routedRead(
    'product',
    async () => {
      const where = {};
      
      if (filters.status !== undefined) {
        where.status = filters.status;
      }
      
      const search = String(filters.search || filters.q || '').trim();
      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const phraseRegex = new RegExp(escaped, 'i');
        where.$or = [
          { name: phraseRegex },
          { description: phraseRegex },
          { tags: phraseRegex },
          { productId: phraseRegex }
        ];
      }
      
      if (filters.category) where.category = filters.category;
      if (filters.brand) where.brand = filters.brand;
      
      if (filters.minPrice != null || filters.maxPrice != null) {
        where.price = {};
        if (filters.minPrice != null) where.price.$gte = filters.minPrice;
        if (filters.maxPrice != null) where.price.$lte = filters.maxPrice;
      }
      
      const query = Product.find(where);
      
      if (filters.sort) {
        const sortMap = {
          'price_asc': { price: 1 },
          'price_desc': { price: -1 },
          'rating': { rating: -1 },
          'popular': { numOfReviews: -1 },
          'newest': { createdAt: -1 },
          'oldest': { createdAt: 1 }
        };
        query.sort(sortMap[filters.sort] || { createdAt: -1 });
      } else {
        query.sort({ createdAt: -1 });
      }
      
      const limit = Number(filters.limit);
      if (Number.isFinite(limit) && limit > 0) {
        const page = Math.max(1, Number(filters.page) || 1);
        query.skip((page - 1) * limit).limit(limit);
      }
      
      return query.lean();
    },
    async () => {
      const repo = getProductRepository();
      return repo.listProductsFromPG(filters);
    }
  );
}

/**
 * Count products with filters.
 * Routes between Mongo and Postgres based on READ_PG_PRODUCT flag.
 */
async function countProducts(filters = {}) {
  return routedRead(
    'product',
    async () => {
      const where = {};
      
      if (filters.status !== undefined) {
        where.status = filters.status;
      }
      
      const search = String(filters.search || filters.q || '').trim();
      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const phraseRegex = new RegExp(escaped, 'i');
        where.$or = [
          { name: phraseRegex },
          { description: phraseRegex },
          { tags: phraseRegex },
          { productId: phraseRegex }
        ];
      }
      
      if (filters.category) where.category = filters.category;
      if (filters.brand) where.brand = filters.brand;
      
      if (filters.minPrice != null || filters.maxPrice != null) {
        where.price = {};
        if (filters.minPrice != null) where.price.$gte = filters.minPrice;
        if (filters.maxPrice != null) where.price.$lte = filters.maxPrice;
      }
      
      return Product.countDocuments(where);
    },
    async () => {
      const repo = getProductRepository();
      const prisma = require('../config/prismaClient');
      
      const where = {};
      
      if (filters.status !== undefined) {
        where.status = String(filters.status).toLowerCase() === 'inactive' ? 'INACTIVE' : 'ACTIVE';
      }
      
      const search = String(filters.search || filters.q || '').trim();
      if (search) {
        where.name = { contains: search, mode: 'insensitive' };
      }
      
      if (filters.category) where.categoryName = String(filters.category);
      if (filters.brand) where.brandId = filters.brand;
      
      if (filters.minPrice != null || filters.maxPrice != null) {
        where.price = {};
        if (filters.minPrice != null) where.price.gte = filters.minPrice;
        if (filters.maxPrice != null) where.price.lte = filters.maxPrice;
      }
      
      return prisma.product.count({ where });
    }
  );
}

/**
 * Search products with advanced filters (full-text, price range, brand, category).
 * Routes between Mongo and Postgres based on READ_PG_PRODUCT flag.
 *
 * @param {import('express').Request} req
 * @returns {Promise<{ success: true, products: object[], total: number, page: number, pages: number, limit: number }>}
 */
async function searchProducts(req) {
  const options = await parseProductSearchRequest(req);
  const skip = (options.page - 1) * options.limit;
  const sortOption = buildSortOption(options.sort);

  const routed = await routedRead(
    'product',
    async () => {
      const filter = await buildMongoSearchFilter(options);
      const [total, products] = await Promise.all([
        Product.countDocuments(filter),
        Product.find(filter).sort(sortOption).skip(skip).limit(options.limit).lean()
      ]);
      return { products, total };
    },
    async () => {
      if (options.lowStock) {
        return searchPgProductsLowStock(options, skip, options.limit);
      }

      const prisma = require('../config/prismaClient');
      const where = buildPgSearchWhere(options);
      const orderBy = buildPgSortOrder(options.sort);

      const [total, rows] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          orderBy,
          skip,
          take: options.limit,
          include: {
            variants: { include: { attributes: true } }
          }
        })
      ]);

      return {
        products: rows.map(mapPgProductRow),
        total
      };
    }
  );

  const products = Array.isArray(routed?.products) ? routed.products : [];
  const total = Math.max(0, Number(routed?.total) || 0);
  const pages = total > 0 ? Math.ceil(total / options.limit) : 0;

  return {
    success: true,
    products,
    total,
    page: options.page,
    pages,
    limit: options.limit
  };
}

module.exports = {
  fetchProductById,
  fetchProductByProductId,
  fetchProductBySlug,
  listProducts,
  countProducts,
  searchProducts
};
