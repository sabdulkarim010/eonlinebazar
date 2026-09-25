/********************************************************************
 * CRM — Abandoned cart list + recovery notification tests.
 ********************************************************************/

jest.mock('../backend/src/services/mailer', () => ({
    sendAbandonedCartEmail: jest.fn().mockResolvedValue({ delivered: true })
}));

const request = require('supertest');
const Cart = require('../backend/src/models/cart');
const Product = require('../backend/src/models/product');
const { ABANDON_THRESHOLD_MS } = require('../backend/src/jobs/abandonedCartJob');
const {
    aggregateMongoAbandonedValue,
    parseListPagination
} = require('../backend/src/controllers/admin/crmController');
const { getApp, createTestAdmin, createTestUser } = require('./setup');

describe('CRM — Abandoned Carts', () => {
    const app = getApp();
    const originalCrmFlag = process.env.READ_PG_CRM;

    afterEach(() => {
        if (originalCrmFlag !== undefined) {
            process.env.READ_PG_CRM = originalCrmFlag;
        } else {
            delete process.env.READ_PG_CRM;
        }
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

    function auth(token) {
        return { Authorization: `Bearer ${token}` };
    }

    async function seedAbandonedCart() {
        const { user } = await createTestUser();
        const product = await Product.create({
            productId: `ABN-${Date.now()}`,
            name: 'Abandoned Test Item',
            price: 500,
            stock: 10,
            stockQuantity: 10
        });
        const staleAt = new Date(Date.now() - ABANDON_THRESHOLD_MS - 60_000);

        const cart = await Cart.create({
            userId: user._id,
            items: [{ productId: product._id, name: product.name, price: 500, quantity: 1 }]
        });

        // pre('save') bumps lastActivityAt on item writes — backdate after create.
        await Cart.updateOne(
            { _id: cart._id },
            { $set: { lastActivityAt: staleAt, updatedAt: staleAt } }
        );

        return user;
    }

    test('lists abandoned carts with KPI stats', async () => {
        const token = await adminToken();
        await seedAbandonedCart();

        const res = await request(app)
            .get('/api/admin/crm/abandoned-carts?filter=all')
            .set(auth(token));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.count).toBeGreaterThanOrEqual(1);
        expect(res.body.data.value).toBeGreaterThanOrEqual(500);
        expect(Array.isArray(res.body.data.carts)).toBe(true);
        expect(res.body.data.carts.length).toBeGreaterThanOrEqual(1);
        expect(res.body.data.pagination).toMatchObject({
            page: 1,
            limit: 100
        });
    });

    test('notify endpoint accepts a recovery request without server error', async () => {
        const token = await adminToken();
        const user = await seedAbandonedCart();

        const res = await request(app)
            .post(`/api/admin/crm/abandoned-carts/${user._id}/notify`)
            .set(auth(token))
            .send({ channel: 'email' });

        expect([200, 201]).toContain(res.status);
        expect(res.body.success).toBe(true);

        const refreshed = await Cart.findOne({ userId: user._id }).lean();
        expect(refreshed.abandonedNotifiedAt).toBeTruthy();
    });

    test('rejects unauthenticated list access', async () => {
        const res = await request(app).get('/api/admin/crm/abandoned-carts');
        expect(res.status).toBe(401);
    });

    test('respects list limit query param (max 100)', async () => {
        const token = await adminToken();
        await seedAbandonedCart();

        const res = await request(app)
            .get('/api/admin/crm/abandoned-carts?filter=all&limit=50')
            .set(auth(token));

        expect(res.status).toBe(200);
        expect(res.body.data.pagination.limit).toBe(50);
        expect(res.body.data.carts.length).toBeLessThanOrEqual(50);
    });

    test('aggregates Mongo cart value without loading full cart documents', async () => {
        await seedAbandonedCart();
        const cutoff = new Date(Date.now() - ABANDON_THRESHOLD_MS);
        const value = await aggregateMongoAbandonedValue(cutoff);
        expect(value).toBeGreaterThanOrEqual(500);
    });

    test('READ_PG_CRM=true falls back to Mongo when Postgres throws', async () => {
        process.env.READ_PG_CRM = 'true';
        const prisma = require('../backend/src/config/prismaClient');
        jest.spyOn(prisma.cart, 'count').mockRejectedValue(new Error('Neon timeout'));

        const token = await adminToken();
        await seedAbandonedCart();

        const res = await request(app)
            .get('/api/admin/crm/abandoned-carts?filter=all')
            .set(auth(token));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.count).toBeGreaterThanOrEqual(1);
        expect(res.body.data.carts.length).toBeGreaterThanOrEqual(1);
    });

    test('parseListPagination caps limit at 100', () => {
        expect(parseListPagination({ limit: '250' })).toEqual({ page: 1, limit: 100, skip: 0 });
        expect(parseListPagination({ page: '2', limit: '50' })).toEqual({ page: 2, limit: 50, skip: 50 });
    });
});
