/********************************************************************
 * Attendance Repository — Isolated Integration Tests
 * Stage 2 Step 2, Part 4 — 2026-09-13
 ********************************************************************/

const { describe, test, expect, afterEach, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const { create: createAdmin } = require('../../backend/src/repositories/adminRepository');
const { create: createEmployee } = require('../../backend/src/repositories/employeeRepository');
const {
  computeHoursWorked,
  markAttendance,
  clockIn,
  clockOut,
  getSummary
} = require('../../backend/src/repositories/attendanceRepository');

const PREFIX = `__test_att_${Date.now()}_`;
const createdAttendanceIds = [];
const createdEmployeeIds = [];
const createdAdminIds = [];

async function cleanup() {
  if (createdAttendanceIds.length) {
    await prisma.attendance.deleteMany({ where: { id: { in: [...createdAttendanceIds] } } });
    createdAttendanceIds.length = 0;
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

function trackAttendance(record) {
  if (record?.id) createdAttendanceIds.push(record.id);
  return record;
}

describe('Attendance repository — computeHoursWorked', () => {
  test('normal clock in/out computes rounded hours', () => {
    const clockIn = new Date('2026-01-15T09:00:00');
    const clockOut = new Date('2026-01-15T17:00:00');
    expect(computeHoursWorked(clockIn, clockOut)).toBe(8);
  });

  test('missing clockOut yields 0', () => {
    const clockIn = new Date('2026-01-15T09:00:00');
    expect(computeHoursWorked(clockIn, null)).toBe(0);
  });

  test('clockOut before clockIn yields 0', () => {
    const clockIn = new Date('2026-01-15T17:00:00');
    const clockOut = new Date('2026-01-15T09:00:00');
    expect(computeHoursWorked(clockIn, clockOut)).toBe(0);
  });
});

describe('Attendance repository — polymorphic staff + Neon DB', () => {
  test('markAttendance populates adminId for admin staffType', async () => {
    const admin = await createAdmin({
      username: `${PREFIX}admin_att`,
      password: 'AttAdmin123!',
      role: 'staff'
    });
    createdAdminIds.push(admin.id);

    const record = trackAttendance(await markAttendance({
      staffType: 'admin',
      staffId: admin.username,
      date: new Date('2026-06-10'),
      status: 'present'
    }));

    const row = await prisma.attendance.findUnique({ where: { id: record.id } });
    expect(row.adminId).toBe(admin.id);
    expect(row.employeeId).toBeNull();
    expect(row.staffType).toBe('ADMIN');
    expect(row.staffId).toBe(admin.id);
  });

  test('markAttendance populates employeeId for employee staffType', async () => {
    const employee = await createEmployee({
      fullName: `${PREFIX} Att Employee`,
      phone: `018${String(Date.now()).slice(-8)}`
    });
    createdEmployeeIds.push(employee.id);

    const record = trackAttendance(await markAttendance({
      staffType: 'employee',
      staffId: employee.employeeId,
      date: new Date('2026-06-11'),
      status: 'absent'
    }));

    const row = await prisma.attendance.findUnique({ where: { id: record.id } });
    expect(row.employeeId).toBe(employee.id);
    expect(row.adminId).toBeNull();
    expect(row.staffType).toBe('EMPLOYEE');
    expect(row.staffId).toBe(employee.id);
  });

  test('clockOut applies computeHoursWorked to stored clock times', async () => {
    const admin = await createAdmin({
      username: `${PREFIX}clock_admin`,
      password: 'ClockAdmin123!',
      role: 'staff'
    });
    createdAdminIds.push(admin.id);

    const workDate = new Date('2026-06-15T12:00:00');
    const normalized = new Date('2026-06-15T00:00:00');

    const created = trackAttendance(await markAttendance({
      staffType: 'admin',
      staffId: admin.username,
      date: workDate,
      status: 'present'
    }));

    const clockInTime = new Date('2026-06-15T09:00:00');
    const clockOutTime = new Date('2026-06-15T17:00:00');
    await prisma.attendance.update({
      where: { id: created.id },
      data: {
        clockIn: clockInTime,
        clockOut: clockOutTime,
        hoursWorked: computeHoursWorked(clockInTime, clockOutTime)
      }
    });

    const row = await prisma.attendance.findUnique({ where: { id: created.id } });
    expect(Number(row.hoursWorked)).toBe(8);
  });

  test('getSummary returns counts for the month', async () => {
    const admin = await createAdmin({
      username: `${PREFIX}summary_admin`,
      password: 'Summary123!',
      role: 'staff'
    });
    createdAdminIds.push(admin.id);

    trackAttendance(await markAttendance({
      staffType: 'admin',
      staffId: admin.username,
      date: new Date('2026-03-05'),
      status: 'present'
    }));

    const summary = await getSummary('admin', admin.username, 3, 2026);
    expect(summary.present).toBeGreaterThanOrEqual(1);
    expect(summary.period.month).toBe(3);
  });
});
