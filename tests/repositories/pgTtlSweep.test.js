/********************************************************************
 * PG TTL Sweep — Integration Tests
 * Verifies deleteExpired* repository helpers used by pgTtlSweepJob.js
 *
 * Run: node --test --test-concurrency=1 tests/repositories/pgTtlSweep.test.js
 *
 * Stage 2 Step 3, Part 2.6 — 2026-09-20
 ********************************************************************/

const { describe, test, expect, afterEach } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const { deleteExpiredLoginAttemptsFromPG } = require('../../backend/src/repositories/loginAttemptRepository');
const { deleteExpiredBlacklistedIpsFromPG } = require('../../backend/src/repositories/blacklistedIpRepository');

const PREFIX = `test_ttl_${Date.now()}_`;
const createdLoginAttemptIds = [];
const createdBlacklistIps = [];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

afterEach(async () => {
  if (createdLoginAttemptIds.length) {
    await prisma.loginAttempt.deleteMany({
      where: { id: { in: [...createdLoginAttemptIds] } }
    });
    createdLoginAttemptIds.length = 0;
  }
  if (createdBlacklistIps.length) {
    await prisma.blacklistedIp.deleteMany({
      where: { ip: { in: [...createdBlacklistIps] } }
    });
    createdBlacklistIps.length = 0;
  }
});

describe('PG TTL sweep helpers — real Neon DB', () => {
  test('Test 1: deleteExpiredLoginAttemptsFromPG() deletes 31-day-old record', async () => {
    const legacyId = `${PREFIX}login_old_${Math.random().toString(36).slice(2, 8)}`;
    const row = await prisma.loginAttempt.create({
      data: {
        legacyId,
        username: `${PREFIX}user`,
        ipAddress: '203.0.113.10',
        status: 'FAILED',
        createdAt: daysAgo(31)
      }
    });
    createdLoginAttemptIds.push(row.id);

    await deleteExpiredLoginAttemptsFromPG();

    const after = await prisma.loginAttempt.findUnique({ where: { id: row.id } });
    expect(after).toBeNull();
  });

  test('Test 2: deleteExpiredBlacklistedIpsFromPG() deletes past expiresAt record', async () => {
    const ip = `${PREFIX}203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    createdBlacklistIps.push(ip);

    const row = await prisma.blacklistedIp.create({
      data: {
        legacyId: `${PREFIX}bl_old`,
        ip,
        reason: 'Expired ban test',
        expiresAt: daysAgo(1)
      }
    });

    await deleteExpiredBlacklistedIpsFromPG();

    const after = await prisma.blacklistedIp.findUnique({ where: { id: row.id } });
    expect(after).toBeNull();
  });

  test('Test 3: deleteExpiredLoginAttemptsFromPG() does NOT delete fresh record', async () => {
    const legacyId = `${PREFIX}login_fresh_${Math.random().toString(36).slice(2, 8)}`;
    const row = await prisma.loginAttempt.create({
      data: {
        legacyId,
        username: `${PREFIX}fresh`,
        ipAddress: '203.0.113.11',
        status: 'SUCCESS',
        createdAt: new Date()
      }
    });
    createdLoginAttemptIds.push(row.id);

    await deleteExpiredLoginAttemptsFromPG();

    const after = await prisma.loginAttempt.findUnique({ where: { id: row.id } });
    expect(after).toBeDefined();
    expect(after.legacyId).toBe(legacyId);
  });

  test('Test 4: deleteExpiredBlacklistedIpsFromPG() does NOT delete null expiresAt record', async () => {
    const ip = `${PREFIX}203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    createdBlacklistIps.push(ip);

    const row = await prisma.blacklistedIp.create({
      data: {
        legacyId: `${PREFIX}bl_perm`,
        ip,
        reason: 'Permanent ban test',
        expiresAt: null
      }
    });

    await deleteExpiredBlacklistedIpsFromPG();

    const after = await prisma.blacklistedIp.findUnique({ where: { id: row.id } });
    expect(after).toBeDefined();
    expect(after.expiresAt).toBeNull();
  });
});
