const {
  seedDemoProducts,
  isProductSeedAllowed,
  DEMO_PRODUCTS,
} = require('../services/productSeedService');

const getSeedDemoInfo = (req, res) => {
  if (!isProductSeedAllowed()) {
    return res.status(403).json({
      success: false,
      message: 'Product seeding is disabled in production. Use npm run seed:products on a trusted machine, or set ALLOW_PRODUCT_SEED=true.',
    });
  }

  return res.json({
    success: true,
    message: 'POST /api/products/seed-demo to upsert demo products into MongoDB.',
    count: DEMO_PRODUCTS.length,
    productIds: DEMO_PRODUCTS.map((item) => item.productId),
  });
};

const seedDemoProductsHandler = async (req, res) => {
  try {
    if (!isProductSeedAllowed()) {
      return res.status(403).json({
        success: false,
        message: 'Product seeding is disabled in production. Set ALLOW_PRODUCT_SEED=true to enable this route.',
      });
    }

    const replace = req.body?.replace === true || String(req.query.replace || '') === '1';
    const result = await seedDemoProducts({ replace });

    return res.json({
      success: true,
      message: replace
        ? 'Demo products replaced and upserted.'
        : 'Demo products upserted into the live catalog.',
      data: result,
    });
  } catch (error) {
    console.error('Demo product seed failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to seed demo products.',
    });
  }
};

module.exports = {
  getSeedDemoInfo,
  seedDemoProductsHandler,
};
