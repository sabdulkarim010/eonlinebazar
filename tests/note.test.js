const request = require('supertest');
const mongoose = require('mongoose');
const Note = require('../backend/src/models/note');
const { getApp, createTestUser, getAuthToken } = require('./setup');

describe('Notes API', () => {
    const app = getApp();

    async function authedUser(overrides = {}) {
        const created = await createTestUser(overrides);
        const token = await getAuthToken(created.email, created.password);
        return { ...created, token };
    }

    test('GET /api/notes without token — should be rejected', async () => {
        const res = await request(app).get('/api/notes');
        expect([401, 403]).toContain(res.status);
        expect(res.body.success).toBe(false);
    });

    test('POST /api/notes — should create a general note', async () => {
        const { token } = await authedUser();
        const res = await request(app)
            .post('/api/notes')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'Shopping list', content: 'Milk and eggs', type: 'general' });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.note.title).toBe('Shopping list');
        expect(res.body.note.type).toBe('general');
        expect(res.body.note.amount).toBeNull();
    });

    test('POST /api/notes expense without amount — should return 400', async () => {
        const { token } = await authedUser();
        const res = await request(app)
            .post('/api/notes')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'Lunch', type: 'expense' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/amount/i);
    });

    test('GET /api/notes — should return only the owner\'s notes, latest first', async () => {
        const owner = await authedUser({ email: 'owner-notes@test.local' });
        const other = await authedUser({ email: 'other-notes@test.local' });

        await request(app).post('/api/notes').set('Authorization', `Bearer ${owner.token}`)
            .send({ title: 'Mine A', type: 'general' });
        await request(app).post('/api/notes').set('Authorization', `Bearer ${owner.token}`)
            .send({ title: 'Mine B', type: 'expense', amount: 120.5 });
        await request(app).post('/api/notes').set('Authorization', `Bearer ${other.token}`)
            .send({ title: 'Not mine', type: 'general' });

        const res = await request(app)
            .get('/api/notes')
            .set('Authorization', `Bearer ${owner.token}`);

        expect(res.status).toBe(200);
        expect(res.body.notes).toHaveLength(2);
        expect(res.body.notes.every((n) => n.title !== 'Not mine')).toBe(true);
        expect(res.body.notes[0].title).toBe('Mine B');
        expect(res.body.summary.expenseTotal).toBe(120.5);
        expect(res.body.summary.expenseCount).toBe(1);
    });

    test('PUT /api/notes/:id — owner can update; other user gets 404', async () => {
        const owner = await authedUser({ email: 'upd-owner@test.local' });
        const other = await authedUser({ email: 'upd-other@test.local' });

        const created = await request(app).post('/api/notes')
            .set('Authorization', `Bearer ${owner.token}`)
            .send({ title: 'Draft', content: 'v1', type: 'general' });
        const id = created.body.note._id;

        const stolen = await request(app).put(`/api/notes/${id}`)
            .set('Authorization', `Bearer ${other.token}`)
            .send({ title: 'Hacked', content: 'nope', type: 'general' });
        expect(stolen.status).toBe(404);

        const updated = await request(app).put(`/api/notes/${id}`)
            .set('Authorization', `Bearer ${owner.token}`)
            .send({ title: 'Lunch', content: 'Office', type: 'expense', amount: 85 });
        expect(updated.status).toBe(200);
        expect(updated.body.note.type).toBe('expense');
        expect(updated.body.note.amount).toBe(85);
    });

    test('DELETE /api/notes/:id — owner can delete; invalid id is 404', async () => {
        const { token } = await authedUser();
        const created = await request(app).post('/api/notes')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'Temp', type: 'general' });
        const id = created.body.note._id;

        const missing = await request(app)
            .delete(`/api/notes/${new mongoose.Types.ObjectId()}`)
            .set('Authorization', `Bearer ${token}`);
        expect(missing.status).toBe(404);

        const deleted = await request(app)
            .delete(`/api/notes/${id}`)
            .set('Authorization', `Bearer ${token}`);
        expect(deleted.status).toBe(200);

        const leftover = await Note.findById(id);
        expect(leftover).toBeNull();
    });

    test('POST /api/notes — income, shopping list, and note type', async () => {
        const { token } = await authedUser();
        const auth = { Authorization: `Bearer ${token}` };

        const income = await request(app).post('/api/notes').set(auth)
            .send({ title: 'Salary', type: 'income', amount: 25000, category: 'other' });
        expect(income.status).toBe(201);
        expect(income.body.note.type).toBe('income');
        expect(income.body.note.amount).toBe(25000);

        const shopping = await request(app).post('/api/notes').set(auth)
            .send({
                title: 'Bazar',
                type: 'shopping',
                shoppingItems: [
                    { name: 'Rice', price: 80, checked: false },
                    { name: 'Oil', price: 180, checked: true }
                ],
                tags: ['weekly'],
                pinned: true,
                color: '#F0FFF0'
            });
        expect(shopping.status).toBe(201);
        expect(shopping.body.note.type).toBe('shopping');
        expect(shopping.body.note.shoppingItems).toHaveLength(2);
        expect(shopping.body.note.amount).toBe(260);
        expect(shopping.body.note.pinned).toBe(true);

        const diary = await request(app).post('/api/notes').set(auth)
            .send({ title: 'Ideas', type: 'note', content: 'Launch plan' });
        expect(diary.status).toBe(201);
        expect(diary.body.note.type).toBe('note');
        expect(diary.body.note.amount).toBeNull();
    });
});
