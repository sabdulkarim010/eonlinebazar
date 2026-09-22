/********************************************************************
 * Project: EonlineBazar
 * File: hrmDualWriteHelpers.js
 * Location: backend/src/utils/hrmDualWriteHelpers.js
 * Description: Shared mappers for HRM dual-write (Stage 2 Step 3, Part 5).
 *   Polymorphic staff resolution stays inside repository functions —
 *   these helpers only map Mongoose documents to repository inputs.
 ********************************************************************/

'use strict';

function getEmployeeRepository() {
  return require('../repositories/employeeRepository');
}

function getAttendanceRepository() {
  return require('../repositories/attendanceRepository');
}

function getPayrollRepository() {
  return require('../repositories/payrollRepository');
}

function getLeaveRepository() {
  return require('../repositories/leaveRepository');
}

function mapMongoEmployeeToPostgresWrite(doc) {
  const plain = doc.toObject ? doc.toObject() : doc;
  return {
    fullName: plain.fullName,
    phone: plain.phone,
    dateOfBirth: plain.dateOfBirth,
    gender: plain.gender,
    bloodGroup: plain.bloodGroup,
    maritalStatus: plain.maritalStatus,
    religion: plain.religion,
    nationalId: plain.nationalId,
    photo: plain.photo,
    photoPublicId: plain.photoPublicId,
    alternatePhone: plain.alternatePhone,
    email: plain.email,
    presentAddress: plain.presentAddress,
    permanentAddress: plain.permanentAddress,
    address: plain.address,
    emergencyContactName: plain.emergencyContact?.name ?? plain.emergencyContactName,
    emergencyContactPhone: plain.emergencyContact?.phone ?? plain.emergencyContactPhone,
    emergencyContactRelation: plain.emergencyContact?.relation ?? plain.emergencyContactRelation,
    designation: plain.designation,
    role: plain.role,
    department: plain.department,
    employeeType: plain.employeeType,
    shift: plain.shift,
    joiningDate: plain.joiningDate,
    baseSalary: plain.baseSalary,
    salaryType: plain.salaryType,
    bankName: plain.bankName,
    bankAccountNumber: plain.bankAccountNumber,
    bkashNumber: plain.bkashNumber,
    status: plain.status,
    notes: plain.notes,
    employeeId: plain.employeeId,
    createdBy: plain.createdBy,
    legacyId: String(doc._id),
    references: Array.isArray(plain.references) ? plain.references : []
  };
}

async function resolvePostgresAdminId(mongoAdminId) {
  if (!mongoAdminId) return null;
  const prisma = require('../config/prismaClient');
  const row = await prisma.admin.findUnique({
    where: { legacyId: String(mongoAdminId) }
  });
  return row ? row.id : null;
}

async function mirrorAttendanceDoc(savedDoc) {
  await getAttendanceRepository().upsertFromMongo(savedDoc);
}

async function mirrorPayrollDoc(savedDoc) {
  await getPayrollRepository().upsertFromMongo(savedDoc);
}

async function mirrorLeaveApply(savedDoc) {
  const plain = savedDoc.toObject ? savedDoc.toObject() : savedDoc;
  await getLeaveRepository().apply({
    staffType: plain.staffType || 'admin',
    staffId: plain.staffId,
    staffUsername: plain.staffUsername,
    leaveType: plain.leaveType,
    startDate: plain.startDate,
    endDate: plain.endDate,
    reason: plain.reason,
    attachmentUrl: plain.attachmentUrl,
    legacyId: String(savedDoc._id)
  });
}

module.exports = {
  getEmployeeRepository,
  getAttendanceRepository,
  getPayrollRepository,
  getLeaveRepository,
  mapMongoEmployeeToPostgresWrite,
  resolvePostgresAdminId,
  mirrorAttendanceDoc,
  mirrorPayrollDoc,
  mirrorLeaveApply
};
