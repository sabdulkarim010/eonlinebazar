/********************************************************************
 * BlacklistedIp Repository — null expiresAt integration test
 *
 * Verifies audit-critical behaviour: permanent bans store expiresAt as
 * null in Postgres, not a default placeholder date.
 *
 * Stage 2 Step 3, Part 4 — 2026-09-14
 ********************************************************************/

const { describe, test, expect, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  upsertFromMongo,
  findByIp,
  remove,
  normalizeExpiresAt
} = require('../../backend/src/repositories/blacklistedIpRepository');

const TEST_IP = `203.0.113.${Date.now() % 250}`;
let createdId = null;

afterAll(async () => {
  if (createdId) {
    await prisma.blacklistedIp.deleteMany({ where: { id: createdId } }).catch(() => {});
  } else {
    await prisma.blacklistedIp.deleteMany({ where: { ip: TEST_IP } }).catch(() => {});
  }
});

describe('blacklistedIpRepository — expiresAt handling', () => {
  test('normalizeExpiresAt(null) returns null', () => {
    expect(normalizeExpiresAt(null)).toBe(null);
    expect(normalizeExpiresAt(undefined)).toBe(null);
    expect(normalizeExpiresAt('')).toBe(null);
  });

  test('upsertFromMongo stores null expiresAt for permanent bans', async () => {
    const mongoLikeDoc = {
      _id: `mongo_${Date.now()}`,
      ip: TEST_IP,
      reason: 'Permanent test ban',
      source: 'manual',
      blockedBy: 'test',
      blockedAt: new Date(),
      expiresAt: null
    };

    const row = await upsertFromMongo(mongoLikeDoc);
    createdId = row.id;

    expect(row.expiresAt).toBe(null);

    const loaded = await findByIp(TEST_IP);
    expect(loaded).not.toBe(null);
    expect(loaded.expiresAt).toBe(null);
    expect(loaded.reason).toBe('Permanent test ban');

    await remove(row.id);
    createdId = null;
  });
});
