/********************************************************************
 * AttendanceLock Repository — Isolated Integration Tests
 ********************************************************************/

const { describe, test, expect, afterEach, afterAll, withRepositoryRetry } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  lockDate,
  unlockDate,
  getLockStatus,
  isDateLocked
} = require('../../backend/src/repositories/attendanceLockRepository');

const PREFIX = `__test_attlock_${Date.now()}_`;
/** Fixed past calendar day — avoids flaky FUTURE_DATE from random 2026-* fixtures. */
const PAST_LOCK_DATE = '2025-01-01';
const FUTURE_LOCK_DATE = '2099-12-31';
const createdLockDates = [];

async function cleanup() {
  if (createdLockDates.length) {
    await withRepositoryRetry(async () => {
      await prisma.attendanceLock.deleteMany({
        where: { date: { in: [...createdLockDates] } }
      });
    });
    createdLockDates.length = 0;
  }
}

afterEach(async () => { await cleanup(); });
afterAll(async () => { await cleanup(); });

describe('AttendanceLock repository', () => {
  test('lockDate() / isDateLocked() / getLockStatus() work correctly', async () => {
    const dateKey = PAST_LOCK_DATE;
    createdLockDates.push(dateKey);

    await withRepositoryRetry(async () => {
      await prisma.attendanceLock.deleteMany({ where: { date: dateKey } });
    });

    expect(await isDateLocked(dateKey)).toBe(false);

    const locked = await lockDate(dateKey, 'admin-id', 'Super Admin');
    expect(locked.date).toBe(dateKey);
    expect(locked.lockedByName).toBe('Super Admin');

    expect(await isDateLocked(dateKey)).toBe(true);

    const status = await getLockStatus(dateKey);
    expect(status.isLocked).toBe(true);
    expect(status.lockedBy).toBe('admin-id');
  });

  test('unlockDate() removes the lock row', async () => {
    const dateKey = '2025-01-02';
    createdLockDates.push(dateKey);

    await lockDate(dateKey, 'admin-id', 'Super Admin');
    const result = await unlockDate(dateKey);
    expect(result.deleted).toBe(true);
    expect(await isDateLocked(dateKey)).toBe(false);
    createdLockDates.length = 0;
  });

  test('lockDate() rejects future dates', async () => {
    await expect(lockDate(FUTURE_LOCK_DATE, 'admin-id', 'Super Admin')).rejects.toMatchObject({
      code: 'FUTURE_DATE',
      message: 'Future dates cannot be locked.'
    });
  });
});
