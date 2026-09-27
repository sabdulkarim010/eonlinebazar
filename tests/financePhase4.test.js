/********************************************************************
 * Phase 4 — Finance security, POS/wallet liquidity, RBAC
 ********************************************************************/

const request = require('supertest');
const jwt = require('jsonwebtoken');
const Order = require('../backend/src/models/order');
const Product = require('../backend/src/models/product');
const PaymentMethod = require('../backend/src/models/PaymentMethod');
const PosShift = require('../backend/src/models/posShift');
const SecurityLog = require('../backend/src/models/securityLog');
const User = require('../backend/src/models/user');
const { getApp, createTestAdmin, createTestUser } = require('./setup');

describe('Finance Phase 4 — security & liquidity', () => {
    const app = getApp();

    async function adminTokenWithPermissions(permissions = []) {
        const { username } = await createTestAdmin({
            role: 'staff',
            permissions,
            twoFactorEnabled: false
        });
        return jwt.sign({ username, role: 'staff' }, process.env.JWT_SECRET, { expiresIn: '24h' });
    }

    async function seedGatewayOrder() {
        const product = await Product.create({
            productId: `GW-PROD-${Date.now()}`,
            name: 'Gateway Test Product',
            price: 1200,
            stock: 5,
            stockQuantity: 5
        });
        const { user } = await createTestUser();
        const gatewayMethod = await PaymentMethod.findOne({ code: 'sslcommerz' })
            || await PaymentMethod.create({
                name: 'SSLCommerz',
                code: 'sslcommerz',
                type: 'automated',
                provider: 'sslcommerz',
                isActive: true
            });

        return Order.create({
            orderId: `ORD-GW-${Date.now()}`,
            user: user._id,
            customerName: 'Gateway Customer',
            customerPhone: user.mobile,
            customerAddress: 'Dhaka',
            subTotal: product.price,
            deliveryCharge: 0,
            grandTotal: product.price,
            paymentMethod: gatewayMethod.name,
            payment: {
                methodId: gatewayMethod._id,
                code: gatewayMethod.code,
                name: gatewayMethod.name,
                type: 'automated',
                provider: 'sslcommerz',
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
    }

    test('markGatewayOrderPaid writes immutable security audit log', async () => {
        const order = await seedGatewayOrder();
        const token = await adminTokenWithPermissions(['manage_orders']);

        const res = await request(app)
            .patch(`/api/admin/payments/${order._id}/mark-paid`)
            .set('Authorization', `Bearer ${token}`)
            .send({ adminNote: 'Bank confirmed manually' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const log = await SecurityLog.findOne({
            action: 'Payment Status Override',
            resourceId: String(order._id)
        }).lean();

        expect(log).toBeTruthy();
        expect(log.previousValue).toBe('unpaid');
        expect(log.newValue).toBe('paid');
        expect(log.actorType).toBe('admin');

        const meta = JSON.parse(log.details);
        expect(meta.event).toBe('payment_reconciliation_mark_paid');
        expect(meta.orderId).toBeTruthy();
        expect(meta.paymentMethod).toBeTruthy();
        expect(meta.timestamp).toBeTruthy();
    });

    test('accounts-summary includes POS drawer and wallet liability fields', async () => {
        const { user } = await createTestUser();
        await User.findByIdAndUpdate(user._id, { walletBalance: 250 });

        const { admin } = await createTestAdmin({ twoFactorEnabled: false });
        await PosShift.create({
            registerName: 'Main Register',
            cashierId: admin._id,
            cashierName: admin.username,
            startingCash: 500,
            totalCashSales: 300,
            expectedCash: 800,
            status: 'OPEN'
        });

        const token = jwt.sign(
            { username: admin.username, role: 'superadmin' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        const res = await request(app)
            .get('/api/admin/accounts-summary')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.balances.posDrawerCash).toBe(800);
        expect(res.body.data.balances.customerWalletLiability).toBe(250);
        expect(typeof res.body.data.balances.totalLiabilities).toBe('number');
    });

    test('accounts-summary returns 403 for staff without view_accounts', async () => {
        const token = await adminTokenWithPermissions(['manage_orders']);

        const res = await request(app)
            .get('/api/admin/accounts-summary')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.reason).toBe('PERMISSION_DENIED');
    });

    test('finance profit-loss returns 403 without view_financial_reports', async () => {
        const token = await adminTokenWithPermissions(['view_accounts']);

        const res = await request(app)
            .get('/api/admin/finance/profit-loss')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
    });
});
