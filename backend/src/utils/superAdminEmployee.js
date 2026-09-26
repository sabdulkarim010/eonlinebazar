'use strict';

const mongoose = require('mongoose');
const Admin = require('../models/admin');
const Employee = require('../models/employee');
const { ROLES } = require('../config/permissions');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function usePostgresStaffLookup() {
  return process.env.REPOSITORY_TEST === '1' || mongoose.connection.readyState !== 1;
}

/**
 * Legacy Mongo _id strings for employees linked to the Super Admin account.
 * Used to block delete and exclude from operational HRM pickers/lists.
 */
async function getSuperAdminLinkedEmployeeLegacyIdsMongo() {
  const superAdmin = await Admin.findOne({ role: ROLES.SUPER_ADMIN })
    .sort({ createdAt: 1 })
    .select('employeeRef _id')
    .lean();

  if (!superAdmin) return [];

  const ids = new Set();
  if (superAdmin.employeeRef) ids.add(String(superAdmin.employeeRef));

  if (superAdmin._id) {
    const linked = await Employee.find({ linkedAdminId: String(superAdmin._id) })
      .select('_id')
      .lean();
    linked.forEach((row) => ids.add(String(row._id)));
  }

  return [...ids];
}

async function getSuperAdminLinkedEmployeeLegacyIdsPg() {
  const prisma = require('../config/prismaClient');
  const superAdmin = await prisma.admin.findFirst({
    where: { role: 'SUPERADMIN' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      legacyId: true,
      employee: {
        select: { id: true, legacyId: true }
      }
    }
  });

  if (!superAdmin) return [];

  const ids = new Set();
  if (superAdmin.employee?.legacyId) ids.add(superAdmin.employee.legacyId);
  if (superAdmin.employee?.id) ids.add(superAdmin.employee.id);

  const linked = await prisma.employee.findMany({
    where: { linkedAdminId: superAdmin.id },
    select: { id: true, legacyId: true }
  });

  linked.forEach((row) => {
    if (row.legacyId) ids.add(row.legacyId);
    ids.add(row.id);
  });

  return [...ids];
}

async function getSuperAdminLinkedEmployeeLegacyIds() {
  if (usePostgresStaffLookup()) {
    return getSuperAdminLinkedEmployeeLegacyIdsPg();
  }
  return getSuperAdminLinkedEmployeeLegacyIdsMongo();
}

async function isSuperAdminLinkedEmployeeMongo(employeeLegacyId) {
  const id = String(employeeLegacyId || '').trim();
  if (!id) return false;

  const linked = await Admin.findOne({
    role: ROLES.SUPER_ADMIN,
    employeeRef: id
  }).select('_id').lean();

  if (linked) return true;

  const ids = await getSuperAdminLinkedEmployeeLegacyIdsMongo();
  return ids.includes(id);
}

async function isSuperAdminLinkedEmployeePg(employeeLegacyId) {
  const id = String(employeeLegacyId || '').trim();
  if (!id) return false;

  const prisma = require('../config/prismaClient');
  const employeeMatch = UUID_PATTERN.test(id)
    ? { OR: [{ legacyId: id }, { id }] }
    : { legacyId: id };

  const linkedViaEmployee = await prisma.admin.findFirst({
    where: {
      role: 'SUPERADMIN',
      employee: employeeMatch
    },
    select: { id: true }
  });
  if (linkedViaEmployee) return true;

  const ids = await getSuperAdminLinkedEmployeeLegacyIdsPg();
  return ids.includes(id);
}

async function isSuperAdminLinkedEmployee(employeeLegacyId) {
  if (usePostgresStaffLookup()) {
    return isSuperAdminLinkedEmployeePg(employeeLegacyId);
  }
  return isSuperAdminLinkedEmployeeMongo(employeeLegacyId);
}

function buildMongoExcludeSuperAdminClause(excludeIds = []) {
  const objectIds = excludeIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!objectIds.length) return null;
  return { _id: { $nin: objectIds } };
}

/**
 * Prefer Employee.linkedAdminId as source of truth; repair Admin.employeeRef when mismatched.
 */
async function ensureSuperAdminBidirectionalEmployeeLink(adminAccount) {
  if (!adminAccount || adminAccount.role !== ROLES.SUPER_ADMIN) return null;

  const adminId = String(adminAccount._id || '');
  if (!adminId) return null;

  let canonical = await Employee.findOne({ linkedAdminId: adminId });
  if (canonical) {
    const ref = adminAccount.employeeRef ? String(adminAccount.employeeRef) : '';
    if (ref !== String(canonical._id)) {
      await Admin.updateOne({ _id: adminAccount._id }, { $set: { employeeRef: String(canonical._id) } });
      adminAccount.employeeRef = String(canonical._id);
    }
    return canonical;
  }

  if (adminAccount.employeeRef) {
    const byRef = await Employee.findById(adminAccount.employeeRef);
    if (byRef) {
      const linked = byRef.linkedAdminId ? String(byRef.linkedAdminId) : '';
      if (!linked || linked === adminId) {
        if (!linked) {
          byRef.linkedAdminId = adminId;
          await byRef.save();
        }
        return byRef;
      }
    }
    await Admin.updateOne({ _id: adminAccount._id }, { $unset: { employeeRef: 1 } });
    adminAccount.employeeRef = undefined;
  }

  return null;
}

module.exports = {
  getSuperAdminLinkedEmployeeLegacyIds,
  isSuperAdminLinkedEmployee,
  buildMongoExcludeSuperAdminClause,
  ensureSuperAdminBidirectionalEmployeeLink
};
