/********************************************************************
 * Project: EonlineBazar
 * File: productController.js
 * Location: controllers/productController.js
 * Author: Abdul Karim Sheikh
 * Description: Handles fetching, creating, updating, and deleting products 
 * along with Cloudinary image management. Also handles customer reviews.
 ********************************************************************/

const Product = require('../models/product'); 
const Brand = require('../models/brand');
const Category = require('../models/category');
const Setting = require('../models/Setting');
const { upload } = require('../middlewares/uploadMiddleware'); // এখানে শুধু upload ইমপোর্ট হবে
const cloudinary = require('cloudinary').v2; // ক্লাউডিনারি সরাসরি এখান থেকে ইমপোর্ট করুন
const mongoose = require('mongoose');
const { parseVariants, applyProductStockFields, computeMinVariantPrice, applyPrimaryImageToVariants } = require('../utils/variantHelpers');
const { loadFlashSaleSettings, applyFlashSaleToProducts } = require('../services/flashSaleService');
const { getOrSet, invalidateProductCaches, CACHE_KEYS } = require('../services/cacheService');

const FALLBACK_PRODUCTS_PER_PAGE = 24;
/** Hard cap on ?limit= (default page size from settings stays ≤ 100). */
const MAX_PRODUCTS_PER_PAGE = 500;

/** Recount products for a category name and store on Category.productCount. */
async function syncCategoryProductCount(categoryName) {
  if (!categoryName) return;
  try {
    const count = await Product.countDocuments({ category: categoryName });
    await Category.findOneAndUpdate(
      { name: categoryName },
      { productCount: count }
    );
  } catch (err) {
    console.error('syncCategoryProductCount error:', err);
  }
}

async function resolveDefaultProductsPerPage() {
    try {
        const settings = await Setting.getOrCreate();
        const n = Number(settings.defaultProductsPerPage);
        if (Number.isFinite(n) && n >= 1) {
            return Math.min(MAX_PRODUCTS_PER_PAGE, Math.max(1, Math.floor(n)));
        }
    } catch (_err) { /* fall through to hardcoded default */ }
    return FALLBACK_PRODUCTS_PER_PAGE;
}

async function parseProductPagination(req) {
    const defaultLimit = await resolveDefaultProductsPerPage();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(
        MAX_PRODUCTS_PER_PAGE,
        Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit)
    );
    return { page, limit, skip: (page - 1) * limit };
}

function buildPaginationMeta(totalProducts, currentPage, limit) {
    const total = Math.max(0, Number(totalProducts) || 0);
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    return {
        totalProducts: total,
        currentPage,
        totalPages,
        limit,
        hasMore: currentPage < totalPages
    };
}

function parseHasVariants(raw) {
    if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
    if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
    return undefined;
}

/**
 * 🌟 হেল্পার: brand ফিল্ড রিসলভ করা। বৈধ ObjectId হলে সেই ব্র্যান্ড খুঁজে
 * { brand, brandName } রিটার্ন করে। খালি/অবৈধ হলে রেফারেন্স ক্লিয়ার করে।
 */
/**
 * 🌟 হেল্পার: highlights/tags-এর মতো অ্যারে ফিল্ড পার্স করা। JSON string,
 * কমা-সেপারেটেড string বা array — সব ফরম্যাট গ্রহণ করে পরিষ্কার অ্যারে দেয়।
 */
function parseStringArray(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(v => String(v).trim()).filter(Boolean);
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.map(v => String(v).trim()).filter(Boolean);
        } catch (e) { /* JSON নয়, নিচে কমা-সেপারেটেড হিসেবে ধরা হবে */ }
        return raw.split(',').map(v => v.trim()).filter(Boolean);
    }
    return [];
}

// রেগেক্স স্পেশাল ক্যারেক্টার এস্কেপ (ইনজেকশন-নিরাপদ কিওয়ার্ড সার্চ)
function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveBrand(brandInput) {
    if (!brandInput || brandInput === 'null' || brandInput === 'undefined') {
        return { brand: null, brandName: '' };
    }
    if (!mongoose.Types.ObjectId.isValid(brandInput)) {
        return { brand: null, brandName: '' };
    }
    const brandDoc = await Brand.findById(brandInput);
    if (!brandDoc) return { brand: null, brandName: '' };
    return { brand: brandDoc._id, brandName: brandDoc.name };
}

// ১. প্রোডাক্ট লিস্ট (পাবলিক) — ?page=1&limit=24
const getProducts = async (req, res) => {
    try {
        const { page, limit, skip } = await parseProductPagination(req);

        const [totalProducts, products, flashSettings] = await Promise.all([
            Product.countDocuments(),
            Product.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            loadFlashSaleSettings()
        ]);

        const enriched = applyFlashSaleToProducts(products, flashSettings);
        res.json({
            products: enriched,
            pagination: buildPaginationMeta(totalProducts, page, limit)
        });
    } catch (err) {
        console.error("Error fetching products:", err);
        res.status(500).json({ success: false, message: "Failed to fetch products" });
    }
};

/**
 * Resolve comma-separated brand slugs/IDs to ObjectId array.
 */
async function resolveBrandFilterIds(brandParam) {
    if (!brandParam) return [];
    const tokens = String(brandParam).split(',').map(s => s.trim()).filter(Boolean);
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

/**
 * Resolve category slug/ID/name to Product.category name strings.
 * Expands to the matched category AND all nested descendant sub-categories
 * (recursive), so a parent scope includes products filed under any child.
 */
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

    if (!matched) {
        // Unknown token — keep legacy exact-name match behavior
        return [token];
    }

    // BFS: self + all nested descendants at any depth
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

/**
 * Build text-search $or conditions for keyword q.
 */
async function buildTextSearchConditions(q) {
    const trimmed = String(q || '').trim();
    if (!trimmed) return null;

    const words = trimmed.split(/\s+/).filter(Boolean);
    const phraseRegex = new RegExp(escapeRegex(trimmed), 'i');
    const wordRegexes = words.map(w => new RegExp(escapeRegex(w), 'i'));

    const brandIds = await Brand.find({ name: phraseRegex }).distinct('_id');

    const searchableFields = [
        'name', 'description', 'detailedDescription',
        'category', 'brandName', 'tags', 'highlights'
    ];

    const orConditions = [];
    searchableFields.forEach(field => orConditions.push({ [field]: phraseRegex }));
    wordRegexes.forEach(re => {
        searchableFields.forEach(field => orConditions.push({ [field]: re }));
    });
    if (brandIds.length > 0) {
        orConditions.push({ brand: { $in: brandIds } });
    }

    return { $or: orConditions };
}

function buildSortOption(sortParam) {
    switch (String(sortParam || '').toLowerCase()) {
        case 'oldest':      return { createdAt: 1 };
        case 'price_asc':   return { price: 1 };
        case 'price_desc':  return { price: -1 };
        case 'rating_desc':
        case 'rating':
        case 'top':         return { rating: -1, numOfReviews: -1 };
        case 'popular':     return { numOfReviews: -1, rating: -1 };
        case 'relevance':   return { rating: -1, numOfReviews: -1, createdAt: -1 };
        case 'newest':
        default:            return { createdAt: -1 };
    }
}

/**
 * 🌟 ১বি. অ্যাডভান্সড সার্চ (পাবলিক) — GET /api/products/search
 * ------------------------------------------------------------------
 * Query params: q, minPrice, maxPrice, brand, category, rating, sort,
 *               inStock, page, limit
 */
const searchProducts = async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        const minPrice = req.query.minPrice != null && req.query.minPrice !== ''
            ? Number(req.query.minPrice) : null;
        const maxPrice = req.query.maxPrice != null && req.query.maxPrice !== ''
            ? Number(req.query.maxPrice) : null;
        const rating = req.query.rating != null && req.query.rating !== ''
            ? Number(req.query.rating) : null;
        const inStock = String(req.query.inStock || '').toLowerCase();
        const sort = String(req.query.sort || 'newest').toLowerCase();

        const { page, limit, skip } = await parseProductPagination(req);

        const filter = {};

        const textFilter = await buildTextSearchConditions(q);
        if (textFilter) Object.assign(filter, textFilter);

        if (minPrice != null && !Number.isNaN(minPrice)) {
            filter.price = filter.price || {};
            filter.price.$gte = minPrice;
        }
        if (maxPrice != null && !Number.isNaN(maxPrice)) {
            filter.price = filter.price || {};
            filter.price.$lte = maxPrice;
        }

        const brandIds = await resolveBrandFilterIds(req.query.brand);
        if (brandIds.length === 1) filter.brand = brandIds[0];
        else if (brandIds.length > 1) filter.brand = { $in: brandIds };

        const categoryNames = await resolveCategoryFilterNames(req.query.category);
        if (categoryNames.length > 0) {
            // Parent expands to parent + child names via $in (e.g. Mobile + Walton Mobile)
            filter.category = { $in: categoryNames };
        }

        if (rating != null && !Number.isNaN(rating) && rating >= 1 && rating <= 5) {
            filter.rating = { $gte: rating };
        }

        if (inStock === 'true') {
            filter.stockQuantity = { $gt: 0 };
        } else if (inStock === 'false') {
            filter.stockQuantity = 0;
        }

        const sortOption = buildSortOption(sort);

        const [
            total,
            products,
            flashSettings,
            priceStats,
            brandAgg,
            categoryList
        ] = await Promise.all([
            Product.countDocuments(filter),
            Product.find(filter).sort(sortOption).skip(skip).limit(limit),
            loadFlashSaleSettings(),
            Product.aggregate([
                { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }
            ]),
            Product.aggregate([
                { $match: { brand: { $ne: null } } },
                { $group: { _id: '$brand', productCount: { $sum: 1 } } },
                { $sort: { productCount: -1 } }
            ]),
            Product.distinct('category')
        ]);

        const enrichedProducts = applyFlashSaleToProducts(products, flashSettings);

        const brandObjectIds = brandAgg.map(b => b._id).filter(Boolean);
        const brandDocs = brandObjectIds.length
            ? await Brand.find({ _id: { $in: brandObjectIds }, status: 'active' })
                .select('name slug')
                .lean()
            : [];

        const brandCountMap = new Map(
            brandAgg.map(b => [String(b._id), b.productCount])
        );

        const availableBrands = brandDocs
            .map(b => ({
                _id: b._id,
                name: b.name,
                slug: b.slug,
                productCount: brandCountMap.get(String(b._id)) || 0
            }))
            .sort((a, b) => b.productCount - a.productCount);

        const availableCategories = categoryList
            .filter(Boolean)
            .map(name => ({ name }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const priceRange = priceStats[0]
            ? { min: priceStats[0].min || 0, max: priceStats[0].max || 0 }
            : { min: 0, max: 0 };

        const pagination = buildPaginationMeta(total, page, limit);

        return res.json({
            success: true,
            products: enrichedProducts,
            pagination,
            data: {
                products: enrichedProducts,
                pagination: {
                    ...pagination,
                    // Legacy aliases for older storefront clients
                    page: pagination.currentPage,
                    total: pagination.totalProducts
                },
                filters: {
                    appliedFilters: {
                        q: q || undefined,
                        minPrice: minPrice != null && !Number.isNaN(minPrice) ? minPrice : undefined,
                        maxPrice: maxPrice != null && !Number.isNaN(maxPrice) ? maxPrice : undefined,
                        brand: req.query.brand || undefined,
                        category: req.query.category || undefined,
                        rating: rating != null && !Number.isNaN(rating) ? rating : undefined,
                        sort: sort || 'newest',
                        inStock: inStock === 'true' || inStock === 'false' ? inStock : undefined
                    },
                    priceRange,
                    availableBrands,
                    availableCategories
                }
            }
        });
    } catch (err) {
        console.error('Product Search Error:', err);
        res.status(500).json({ success: false, message: 'Search failed. Please try again.' });
    }
};

// ২. নতুন প্রোডাক্ট যোগ করা (অ্যাডমিন)
const createProduct = async (req, res) => {
    try {
        // 🐛 ডিবাগিংয়ের জন্য: ফ্রন্টএন্ড থেকে কী ডাটা আসছে তা টার্মিনালে প্রিন্ট করবে
        console.log("Request Body:", req.body); 
        console.log("Files received:", req.files ? req.files.length : 0);

        const { id, name, price, buyingPrice, stock, stockQuantity, lowStockThreshold, category, brand, variants, hasVariants, icon, description, detailedDescription, highlights, tags } = req.body;
        
        const parsedHighlights = parseStringArray(highlights);
        const parsedTags = parseStringArray(tags);

        const { brand: brandRef, brandName } = await resolveBrand(brand);
        const parsedVariants = parseVariants(variants);
        const explicitHasVariants = parseHasVariants(hasVariants);

        let newProductData = applyProductStockFields({
            productId: id || `PROD-${Date.now()}`, 
            name: name || description || 'Unnamed Product',
            price: Number(price) || 0,
            buyingPrice: Number(buyingPrice) || 0,
            hasVariants: explicitHasVariants !== undefined ? explicitHasVariants : parsedVariants.length > 0,
            stockQuantity: Number(stockQuantity ?? stock) || 0,
            lowStockThreshold: Number(lowStockThreshold) || 10,
            stock: Number(stock) || 0,
            category: req.body.category || '', // category name string (not ObjectId)
            brand: brandRef,
            brandName: brandName,
            variants: parsedVariants,
            icon: icon || '📦',
            description: description || '',
            detailedDescription: detailedDescription || '', 
            highlights: parsedHighlights,
            tags: parsedTags,
            images: [] 
        });

        if (req.files && req.files.length > 0) {
            let uploadedUrls = [];
            for (const file of req.files) {
                const b64 = Buffer.from(file.buffer).toString("base64");
                const dataURI = "data:" + file.mimetype + ";base64," + b64;
                const result = await cloudinary.uploader.upload(dataURI, { folder: 'eonlinebazar' });
                uploadedUrls.push(result.secure_url);
            }
            newProductData.image = uploadedUrls[0]; 
            newProductData.images = uploadedUrls;
            if (newProductData.hasVariants && newProductData.variants?.length) {
                newProductData.variants = applyPrimaryImageToVariants(newProductData.variants, uploadedUrls[0]);
            }
        }

        const newProduct = new Product(newProductData);
        await newProduct.save();
        await syncCategoryProductCount(newProduct.category);
        await invalidateProductCaches();
        res.status(201).json({ success: true, message: "Product added successfully!", data: newProduct });
    } catch (err) {
        console.error("Product Add Error:", err);
        // 🚀 ফিক্স: এখন ফ্রন্টএন্ডের নেটওয়ার্ক ট্যাবে আসল এররটি দেখা যাবে
        res.status(500).json({ 
            success: false, 
            message: "Failed to add new product",
            errorDetail: err.message // এটি দেখে আমরা বুঝতে পারব সমস্যা কোথায়
        });
    }
};



// ৩. প্রোডাক্ট এডিট করা (অ্যাডমিন)
const updateProduct = async (req, res) => {
    try {
        const productIdParam = req.params.id;
        const { name, price, buyingPrice, stock, stockQuantity, lowStockThreshold, category, brand, variants, hasVariants, icon, description, detailedDescription, highlights, tags } = req.body;

        let updateFields = {};
        if (name) updateFields.name = name;
        if (category !== undefined) updateFields.category = req.body.category || ''; // category name string
        if (icon) updateFields.icon = icon.trim();
        if (lowStockThreshold !== undefined && lowStockThreshold !== '') {
            updateFields.lowStockThreshold = Number(lowStockThreshold) || 10;
        }

        if (brand !== undefined) {
            const { brand: brandRef, brandName } = await resolveBrand(brand);
            updateFields.brand = brandRef;
            updateFields.brandName = brandName;
        }

        const explicitHasVariants = parseHasVariants(hasVariants);
        if (variants !== undefined || explicitHasVariants !== undefined || stockQuantity !== undefined || stock !== undefined) {
            const existingProduct = await Product.findOne(
                mongoose.Types.ObjectId.isValid(productIdParam) ? { _id: productIdParam } : { productId: String(productIdParam) }
            );

            const nextVariants = variants !== undefined
                ? parseVariants(variants)
                : (existingProduct?.variants || []);

            const nextHasVariants = explicitHasVariants !== undefined
                ? explicitHasVariants
                : (existingProduct?.hasVariants || false);

            const stockPayload = applyProductStockFields({
                hasVariants: nextHasVariants,
                variants: nextVariants,
                stockQuantity: stockQuantity !== undefined ? Number(stockQuantity) : (existingProduct?.stockQuantity ?? existingProduct?.stock ?? 0),
                stock: stock !== undefined ? Number(stock) : (existingProduct?.stock ?? 0)
            });

            updateFields.hasVariants = stockPayload.hasVariants;
            updateFields.variants = stockPayload.variants;
            updateFields.stockQuantity = stockPayload.stockQuantity;
            updateFields.stock = stockPayload.stock;
            if (stockPayload.hasVariants) {
                const minPrice = computeMinVariantPrice(stockPayload.variants, Number(price) || existingProduct?.price || 0);
                if (minPrice > 0) updateFields.price = minPrice;
                else if (price) updateFields.price = Number(price);
                if (Number(stockPayload.buyingPrice) > 0) {
                    updateFields.buyingPrice = stockPayload.buyingPrice;
                } else if (buyingPrice !== undefined && buyingPrice !== '') {
                    updateFields.buyingPrice = Number(buyingPrice) || 0;
                }
            } else {
                if (price) updateFields.price = Number(price);
                if (buyingPrice !== undefined && buyingPrice !== '') {
                    updateFields.buyingPrice = Number(buyingPrice) || 0;
                }
            }
        } else {
            if (price) updateFields.price = Number(price);
            if (buyingPrice !== undefined && buyingPrice !== '') {
                updateFields.buyingPrice = Number(buyingPrice) || 0;
            }
        }
        if (description) updateFields.description = description;
        if (detailedDescription) updateFields.detailedDescription = detailedDescription;

        if (highlights !== undefined) {
            updateFields.highlights = parseStringArray(highlights);
        }
        if (tags !== undefined) {
            updateFields.tags = parseStringArray(tags);
        }

        let query = mongoose.Types.ObjectId.isValid(productIdParam) ? { _id: productIdParam } : { productId: String(productIdParam) }; 

        let oldCategoryName = null;
        if (category !== undefined) {
            const existingForCat = await Product.findOne(query).select('category').lean();
            oldCategoryName = existingForCat?.category || null;
        }

        if (req.files && req.files.length > 0) {
            const existingProduct = await Product.findOne(query);
            
            if (existingProduct) {
                const imagesToDelete = existingProduct.images && existingProduct.images.length > 0 
                                       ? existingProduct.images 
                                       : (existingProduct.image ? [existingProduct.image] : []);
                
                for (const imgUrl of imagesToDelete) {
                    if (imgUrl.includes('cloudinary.com')) {
                        try {
                            const urlParts = imgUrl.split('/');
                            const filename = urlParts[urlParts.length - 1].split('.')[0];        
                            const folder = urlParts[urlParts.length - 2];      
                            const publicId = `${folder}/${filename}`;
                            await cloudinary.uploader.destroy(publicId);
                        } catch (cloudinaryErr) {
                            console.error("Cloudinary Delete Error:", cloudinaryErr);
                        }
                    }
                }
            }

            let uploadedUrls = [];
            for (const file of req.files) {
                const b64 = Buffer.from(file.buffer).toString("base64");
                const dataURI = "data:" + file.mimetype + ";base64," + b64;
                const result = await cloudinary.uploader.upload(dataURI, { folder: 'eonlinebazar' });
                uploadedUrls.push(result.secure_url);
            }
            updateFields.image = uploadedUrls[0]; 
            updateFields.images = uploadedUrls;
            if (updateFields.variants?.length) {
                updateFields.variants = applyPrimaryImageToVariants(updateFields.variants, uploadedUrls[0]);
            } else if (existingProduct?.variants?.length) {
                updateFields.variants = applyPrimaryImageToVariants(existingProduct.variants, uploadedUrls[0]);
            }
        }

        const updatedProduct = await Product.findOneAndUpdate(query, { $set: updateFields }, { returnDocument: 'after' });
        if (!updatedProduct) return res.status(404).json({ success: false, message: "Product not found!" });

        if (category !== undefined) {
            const newCategoryName = updatedProduct.category || '';
            if (String(oldCategoryName || '') !== String(newCategoryName || '')) {
                await syncCategoryProductCount(oldCategoryName);
                await syncCategoryProductCount(newCategoryName);
            }
        }

        await invalidateProductCaches(productIdParam);

        res.json({ success: true, message: "Product updated successfully!", data: updatedProduct });
    } catch (err) {
        console.error("Product Update Error:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ৪. প্রোডাক্ট ডিলিট করা (অ্যাডমিন)
const deleteProduct = async (req, res) => {
    try {
        const productIdParam = req.params.id;
        let query = mongoose.Types.ObjectId.isValid(productIdParam) ? { _id: productIdParam } : { productId: String(productIdParam) }; 

        const productToDelete = await Product.findOne(query);
        if (!productToDelete) return res.status(404).json({ success: false, message: "Product not found!" });

        const imagesToDelete = productToDelete.images && productToDelete.images.length > 0 
                               ? productToDelete.images 
                               : (productToDelete.image ? [productToDelete.image] : []);

        for (const imgUrl of imagesToDelete) {
            if (imgUrl.includes('cloudinary.com')) {
                try {
                    const urlParts = imgUrl.split('/');
                    const filename = urlParts[urlParts.length - 1].split('.')[0];        
                    const folder = urlParts[urlParts.length - 2];      
                    const publicId = `${folder}/${filename}`;
                    await cloudinary.uploader.destroy(publicId);
                } catch (err) {
                    console.error("Cloudinary Delete Error:", err);
                }
            }
        }

        await Product.findOneAndDelete(query);
        await syncCategoryProductCount(productToDelete.category);
        await invalidateProductCaches(productIdParam);
        res.json({ success: true, message: "Product and its images deleted successfully!" });
    } catch (err) {
        console.error("Product Delete Error:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ৫. সিঙ্গেল প্রোডাক্টের বিস্তারিত তথ্য দেখা (পাবলিক)
const getProductById = async (req, res) => {
    try {
        const productIdParam = req.params.id;
        let query = mongoose.Types.ObjectId.isValid(productIdParam) ? { _id: productIdParam } : { productId: String(productIdParam) };

        const product = await getOrSet(CACHE_KEYS.PRODUCT(productIdParam), async () => {
            return Product.findOne(query).lean();
        }, 300);

        if (!product) return res.status(404).json({ success: false, message: "Product not found!" });
        res.json(product);
    } catch (err) {
        console.error("Error fetching single product:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};


module.exports = { 
    getProducts, 
    searchProducts, // 🌟 অ্যাডভান্সড সার্চ এক্সপোর্ট
    createProduct, 
    updateProduct, 
    deleteProduct, 
    getProductById,
};




