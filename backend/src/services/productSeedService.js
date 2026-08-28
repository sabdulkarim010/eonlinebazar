const Product = require('../models/product');
const Category = require('../models/category');
const { invalidateProductCaches } = require('./cacheService');
const { DEMO_PRODUCT_ID_PREFIX, DEMO_PRODUCTS } = require('../data/demoProducts');

function toProductPayload(item) {
  const stock = Math.max(0, Number(item.stock ?? item.stockQuantity) || 0);
  const image = String(item.image || '');
  const images = Array.isArray(item.images) && item.images.length
    ? item.images
    : (image ? [image] : []);

  return {
    productId: item.productId,
    name: item.name,
    price: Number(item.price) || 0,
    buyingPrice: Number(item.buyingPrice) || 0,
    category: item.category || 'General',
    description: item.description || '',
    detailedDescription: item.detailedDescription || item.description || '',
    highlights: Array.isArray(item.highlights) ? item.highlights : [],
    stock,
    stockQuantity: stock,
    lowStockThreshold: Number(item.lowStockThreshold) || 10,
    icon: item.icon || '📦',
    image,
    images,
    status: 'active',
    hasVariants: false,
    variants: [],
  };
}

async function ensureCategories(names) {
  const unique = [...new Set(names.map((name) => String(name || '').trim()).filter(Boolean))];
  let created = 0;

  for (const name of unique) {
    const existing = await Category.findOne({ name });
    if (existing) continue;
    await Category.create({
      name,
      isActive: true,
      showInNavbar: true,
      showInHomepage: true,
    });
    created += 1;
  }

  return created;
}

/**
 * Upsert demo products by productId. Does not wipe the rest of the catalog.
 * Pass replace=true to delete previous DEMO-* rows first, then insert fresh.
 */
async function seedDemoProducts({ replace = false } = {}) {
  if (replace) {
    await Product.deleteMany({ productId: { $regex: `^${DEMO_PRODUCT_ID_PREFIX}` } });
  }

  const categoriesCreated = await ensureCategories(DEMO_PRODUCTS.map((item) => item.category));
  let created = 0;
  let updated = 0;

  for (const item of DEMO_PRODUCTS) {
    const payload = toProductPayload(item);
    const existing = await Product.findOne({ productId: payload.productId });
    if (existing) {
      await Product.updateOne({ _id: existing._id }, { $set: payload });
      updated += 1;
    } else {
      await Product.create(payload);
      created += 1;
    }
  }

  await invalidateProductCaches();

  return {
    created,
    updated,
    total: DEMO_PRODUCTS.length,
    categoriesCreated,
    productIds: DEMO_PRODUCTS.map((item) => item.productId),
  };
}

function isProductSeedAllowed() {
  if (process.env.ALLOW_PRODUCT_SEED === 'true') return true;
  if (process.env.ALLOW_PRODUCT_SEED === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

module.exports = {
  seedDemoProducts,
  isProductSeedAllowed,
  DEMO_PRODUCTS,
  DEMO_PRODUCT_ID_PREFIX,
};
