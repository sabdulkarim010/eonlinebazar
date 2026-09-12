/********************************************************************
 * ERP Finance — Advanced Profit & Loss report tests.
 ********************************************************************/

const request = require('supertest');
const { getApp, createTestAdmin } = require('./setup');

describe('ERP Finance — Profit & Loss', () => {
    const app = getApp();

    async function adminToken() {
        const { username, password } = await createTestAdmin({ role: 'superadmin' });
        const res = await request(app)
            .post('/admin/api/login')
            .send({ username, password });
        expect(res.status).toBe(200);
        return res.body.token;
    }

    function auth(token) {
        return { Authorization: `Bearer ${token}` };
    }

    test('returns the expected report shape for an empty date range', async () => {
        const token = await adminToken();

        const res = await request(app)
            .get('/api/admin/finance/profit-loss?startDate=2099-01-01&endDate=2099-01-31')
            .set(auth(token));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const report = res.body.data;
        expect(report.period.start).toBeTruthy();
        expect(report.period.end).toBeTruthy();
        expect(report.period.groupBy).toBeTruthy();
        expect(report.revenue).toMatchObject({
            gross: 0,
            returns: 0,
            net: 0
        });
        expect(report.costs.expensesTotal).toBe(0);
        expect(report.profit).toMatchObject({
            gross: 0,
            net: 0,
            marginPercent: 0
        });
        expect(Array.isArray(report.series)).toBe(true);
        expect(Array.isArray(report.topProducts)).toBe(true);
        expect(Array.isArray(report.worstProducts)).toBe(true);
    });

    test('empty-range zero case has no delivered orders', async () => {
        const token = await adminToken();

        const res = await request(app)
            .get('/api/admin/finance/profit-loss?startDate=2099-06-01&endDate=2099-06-30&groupBy=month')
            .set(auth(token));

        expect(res.status).toBe(200);
        expect(res.body.data.orders.delivered).toBe(0);
        expect(res.body.data.revenue.net).toBe(0);
        expect(res.body.data.profit.net).toBe(0);
    });
});
