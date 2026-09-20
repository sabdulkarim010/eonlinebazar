const { describe, test, expect, beforeAll, afterAll } = require('./jestCompat');
require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  upsertUserSessionInPG,
  getUserSessionByToken,
  deleteUserSessionInPG,
  deleteExpiredUserSessionsFromPG
} = require('../../backend/src/repositories/userSessionRepository');

const PREFIX = `test_usess_${Date.now()}_`;
const createdSessionLegacyIds = [];
const createdUserIds = [];

let testUserLegacyId;

function createMockMongoUserSession(overrides = {}) {
  const uniqueId = Math.random().toString(36).substr(2, 9);
  return {
    _id: `${PREFIX}${uniqueId}`,
    sessionId: `${PREFIX}sid-${uniqueId}`,
    userId: testUserLegacyId,
    userAgent: 'test-agent',
    device: 'Test Device',
    browser: 'Test Browser',
    ipAddress: '127.0.0.1',
    location: 'Dhaka, Bangladesh',
    createdAt: new Date(),
    lastActiveAt: new Date(),
    ...overrides
  };
}

beforeAll(async () => {
  const userLegacyId = `${PREFIX}user`;
  const user = await prisma.user.create({
    data: {
      legacyId: userLegacyId,
      email: `${PREFIX}@example.com`,
      password: 'hashed',
      firstName: 'Session',
      lastName: 'User'
    }
  });
  createdUserIds.push(user.id);
  testUserLegacyId = userLegacyId;
});

afterAll(async () => {
  if (createdSessionLegacyIds.length) {
    await prisma.userSession.deleteMany({ where: { legacyId: { in: [...createdSessionLegacyIds] } } });
  }
  await prisma.userSession.deleteMany({ where: { sessionId: { startsWith: PREFIX } } });
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: [...createdUserIds] } } });
  }
});

describe('UserSession repository — real Neon DB', () => {
  test('Test 1: upsertUserSessionInPG() creates session', async () => {
    const mongoDoc = createMockMongoUserSession();
    createdSessionLegacyIds.push(mongoDoc._id);

    const result = await upsertUserSessionInPG(mongoDoc);

    expect(result).toBeDefined();
    expect(result._id).toBe(String(mongoDoc._id));
    expect(result.sessionId).toBe(mongoDoc.sessionId);
  });

  test('Test 2: getUserSessionByToken() returns correct session', async () => {
    const mongoDoc = createMockMongoUserSession();
    createdSessionLegacyIds.push(mongoDoc._id);

    await upsertUserSessionInPG(mongoDoc);
    const found = await getUserSessionByToken(mongoDoc.sessionId);

    expect(found).toBeDefined();
    expect(found.sessionId).toBe(mongoDoc.sessionId);
  });

  test('Test 3: deleteUserSessionInPG() removes session', async () => {
    const mongoDoc = createMockMongoUserSession();
    await upsertUserSessionInPG(mongoDoc);

    await deleteUserSessionInPG(mongoDoc._id);
    const after = await prisma.userSession.findUnique({ where: { legacyId: String(mongoDoc._id) } });
    expect(after).toBeNull();
  });

  test('Test 4: deleteExpiredUserSessionsFromPG() removes only expired sessions', async () => {
    const expired = createMockMongoUserSession({
      lastActiveAt: new Date('2020-01-01T00:00:00.000Z')
    });
    const active = createMockMongoUserSession({
      lastActiveAt: new Date('2099-01-01T00:00:00.000Z')
    });
    createdSessionLegacyIds.push(active._id);

    await upsertUserSessionInPG(expired);
    await upsertUserSessionInPG(active);

    const removed = await deleteExpiredUserSessionsFromPG(new Date());

    expect(removed).toBeGreaterThanOrEqual(1);

    const expiredAfter = await prisma.userSession.findUnique({ where: { legacyId: String(expired._id) } });
    const activeAfter = await prisma.userSession.findUnique({ where: { legacyId: String(active._id) } });

    expect(expiredAfter).toBeNull();
    expect(activeAfter).toBeDefined();
  });
});
