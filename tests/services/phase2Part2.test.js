/********************************************************************
 * Phase 2.1 — Admin product search RBAC, PO routedRead, variant GRN
 ********************************************************************/

const request = require('supertest');
const Product = require('../../backend/src/models/product');
const { getApp, createTestAdmin } = require('../setup');
const { seedDefaultWarehouse } = require('../../backend/src/services/warehouseService');

describe('Phase 2.1 — admin search, PO fallback, variant receive', () => {
    const app = getApp();
    const originalPoFlag = process.env.READ_PG_PURCHASE_ORDER;
    const originalProductFlag = process.env.READ_PG_PRODUCT;

    afterEach(() => {
        if (originalPoFlag !== undefined) process.env.READ_PG_PURCHASE_ORDER = originalPoFlag;
        else delete process.env.READ_PG_PURCHASE_ORDER;
        if (originalProductFlag !== undefined) process.env.READ_PG_PRODUCT = originalProductFlag;
        else delete process.env.READ_PG_PRODUCT;
        jest.restoreAllMocks();
    });

    function auth(token) {
        return { Authorization: `Bearer ${token}` };
    }

    async function adminToken(permissions) {
        const { username, password } = await createTestAdmin(
            permissions ? { role: 'staff', permissions } : undefined
        );
        const res = await request(app)
            .post('/admin/api/login')
            .send({ username, password });
        expect(res.status).toBe(200);
        return res.body.token;
    }

    test('GET /api/admin/products/search requires authentication', async () => {
        const res = await request(app).get('/api/admin/products/search');
        expect(res.status).toBe(401);
    });

    test('GET /api/admin/products/search rejects staff without view_products', async () => {
        const token = await adminToken(['manage_coupons']);
        const res = await request(app)
            .get('/api/admin/products/search')
            .set(auth(token));
        expect(res.status).toBe(403);
    });

    test('GET /api/admin/products/search succeeds for view_products staff', async () => {
        process.env.READ_PG_PRODUCT = 'false';
        const token = await adminToken(['view_products']);
        await Product.create({
            productId: `ADM-SEARCH-${Date.now()}`,
            name: 'Admin Search Fixture',
            price: 100,
            stockQuantity: 5,
            stock: 5
        });

        const res = await request(app)
            .get('/api/admin/products/search')
            .query({ q: 'Admin Search Fixture', limit: 10 })
            .set(auth(token));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.products)).toBe(true);
    });

    test('PO list falls back to Mongo when PG read fails', async () => {
        process.env.READ_PG_PURCHASE_ORDER = 'true';
        const poRepo = require('../../backend/src/repositories/purchaseOrderRepository');
        jest.spyOn(poRepo, 'listPurchaseOrdersFromPG').mockRejectedValue(new Error('Neon timeout'));

        const token = await adminToken();
        const supplierRes = await request(app)
            .post('/api/admin/suppliers')
            .set(auth(token))
            .send({ name: 'Fallback Supplier', phone: '01710000001' });
        expect(supplierRes.status).toBe(201);

        const product = await Product.create({
            productId: `PO-FB-${Date.now()}`,
            name: 'PO Fallback Product',
            price: 50,
            stockQuantity: 0,
            stock: 0
        });

        await seedDefaultWarehouse();
        const po = await request(app)
            .post('/api/admin/purchase-orders')
            .set(auth(token))
            .send({
                supplierId: supplierRes.body.data._id,
                items: [{ productId: product._id, qty: 2, unitCost: 10 }]
            });
        expect(po.status).toBe(201);

        const list = await request(app)
            .get('/api/admin/purchase-orders')
            .set(auth(token));

        expect(list.status).toBe(200);
        expect(list.body.success).toBe(true);
        expect(list.body.pagination.total).toBeGreaterThanOrEqual(1);
    });

    test('receiving a variant PO line increments variant and parent stock', async () => {
        const token = await adminToken();
        await seedDefaultWarehouse();

        const supplierRes = await request(app)
            .post('/api/admin/suppliers')
            .set(auth(token))
            .send({ name: 'Variant Supplier', phone: '01710000002' });
        expect(supplierRes.status).toBe(201);

        const product = await Product.create({
            productId: `VAR-PO-${Date.now()}`,
            name: 'Variant PO Product',
            price: 200,
            hasVariants: true,
            variants: [
                { sku: 'VAR-RED-S', attribute: 'Color', value: 'Red', price: 200, stock: 2 },
                { sku: 'VAR-BLU-M', attribute: 'Color', value: 'Blue', price: 210, stock: 4 }
            ],
            stockQuantity: 6,
            stock: 6
        });

        const po = await request(app)
            .post('/api/admin/purchase-orders')
            .set(auth(token))
            .send({
                supplierId: supplierRes.body.data._id,
                items: [{
                    productId: product._id,
                    qty: 3,
                    unitCost: 120,
                    variantSku: 'VAR-RED-S'
                }]
            });
        expect(po.status).toBe(201);

        const itemId = po.body.data.items[0]._id;
        const received = await request(app)
            .post(`/api/admin/purchase-orders/${po.body.data._id}/receive`)
            .set(auth(token))
            .send({ items: [{ itemId, receivedQty: 3, variantSku: 'VAR-RED-S' }] });

        expect(received.status).toBe(200);

        const reloaded = await Product.findById(product._id).lean();
        expect(reloaded.stockQuantity).toBe(9);
        expect(reloaded.stock).toBe(9);
        expect(reloaded.variants.find((v) => v.sku === 'VAR-RED-S').stock).toBe(5);
        expect(reloaded.variants.find((v) => v.sku === 'VAR-BLU-M').stock).toBe(4);
    });
});
