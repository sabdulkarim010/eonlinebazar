/********************************************************************
 * Phase 1.2 — Server-side low-stock search filter
 ********************************************************************/

const request = require('supertest');
const Product = require('../../backend/src/models/product');
const { searchProducts } = require('../../backend/src/services/productReadService');
const { getApp } = require('../setup');

describe('Phase 1.2 — server-side low stock filter', () => {
    const app = getApp();
    const originalProductFlag = process.env.READ_PG_PRODUCT;

    afterEach(() => {
        if (originalProductFlag !== undefined) process.env.READ_PG_PRODUCT = originalProductFlag;
        else delete process.env.READ_PG_PRODUCT;
    });

    async function seedLowStockFixtures() {
        const suffix = Date.now();
        await Product.insertMany([
            {
                productId: `LOW-A-${suffix}`,
                name: `Low Stock A ${suffix}`,
                price: 100,
                stockQuantity: 3,
                lowStockThreshold: 10
            },
            {
                productId: `LOW-B-${suffix}`,
                name: `Healthy Stock B ${suffix}`,
                price: 100,
                stockQuantity: 15,
                lowStockThreshold: 10
            },
            {
                productId: `LOW-C-${suffix}`,
                name: `Out Of Stock C ${suffix}`,
                price: 100,
                stockQuantity: 0,
                lowStockThreshold: 10
            },
            {
                productId: `LOW-D-${suffix}`,
                name: `Low Custom D ${suffix}`,
                price: 100,
                stockQuantity: 4,
                lowStockThreshold: 5
            }
        ]);
        return suffix;
    }

    test('lowStock=true returns only in-threshold products with accurate total', async () => {
        process.env.READ_PG_PRODUCT = 'false';
        const suffix = await seedLowStockFixtures();

        const res = await request(app)
            .get('/api/products/search')
            .query({ lowStock: 'true', q: String(suffix), limit: 50 });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const names = (res.body.products || []).map((p) => p.name);
        expect(names.some((n) => n.includes('Low Stock A'))).toBe(true);
        expect(names.some((n) => n.includes('Low Custom D'))).toBe(true);
        expect(names.some((n) => n.includes('Healthy Stock B'))).toBe(false);
        expect(names.some((n) => n.includes('Out Of Stock C'))).toBe(false);
        expect(res.body.total).toBe(2);
        expect(res.body.pagination.totalProducts).toBe(2);
    });

    test('productReadService.searchProducts paginates low-stock results before returning', async () => {
        process.env.READ_PG_PRODUCT = 'false';
        const suffix = Date.now();
        const rows = Array.from({ length: 12 }, (_, index) => ({
            productId: `LOW-PAGE-${suffix}-${index}`,
            name: `Paged Low ${suffix}-${index}`,
            price: 50,
            stockQuantity: 2,
            lowStockThreshold: 10
        }));
        await Product.insertMany(rows);

        const req = {
            query: {
                lowStock: 'true',
                q: String(suffix),
                page: '2',
                limit: '5'
            }
        };

        const result = await searchProducts(req);

        expect(result.success).toBe(true);
        expect(result.total).toBe(12);
        expect(result.page).toBe(2);
        expect(result.pages).toBe(3);
        expect(result.products).toHaveLength(5);
    });
});
