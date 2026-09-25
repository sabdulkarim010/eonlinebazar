/********************************************************************
 * Phase 2 — Customer order stats, support unread badge, review product enrichment
 * READ_PG_* failover integration tests.
 ********************************************************************/

const request = require('supertest');
const Order = require('../../backend/src/models/order');
const Product = require('../../backend/src/models/product');
const Review = require('../../backend/src/models/review');
const ContactMessage = require('../../backend/src/models/ContactMessage');
const {
    fetchCustomerOrderStatsMap,
    fetchCustomerOrderCount,
    fetchProductsForAdminReviews
} = require('../../backend/src/services/userReadService');
const { getApp, createTestAdmin, createTestUser } = require('../setup');

describe('Phase 2 — READ_PG cutover failover', () => {
    const app = getApp();
    const originalEnv = {
        order: process.env.READ_PG_ORDER,
        contact: process.env.READ_PG_CONTACTMESSAGE,
        product: process.env.READ_PG_PRODUCT
    };

    afterEach(() => {
        if (originalEnv.order !== undefined) process.env.READ_PG_ORDER = originalEnv.order;
        else delete process.env.READ_PG_ORDER;
        if (originalEnv.contact !== undefined) process.env.READ_PG_CONTACTMESSAGE = originalEnv.contact;
        else delete process.env.READ_PG_CONTACTMESSAGE;
        if (originalEnv.product !== undefined) process.env.READ_PG_PRODUCT = originalEnv.product;
        else delete process.env.READ_PG_PRODUCT;
        jest.restoreAllMocks();
    });

    async function adminToken() {
        const { username, password } = await createTestAdmin();
        const res = await request(app)
            .post('/admin/api/login')
            .send({ username, password });
        expect(res.status).toBe(200);
        return res.body.token;
    }

    test('READ_PG_ORDER=true falls back to Mongo for customer order stats', async () => {
        process.env.READ_PG_ORDER = 'true';
        const prisma = require('../../backend/src/config/prismaClient');
        const userRepo = require('../../backend/src/repositories/userRepository');
        jest.spyOn(userRepo, 'resolvePostgresUserId').mockResolvedValue('00000000-0000-4000-8000-000000000001');
        jest.spyOn(prisma.order, 'groupBy').mockRejectedValue(new Error('Neon timeout'));
        jest.spyOn(prisma.order, 'count').mockRejectedValue(new Error('Neon timeout'));

        const { user } = await createTestUser();
        const product = await Product.create({
            productId: `P2-ORD-${Date.now()}`,
            name: 'Phase2 Order Product',
            price: 900,
            stock: 5,
            stockQuantity: 5
        });

        await Order.create({
            orderId: `ORD-P2-${Date.now()}`,
            user: user._id,
            customerName: 'Phase2 Customer',
            customerPhone: user.mobile,
            customerAddress: 'Dhaka',
            subTotal: 900,
            deliveryCharge: 60,
            grandTotal: 960,
            items: [{ productId: product._id, name: product.name, price: 900, quantity: 1 }],
            status: 'Delivered',
            isDelivered: true
        });

        const statsMap = await fetchCustomerOrderStatsMap([String(user._id)]);
        expect(statsMap.get(String(user._id))?.orderCount).toBeGreaterThanOrEqual(1);
        expect(statsMap.get(String(user._id))?.totalSpent).toBeGreaterThanOrEqual(960);

        const orderCount = await fetchCustomerOrderCount(user._id);
        expect(orderCount).toBeGreaterThanOrEqual(1);
    });

    test('GET /api/admin/customers returns order stats when READ_PG_ORDER PG fails', async () => {
        process.env.READ_PG_ORDER = 'true';
        const prisma = require('../../backend/src/config/prismaClient');
        const userRepo = require('../../backend/src/repositories/userRepository');
        jest.spyOn(userRepo, 'resolvePostgresUserId').mockResolvedValue('00000000-0000-4000-8000-000000000002');
        jest.spyOn(prisma.order, 'groupBy').mockRejectedValue(new Error('Neon timeout'));

        const token = await adminToken();
        const { user } = await createTestUser();
        const product = await Product.create({
            productId: `P2-CUST-${Date.now()}`,
            name: 'Phase2 Customer Product',
            price: 400,
            stock: 5,
            stockQuantity: 5
        });

        await Order.create({
            orderId: `ORD-P2C-${Date.now()}`,
            user: user._id,
            customerName: 'Phase2 List Customer',
            customerPhone: user.mobile,
            customerAddress: 'Dhaka',
            subTotal: 400,
            grandTotal: 400,
            items: [{ productId: product._id, name: product.name, price: 400, quantity: 1 }],
            status: 'Processing'
        });

        const res = await request(app)
            .get('/api/admin/customers?limit=50')
            .set({ Authorization: `Bearer ${token}` });

        expect(res.status).toBe(200);
        const match = (res.body.customers || []).find((row) => String(row._id) === String(user._id));
        expect(match).toBeTruthy();
        expect(match.orderCount).toBeGreaterThanOrEqual(1);
        expect(match.totalSpent).toBeGreaterThanOrEqual(400);
    });

    test('READ_PG_CONTACTMESSAGE=true falls back to Mongo unread inbox count', async () => {
        process.env.READ_PG_CONTACTMESSAGE = 'true';
        const prisma = require('../../backend/src/config/prismaClient');
        jest.spyOn(prisma.contactMessage, 'count').mockRejectedValue(new Error('Neon timeout'));

        await ContactMessage.create({
            name: 'Unread Tester',
            email: `unread-${Date.now()}@example.com`,
            message: 'Need help with my order',
            isRead: false,
            status: 'open'
        });

        const token = await adminToken();
        const res = await request(app)
            .get('/api/admin/messages')
            .set({ Authorization: `Bearer ${token}` });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.unreadCount).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    test('READ_PG_PRODUCT=true falls back to Mongo for review product enrichment', async () => {
        process.env.READ_PG_PRODUCT = 'true';
        const prisma = require('../../backend/src/config/prismaClient');
        jest.spyOn(prisma.product, 'findMany').mockRejectedValue(new Error('Neon timeout'));

        const product = await Product.create({
            productId: `P2-REV-${Date.now()}`,
            name: 'Review Enrichment Product',
            price: 300,
            stock: 5,
            stockQuantity: 5,
            image: 'https://example.com/review-product.jpg'
        });

        const productMap = await fetchProductsForAdminReviews([
            String(product._id),
            product.productId
        ]);

        const resolved = productMap.get(String(product._id)) || productMap.get(product.productId);
        expect(resolved).toBeTruthy();
        expect(resolved.name).toBe('Review Enrichment Product');
    });
});
