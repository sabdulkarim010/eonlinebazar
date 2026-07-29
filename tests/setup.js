/********************************************************************
 * Jest global setup — in-memory MongoDB, mocks, and shared helpers.
 ********************************************************************/

jest.mock('nodemailer', () => ({
    createTransport: jest.fn(() => ({
        sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
        verify: jest.fn().mockResolvedValue(true)
    }))
}));

jest.mock('cloudinary', () => ({
    v2: {
        config: jest.fn(),
        uploader: {
            upload: jest.fn().mockResolvedValue({ secure_url: 'https://test.cloudinary/mock.jpg', public_id: 'mock' }),
            upload_stream: jest.fn((opts, cb) => {
                cb(null, { secure_url: 'https://test.cloudinary/mock.jpg', public_id: 'mock' });
            }),
            destroy: jest.fn().mockResolvedValue({ result: 'ok' })
        }
    }
}));

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/user');
const Admin = require('../models/admin');
const { seedDefaultPaymentMethods } = require('../utils/paymentMethodService');

let mongoServer;

function configureTestEnv() {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.JWT_SECRET = 'test-jwt-secret-for-smoke-tests-only-64chars-long!!';
    process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eonlinebazar-test';
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';
    process.env.SMTP_HOST = 'smtp.test.local';
    process.env.SMTP_USER = 'test@test.local';
    process.env.SMTP_PASS = 'test-pass';
    process.env.EMAIL_USER = 'test@test.local';
    process.env.EMAIL_PASS = 'test-pass';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    process.env.ADMIN_PASSWORD = 'TestAdminPass123!';
    process.env.GEO_ALLOW_PRIVATE = 'true';
    delete process.env.SSLCOMMERZ_STORE_ID;
    delete process.env.SSLCOMMERZ_STORE_PASSWORD;
}

configureTestEnv();

function getApp() {
    return require('./app');
}

async function createTestUser(overrides = {}) {
    const password = overrides.password || 'TestPass123!';
    const email = overrides.email || `customer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const mobile = overrides.mobile || `017${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
        firstName: 'Test',
        lastName: 'Customer',
        mobile,
        email: email.toLowerCase(),
        password: hashedPassword,
        isVerified: true,
        accountStatus: 'active',
        ...overrides,
        email: (overrides.email || email).toLowerCase(),
        password: hashedPassword,
        isVerified: overrides.isVerified !== undefined ? overrides.isVerified : true
    });

    return { user, email: user.email, password, mobile };
}

async function createTestAdmin(overrides = {}) {
    const password = overrides.password || 'TestAdminPass123!';
    const username = overrides.username || `admin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const admin = await Admin.create({
        username,
        password,
        email: 'admin@test.local',
        role: 'superadmin',
        status: 'active',
        twoFactorEnabled: false,
        ...overrides,
        username,
        password,
        twoFactorEnabled: overrides.twoFactorEnabled !== undefined ? overrides.twoFactorEnabled : false
    });

    return { admin, username, password };
}

async function getAuthToken(email, password) {
    const app = getApp();
    const res = await request(app)
        .post('/api/customer/login')
        .send({ email, password });

    if (res.status !== 200 || !res.body.token) {
        throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }

    return res.body.token;
}

async function clearDatabase() {
    const { collections } = mongoose.connection;
    const names = Object.keys(collections);
    await Promise.all(names.map((name) => collections[name].deleteMany({})));
}

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();

    await mongoose.connect(process.env.MONGODB_URI);
    await seedDefaultPaymentMethods();
});

afterEach(async () => {
    await clearDatabase();
    await seedDefaultPaymentMethods();
});

afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
        await mongoServer.stop();
    }
});

module.exports = {
    getApp,
    createTestUser,
    createTestAdmin,
    getAuthToken,
    clearDatabase
};
