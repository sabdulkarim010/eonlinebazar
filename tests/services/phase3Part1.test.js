/********************************************************************
 * Phase 3 Part 1 — COD risk scoring, cart restore links, courier webhooks.
 ********************************************************************/

const jwt = require('jsonwebtoken');
const request = require('supertest');
const Order = require('../../backend/src/models/order');
const Product = require('../../backend/src/models/product');
const Cart = require('../../backend/src/models/cart');
const {
    computeRiskFromMetrics,
    computeCustomerRisk
} = require('../../backend/src/services/riskScoringService');
const {
    generateCartRestoreToken,
    verifyCartRestoreToken,
    restoreCartFromToken,
    buildRestoreCheckoutUrl
} = require('../../backend/src/services/cartRestoreService');
const { getApp, createTestAdmin, createTestUser } = require('../setup');

describe('Phase 3 Part 1 — risk, cart restore, courier webhooks', () => {
    const app = getApp();
    const restoreSecret = process.env.CART_RESTORE_SECRET || process.env.JWT_SECRET || 'cart-restore-dev-secret';

    afterEach(() => {
        delete process.env.STEADFAST_WEBHOOK_SECRET;
        jest.restoreAllMocks();
    });

    test('risk scoring — HIGH for high return rate, LOW for healthy customer', async () => {
        const high = computeRiskFromMetrics({
            totalOrders: 10,
            deliveredCount: 4,
            returnCancelCount: 5,
            pendingCodCount: 0
        });
        expect(high.riskScore).toBe('HIGH');
        expect(high.riskReason).toMatch(/50%/);

        const low = computeRiskFromMetrics({
            totalOrders: 8,
            deliveredCount: 7,
            returnCancelCount: 1,
            pendingCodCount: 0
        });
        expect(low.riskScore).toBe('LOW');

        const { user } = await createTestUser();
        const phone = user.mobile;
        const product = await Product.create({
            productId: `P3-RISK-${Date.now()}`,
            name: 'Risk Product',
            price: 500,
            stock: 20,
            stockQuantity: 20
        });

        for (let i = 0; i < 4; i += 1) {
            await Order.create({
                orderId: `RISK-CANCEL-${Date.now()}-${i}`,
                user: user._id,
                customerName: 'Risk Tester',
                customerPhone: phone,
                customerAddress: 'Dhaka',
                subTotal: 500,
                grandTotal: 500,
                items: [{ productId: product._id, name: product.name, price: 500, quantity: 1 }],
                status: 'Cancelled',
                paymentMethod: 'COD'
            });
        }

        await Order.create({
            orderId: `RISK-DEL-${Date.now()}`,
            user: user._id,
            customerName: 'Risk Tester',
            customerPhone: phone,
            customerAddress: 'Dhaka',
            subTotal: 500,
            grandTotal: 500,
            items: [{ productId: product._id, name: product.name, price: 500, quantity: 1 }],
            status: 'Delivered',
            isDelivered: true,
            paymentMethod: 'COD'
        });

        const liveRisk = await computeCustomerRisk({ userId: user._id, phone });
        expect(liveRisk.riskScore).toBe('HIGH');
        expect(liveRisk.riskReason).toMatch(/Return\/cancel rate/i);
    });

    test('cart restore token — valid restore and expired token rejection', async () => {
        const { user } = await createTestUser();
        const product = await Product.create({
            productId: `P3-CART-${Date.now()}`,
            name: 'Restore Product',
            price: 750,
            stock: 5,
            stockQuantity: 5
        });

        const cart = await Cart.create({
            userId: user._id,
            items: [{
                productId: product._id,
                name: product.name,
                price: 750,
                quantity: 2,
                selected: false
            }]
        });

        const token = generateCartRestoreToken(cart._id);
        const decoded = verifyCartRestoreToken(token);
        expect(decoded.cartId).toBe(String(cart._id));

        const checkoutUrl = buildRestoreCheckoutUrl(token);
        expect(checkoutUrl).toContain('restoreToken=');

        const restoreResult = await restoreCartFromToken(token);
        expect(restoreResult.success).toBe(true);
        expect(restoreResult.itemsRestored).toBe(1);

        const refreshed = await Cart.findById(cart._id);
        expect(refreshed.items[0].selected).toBe(true);
        expect(refreshed.items[0].quantity).toBe(2);

        const httpRestore = await request(app).get(`/api/cart/restore/${encodeURIComponent(token)}`);
        expect(httpRestore.status).toBe(200);
        expect(httpRestore.body.success).toBe(true);
        expect(httpRestore.body.data.checkoutUrl).toContain('restoreToken=');

        const expiredToken = jwt.sign(
            {
                purpose: 'cart_restore',
                cartId: String(cart._id),
                exp: Math.floor(Date.now() / 1000) - 60
            },
            restoreSecret
        );
        const expiredResult = await restoreCartFromToken(expiredToken);
        expect(expiredResult.success).toBe(false);
        expect(expiredResult.status).toBe(410);

        const expiredHttp = await request(app).get(`/api/cart/restore/${encodeURIComponent(expiredToken)}`);
        expect(expiredHttp.status).toBe(410);
    });

    test('courier webhook — updates order status with valid auth', async () => {
        process.env.STEADFAST_WEBHOOK_SECRET = 'test-steadfast-webhook-secret';

        const { user } = await createTestUser();
        const product = await Product.create({
            productId: `P3-WH-${Date.now()}`,
            name: 'Webhook Product',
            price: 900,
            stock: 10,
            stockQuantity: 10
        });

        const order = await Order.create({
            orderId: `WH-ORD-${Date.now()}`,
            user: user._id,
            customerName: 'Webhook Customer',
            customerPhone: user.mobile,
            customerAddress: 'Dhaka',
            subTotal: 900,
            grandTotal: 900,
            items: [{ productId: product._id, name: product.name, price: 900, quantity: 1 }],
            status: 'Shipped',
            paymentMethod: 'COD',
            courierProvider: 'steadfast',
            courierTrackingId: 'SF-TRACK-12345',
            courierConsignmentId: 'SF-CON-12345'
        });

        const res = await request(app)
            .post('/api/webhooks/courier/steadfast')
            .set('Authorization', 'Bearer test-steadfast-webhook-secret')
            .send({
                status: 'delivered',
                tracking_code: 'SF-TRACK-12345',
                consignment_id: 'SF-CON-12345',
                invoice: order.orderId
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.changed).toBe(true);
        expect(res.body.to).toBe('Delivered');

        const updated = await Order.findById(order._id);
        expect(updated.status).toBe('Delivered');
        expect(updated.isDelivered).toBe(true);
        expect(Array.isArray(updated.statusHistory)).toBe(true);
        expect(updated.statusHistory.some((entry) => entry.status === 'Delivered')).toBe(true);
    });

    test('admin orders list includes riskScore enrichment', async () => {
        const { username, password } = await createTestAdmin();
        const login = await request(app)
            .post('/admin/api/login')
            .send({ username, password });
        expect(login.status).toBe(200);

        const res = await request(app)
            .get('/admin/api/orders')
            .set('Authorization', `Bearer ${login.body.token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        if (Array.isArray(res.body.data) && res.body.data.length) {
            expect(res.body.data[0]).toHaveProperty('riskScore');
            expect(res.body.data[0]).toHaveProperty('riskReason');
        }
    });
});
