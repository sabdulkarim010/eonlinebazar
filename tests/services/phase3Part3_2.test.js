/********************************************************************
 * Phase 3.2 — Inventory intelligence: velocity, ROP, auto PO
 ********************************************************************/

const request = require('supertest');
const Order = require('../../backend/src/models/order');
const Product = require('../../backend/src/models/product');
const PurchaseOrder = require('../../backend/src/models/purchaseOrder');
const Supplier = require('../../backend/src/models/supplier');
const {
    calculateDailySalesVelocity,
    calculateDynamicRop,
    aggregateSalesFromOrders,
    scanInventoryIntelligence,
    generateAutoDraftPurchaseOrders
} = require('../../backend/src/services/inventoryIntelligenceService');
const { getApp, createTestAdmin, createTestUser } = require('../setup');

describe('Phase 3.2 — inventory intelligence', () => {
    const app = getApp();

    async function adminToken() {
        const { username, password } = await createTestAdmin();
        const res = await request(app)
            .post('/admin/api/login')
            .send({ username, password });
        expect(res.status).toBe(200);
        return res.body.token;
    }

    function auth(token) {
        return { Authorization: `Bearer ${token}` };
    }

    test('calculateDailySalesVelocity and dynamic ROP formulas', () => {
        expect(calculateDailySalesVelocity(60, 30)).toBe(2);
        expect(calculateDailySalesVelocity(0, 30)).toBe(0);

        const withHistory = calculateDynamicRop({
            dailySalesVelocity: 2,
            leadTimeDays: 7,
            safetyStock: 10,
            hasSalesHistory: true
        });
        expect(withHistory.usedDynamicRop).toBe(true);
        expect(withHistory.calculatedRop).toBe(24);

        const fallback = calculateDynamicRop({
            dailySalesVelocity: 0,
            leadTimeDays: 7,
            safetyStock: 10,
            hasSalesHistory: false
        });
        expect(fallback.usedDynamicRop).toBe(false);
        expect(fallback.calculatedRop).toBe(10);
    });

    test('aggregateSalesFromOrders sums units from recent fulfilled orders', async () => {
        const { user } = await createTestUser();
        const product = await Product.create({
            productId: `INT-VEL-${Date.now()}`,
            name: 'Velocity Product',
            price: 500,
            stock: 50,
            stockQuantity: 50
        });

        await Order.create({
            orderId: `INT-ORD-A-${Date.now()}`,
            user: user._id,
            customerName: 'Intel Customer',
            customerPhone: user.mobile,
            customerAddress: 'Dhaka',
            subTotal: 1500,
            grandTotal: 1500,
            items: [{
                productId: product._id,
                name: product.name,
                price: 500,
                quantity: 3
            }],
            status: 'Delivered',
            paymentMethod: 'COD',
            createdAt: new Date()
        });

        await Order.create({
            orderId: `INT-ORD-B-${Date.now()}`,
            user: user._id,
            customerName: 'Intel Customer',
            customerPhone: user.mobile,
            customerAddress: 'Dhaka',
            subTotal: 1000,
            grandTotal: 1000,
            items: [{
                productId: product._id,
                name: product.name,
                price: 500,
                quantity: 2
            }],
            status: 'Shipped',
            paymentMethod: 'COD',
            createdAt: new Date()
        });

        const salesMap = await aggregateSalesFromOrders(30);
        const key = `${String(product._id)}::`;
        const totalKey = [...salesMap.keys()].find((k) => k.startsWith(String(product._id)));
        expect(salesMap.get(totalKey)).toBe(5);
    });

    test('scanInventoryIntelligence flags REORDER_NEEDED when stock <= ROP', async () => {
        const supplier = await Supplier.create({ name: 'Intel Supplier', status: 'active' });
        const product = await Product.create({
            productId: `INT-ROP-${Date.now()}`,
            name: 'ROP Product',
            price: 800,
            stock: 3,
            stockQuantity: 3,
            lowStockThreshold: 10,
            reorderPoint: 10,
            supplierId: supplier._id,
            buyingPrice: 400
        });

        const { user } = await createTestUser();
        await Order.create({
            orderId: `INT-ROP-ORD-${Date.now()}`,
            user: user._id,
            customerName: 'ROP Customer',
            customerPhone: user.mobile,
            customerAddress: 'Dhaka',
            subTotal: 2400,
            grandTotal: 2400,
            items: [{
                productId: product._id,
                name: product.name,
                price: 800,
                quantity: 30
            }],
            status: 'Delivered',
            paymentMethod: 'COD',
            createdAt: new Date()
        });

        const snapshot = await scanInventoryIntelligence({ windowDays: 30, leadTimeDays: 7 });
        const row = snapshot.products.find((p) => String(p.productMongoId) === String(product._id));
        expect(row).toBeTruthy();
        expect(row.salesVelocity).toBe(1);
        expect(row.calculatedRop).toBeGreaterThan(3);
        expect(row.status).toBe('REORDER_NEEDED');
        expect(row.reorderSuggestedQuantity).toBeGreaterThan(0);
    });

    test('generateAutoDraftPurchaseOrders groups by supplier and skips duplicate open PO lines', async () => {
        const supplier = await Supplier.create({ name: 'Auto PO Supplier', status: 'active' });
        const productA = await Product.create({
            productId: `INT-A-${Date.now()}`,
            name: 'Auto PO Product A',
            price: 600,
            stock: 2,
            stockQuantity: 2,
            lowStockThreshold: 10,
            supplierId: supplier._id,
            buyingPrice: 300
        });
        const productB = await Product.create({
            productId: `INT-B-${Date.now()}`,
            name: 'Auto PO Product B',
            price: 700,
            stock: 1,
            stockQuantity: 1,
            lowStockThreshold: 10,
            supplierId: supplier._id,
            buyingPrice: 350
        });

        await PurchaseOrder.create({
            poNumber: `PO-TEST-DUP-${Date.now()}`,
            supplierId: supplier._id,
            status: 'draft',
            items: [{
                productId: productA._id,
                productName: productA.name,
                qty: 5,
                unitCost: 300,
                receivedQty: 0
            }]
        });

        const snapshot = await scanInventoryIntelligence({ windowDays: 30 });
        const result = await generateAutoDraftPurchaseOrders({ snapshot });

        expect(result.purchaseOrders.length).toBeGreaterThanOrEqual(1);
        expect(result.skipped.some((s) => String(s.productMongoId) === String(productA._id))).toBe(true);

        const pos = await PurchaseOrder.find({ supplierId: supplier._id, status: 'draft' }).lean();
        expect(pos.length).toBe(1);

        const allProductIds = pos.flatMap((po) => (po.items || []).map((i) => String(i.productId)));
        expect(allProductIds).toContain(String(productB._id));
        expect(allProductIds.filter((id) => id === String(productA._id)).length).toBe(1);
    });

    test('GET /api/admin/inventory-intelligence/velocity returns metrics', async () => {
        const token = await adminToken();
        const res = await request(app)
            .get('/api/admin/inventory-intelligence/velocity')
            .query({ refresh: 'true' })
            .set(auth(token));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data.products)).toBe(true);
        expect(res.body.data).toHaveProperty('reorderNeededCount');
    });

    test('POST /api/admin/inventory-intelligence/trigger-auto-po creates draft POs', async () => {
        const token = await adminToken();
        const supplier = await Supplier.create({ name: 'API Auto Supplier', status: 'active' });
        await Product.create({
            productId: `INT-API-${Date.now()}`,
            name: 'API Auto Product',
            price: 900,
            stock: 1,
            stockQuantity: 1,
            lowStockThreshold: 15,
            supplierId: supplier._id,
            buyingPrice: 450
        });

        const res = await request(app)
            .post('/api/admin/inventory-intelligence/trigger-auto-po')
            .set(auth(token))
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('purchaseOrders');

        const draftCount = await PurchaseOrder.countDocuments({
            supplierId: supplier._id,
            status: 'draft'
        });
        expect(draftCount).toBeGreaterThanOrEqual(1);
    });
});
