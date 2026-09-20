/********************************************************************
 * AttendanceLock Repository — Isolated Integration Tests
 ********************************************************************/

const { describe, test, expect, afterEach, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const {
  lockDate,
  unlockDate,
  getLockStatus,
  isDateLocked,
  formatDateKey
} = require('../../backend/src/repositories/attendanceLockRepository');

const PREFIX = `__test_attlock_${Date.now()}_`;
const createdLockDates = [];

async function cleanup() {
  if (createdLockDates.length) {
    await prisma.attendanceLock.deleteMany({
      where: { date: { in: [...createdLockDates] } }
    });
    createdLockDates.length = 0;
  }
}

afterEach(async () => { await cleanup(); });
afterAll(async () => { await cleanup(); });

describe('AttendanceLock repository', () => {
  test('lockDate() / isDateLocked() / getLockStatus() work correctly', async () => {
    const dateKey = '2026-06-01';
    createdLockDates.push(dateKey);

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
    const dateKey = '2026-06-02';
    createdLockDates.push(dateKey);

    await lockDate(dateKey, 'admin-id', 'Super Admin');
    const result = await unlockDate(dateKey);
    expect(result.deleted).toBe(true);
    expect(await isDateLocked(dateKey)).toBe(false);
    createdLockDates.length = 0;
  });

  test('lockDate() rejects future dates', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const dateKey = formatDateKey(future);

    await expect(lockDate(dateKey, 'admin-id', 'Super Admin')).rejects.toMatchObject({
      code: 'FUTURE_DATE'
    });
  });
});
