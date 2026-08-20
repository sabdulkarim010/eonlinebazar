const request = require('supertest');
const Order = require('../backend/src/models/order');
const Product = require('../backend/src/models/product');
const PaymentMethod = require('../backend/src/models/PaymentMethod');
const { getGatewayAdapter } = require('../backend/src/services/paymentGatewayAdapters');
const { getApp, createTestAdmin, createTestUser, getAuthToken } = require('./setup');

describe('Payment API', () => {
    const app = getApp();

    async function seedOrder() {
        const product = await Product.create({
            productId: 'PAY-PROD-001',
            name: 'Payment Test Item',
            price: 900,
            stock: 20,
            stockQuantity: 20
        });

        const codMethod = await PaymentMethod.findOne({ code: 'cod' });
        const { user } = await createTestUser();

        const order = await Order.create({
            orderId: `ORD-PAY-${Date.now()}`,
            user: user._id,
            customerName: 'Payment Tester',
            customerPhone: user.mobile,
            customerAddress: 'Test Address, Dhaka',
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
                status: 'unpaid'
            },
            items: [{
                productId: String(product._id),
                name: product.name,
                price: product.price,
                quantity: 1
            }],
            status: 'Pending'
        });

        return { order, user };
    }

    test("SSLCommerz adapter buildRedirect() returns { success: false } when SSLCOMMERZ_STORE_ID env is not set", async () => {
        delete process.env.SSLCOMMERZ_STORE_ID;
        delete process.env.SSLCOMMERZ_STORE_PASSWORD;

        const adapter = getGatewayAdapter('sslcommerz');
        const result = await adapter.buildRedirect({
            orderId: 'ORD-SSL-001',
            amount: 1500,
            customerName: 'SSL Tester',
            customerPhone: '01711111111',
            shippingAddress: 'Dhaka',
            city: 'Dhaka'
        });

        expect(result.success).toBe(false);
    });

    test('POST /api/payments/ipn/cod exists and returns 200', async () => {
        const { order } = await seedOrder();

        const res = await request(app)
            .post('/api/payments/ipn/cod')
            .send({ orderId: order.orderId, status: 'pending' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test("an order's payment status can be updated by admin", async () => {
        const { order } = await seedOrder();
        const { username, password } = await createTestAdmin();

        const loginRes = await request(app)
            .post('/admin/api/login')
            .send({ username, password });

        expect(loginRes.status).toBe(200);
        const adminToken = loginRes.body.token;

        const updateRes = await request(app)
            .put(`/api/orders/${order._id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'Processing', paymentStatus: 'paid' });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.success).toBe(true);
        expect(updateRes.body.data.payment.status).toBe('paid');

        const refreshed = await Order.findById(order._id);
        expect(refreshed.payment.status).toBe('paid');
    });
});
