const request = require('supertest');
const Product = require('../backend/src/models/product');
const PaymentMethod = require('../backend/src/models/PaymentMethod');
const { getApp, createTestUser, getAuthToken } = require('./setup');

describe('Order API', () => {
    const app = getApp();

    async function seedProduct() {
        return Product.create({
            productId: 'ORD-PROD-001',
            name: 'Order Smoke Hoodie',
            price: 1200,
            stock: 50,
            stockQuantity: 50,
            category: 'General'
        });
    }

    async function createCodOrder() {
        const product = await seedProduct();
        const codMethod = await PaymentMethod.findOne({ code: 'cod' });
        const { email, password, user } = await createTestUser();
        const token = await getAuthToken(email, password);

        const orderRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${token}`)
            .send({
                customerName: 'Test Customer',
                customerPhone: user.mobile,
                customerAddress: 'House 12, Road 5, Gulshan',
                shippingDistrict: 'Dhaka',
                paymentMethod: codMethod.code,
                items: [{
                    productId: String(product._id),
                    name: product.name,
                    price: product.price,
                    quantity: 1
                }]
            });

        return { orderRes, token, user, product };
    }

    test('POST /api/orders — create an order with COD payment method, expect 201 and orderId in response', async () => {
        const { orderRes } = await createCodOrder();

        expect(orderRes.status).toBe(201);
        expect(orderRes.body.success).toBe(true);
        expect(orderRes.body.data.orderId).toBeTruthy();
    });

    test('GET /api/orders/:orderId — get the created order, verify status is pending', async () => {
        const { orderRes, token } = await createCodOrder();
        const mongoId = orderRes.body.data._id;

        const res = await request(app)
            .get(`/api/orders/${mongoId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(String(res.body.data.status).toLowerCase()).toBe('pending');
    });

    test('GET /api/orders/track with orderId + phone — public tracking, expect 200', async () => {
        const { orderRes, user } = await createCodOrder();
        const orderId = orderRes.body.data.orderId;

        const res = await request(app)
            .get('/api/orders/track')
            .query({ orderId, phone: user.mobile });

        expect(res.status).toBe(200);
        expect(res.body.orderId).toBe(orderId);
    });

    test('POST /api/orders/:orderId/cancel — customer cancels order, expect 200', async () => {
        const { orderRes, token } = await createCodOrder();
        const mongoId = orderRes.body.data._id;

        const res = await request(app)
            .post(`/api/orders/${mongoId}/cancel`)
            .set('Authorization', `Bearer ${token}`)
            .send({ reason: 'Changed my mind' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(String(res.body.data.status).toLowerCase()).toBe('cancelled');
    });

    test('GET /api/orders/my-orders — returns all line items with name, price, quantity, image', async () => {
        const productA = await Product.create({
            productId: 'ORD-PROD-A',
            name: 'Order Card Tee',
            price: 800,
            stock: 20,
            stockQuantity: 20,
            category: 'General',
            image: '/uploads/products/tee.jpg',
            images: ['/uploads/products/tee.jpg']
        });
        const productB = await Product.create({
            productId: 'ORD-PROD-B',
            name: 'Order Card Cap',
            price: 450,
            stock: 20,
            stockQuantity: 20,
            category: 'General',
            image: '/uploads/products/cap.jpg',
            images: ['/uploads/products/cap.jpg']
        });
        const productC = await Product.create({
            productId: 'ORD-PROD-C',
            name: 'Order Card Bag',
            price: 1500,
            stock: 20,
            stockQuantity: 20,
            category: 'General',
            image: '/uploads/products/bag.jpg',
            images: ['/uploads/products/bag.jpg']
        });

        const codMethod = await PaymentMethod.findOne({ code: 'cod' });
        const { email, password, user } = await createTestUser();
        const token = await getAuthToken(email, password);

        const orderRes = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${token}`)
            .send({
                customerName: 'Test Customer',
                customerPhone: user.mobile,
                customerAddress: 'House 12, Road 5, Gulshan',
                shippingDistrict: 'Dhaka',
                paymentMethod: codMethod.code,
                items: [
                    { productId: String(productA._id), name: productA.name, price: productA.price, quantity: 1, variantLabel: 'Black / M' },
                    { productId: String(productB._id), name: productB.name, price: productB.price, quantity: 2, color: 'Navy' },
                    { productId: String(productC._id), name: productC.name, price: productC.price, quantity: 1 }
                ]
            });

        expect(orderRes.status).toBe(201);

        const res = await request(app)
            .get('/api/orders/my-orders')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);

        const order = res.body.data[0];
        expect(Array.isArray(order.items)).toBe(true);
        expect(order.items).toHaveLength(3);

        order.items.forEach((item) => {
            expect(item.name).toBeTruthy();
            expect(typeof item.price).toBe('number');
            expect(item.quantity).toBeGreaterThan(0);
            expect(item).toHaveProperty('image');
            expect(item.image).toBeTruthy();
        });
    });
});
