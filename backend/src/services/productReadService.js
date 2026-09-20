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
const { routedRead } = require('./readRouter');

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
 */
async function searchProducts(searchOptions = {}) {
  const {
    q,
    minPrice,
    maxPrice,
    brand,
    category,
    rating,
    inStock,
    sort,
    page,
    limit
  } = searchOptions;
  
  return routedRead(
    'product',
    async () => {
      const where = {};
      
      // Text search
      if (q) {
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const phraseRegex = new RegExp(escaped, 'i');
        where.$or = [
          { name: phraseRegex },
          { description: phraseRegex },
          { detailedDescription: phraseRegex },
          { tags: phraseRegex },
          { brandName: phraseRegex }
        ];
      }
      
      // Price range
      if (minPrice != null || maxPrice != null) {
        where.price = {};
        if (minPrice != null) where.price.$gte = Number(minPrice);
        if (maxPrice != null) where.price.$lte = Number(maxPrice);
      }
      
      // Brand filter
      if (brand) {
        if (mongoose.Types.ObjectId.isValid(brand)) {
          where.brand = brand;
        }
      }
      
      // Category filter
      if (category) where.category = category;
      
      // Rating filter
      if (rating != null && !Number.isNaN(rating)) {
        where.rating = { $gte: Number(rating) };
      }
      
      // Stock filter
      if (inStock === 'true' || inStock === true) {
        where.stockQuantity = { $gt: 0 };
      } else if (inStock === 'false' || inStock === false) {
        where.stockQuantity = 0;
      }
      
      // Build query
      const query = Product.find(where);
      
      // Sort
      const sortMap = {
        'price_asc': { price: 1 },
        'price_desc': { price: -1 },
        'rating': { rating: -1 },
        'popular': { numOfReviews: -1 },
        'newest': { createdAt: -1 },
        'oldest': { createdAt: 1 },
        'relevance': { rating: -1, numOfReviews: -1 }
      };
      query.sort(sortMap[sort] || { createdAt: -1 });
      
      // Pagination
      const pageLimit = Number(limit) || 24;
      const currentPage = Math.max(1, Number(page) || 1);
      query.skip((currentPage - 1) * pageLimit).limit(pageLimit);
      
      return query.lean();
    },
    async () => {
      const repo = getProductRepository();
      const filters = {
        search: q,
        minPrice,
        maxPrice,
        brandId: brand,
        categoryName: category,
        limit,
        page
      };
      
      // Stock filter
      if (inStock === 'true' || inStock === true) {
        filters.minStock = 1;
      } else if (inStock === 'false' || inStock === false) {
        filters.maxStock = 0;
      }
      
      return repo.listProductsFromPG(filters);
    }
  );
}

module.exports = {
  fetchProductById,
  fetchProductByProductId,
  fetchProductBySlug,
  listProducts,
  countProducts,
  searchProducts
};
