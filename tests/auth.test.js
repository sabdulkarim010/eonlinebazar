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
        expect(res.body.needsVerification).toBe(true);

        const user = await User.findOne({ email: 'newuser@test.local' });
        expect(user).toBeTruthy();
        expect(user.isVerified).toBe(false);
    });

    test('POST /api/customer/register with same email — should return 409 (duplicate)', async () => {
        await createTestUser({ email: 'duplicate@test.local' });

        const res = await request(app)
            .post('/api/customer/register')
            .send({
                firstName: 'Another',
                lastName: 'User',
                mobile: '01798765432',
                email: 'Duplicate@test.local',
                password: 'SecurePass123!'
            });

        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/already exists/i);
    });

    test('POST /api/customer/register with same mobile — should return 409', async () => {
        await createTestUser({ email: 'one@test.local', mobile: '01711112222' });

        const res = await request(app)
            .post('/api/customer/register')
            .send({
                firstName: 'Another',
                lastName: 'User',
                mobile: '01711112222',
                email: 'two@test.local',
                password: 'SecurePass123!'
            });

        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
    });

    test('POST /api/customer/register with short password — should return 400', async () => {
        const res = await request(app)
            .post('/api/customer/register')
            .send({
                firstName: 'Short',
                lastName: 'Pass',
                mobile: '01712345000',
                email: 'shortpass@test.local',
                password: '123'
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/password/i);
    });

    test('POST /api/customer/register with invalid mobile — should return 400', async () => {
        const res = await request(app)
            .post('/api/customer/register')
            .send({
                firstName: 'Bad',
                lastName: 'Mobile',
                mobile: '12345',
                email: 'badmobile@test.local',
                password: 'SecurePass123!'
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/mobile/i);
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

    test('POST /api/auth/register alias — should create a new user', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                firstName: 'Alias',
                lastName: 'User',
                mobile: '01912345678',
                email: 'alias-register@test.local',
                password: 'SecurePass123!'
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
    });

    test('POST /api/customer/login unverified — should return 403 when verification required', async () => {
        const previous = process.env.REQUIRE_EMAIL_VERIFICATION;
        process.env.REQUIRE_EMAIL_VERIFICATION = 'true';

        const { email, password } = await createTestUser({
            email: 'unverified@test.local',
            password: 'SecurePass123!',
            isVerified: false
        });

        const res = await request(app)
            .post('/api/customer/login')
            .send({ email, password });

        process.env.REQUIRE_EMAIL_VERIFICATION = previous;

        expect(res.status).toBe(403);
        expect(res.body.needsVerification).toBe(true);
        expect(res.body.email).toBe('unverified@test.local');
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

    test('POST /api/customer/resend-verification — should return 200 for unverified user', async () => {
        await createTestUser({
            email: 'resendme@test.local',
            isVerified: false
        });

        const res = await request(app)
            .post('/api/customer/resend-verification')
            .send({ email: 'ResendMe@test.local' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.emailSent).toBe(true);
    });

    test('GET /api/customer/verify/:badtoken — should return 400', async () => {
        const res = await request(app)
            .get('/api/customer/verify/not-a-real-token')
            .query({ format: 'json' });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('DELETE /api/auth/account with wrong password — should return 401', async () => {
        const { email, password } = await createTestUser({
            email: 'keep-me@test.local',
            password: 'SecurePass123!'
        });
        const token = await getAuthToken(email, password);

        const res = await request(app)
            .delete('/api/auth/account')
            .set('Authorization', `Bearer ${token}`)
            .send({ password: 'WrongPassword999!' });

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);

        const user = await User.findOne({ email: 'keep-me@test.local' });
        expect(user).toBeTruthy();
        expect(user.isDeleted).toBeFalsy();
    });

    test('DELETE /api/auth/account with password — should anonymize user and block login', async () => {
        const { email, password, user } = await createTestUser({
            email: 'gone@test.local',
            password: 'SecurePass123!'
        });
        const token = await getAuthToken(email, password);

        const res = await request(app)
            .delete('/api/auth/account')
            .set('Authorization', `Bearer ${token}`)
            .send({ password, reason: 'Play Store test' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const deleted = await User.findById(user._id);
        expect(deleted.isDeleted).toBe(true);
        expect(deleted.email).toMatch(/^deleted_/);
        expect(deleted.mobile).toBeNull();

        const loginRes = await request(app)
            .post('/api/customer/login')
            .send({ email, password });

        expect(loginRes.status).toBeGreaterThanOrEqual(400);
        expect(loginRes.body.success).toBe(false);
    });
});
