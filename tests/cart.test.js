const request = require('supertest');
const Product = require('../models/product');
const { getApp, createTestUser, getAuthToken } = require('./setup');

describe('Cart API', () => {
    const app = getApp();

    async function seedProduct() {
        return Product.create({
            productId: 'CART-PROD-001',
            name: 'Smoke Test T-Shirt',
            price: 499,
            stock: 100,
            stockQuantity: 100,
            category: 'General'
        });
    }

    test('POST /api/cart/add (authenticated) — add a product to cart, expect 200', async () => {
        const product = await seedProduct();
        const { email, password } = await createTestUser();
        const token = await getAuthToken(email, password);

        const res = await request(app)
            .post('/api/cart/add')
            .set('Authorization', `Bearer ${token}`)
            .send({
                productId: String(product._id),
                name: product.name,
                price: product.price,
                quantity: 1
            });

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        expect(String(res.body[0].productId)).toBe(String(product._id));
    });

    test('GET /api/cart (authenticated) — get cart, expect items array to contain the added product', async () => {
        const product = await seedProduct();
        const { email, password } = await createTestUser();
        const token = await getAuthToken(email, password);

        await request(app)
            .post('/api/cart/add')
            .set('Authorization', `Bearer ${token}`)
            .send({
                productId: String(product._id),
                name: product.name,
                price: product.price,
                quantity: 2
            });

        const res = await request(app)
            .get('/api/cart')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.some((item) => String(item.productId) === String(product._id))).toBe(true);
    });

    test('GET /api/cart — returns image and emojiIcon from product catalog', async () => {
        const product = await Product.create({
            productId: 'CART-IMG-001',
            name: 'Image Test Shirt',
            price: 599,
            stock: 50,
            stockQuantity: 50,
            category: 'General',
            images: ['/products/test-shirt.jpg'],
            icon: '👕'
        });
        const { email, password } = await createTestUser();
        const token = await getAuthToken(email, password);

        await request(app)
            .post('/api/cart/add')
            .set('Authorization', `Bearer ${token}`)
            .send({
                productId: String(product._id),
                name: product.name,
                price: product.price,
                quantity: 1
            });

        const res = await request(app)
            .get('/api/cart')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data[0].image).toBe('/products/test-shirt.jpg');
        expect(res.body.data[0].emojiIcon).toBe('👕');
    });

    test('GET /api/cart — prefers catalog image over stale stored cart image', async () => {
        const Cart = require('../models/cart');
        const product = await Product.create({
            productId: 'CART-IMG-002',
            name: 'Stale Image Shirt',
            price: 699,
            stock: 40,
            stockQuantity: 40,
            category: 'General',
            images: ['/products/fresh-shirt.jpg'],
            icon: '👔'
        });
        const { email, password, user } = await createTestUser();
        const token = await getAuthToken(email, password);

        await Cart.create({
            userId: user._id,
            items: [{
                productId: product._id,
                name: product.name,
                price: product.price,
                quantity: 1,
                image: '📦',
                variantImage: null,
                icon: '📦',
                emojiIcon: '📦',
                selected: true
            }]
        });

        const res = await request(app)
            .get('/api/cart')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data[0].image).toBe('/products/fresh-shirt.jpg');
    });

    test('DELETE /api/cart/clear (authenticated) — clear cart, expect empty items', async () => {
        const product = await seedProduct();
        const { email, password } = await createTestUser();
        const token = await getAuthToken(email, password);

        await request(app)
            .post('/api/cart/add')
            .set('Authorization', `Bearer ${token}`)
            .send({
                productId: String(product._id),
                name: product.name,
                price: product.price,
                quantity: 1
            });

        const clearRes = await request(app)
            .delete('/api/cart/clear')
            .set('Authorization', `Bearer ${token}`);

        expect(clearRes.status).toBe(200);
        expect(clearRes.body).toEqual([]);

        const getRes = await request(app)
            .get('/api/cart')
            .set('Authorization', `Bearer ${token}`);

        expect(getRes.status).toBe(200);
        expect(getRes.body).toEqual({ success: true, data: [] });
    });
});
