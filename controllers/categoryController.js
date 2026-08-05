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

// ── PUBLIC ENDPOINTS ──

// GET /api/categories — all active categories with recursive tree structure
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .sort({ position: 1, name: 1 })
      .lean();

    const tree = buildCategoryTree(categories);
    res.json({ success: true, data: tree, flat: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/categories/tree — top-level parents with nested subCategories (storefront)
exports.getCategoryTree = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .sort({ position: 1, name: 1 })
      .select('_id name slug description imageUrl iconUrl color parentCategory position productCount showInNavbar showInHomepage isFeatured')
      .lean();

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
    const categories = await Category.find({ isActive: true })
      .sort({ position: 1, name: 1 })
      .lean();

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
    const cats = await Category.find({
      isActive: true,
      showInHomepage: true,
      parentCategory: null
    }).sort({ position: 1 }).limit(12).lean();

    res.json({ success: true, data: cats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/categories/:slug — single category with products (parent expands to children)
exports.getCategoryBySlug = async (req, res) => {
  try {
    const rawParam = String(req.params.slug || '').trim();
    const slug = rawParam.toLowerCase();
    let category = null;

    // Allow /api/categories/:id when a Mongo ObjectId is passed (UI name resolution)
    if (/^[a-f0-9]{24}$/i.test(rawParam)) {
      category = await Category.findOne({ _id: rawParam, isActive: true }).lean();
    }

    if (!category) {
      category = await Category.findOne({
        slug,
        isActive: true
      }).lean();
    }

    // Legacy docs may lack slug — match by slugified name
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

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Include self + all nested descendants (any depth)
    const allActive = await Category.find({ isActive: true })
      .sort({ position: 1, name: 1 })
      .lean();
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

    await Category.findByIdAndUpdate(category._id, { productCount: total });

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
    const category = await Category.findById(req.params.id)
      .populate('parentCategory', 'name')
      .lean();
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
    const categories = await Category.find()
      .populate('parentCategory', 'name')
      .sort({ position: 1, name: 1 })
      .lean();

    const withCounts = await Promise.all(
      categories.map(async cat => {
        const count = await Product.countDocuments({
          category: cat.name,
          status: 'active'
        });
        return { ...cat, productCount: count };
      })
    );

    res.json({ success: true, data: withCounts });
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

    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadCategoryImageFile(req.file);
    }

    const cat = new Category({
      name: name?.trim(),
      description,
      parentCategory: parentCategory || null,
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

    await cat.save();
    res.status(201).json({ success: true, category: cat });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

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
    await cat.save();

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

// DELETE /api/categories/admin/:id
exports.adminDeleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false, message: 'Category not found'
      });
    }

    const productCount = await Product.countDocuments({
      category: category.name
    });

    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete. ${productCount} products use this category. Reassign them first.`
      });
    }

    await Category.deleteMany({ parentCategory: req.params.id });
    await Category.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Category deleted' });
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
