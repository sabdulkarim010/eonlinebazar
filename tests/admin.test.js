const request = require('supertest');
const jwt = require('jsonwebtoken');
const Order = require('../backend/src/models/order');
const Product = require('../backend/src/models/product');
const PaymentMethod = require('../backend/src/models/PaymentMethod');
const User = require('../backend/src/models/user');
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

    async function getAdminAuthToken() {
        const { username } = await createTestAdmin({ twoFactorEnabled: false });
        return jwt.sign(
            { username, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
    }

    test('GET /api/admin/customers hydrates full name from firstName + lastName', async () => {
        const { user } = await createTestUser({
            firstName: 'Nusrat',
            lastName: 'Jahan',
            email: 'nusrat.jahan@test.local'
        });
        const token = await getAdminAuthToken();

        const res = await request(app)
            .get('/api/admin/customers')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        const match = (res.body.customers || []).find((row) => String(row._id) === String(user._id));
        expect(match).toBeTruthy();
        expect(match.name).toBe('Nusrat Jahan');
        expect(match.orderCount).toBe(0);
        expect(match.segment).toBe('inactive');
        expect(match.isInactive).toBe(true);
    });

    test('DELETE /api/admin/customers/:id permanently removes the user so they can re-register', async () => {
        const { user, email, mobile } = await createTestUser({
            firstName: 'Delete',
            lastName: 'Me',
            email: 'delete.me@test.local',
            mobile: '01733334444'
        });
        const token = await getAdminAuthToken();

        const delRes = await request(app)
            .delete(`/api/admin/customers/${user._id}`)
            .set('Authorization', `Bearer ${token}`);

        expect(delRes.status).toBe(200);
        expect(delRes.body.success).toBe(true);
        expect(await User.findById(user._id)).toBeNull();

        const registerRes = await request(app)
            .post('/api/customer/register')
            .send({
                firstName: 'Delete',
                lastName: 'Me',
                mobile,
                email,
                password: 'SecurePass123!'
            });

        expect(registerRes.status).toBe(201);
        expect(registerRes.body.success).toBe(true);
    });
});
