/********************************************************************
 * Leave Repository — Isolated Integration Tests
 * Stage 2 Step 2, Part 4 — 2026-09-13
 ********************************************************************/

const { describe, test, expect, afterEach, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const { create: createAdmin } = require('../../backend/src/repositories/adminRepository');
const { create: createEmployee } = require('../../backend/src/repositories/employeeRepository');
const {
  countLeaveDays,
  apply,
  approve,
  getBalance
} = require('../../backend/src/repositories/leaveRepository');

const PREFIX = `__test_leave_${Date.now()}_`;
const createdLeaveIds = [];
const createdEmployeeIds = [];
const createdAdminIds = [];

async function cleanup() {
  if (createdLeaveIds.length) {
    await prisma.leave.deleteMany({ where: { id: { in: [...createdLeaveIds] } } });
    createdLeaveIds.length = 0;
  }
  if (createdEmployeeIds.length) {
    await prisma.employee.deleteMany({ where: { id: { in: [...createdEmployeeIds] } } });
    createdEmployeeIds.length = 0;
  }
  if (createdAdminIds.length) {
    await prisma.admin.deleteMany({ where: { id: { in: [...createdAdminIds] } } });
    createdAdminIds.length = 0;
  }
}

afterEach(async () => { await cleanup(); });
afterAll(async () => { await cleanup(); });

function trackLeave(record) {
  if (record?.id) createdLeaveIds.push(record.id);
  return record;
}

describe('Leave repository — countLeaveDays', () => {
  test('same-day leave counts as 1 (inclusive)', () => {
    expect(countLeaveDays('2026-07-01', '2026-07-01')).toBe(1);
  });

  test('multi-day range counts both endpoints inclusively', () => {
    expect(countLeaveDays('2026-07-01', '2026-07-03')).toBe(3);
  });

  test('invalid dates default to 1', () => {
    expect(countLeaveDays('invalid', '2026-07-01')).toBe(1);
  });
});

describe('Leave repository — polymorphic staff + Neon DB', () => {
  test('apply() sets adminId for admin staffType', async () => {
    const admin = await createAdmin({
      username: `${PREFIX}leave_admin`,
      password: 'LeaveAdmin123!',
      role: 'staff'
    });
    createdAdminIds.push(admin.id);

    const leave = trackLeave(await apply({
      staffType: 'admin',
      staffId: admin.username,
      leaveType: 'casual',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
      reason: 'Personal'
    }));

    expect(leave.totalDays).toBe(1);

    const row = await prisma.leave.findUnique({ where: { id: leave.id } });
    expect(row.adminId).toBe(admin.id);
    expect(row.employeeId).toBeNull();
    expect(row.staffId).toBe(admin.id);
  });

  test('apply() sets employeeId for employee staffType', async () => {
    const employee = await createEmployee({
      fullName: `${PREFIX} Leave Employee`,
      phone: `016${String(Date.now()).slice(-8)}`
    });
    createdEmployeeIds.push(employee.id);

    const leave = trackLeave(await apply({
      staffType: 'employee',
      staffId: employee.employeeId,
      leaveType: 'sick',
      startDate: '2026-08-05',
      endDate: '2026-08-07',
      reason: 'Medical'
    }));

    expect(leave.totalDays).toBe(3);

    const row = await prisma.leave.findUnique({ where: { id: leave.id } });
    expect(row.employeeId).toBe(employee.id);
    expect(row.adminId).toBeNull();
  });

  test('approve() and getBalance() track approved days', async () => {
    const admin = await createAdmin({
      username: `${PREFIX}leave_bal`,
      password: 'LeaveBal123!',
      role: 'staff'
    });
    createdAdminIds.push(admin.id);

    const leave = trackLeave(await apply({
      staffType: 'admin',
      staffId: admin.username,
      leaveType: 'annual',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      reason: 'Vacation'
    }));

    await approve(leave.id, 'supervisor');

    const balance = await getBalance('admin', admin.username, 2026);
    const annual = balance.balances.find((b) => b.leaveType === 'annual');
    expect(annual.used).toBe(3);
    expect(annual.remaining).toBe(17);
  });
});
