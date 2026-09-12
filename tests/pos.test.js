/********************************************************************
 * ERP POS — Manual order creation (staff counter / phone entry).
 ********************************************************************/

const request = require('supertest');
const Product = require('../backend/src/models/product');
const Order = require('../backend/src/models/order');
const { getApp, createTestAdmin } = require('./setup');

describe('ERP POS — Manual Orders', () => {
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

    async function createProduct(overrides = {}) {
        return Product.create({
            productId: `POS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: 'POS Test Product',
            price: 750,
            stock: 20,
            stockQuantity: 20,
            ...overrides
        });
    }

    test('creates a manual POS order with COD payment', async () => {
        const token = await adminToken();
        const product = await createProduct();

        const res = await request(app)
            .post('/api/admin/orders/manual')
            .set(auth(token))
            .send({
                customerName: 'Walk-in Customer',
                customerPhone: '01711112222',
                customerAddress: 'Shop counter pickup',
                items: [{ productId: product._id, quantity: 2 }],
                shippingFee: 60,
                paymentType: 'COD'
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.orderId).toMatch(/^ORD-/);
        expect(res.body.data.grandTotal).toBeGreaterThan(0);
        expect(res.body.data.status).toBe('Pending');
        expect(res.body.data.orderSource).toBe('manual');

        const saved = await Order.findOne({ orderId: res.body.data.orderId }).lean();
        expect(saved).toBeTruthy();
        expect(saved.items).toHaveLength(1);
        expect(saved.customerName).toBe('Walk-in Customer');
    });

    test('rejects manual order without line items', async () => {
        const token = await adminToken();

        const res = await request(app)
            .post('/api/admin/orders/manual')
            .set(auth(token))
            .send({
                customerName: 'No Items',
                customerPhone: '01711113333',
                customerAddress: 'Dhaka',
                items: []
            });

        expect(res.status).toBe(400);
    });
});
