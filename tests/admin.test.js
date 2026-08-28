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

    test('PUT /api/admin/users/:id/avatar uploads a customer photo', async () => {
        const { user } = await createTestUser({
            firstName: 'Sima',
            lastName: 'Sheikh',
            email: 'sima.avatar@test.local'
        });
        const token = await getAdminAuthToken();
        const png = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64'
        );

        const res = await request(app)
            .put(`/api/admin/users/${user._id}/avatar`)
            .set('Authorization', `Bearer ${token}`)
            .attach('avatar', png, 'avatar.png');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.avatarUrl).toBe('https://test.cloudinary/mock.jpg');

        const updated = await User.findById(user._id);
        expect(updated.avatar).toBe('https://test.cloudinary/mock.jpg');
        expect(updated.avatarPublicId).toBe('mock');
    });

    test('PUT /api/admin/users/:id/avatar with avatar:null clears the photo', async () => {
        const { user } = await createTestUser({
            firstName: 'Clear',
            lastName: 'Photo',
            email: 'clear.avatar@test.local',
            avatar: 'https://test.cloudinary/old.jpg',
            avatarUrl: 'https://test.cloudinary/old.jpg',
            avatarPublicId: 'old-id'
        });
        const token = await getAdminAuthToken();

        const res = await request(app)
            .put(`/api/admin/users/${user._id}/avatar`)
            .set('Authorization', `Bearer ${token}`)
            .send({ avatar: null });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.avatarUrl).toBeNull();

        const updated = await User.findById(user._id);
        expect(updated.avatar).toBe('');
        expect(updated.avatarPublicId).toBe('');
    });

    test('DELETE /api/admin/users/:id/avatar removes the customer photo', async () => {
        const { user } = await createTestUser({
            firstName: 'Remove',
            lastName: 'Photo',
            email: 'remove.avatar@test.local',
            avatar: 'https://test.cloudinary/old.jpg',
            avatarPublicId: 'old-id'
        });
        const token = await getAdminAuthToken();

        const res = await request(app)
            .delete(`/api/admin/users/${user._id}/avatar`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.avatarUrl).toBeNull();

        const updated = await User.findById(user._id);
        expect(updated.avatar).toBe('');
        expect(updated.avatarPublicId).toBe('');
    });

    test('PUT /api/admin/customers/:id/avatar without a file returns 400', async () => {
        const { user } = await createTestUser({
            email: 'missing.avatar@test.local'
        });
        const token = await getAdminAuthToken();

        const res = await request(app)
            .put(`/api/admin/customers/${user._id}/avatar`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('PUT /api/admin/orders/:id/master-update updates shipping details', async () => {
        const order = await seedOrderForAdminList();
        const token = await getAdminAuthToken();

        const res = await request(app)
            .put(`/api/admin/orders/${order._id}/master-update`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                customerName: 'Updated Ship Customer',
                customerPhone: '01712345678',
                shippingDistrict: 'Dhaka',
                shippingUpazila: 'Gulshan',
                shippingStreetAddress: 'House 20, Road 11',
                note: 'Leave at gate'
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.customerName).toBe('Updated Ship Customer');
        expect(res.body.data.customerPhone).toBe('01712345678');
        expect(res.body.data.shippingDistrict).toBe('Dhaka');
        expect(res.body.data.note).toBe('Leave at gate');
        expect(res.body.data.grandTotal).toBe(order.grandTotal);
    });

    test('PUT /api/admin/orders/:id/master-update recalculates totals when quantity changes', async () => {
        const order = await seedOrderForAdminList();
        const token = await getAdminAuthToken();
        const line = order.items[0];

        const res = await request(app)
            .put(`/api/admin/orders/${order._id}/master-update`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                items: [{
                    productId: line.productId,
                    quantity: 2
                }]
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.subTotal).toBe(1500);
        expect(res.body.data.deliveryCharge).toBe(60);
        expect(res.body.data.grandTotal).toBe(1560);
        expect(res.body.data.items[0].quantity).toBe(2);
        expect(res.body.data.items[0].price).toBe(750);
    });

    test('PUT /api/admin/orders/:id/master-update adds a catalog product and saves shipping together', async () => {
        const order = await seedOrderForAdminList();
        const extra = await Product.create({
            productId: 'ADM-PROD-002',
            name: 'Added Line Hoodie',
            price: 400,
            stock: 8,
            stockQuantity: 8
        });
        const token = await getAdminAuthToken();
        const line = order.items[0];

        const res = await request(app)
            .put(`/api/admin/orders/${order._id}/master-update`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                customerName: 'Combo Customer',
                customerPhone: '01812345678',
                shippingDistrict: 'Dhaka',
                shippingUpazila: 'Dhanmondi',
                shippingStreetAddress: 'House 5, Road 2',
                items: [
                    { productId: line.productId, quantity: 1 },
                    { productId: String(extra._id), quantity: 1 }
                ]
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.customerName).toBe('Combo Customer');
        expect(res.body.data.items).toHaveLength(2);
        expect(res.body.data.subTotal).toBe(1150);
        expect(res.body.data.grandTotal).toBe(1210);

        const extraAfter = await Product.findById(extra._id);
        expect(extraAfter.stock).toBe(7);
    });

    test('PUT /api/admin/orders/:id/master-update rejects item edits on cancelled orders', async () => {
        const order = await seedOrderForAdminList();
        order.status = 'Cancelled';
        await order.save();
        const token = await getAdminAuthToken();

        const res = await request(app)
            .put(`/api/admin/orders/${order._id}/master-update`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                items: [{ productId: order.items[0].productId, quantity: 2 }]
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });
});
