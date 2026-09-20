const { describe, test, expect, beforeAll, afterAll } = require('./jestCompat');
require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  upsertAdminSessionInPG,
  getAdminSessionByToken,
  deleteAdminSessionInPG,
  deleteExpiredAdminSessionsFromPG
} = require('../../backend/src/repositories/adminSessionRepository');

const PREFIX = `test_admsess_${Date.now()}_`;
const createdSessionLegacyIds = [];
const createdAdminIds = [];

let testAdminUsername;

function createMockMongoAdminSession(overrides = {}) {
  const uniqueId = Math.random().toString(36).substr(2, 9);
  return {
    _id: `${PREFIX}${uniqueId}`,
    sessionId: `${PREFIX}sid-${uniqueId}`,
    adminUsername: testAdminUsername,
    ipAddress: '127.0.0.1',
    location: 'Dhaka, Bangladesh',
    os: 'Windows',
    browser: 'Chrome',
    deviceType: 'Desktop',
    device: 'Windows · Chrome',
    userAgent: 'test-agent',
    status: 'active',
    lastActive: new Date(),
    ...overrides
  };
}

beforeAll(async () => {
  testAdminUsername = `${PREFIX}admin_user`;
  const admin = await prisma.admin.create({
    data: {
      legacyId: `${PREFIX}admin_legacy`,
      username: testAdminUsername,
      password: 'hashed',
      name: 'Test Admin'
    }
  });
  createdAdminIds.push(admin.id);
});

afterAll(async () => {
  if (createdSessionLegacyIds.length) {
    await prisma.adminSession.deleteMany({ where: { legacyId: { in: [...createdSessionLegacyIds] } } });
  }
  await prisma.adminSession.deleteMany({ where: { sessionId: { startsWith: PREFIX } } });
  if (createdAdminIds.length) {
    await prisma.admin.deleteMany({ where: { id: { in: [...createdAdminIds] } } });
  }
});

describe('AdminSession repository — real Neon DB', () => {
  test('Test 1: upsertAdminSessionInPG() creates session', async () => {
    const mongoDoc = createMockMongoAdminSession();
    createdSessionLegacyIds.push(mongoDoc._id);

    const result = await upsertAdminSessionInPG(mongoDoc);

    expect(result).toBeDefined();
    expect(result._id).toBe(String(mongoDoc._id));
    expect(result.sessionId).toBe(mongoDoc.sessionId);
    expect(result.status).toBe('active');
  });

  test('Test 2: getAdminSessionByToken() returns correct session', async () => {
    const mongoDoc = createMockMongoAdminSession();
    createdSessionLegacyIds.push(mongoDoc._id);

    await upsertAdminSessionInPG(mongoDoc);
    const found = await getAdminSessionByToken(mongoDoc.sessionId);

    expect(found).toBeDefined();
    expect(found.sessionId).toBe(mongoDoc.sessionId);
  });

  test('Test 3: deleteAdminSessionInPG() removes session', async () => {
    const mongoDoc = createMockMongoAdminSession();
    await upsertAdminSessionInPG(mongoDoc);

    await deleteAdminSessionInPG(mongoDoc._id);
    const after = await prisma.adminSession.findUnique({ where: { legacyId: String(mongoDoc._id) } });
    expect(after).toBeNull();
  });

  test('Test 4: deleteExpiredAdminSessionsFromPG() removes only expired sessions', async () => {
    const expired = createMockMongoAdminSession({
      lastActive: new Date('2020-01-01T00:00:00.000Z')
    });
    const active = createMockMongoAdminSession({
      lastActive: new Date('2099-01-01T00:00:00.000Z')
    });
    createdSessionLegacyIds.push(active._id);

    await upsertAdminSessionInPG(expired);
    await upsertAdminSessionInPG(active);

    const removed = await deleteExpiredAdminSessionsFromPG(new Date());

    expect(removed).toBeGreaterThanOrEqual(1);

    const expiredAfter = await prisma.adminSession.findUnique({ where: { legacyId: String(expired._id) } });
    const activeAfter = await prisma.adminSession.findUnique({ where: { legacyId: String(active._id) } });

    expect(expiredAfter).toBeNull();
    expect(activeAfter).toBeDefined();
  });
});
