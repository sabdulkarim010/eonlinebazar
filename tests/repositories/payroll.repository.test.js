/********************************************************************
 * Payroll Repository — Isolated Integration Tests
 * Stage 2 Step 2, Part 4 — 2026-09-13
 ********************************************************************/

const { describe, test, expect, afterEach, afterAll } = require('./jestCompat');

require('dotenv').config();

const prisma = require('../../backend/src/config/prismaClient');
const { create: createAdmin } = require('../../backend/src/repositories/adminRepository');
const { create: createEmployee } = require('../../backend/src/repositories/employeeRepository');
const { markAttendance } = require('../../backend/src/repositories/attendanceRepository');
const {
  computeTotalSalary,
  generate,
  approve,
  markPaid
} = require('../../backend/src/repositories/payrollRepository');

const PREFIX = `__test_pay_${Date.now()}_`;
const createdPayrollIds = [];
const createdAttendanceIds = [];
const createdEmployeeIds = [];
const createdAdminIds = [];

async function cleanup() {
  if (createdPayrollIds.length) {
    await prisma.payroll.deleteMany({ where: { id: { in: [...createdPayrollIds] } } });
    createdPayrollIds.length = 0;
  }
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

function trackPayroll(record) {
  if (record?.id) createdPayrollIds.push(record.id);
  return record;
}

describe('Payroll repository — computeTotalSalary', () => {
  test('pro-rates base salary by present/working days', () => {
    const result = computeTotalSalary({
      baseSalary: 10000,
      workingDays: 20,
      presentDays: 10,
      overtime: 0,
      overtimeRate: 0,
      bonus: 500,
      deductions: 200
    });
    expect(result.overtimeAmount).toBe(0);
    expect(result.totalSalary).toBe(5300);
  });

  test('workingDays=0 pays full base (no division)', () => {
    const result = computeTotalSalary({
      baseSalary: 8000,
      workingDays: 0,
      presentDays: 0,
      overtime: 2,
      overtimeRate: 100,
      bonus: 0,
      deductions: 0
    });
    expect(result.overtimeAmount).toBe(200);
    expect(result.totalSalary).toBe(8200);
  });

  test('totalSalary never goes below 0', () => {
    const result = computeTotalSalary({
      baseSalary: 1000,
      workingDays: 10,
      presentDays: 2,
      overtime: 0,
      overtimeRate: 0,
      bonus: 0,
      deductions: 5000
    });
    expect(result.totalSalary).toBe(0);
  });
});

describe('Payroll repository — polymorphic staff + Neon DB', () => {
  test('generate() sets adminId FK for admin staff', async () => {
    const admin = await createAdmin({
      username: `${PREFIX}pay_admin`,
      password: 'PayAdmin123!',
      role: 'staff',
      baseSalary: 15000
    });
    createdAdminIds.push(admin.id);

    await prisma.admin.update({
      where: { id: admin.id },
      data: { baseSalary: 15000 }
    });

    const att = await markAttendance({
      staffType: 'admin',
      staffId: admin.username,
      date: new Date('2026-04-10'),
      status: 'present'
    });
    createdAttendanceIds.push(att.id);

    const payroll = trackPayroll(await generate('admin', admin.username, 4, 2026));

    const row = await prisma.payroll.findUnique({ where: { id: payroll.id } });
    expect(row.adminId).toBe(admin.id);
    expect(row.employeeId).toBeNull();
    expect(Number(row.totalSalary)).toBeGreaterThan(0);
  });

  test('generate() sets employeeId FK for employee staff', async () => {
    const employee = await createEmployee({
      fullName: `${PREFIX} Pay Employee`,
      phone: `019${String(Date.now()).slice(-8)}`,
      baseSalary: 12000
    });
    createdEmployeeIds.push(employee.id);

    const att = await markAttendance({
      staffType: 'employee',
      staffId: employee.employeeId,
      date: new Date('2026-05-12'),
      status: 'present'
    });
    createdAttendanceIds.push(att.id);

    const payroll = trackPayroll(await generate('employee', employee.employeeId, 5, 2026));

    const row = await prisma.payroll.findUnique({ where: { id: payroll.id } });
    expect(row.employeeId).toBe(employee.id);
    expect(row.adminId).toBeNull();
  });

  test('approve() and markPaid() transition status', async () => {
    const admin = await createAdmin({
      username: `${PREFIX}pay_flow`,
      password: 'PayFlow123!',
      role: 'staff'
    });
    createdAdminIds.push(admin.id);

    const payroll = trackPayroll(await generate('admin', admin.username, 6, 2026));
    const approved = await approve(payroll.id);
    expect(approved.status).toBe('approved');

    const paid = await markPaid(payroll.id, 'bank');
    expect(paid.status).toBe('paid');
    expect(paid.paymentMethod).toBe('bank');
  });
});
