/********************************************************************
 * Project: EonlineBazar
 * File: hrmStaffResolver.js
 * Location: backend/src/repositories/hrmStaffResolver.js
 * Description: Prisma-side polymorphic staff resolution for Attendance,
 *   Payroll, and Leave repositories. Mirrors utils/hrmStaffResolver.js
 *   but reads/writes Postgres via Prisma.
 *
 *   Every resolved subject includes BOTH legacy fields (staffId, staffType)
 *   AND the correct FK (adminId or employeeId) for dual representation.
 *
 *   NOT YET WIRED INTO THE APP — Stage 2 Step 2, Part 4 (2026-09-13).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseStaffSelector(raw) {
  const value = String(raw || '').trim();
  if (!value) return { staffType: 'admin' };

  if (value.includes(':')) {
    const [staffType, id] = value.split(':');
    return {
      staffType: staffType === 'employee' ? 'employee' : 'admin',
      staffId: id,
      staffUsername: staffType === 'admin' ? id : undefined,
      employeeId: staffType === 'employee' ? id : undefined
    };
  }

  return { staffType: 'admin', staffUsername: value };
}

async function findEmployeeRecord(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;

  if (UUID_PATTERN.test(value)) {
    const byId = await prisma.employee.findUnique({ where: { id: value } });
    if (byId) return byId;
  }

  const byLegacy = await prisma.employee.findUnique({ where: { legacyId: value } });
  if (byLegacy) return byLegacy;

  return prisma.employee.findFirst({
    where: {
      OR: [{ employeeId: value }, { phone: value }]
    }
  });
}

async function findAdminRecord(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;

  if (UUID_PATTERN.test(value)) {
    const byId = await prisma.admin.findUnique({ where: { id: value } });
    if (byId) return byId;
  }

  const byLegacy = await prisma.admin.findUnique({ where: { legacyId: value } });
  if (byLegacy) return byLegacy;

  return prisma.admin.findUnique({
    where: { username: value.toLowerCase() }
  });
}

/**
 * Resolve HRM subject from input. Returns null when not found.
 * Populates staffId (legacy string id), staffType, adminId/employeeId FKs.
 */
async function resolveStaffSubject(input = {}) {
  const staffType = String(input.staffType || 'admin').toLowerCase();

  if (staffType === 'employee') {
    const employee = await findEmployeeRecord(
      input.staffId || input.employeeId || input.staffUsername
    );
    if (!employee) return null;

    return {
      staffType: 'employee',
      staffId: employee.id,
      staffUsername: employee.employeeId,
      staffName: employee.fullName,
      shiftKey: employee.employeeId,
      baseSalary: Number(employee.baseSalary) || 0,
      adminId: null,
      employeeId: employee.id
    };
  }

  const account = await findAdminRecord(input.staffId || input.staffUsername);
  if (!account) return null;

  return {
    staffType: 'admin',
    staffId: account.id,
    staffUsername: account.username,
    staffName: account.name || account.displayName || account.username,
    shiftKey: account.username,
    baseSalary: Number(account.baseSalary) || 0,
    adminId: account.id,
    employeeId: null
  };
}

/** Build Prisma create/update payload fields for polymorphic staff columns. */
function staffFields(subject) {
  return {
    staffId: subject.staffId,
    staffType: subject.staffType === 'employee' ? 'EMPLOYEE' : 'ADMIN',
    staffUsername: subject.staffUsername || '',
    adminId: subject.adminId ?? null,
    employeeId: subject.employeeId ?? null
  };
}

function toStaffTypeEnum(value) {
  return String(value || '').toLowerCase() === 'employee' ? 'EMPLOYEE' : 'ADMIN';
}

module.exports = {
  UUID_PATTERN,
  parseStaffSelector,
  findEmployeeRecord,
  findAdminRecord,
  resolveStaffSubject,
  staffFields,
  toStaffTypeEnum
};
