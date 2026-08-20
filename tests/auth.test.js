const request = require('supertest');
const User = require('../backend/src/models/user');
const { getApp, createTestUser, getAuthToken } = require('./setup');

describe('Auth API', () => {
    const app = getApp();

    test('POST /api/customer/register — should create a new user and return 201', async () => {
        const res = await request(app)
            .post('/api/customer/register')
            .send({
                firstName: 'Karim',
                lastName: 'Sheikh',
                mobile: '01712345678',
                email: 'newuser@test.local',
                password: 'SecurePass123!'
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);

        const user = await User.findOne({ email: 'newuser@test.local' });
        expect(user).toBeTruthy();
        expect(user.isVerified).toBe(false);
    });

    test('POST /api/customer/register with same email — should return 400 (duplicate)', async () => {
        await createTestUser({ email: 'duplicate@test.local' });

        const res = await request(app)
            .post('/api/customer/register')
            .send({
                firstName: 'Another',
                lastName: 'User',
                mobile: '01798765432',
                email: 'duplicate@test.local',
                password: 'SecurePass123!'
            });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/already exists/i);
    });

    test('POST /api/customer/login with correct credentials — should return 200 with token', async () => {
        const { email, password } = await createTestUser({
            email: 'loginuser@test.local',
            password: 'SecurePass123!'
        });

        const res = await request(app)
            .post('/api/customer/login')
            .send({ email, password });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.token).toBeTruthy();
    });

    test('POST /api/customer/login with wrong password — should return 401', async () => {
        const { email } = await createTestUser({
            email: 'wrongpass@test.local',
            password: 'SecurePass123!'
        });

        const res = await request(app)
            .post('/api/customer/login')
            .send({ email, password: 'WrongPassword999!' });

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    test('GET /api/customer/verify/:token with valid token — should return 200 and mark user verified', async () => {
        const verificationToken = 'valid-verification-token-abc123';
        await User.create({
            firstName: 'Verify',
            lastName: 'Me',
            mobile: '01812345678',
            email: 'verifyme@test.local',
            password: 'hashed-placeholder',
            isVerified: false,
            verificationToken,
            verificationTokenExpiry: new Date(Date.now() + 60 * 60 * 1000)
        });

        const res = await request(app)
            .get(`/api/customer/verify/${verificationToken}`)
            .query({ format: 'json' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const user = await User.findOne({ email: 'verifyme@test.local' });
        expect(user.isVerified).toBe(true);
        expect(user.verificationToken).toBeNull();
    });

    test('GET /api/customer/verify/:badtoken — should return 400', async () => {
        const res = await request(app)
            .get('/api/customer/verify/not-a-real-token')
            .query({ format: 'json' });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });
});
