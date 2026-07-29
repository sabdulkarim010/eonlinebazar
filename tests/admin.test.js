const request = require('supertest');
const Order = require('../models/order');
const Product = require('../models/product');
const PaymentMethod = require('../models/PaymentMethod');
const { getApp, createTestAdmin, createTestUser } = require('./setup');

describe('Admin API', () => {
    const app = getApp();

    async function seedOrderForAdminList() {
        const product = await Product.create({
            productId: 'ADM-PROD-001',
            name: 'Admin List Product',
            price: 750,
            stock: 10,
            stockQuantity: 10
        });

        const codMethod = await PaymentMethod.findOne({ code: 'cod' });
        const { user } = await createTestUser();

        return Order.create({
            orderId: `ORD-ADM-${Date.now()}`,
            user: user._id,
            customerName: 'Admin View Customer',
            customerPhone: user.mobile,
            customerAddress: 'Admin Test Address, Dhaka',
            subTotal: product.price,
            deliveryCharge: 60,
            grandTotal: product.price + 60,
            shippingDistrict: 'Dhaka',
            shippingLocationType: 'Inside City',
            paymentMethod: codMethod.name,
            payment: {
                methodId: codMethod._id,
                code: codMethod.code,
                name: codMethod.name,
                type: 'manual',
                status: 'pending'
            },
            items: [{
                productId: String(product._id),
                name: product.name,
                price: product.price,
                quantity: 1
            }],
            status: 'Pending'
        });
    }

    test('POST /admin/api/login with correct admin credentials — should return 200 with token', async () => {
        const { username, password } = await createTestAdmin();

        const res = await request(app)
            .post('/admin/api/login')
            .send({ username, password });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.token).toBeTruthy();
    });

    test('GET /admin/api/orders (authenticated as admin) — should return orders array', async () => {
        await seedOrderForAdminList();
        const { username, password } = await createTestAdmin();

        const loginRes = await request(app)
            .post('/admin/api/login')
            .send({ username, password });

        const res = await request(app)
            .get('/admin/api/orders')
            .set('Authorization', `Bearer ${loginRes.body.token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);
    });

    test("PATCH /admin/api/orders/:id/status (authenticated as admin) — update status to 'processing', expect 200", async () => {
        const order = await seedOrderForAdminList();
        const { username, password } = await createTestAdmin();

        const loginRes = await request(app)
            .post('/admin/api/login')
            .send({ username, password });

        const res = await request(app)
            .patch(`/admin/api/orders/${order._id}/status`)
            .set('Authorization', `Bearer ${loginRes.body.token}`)
            .send({ status: 'processing' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(String(res.body.data.status).toLowerCase()).toBe('processing');
    });
});
