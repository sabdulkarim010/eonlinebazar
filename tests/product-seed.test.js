const request = require('supertest');
const Product = require('../backend/src/models/product');
const Category = require('../backend/src/models/category');
const { getApp } = require('./setup');
const { DEMO_PRODUCTS } = require('../backend/src/data/demoProducts');

describe('Demo product seed API', () => {
  const app = getApp();

  test('GET /api/products/seed-demo — returns demo catalog info', async () => {
    const res = await request(app).get('/api/products/seed-demo');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(DEMO_PRODUCTS.length);
    expect(res.body.productIds).toContain('DEMO-P1');
  });

  test('POST /api/products/seed-demo — upserts titles, prices, categories, and images', async () => {
    const res = await request(app)
      .post('/api/products/seed-demo')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.created).toBe(DEMO_PRODUCTS.length);

    const earbuds = await Product.findOne({ productId: 'DEMO-P1' }).lean();
    expect(earbuds).toBeTruthy();
    expect(earbuds.name).toBe('Wireless Bluetooth Earbuds');
    expect(earbuds.price).toBe(2490);
    expect(earbuds.category).toBe('Electronics');
    expect(earbuds.image).toMatch(/^https?:\/\//);

    const fashion = await Category.findOne({ name: 'Fashion' }).lean();
    expect(fashion).toBeTruthy();

    const list = await request(app).get('/api/products').query({ limit: 50 });
    expect(list.status).toBe(200);
    const ids = (list.body.products || []).map((item) => item.productId);
    expect(ids).toContain('DEMO-P1');
  });

  test('POST /api/products/seed-demo — second call updates instead of duplicating', async () => {
    await request(app).post('/api/products/seed-demo').send({});
    const second = await request(app).post('/api/products/seed-demo').send({});

    expect(second.status).toBe(200);
    expect(second.body.data.created).toBe(0);
    expect(second.body.data.updated).toBe(DEMO_PRODUCTS.length);

    const count = await Product.countDocuments({ productId: /^DEMO-/ });
    expect(count).toBe(DEMO_PRODUCTS.length);
  });
});
