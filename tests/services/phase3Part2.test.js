/********************************************************************
 * Phase 3 Part 2 — Wallet, POS shifts, split payments.
 ********************************************************************/

const request = require('supertest');
const Product = require('../../backend/src/models/product');
const Order = require('../../backend/src/models/order');
const PosShift = require('../../backend/src/models/posShift');
const {
    creditWallet,
    debitWallet,
    getWalletBalance,
    getWalletTransactions
} = require('../../backend/src/services/walletService');
const { getApp, createTestAdmin, createTestUser, getAuthToken } = require('../setup');

describe('Phase 3 Part 2 — wallet, POS shifts, split payments', () => {
    const app = getApp();

    async function adminToken(overrides = {}) {
        const { username, password } = await createTestAdmin(overrides);
        const res = await request(app)
            .post('/admin/api/login')
            .send({ username, password });
        expect(res.status).toBe(200);
        return res.body.token;
    }

    function auth(token) {
        return { Authorization: `Bearer ${token}` };
    }

    async function createProduct(price = 500) {
        return Product.create({
            productId: `P3P2-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            name: 'Phase3P2 Product',
            price,
            stock: 30,
            stockQuantity: 30
        });
    }

    test('wallet credit/debit keeps balance consistent and records transactions', async () => {
        const { user, email, password } = await createTestUser();
        const admin = await adminToken();

        const creditRes = await request(app)
            .post(`/api/admin/customers/${user._id}/wallet/credit`)
            .set(auth(admin))
            .send({ amount: 1000, reason: 'Refund bonus' });

        expect(creditRes.status).toBe(200);
        expect(creditRes.body.success).toBe(true);
        expect(creditRes.body.data.balance).toBe(1000);

        const serviceBalance = await getWalletBalance(user._id);
        expect(serviceBalance).toBe(1000);

        const debited = await debitWallet(user._id, 250, 'Manual debit test');
        expect(debited).toBeTruthy();
        expect(await getWalletBalance(user._id)).toBe(750);

        const txPayload = await getWalletTransactions(user._id, { limit: 10 });
        expect(txPayload.balance).toBe(750);
        expect(txPayload.transactions.length).toBeGreaterThanOrEqual(2);
        expect(txPayload.transactions.some((row) => String(row.note).includes('Refund bonus'))).toBe(true);

        const adminTxRes = await request(app)
            .get(`/api/admin/customers/${user._id}/wallet/transactions`)
            .set(auth(admin));
        expect(adminTxRes.status).toBe(200);
        expect(adminTxRes.body.data.balance).toBe(750);

        const customerToken = await getAuthToken(email, password);

        const customerBalanceRes = await request(app)
            .get('/api/user/wallet/balance')
            .set(auth(customerToken));
        expect(customerBalanceRes.status).toBe(200);
        expect(customerBalanceRes.body.data.balance).toBe(750);

        const customerTxRes = await request(app)
            .get('/api/user/wallet/transactions')
            .set(auth(customerToken));
        expect(customerTxRes.status).toBe(200);
        expect(customerTxRes.body.data.transactions.length).toBeGreaterThanOrEqual(2);
    });

    test('POS shift lifecycle — open, sale stats, close with cash discrepancy', async () => {
        const token = await adminToken({ permissions: ['manage_orders', 'access_pos'] });
        const product = await createProduct(400);

        const openRes = await request(app)
            .post('/api/admin/pos/shifts/open')
            .set(auth(token))
            .send({ startingCash: 1000, registerName: 'Counter-1', notes: 'Morning open' });

        expect(openRes.status).toBe(201);
        const shiftId = openRes.body.data._id;

        const orderRes = await request(app)
            .post('/api/admin/orders/manual')
            .set(auth(token))
            .send({
                customerName: 'POS Shift Customer',
                customerPhone: '01799998888',
                customerAddress: 'Counter pickup',
                registerName: 'Counter-1',
                items: [{ productId: product._id, quantity: 1 }],
                shippingFee: 0,
                payments: [
                    { method: 'CASH', amount: 250 },
                    { method: 'BKASH', amount: 150 }
                ]
            });

        expect(orderRes.status).toBe(201);
        expect(orderRes.body.data.splitPayments).toHaveLength(2);
        expect(String(orderRes.body.data.posShiftId)).toBe(String(shiftId));

        const currentRes = await request(app)
            .get('/api/admin/pos/shifts/current?registerName=Counter-1')
            .set(auth(token));

        expect(currentRes.status).toBe(200);
        expect(currentRes.body.data.totalCashSales).toBe(250);
        expect(currentRes.body.data.totalDigitalSales).toBe(150);
        expect(currentRes.body.data.expectedCash).toBe(1250);
        expect(currentRes.body.data.orderCount).toBe(1);

        const closeRes = await request(app)
            .post('/api/admin/pos/shifts/close')
            .set(auth(token))
            .send({ shiftId, actualCash: 1240, notes: 'Short 10 taka' });

        expect(closeRes.status).toBe(200);
        expect(closeRes.body.data.status).toBe('CLOSED');
        expect(closeRes.body.data.actualCash).toBe(1240);
        expect(closeRes.body.data.cashDiscrepancy).toBe(-10);

        const closedShift = await PosShift.findById(shiftId).lean();
        expect(closedShift.status).toBe('CLOSED');
        expect(closedShift.cashDiscrepancy).toBe(-10);
    });

    test('POS split payment validation rejects mismatched totals', async () => {
        const token = await adminToken();
        const product = await createProduct(600);

        const badRes = await request(app)
            .post('/api/admin/orders/manual')
            .set(auth(token))
            .send({
                customerName: 'Split Fail Customer',
                customerPhone: '01788887777',
                customerAddress: 'Dhaka',
                items: [{ productId: product._id, quantity: 1 }],
                shippingFee: 0,
                payments: [
                    { method: 'CASH', amount: 300 },
                    { method: 'BKASH', amount: 200 }
                ]
            });

        expect(badRes.status).toBe(400);
        expect(badRes.body.message).toMatch(/must equal order total/i);

        const { user } = await createTestUser();
        await creditWallet(user._id, 600, 'POS wallet test');

        const goodRes = await request(app)
            .post('/api/admin/orders/manual')
            .set(auth(token))
            .send({
                customerName: 'Split Wallet Customer',
                customerPhone: user.mobile,
                customerAddress: 'Dhaka',
                customerUserId: user._id,
                items: [{ productId: product._id, quantity: 1 }],
                shippingFee: 0,
                payments: [
                    { method: 'WALLET', amount: 200 },
                    { method: 'CASH', amount: 400 }
                ]
            });

        expect(goodRes.status).toBe(201);
        expect(goodRes.body.data.walletApplied).toBe(200);
        expect(goodRes.body.data.splitPayments).toHaveLength(2);

        const saved = await Order.findOne({ orderId: goodRes.body.data.orderId }).lean();
        expect(saved.walletApplied).toBe(200);
        expect(await getWalletBalance(user._id)).toBe(400);
    });
});
