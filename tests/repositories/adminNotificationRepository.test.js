const { describe, test, expect, afterAll } = require('./jestCompat');
require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  upsertAdminNotificationInPG,
  listAdminNotificationsFromPG,
  markAdminNotificationReadInPG,
  deleteAdminNotificationInPG
} = require('../../backend/src/repositories/adminNotificationRepository');

const PREFIX = `test_notif_${Date.now()}_`;
const createdLegacyIds = [];

function createMockMongoNotification(overrides = {}) {
  const uniqueId = Math.random().toString(36).substr(2, 9);
  return {
    _id: `${PREFIX}${uniqueId}`,
    recipientId: `${PREFIX}admin_recipient`,
    type: 'system',
    title: `${PREFIX}Alert`,
    message: 'Test notification message',
    link: '/admin',
    isRead: false,
    createdAt: new Date(),
    ...overrides
  };
}

afterAll(async () => {
  if (createdLegacyIds.length) {
    await prisma.adminNotification.deleteMany({ where: { legacyId: { in: [...createdLegacyIds] } } });
  }
});

describe('AdminNotification repository — real Neon DB', () => {
  test('Test 1: upsertAdminNotificationInPG() creates record', async () => {
    const mongoDoc = createMockMongoNotification();
    createdLegacyIds.push(mongoDoc._id);

    const result = await upsertAdminNotificationInPG(mongoDoc);

    expect(result).toBeDefined();
    expect(result._id).toBe(String(mongoDoc._id));
    expect(result.title).toBe(mongoDoc.title);
    expect(result.isRead).toBe(false);
  });

  test('Test 2: listAdminNotificationsFromPG() returns array', async () => {
    const mongoDoc = createMockMongoNotification();
    createdLegacyIds.push(mongoDoc._id);

    await upsertAdminNotificationInPG(mongoDoc);
    const rows = await listAdminNotificationsFromPG({ recipientId: mongoDoc.recipientId });

    expect(Array.isArray(rows)).toBe(true);
    expect(rows.find((n) => n._id === String(mongoDoc._id))).toBeDefined();
  });

  test('Test 3: markAdminNotificationReadInPG() sets isRead to true', async () => {
    const mongoDoc = createMockMongoNotification({ isRead: false });
    createdLegacyIds.push(mongoDoc._id);

    await upsertAdminNotificationInPG(mongoDoc);
    const updated = await markAdminNotificationReadInPG(mongoDoc._id);

    expect(updated).toBeDefined();
    expect(updated.isRead).toBe(true);
  });

  test('Test 4: deleteAdminNotificationInPG() removes record', async () => {
    const mongoDoc = createMockMongoNotification();
    await upsertAdminNotificationInPG(mongoDoc);

    await deleteAdminNotificationInPG(mongoDoc._id);
    const after = await prisma.adminNotification.findUnique({ where: { legacyId: String(mongoDoc._id) } });
    expect(after).toBeNull();
  });
});
