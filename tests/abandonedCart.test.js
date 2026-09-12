/********************************************************************
 * CRM — Abandoned cart list + recovery notification tests.
 ********************************************************************/

const request = require('supertest');
const Cart = require('../backend/src/models/cart');
const Product = require('../backend/src/models/product');
const { ABANDON_THRESHOLD_MS } = require('../backend/src/jobs/abandonedCartJob');
const { getApp, createTestAdmin, createTestUser } = require('./setup');

describe('CRM — Abandoned Carts', () => {
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
});
