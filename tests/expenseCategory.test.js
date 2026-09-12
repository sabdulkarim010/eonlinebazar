/********************************************************************
 * ERP Finance — Dynamic expense category integration tests.
 ********************************************************************/

const request = require('supertest');
const Expense = require('../backend/src/models/expense');
const ExpenseCategory = require('../backend/src/models/expenseCategory');
const { getApp, createTestAdmin } = require('./setup');

describe('ERP Finance — Expense Categories', () => {
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

    test('rejects unauthenticated category access', async () => {
        const res = await request(app).get('/api/admin/expense-categories');
        expect(res.status).toBe(401);
    });

    test('lists active categories for dropdowns', async () => {
        const token = await adminToken();

        const res = await request(app)
            .get('/api/admin/expense-categories')
            .set(auth(token));

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.length).toBeGreaterThanOrEqual(8);
        expect(res.body.data.some((row) => row.slug === 'other')).toBe(true);
    });

    test('creates, toggles, and deletes a custom category', async () => {
        const token = await adminToken();

        const created = await request(app)
            .post('/api/admin/expense-categories')
            .set(auth(token))
            .send({ name: 'Raw Materials' });

        expect(created.status).toBe(201);
        expect(created.body.data.slug).toBe('raw_materials');

        const toggled = await request(app)
            .patch(`/api/admin/expense-categories/${created.body.data._id}/toggle`)
            .set(auth(token));

        expect(toggled.status).toBe(200);
        expect(toggled.body.data.isActive).toBe(false);

        const deleted = await request(app)
            .delete(`/api/admin/expense-categories/${created.body.data._id}`)
            .set(auth(token));

        expect(deleted.status).toBe(200);
        expect(await ExpenseCategory.countDocuments({ slug: 'raw_materials' })).toBe(0);
    });

    test('blocks deletion of system default categories', async () => {
        const token = await adminToken();
        const officeRent = await ExpenseCategory.findOne({ slug: 'office_rent' });

        const res = await request(app)
            .delete(`/api/admin/expense-categories/${officeRent._id}`)
            .set(auth(token));

        expect(res.status).toBe(403);
    });

    test('toggles Other custom input and validates expense payload', async () => {
        const token = await adminToken();

        const disabled = await request(app)
            .patch('/api/admin/expense-categories/other-custom-toggle')
            .set(auth(token))
            .send({ enabled: false });

        expect(disabled.status).toBe(200);

        const withoutCustomWhenDisabled = await request(app)
            .post('/api/admin/expenses')
            .set(auth(token))
            .send({ category: 'other', amount: 500, date: '2026-06-01' });

        expect(withoutCustomWhenDisabled.status).toBe(201);
        expect(withoutCustomWhenDisabled.body.data.customCategoryName).toBe('');

        const enabled = await request(app)
            .patch('/api/admin/expense-categories/other-custom-toggle')
            .set(auth(token))
            .send({ enabled: true });

        expect(enabled.status).toBe(200);

        const missingCustomWhenEnabled = await request(app)
            .post('/api/admin/expenses')
            .set(auth(token))
            .send({ category: 'other', amount: 250, date: '2026-06-02' });

        expect(missingCustomWhenEnabled.status).toBe(400);

        const withCustom = await request(app)
            .post('/api/admin/expenses')
            .set(auth(token))
            .send({
                category: 'other',
                customCategoryName: 'Fabric / Raw Materials',
                amount: 500,
                date: '2026-06-01'
            });

        expect(withCustom.status).toBe(201);
        expect(withCustom.body.data.category).toBe('other');
        expect(withCustom.body.data.customCategoryName).toBe('Fabric / Raw Materials');
        expect(await Expense.countDocuments()).toBe(2);
    });

    test('blocks delete when category has linked expenses', async () => {
        const token = await adminToken();

        const created = await request(app)
            .post('/api/admin/expense-categories')
            .set(auth(token))
            .send({ name: 'Tailoring Costs' });

        await request(app)
            .post('/api/admin/expenses')
            .set(auth(token))
            .send({
                category: created.body.data.slug,
                amount: 200,
                date: '2026-06-10'
            });

        const res = await request(app)
            .delete(`/api/admin/expense-categories/${created.body.data._id}`)
            .set(auth(token));

        expect(res.status).toBe(409);
    });
});
