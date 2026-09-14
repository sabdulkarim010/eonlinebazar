/********************************************************************
 * Project: EonlineBazar
 * File: categoryController.js
 * Location: controllers/categoryController.js
 * Author: Abdul Karim Sheikh
 * Description: Public + admin category APIs — tree, navbar, homepage,
 * slug pages, CRUD, image/banner upload, and reorder.
 ********************************************************************/

const Category = require('../models/category');
const Product = require('../models/product');
const cloudinary = require('../config/cloudinary');
const multer = require('multer');
const { dualWrite } = require('../services/dualWriteService');
const { routedRead } = require('../services/readRouter');
const {
  mapCategoriesToMongo,
  mapCategoriesToMongoPopulated,
  categoryTreeSelectFields,
  matchCategoryBySlugParam,
  categoryToMongoShape,
  buildCategoryIdMaps
} = require('../services/readShapeHelpers');

/** Lazy load — avoids pulling Prisma into Jest when the app graph is imported. */
function getCategoryRepository() {
  return require('../repositories/categoryRepository');
}

// Memory storage + Cloudinary upload (project standard; Cloudinary v2)
// Multer instances live at module scope and are applied as route middleware —
// never call upload.single() inside controller handlers.
const imageFileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.includes(String(file.mimetype || '').toLowerCase())) {
    cb(null, true);
    return;
  }
  cb(new Error('Only JPG, PNG, and WebP images are allowed.'), false);
};

const categoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFileFilter
});

const bannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: imageFileFilter
});

function wrapMulter(middleware, sizeMessage) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: sizeMessage
          });
        }
        console.warn('Upload warning:', err.message);
      }
      next();
    });
  };
}

// Field name must match FormData key in admin.js ('categoryImage' / 'bannerImage')
exports.uploadCategoryImage = wrapMulter(
  categoryUpload.single('categoryImage'),
  'Image too large. Max 5MB.'
);
exports.uploadBannerImage = wrapMulter(
  bannerUpload.single('bannerImage'),
  'Banner image too large. Max 10MB.'
);

async function uploadToCloudinary(file, { folder, transformation }) {
  const b64 = Buffer.from(file.buffer).toString('base64');
  const dataURI = `data:${file.mimetype};base64,${b64}`;
  const result = await cloudinary.uploader.upload(dataURI, {
    folder,
    transformation
  });
  return result.secure_url;
}

async function uploadCategoryImageFile(file) {
  return uploadToCloudinary(file, {
    folder: 'eonlinebazar/categories',
    transformation: [{ width: 400, height: 400, crop: 'fill', quality: 'auto' }]
  });
}

async function uploadBannerImageFile(file) {
  return uploadToCloudinary(file, {
    folder: 'eonlinebazar/category-banners',
    transformation: [{ width: 1920, height: 400, crop: 'limit', quality: 'auto' }]
  });
}

function parseBool(value, defaultWhenMissing) {
  if (value === undefined || value === null || value === '') {
    return defaultWhenMissing;
  }
  return value === true || value === 'true';
}

function resolveCashback(body) {
  const raw = body.customCashback ?? body.customCashbackPercentage;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Map a saved Mongoose category document to categoryRepository.create() input. */
function mapMongoCategoryToPostgresCreate(mongoCat, parentCategoryId) {
  return {
    name: mongoCat.name,
    description: mongoCat.description,
    parentCategoryId,
    color: mongoCat.color,
    isActive: mongoCat.isActive,
    isFeatured: mongoCat.isFeatured,
    showInNavbar: mongoCat.showInNavbar,
    showInHomepage: mongoCat.showInHomepage,
    position: mongoCat.position,
    customCashback: mongoCat.customCashback,
    metaTitle: mongoCat.metaTitle,
    metaDescription: mongoCat.metaDescription,
    imageUrl: mongoCat.imageUrl,
    iconUrl: mongoCat.iconUrl,
    bannerImageUrl: mongoCat.bannerImageUrl,
    legacyId: String(mongoCat._id)
  };
}

/** Map a saved Mongoose category document to categoryRepository.update() input. */
function mapMongoCategoryToPostgresUpdate(mongoCat, parentCategoryId) {
  return {
    name: mongoCat.name,
    description: mongoCat.description,
    parentCategoryId,
    color: mongoCat.color,
    isActive: mongoCat.isActive,
    isFeatured: mongoCat.isFeatured,
    showInNavbar: mongoCat.showInNavbar,
    showInHomepage: mongoCat.showInHomepage,
    position: mongoCat.position,
    customCashback: mongoCat.customCashback,
    metaTitle: mongoCat.metaTitle,
    metaDescription: mongoCat.metaDescription,
    imageUrl: mongoCat.imageUrl,
    iconUrl: mongoCat.iconUrl,
    bannerImageUrl: mongoCat.bannerImageUrl
  };
}

/**
 * Resolve Mongo parentCategory ObjectId → Postgres parentCategoryId UUID.
 * When the parent was created before dual-write, leave null and log for Stage 3.
 */
async function resolvePostgresParentCategoryId(mongoParentRef) {
  if (mongoParentRef == null || mongoParentRef === '') return null;

  const mongoParentId = String(mongoParentRef._id || mongoParentRef);
  const parent = await getCategoryRepository().findByLegacyId(mongoParentId);

  if (!parent) {
    console.error('[DUAL-WRITE-PARENT-MISSING]', {
      timestamp: new Date().toISOString(),
      model: 'Category',
      message: 'parent not yet in Postgres',
      mongoParentId
    });
    return null;
  }

  return parent.id;
}

// Products store category as name (String), not ObjectId
function categoryNameFilter(names) {
  const list = [...new Set((names || []).filter(Boolean))];
  if (!list.length) return null;
  return { $in: list };
}

function parentKey(cat) {
  if (!cat || cat.parentCategory == null || cat.parentCategory === '') return 'root';
  return String(cat.parentCategory._id || cat.parentCategory);
}

/**
 * Build a recursive parent → children tree from a flat category list.
 * Each node exposes both `children` and `subCategories` (same array alias).
 */
function buildCategoryTree(categories) {
  const byParent = new Map();
  (categories || []).forEach((cat) => {
    const key = parentKey(cat);
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(cat);
  });

  const nest = (parentId) => {
    const kids = byParent.get(parentId) || [];
    return kids.map((cat) => {
      const nested = nest(String(cat._id));
      return {
        ...cat,
        children: nested,
        subCategories: nested
      };
    });
  };

  return nest('root');
}

/** Collect self + all descendant category docs (any depth) from a flat list. */
function collectDescendantFamily(root, flatCategories) {
  if (!root) return [];
  const byParent = new Map();
  (flatCategories || []).forEach((cat) => {
    const key = parentKey(cat);
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(cat);
  });

  const family = [];
  const queue = [root];
  const seen = new Set();

  while (queue.length) {
    const node = queue.shift();
    const id = String(node._id);
    if (seen.has(id)) continue;
    seen.add(id);
    family.push(node);
    const kids = byParent.get(id) || [];
    kids.forEach((k) => queue.push(k));
  }

  return family;
}

// ── Read helpers (Mongo default; Postgres when READ_PG_CATEGORY=true) ──

async function fetchActiveCategoriesFlat() {
  return routedRead(
    'category',
    () => Category.find({ isActive: true }).sort({ position: 1, name: 1 }).lean(),
    async () => {
      const rows = await getCategoryRepository().findAll({ isActive: true });
      return mapCategoriesToMongo(rows);
    }
  );
}

async function fetchAllCategoriesPopulated() {
  return routedRead(
    'category',
    () => Category.find({})
      .populate('parentCategory', 'name')
      .sort({ position: 1, name: 1 })
      .lean(),
    async () => {
      const rows = await getCategoryRepository().findAll({});
      return mapCategoriesToMongoPopulated(rows);
    }
  );
}

async function fetchCategoryBySlugOrId(rawParam) {
  return routedRead(
    'category',
    async () => {
      const param = String(rawParam || '').trim();
      const slug = param.toLowerCase();
      if (/^[a-f0-9]{24}$/i.test(param)) {
        const byId = await Category.findOne({ _id: param, isActive: true }).lean();
        if (byId) return byId;
      }
      let category = await Category.findOne({ slug, isActive: true }).lean();
      if (!category && slug) {
        const candidates = await Category.find({ isActive: true }).lean();
        category = candidates.find((cat) => {
          const catSlug = String(cat.slug || '').toLowerCase();
          if (catSlug && catSlug === slug) return true;
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
      return category;
    },
    async () => {
      const rows = await getCategoryRepository().findAll({ isActive: true });
      const mapped = mapCategoriesToMongo(rows);
      return matchCategoryBySlugParam(mapped, rawParam);
    }
  );
}

async function fetchCategoryByIdAdmin(id) {
  return routedRead(
    'category',
    () => Category.findById(id).populate('parentCategory', 'name').lean(),
    async () => {
      const row = await getCategoryRepository().findByLegacyId(id);
      if (!row) return null;
      const rows = await getCategoryRepository().findAll({});
      const maps = buildCategoryIdMaps(rows);
      return categoryToMongoShape(row, maps, { populateParent: true });
    }
  );
}

// ── PUBLIC ENDPOINTS ──

// GET /api/categories — all active categories with recursive tree structure
exports.getCategories = async (req, res) => {
  try {
    const categories = await fetchActiveCategoriesFlat();

    const tree = buildCategoryTree(categories);
    res.json({ success: true, data: tree, flat: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/categories/tree — top-level parents with nested subCategories (storefront)
exports.getCategoryTree = async (req, res) => {
  try {
    const categories = (await fetchActiveCategoriesFlat()).map(categoryTreeSelectFields);

    const tree = buildCategoryTree(categories);
    res.json({
      success: true,
      data: tree,
      count: tree.length,
      flatCount: categories.length
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/categories/navbar — drawer departments (top-level + nested subCategories)
exports.getNavbarCategories = async (req, res) => {
  try {
    // Load full active tree so nested sub-categories under navbar parents are included
    const categories = await fetchActiveCategoriesFlat();

    const fullTree = buildCategoryTree(categories);
    const result = fullTree.filter((p) => p.showInNavbar !== false);

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/categories/homepage — featured for homepage
exports.getHomepageCategories = async (req, res) => {
  try {
    const cats = await routedRead(
      'category',
      () => Category.find({
        isActive: true,
        showInHomepage: true,
        parentCategory: null
      }).sort({ position: 1 }).limit(12).lean(),
      async () => {
        const rows = await getCategoryRepository().findAll({
          isActive: true,
          showInHomepage: true,
          parentCategoryId: null
        });
        return mapCategoriesToMongo(rows).slice(0, 12);
      }
    );

    res.json({ success: true, data: cats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/categories/:slug — single category with products (parent expands to children)
exports.getCategoryBySlug = async (req, res) => {
  try {
    const rawParam = String(req.params.slug || '').trim();
    const category = await fetchCategoryBySlugOrId(rawParam);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Include self + all nested descendants (any depth)
    const allActive = await fetchActiveCategoriesFlat();
    const family = collectDescendantFamily(category, allActive);

    const subCategories = family.filter(
      (c) => String(c._id) !== String(category._id)
    );

    const {
      page = 1, limit = 20,
      sort = 'newest',
      minPrice, maxPrice,
      inStock
    } = req.query;

    const categoryNames = family.map((c) => c.name).filter(Boolean);

    const filter = { status: 'active' };
    const nameFilter = categoryNameFilter(categoryNames);
    if (nameFilter) filter.category = nameFilter;
    if (minPrice) filter.price = { $gte: Number(minPrice) };
    if (maxPrice) filter.price = { ...filter.price, $lte: Number(maxPrice) };
    if (inStock === 'true') filter.stockQuantity = { $gt: 0 };

    const sortMap = {
      newest: { createdAt: -1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      popular: { numOfReviews: -1 }
    };

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(sortMap[sort] || { createdAt: -1 })
        .skip((page - 1) * Number(limit))
        .limit(Number(limit))
        .select('name price images icon stockQuantity productId rating')
        .lean(),
      Product.countDocuments(filter)
    ]);

    // productCount is maintained on product create/update/delete — not on page view
    res.json({
      success: true,
      category,
      subCategories,
      products,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── ADMIN ENDPOINTS ──

// GET /api/categories/admin/:id
exports.getCategoryById = async (req, res) => {
  try {
    const category = await fetchCategoryByIdAdmin(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/categories/admin/all
exports.adminGetCategories = async (req, res) => {
  try {
    // 1. Get all categories in one query
    const categories = await fetchAllCategoriesPopulated();

    // 2. Get product counts in ONE aggregation query (not N queries)
    const productCounts = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    // 3. Build a lookup map: { 'Fashion & Apparel': 8, 'Electronics': 3, ... }
    const countMap = {};
    for (const item of productCounts) {
      if (item._id) countMap[item._id] = item.count;
    }

    // 4. Attach counts to categories
    const categoriesWithCounts = categories.map((cat) => ({
      ...cat,
      productCount: countMap[cat.name] || 0
    }));

    res.json({ success: true, data: categoriesWithCounts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/categories/admin
exports.adminCreateCategory = async (req, res) => {
  try {
    const {
      name, description, parentCategory,
      color, isActive, isFeatured,
      showInNavbar, showInHomepage,
      position, metaTitle, metaDescription
    } = req.body;

    const existing = await Category.findOne({ name: name?.trim() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Category name already exists'
      });
    }

    let resolvedParent = parentCategory || null;
    if (resolvedParent === '' || resolvedParent === 'null') {
      resolvedParent = null;
    }

    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadCategoryImageFile(req.file);
    }

    const cat = new Category({
      name: name?.trim(),
      description,
      parentCategory: resolvedParent,
      color: color || '#f97316',
      isActive: parseBool(isActive, true),
      isFeatured: parseBool(isFeatured, false),
      showInNavbar: parseBool(showInNavbar, true),
      showInHomepage: parseBool(showInHomepage, false),
      position: parseInt(position, 10) || 0,
      customCashback: resolveCashback(req.body),
      metaTitle, metaDescription,
      imageUrl
    });

    // Edge case: mongoose assigns _id on construction — reject self-parent
    if (cat.parentCategory && cat.parentCategory.toString() === cat._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'A category cannot be its own parent.'
      });
    }

    await dualWrite(
      () => cat.save(),
      async (savedCat) => {
        const parentCategoryId = await resolvePostgresParentCategoryId(savedCat.parentCategory);
        await getCategoryRepository().create(
          mapMongoCategoryToPostgresCreate(savedCat, parentCategoryId)
        );
      },
      {
        model: 'Category',
        operation: 'create',
        mongoId: (savedCat) => String(savedCat._id)
      }
    );

    res.status(201).json({ success: true, category: cat });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Returns true if categoryId is an ancestor of potentialAncestorId
 * (i.e. setting potentialAncestorId as parent of categoryId would create a cycle).
 */
async function isDescendantOf(potentialAncestorId, categoryId) {
  let current = potentialAncestorId;
  const seen = new Set();
  while (current) {
    if (seen.has(current.toString())) return false; // already safe
    if (current.toString() === categoryId.toString()) return true; // CYCLE!
    seen.add(current.toString());
    const walkCat = await Category.findById(current).select('parentCategory').lean();
    current = walkCat?.parentCategory;
  }
  return false;
}

// PATCH /api/categories/admin/:id
exports.adminUpdateCategory = async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id);
    if (!cat) {
      return res.status(404).json({
        success: false, message: 'Category not found'
      });
    }

    const updates = { ...req.body };
    const oldName = cat.name;

    ['isActive', 'isFeatured', 'showInNavbar', 'showInHomepage'].forEach(field => {
      if (updates[field] !== undefined) {
        updates[field] = updates[field] === 'true' || updates[field] === true;
      }
    });

    if (updates.parentCategory === '' || updates.parentCategory === 'null') {
      updates.parentCategory = null;
    }

    const parentCategory = updates.parentCategory;
    if (parentCategory && parentCategory !== 'null') {
      // Prevent self-reference
      if (parentCategory.toString() === req.params.id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'A category cannot be its own parent.'
        });
      }
      // Prevent circular reference (A → B → A)
      const wouldCycle = await isDescendantOf(parentCategory, req.params.id);
      if (wouldCycle) {
        return res.status(400).json({
          success: false,
          message: 'Cannot set this parent — it would create a circular reference.'
        });
      }
    }

    if (updates.customCashback !== undefined || updates.customCashbackPercentage !== undefined) {
      updates.customCashback = resolveCashback(updates);
      delete updates.customCashbackPercentage;
    }

    if (updates.name !== undefined) {
      updates.name = String(updates.name).trim();
    }

    if (req.file) {
      updates.imageUrl = await uploadCategoryImageFile(req.file);
    }

    // Apply allowed fields; save() runs pre-save slug generation
    const allow = [
      'name', 'description', 'parentCategory', 'color',
      'isActive', 'isFeatured', 'showInNavbar', 'showInHomepage',
      'position', 'customCashback', 'metaTitle', 'metaDescription',
      'imageUrl', 'iconUrl', 'bannerImageUrl'
    ];
    for (const key of allow) {
      if (updates[key] !== undefined) cat[key] = updates[key];
    }
    cat.updatedAt = new Date();
    await dualWrite(
      () => cat.save(),
      async (savedCat) => {
        const repo = getCategoryRepository();
        const pgCat = await repo.findByLegacyId(String(savedCat._id));
        if (!pgCat) {
          const err = new Error('Category not found.');
          err.code = 'NOT_FOUND';
          throw err;
        }
        const parentCategoryId = await resolvePostgresParentCategoryId(savedCat.parentCategory);
        await repo.update(
          pgCat.id,
          mapMongoCategoryToPostgresUpdate(savedCat, parentCategoryId)
        );
      },
      {
        model: 'Category',
        operation: 'update',
        mongoId: (savedCat) => String(savedCat._id)
      }
    );

    // Keep product.category (string name) in sync when renamed
    if (updates.name && updates.name !== oldName) {
      await Product.updateMany(
        { category: oldName },
        { $set: { category: updates.name } }
      );
    }

    res.json({ success: true, category: cat });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/categories/admin/:id/banner
exports.adminUploadBanner = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false, message: 'No banner image uploaded'
      });
    }
    const bannerImageUrl = await uploadBannerImageFile(req.file);
    const cat = await Category.findByIdAndUpdate(
      req.params.id,
      { bannerImageUrl, updatedAt: new Date() },
      { new: true }
    );
    if (!cat) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.json({ success: true, category: cat });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/categories/admin/:id — recursive cascade (all descendants)
exports.adminDeleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    async function collectAllDescendantIds(parentId) {
      const ids = [parentId];
      const children = await Category.find({ parentCategory: parentId }).select('_id').lean();
      for (const child of children) {
        const childIds = await collectAllDescendantIds(child._id);
        ids.push(...childIds);
      }
      return ids;
    }

    const allIds = await collectAllDescendantIds(categoryId);

    const allCategories = await Category.find({ _id: { $in: allIds } }).select('name').lean();
    const allNames = allCategories.map((c) => c.name);

    const productCount = await Product.countDocuments({ category: { $in: allNames } });

    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${productCount} product(s) are assigned to this category or its sub-categories. Reassign them first.`
      });
    }

    const idsToDelete = allIds.reverse(); // children before parents
    await dualWrite(
      () => Category.deleteMany({ _id: { $in: idsToDelete } }),
      async () => {
        const repo = getCategoryRepository();
        const pgCat = await repo.findByLegacyId(categoryId);
        if (pgCat) {
          await repo.remove(pgCat.id);
        }
      },
      {
        model: 'Category',
        operation: 'delete',
        mongoId: categoryId
      }
    );

    const subCount = idsToDelete.length - 1;
    res.json({
      success: true,
      message: `Category and ${subCount} sub-categor${subCount === 1 ? 'y' : 'ies'} deleted successfully.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/categories/admin/sync-counts — one-time / manual productCount sync
exports.adminSyncProductCounts = async (req, res) => {
  try {
    const cats = await Category.find({}).select('name').lean();
    for (const syncCat of cats) {
      const count = await Product.countDocuments({ category: syncCat.name });
      await Category.findByIdAndUpdate(syncCat._id, { productCount: count });
    }
    res.json({ success: true, message: 'All category counts synced.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/categories/admin/reorder
exports.adminReorder = async (req, res) => {
  try {
    const { order } = req.body; // [{id, position}]
    if (!Array.isArray(order)) {
      return res.status(400).json({ success: false, message: 'order must be an array' });
    }
    await Promise.all(
      order.map(item =>
        Category.findByIdAndUpdate(item.id, { position: item.position, updatedAt: new Date() })
      )
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
