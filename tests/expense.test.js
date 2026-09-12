/********************************************************************
 * ERP Finance — Expense ledger integration tests.
 ********************************************************************/

const request = require('supertest');
const Expense = require('../backend/src/models/expense');
const { getApp, createTestAdmin } = require('./setup');

describe('ERP Finance — Expenses', () => {
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

    test('rejects unauthenticated access', async () => {
        const res = await request(app).get('/api/admin/expenses');
        expect(res.status).toBe(401);
    });

    test('creates, lists, and summarizes an expense', async () => {
        const token = await adminToken();

        const created = await request(app)
            .post('/api/admin/expenses')
            .set(auth(token))
            .send({
                category: 'marketing',
                amount: 1500,
                description: 'Facebook ads',
                date: '2026-06-15'
            });

        expect(created.status).toBe(201);
        expect(created.body.data.category).toBe('marketing');
        expect(created.body.data.amount).toBe(1500);

        const list = await request(app)
            .get('/api/admin/expenses')
            .set(auth(token));

        expect(list.status).toBe(200);
        expect(list.body.data).toHaveLength(1);
        expect(list.body.totalAmount).toBe(1500);

        const summary = await request(app)
            .get('/api/admin/expenses/summary?startDate=2026-06-01&endDate=2026-06-30')
            .set(auth(token));

        expect(summary.status).toBe(200);
        expect(summary.body.data.byCategory.marketing.total).toBe(1500);
        expect(summary.body.data.grandTotal).toBe(1500);
    });

    test('rejects staff without manage_settings permission', async () => {
        const token = await adminToken({
            role: 'staff',
            permissions: ['manage_orders']
        });

        const res = await request(app)
            .post('/api/admin/expenses')
            .set(auth(token))
            .send({ category: 'other', amount: 100 });

        expect(res.status).toBe(403);
        expect(await Expense.countDocuments()).toBe(0);
    });
});
