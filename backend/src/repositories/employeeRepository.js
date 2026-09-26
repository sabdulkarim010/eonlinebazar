/********************************************************************
 * Project: EonlineBazar
 * File: employeeRepository.js
 * Location: backend/src/repositories/employeeRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for the Employee model (Neon/PostgreSQL).
 *   Mirrors employeeController.js + employee.js Mongoose model.
 *   Reimplements generateEmployeeId, syncEmployeeAliases pre-save hook,
 *   and terminate → linked-admin-block cross-repository call.
 *
 *   NOT YET WIRED INTO THE APP — Stage 2 Step 2, Part 4 (2026-09-13).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');
const { update: updateAdmin } = require('./adminRepository');
const { findEmployeeRecord, UUID_PATTERN } = require('./hrmStaffResolver');

// ── Enum mapping ─────────────────────────────────────────────────────────────
function normaliseStatus(status) {
  if (status === 'ACTIVE') return 'active';
  if (status === 'INACTIVE') return 'inactive';
  if (status === 'TERMINATED') return 'terminated';
  return status ? String(status).toLowerCase() : status;
}

function toStatusEnum(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'inactive') return 'INACTIVE';
  if (v === 'terminated') return 'TERMINATED';
  return 'ACTIVE';
}

function normaliseEmployeeType(type) {
  if (type === 'PERMANENT') return 'permanent';
  if (type === 'CONTRACTUAL') return 'contractual';
  if (type === 'PART_TIME') return 'part-time';
  if (type === 'INTERN') return 'intern';
  return type ? String(type).toLowerCase() : type;
}

function toEmployeeTypeEnum(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'contractual') return 'CONTRACTUAL';
  if (v === 'part-time') return 'PART_TIME';
  if (v === 'intern') return 'INTERN';
  return 'PERMANENT';
}

function normaliseSalaryType(type) {
  if (type === 'MONTHLY') return 'monthly';
  if (type === 'DAILY') return 'daily';
  if (type === 'HOURLY') return 'hourly';
  return type ? String(type).toLowerCase() : type;
}

function toSalaryTypeEnum(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'daily') return 'DAILY';
  if (v === 'hourly') return 'HOURLY';
  return 'MONTHLY';
}

function toGenderEnum(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'male') return 'MALE';
  if (v === 'female') return 'FEMALE';
  if (v === 'other') return 'OTHER';
  return null;
}

function toBloodGroupEnum(value) {
  const map = {
    'A+': 'A_POSITIVE',
    'A-': 'A_NEGATIVE',
    'B+': 'B_POSITIVE',
    'B-': 'B_NEGATIVE',
    'O+': 'O_POSITIVE',
    'O-': 'O_NEGATIVE',
    'AB+': 'AB_POSITIVE',
    'AB-': 'AB_NEGATIVE'
  };
  const key = String(value || '').trim().toUpperCase();
  return map[key] || null;
}

function toMaritalStatusEnum(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'single') return 'SINGLE';
  if (v === 'married') return 'MARRIED';
  if (v === 'divorced') return 'DIVORCED';
  if (v === 'widowed') return 'WIDOWED';
  return null;
}

function applyPersonalIdentityFields(target, data) {
  if (data.dateOfBirth !== undefined) target.dateOfBirth = data.dateOfBirth ?? null;
  if (data.religion !== undefined) target.religion = String(data.religion ?? '').trim();
  if (data.nationalId !== undefined) target.nationalId = String(data.nationalId ?? '').trim();
  if (data.gender !== undefined) target.gender = toGenderEnum(data.gender);
  if (data.bloodGroup !== undefined) target.bloodGroup = toBloodGroupEnum(data.bloodGroup);
  if (data.maritalStatus !== undefined) target.maritalStatus = toMaritalStatusEnum(data.maritalStatus);
}

// ── syncEmployeeAliases (mirrors employee.js pre-save) ───────────────────────
function syncEmployeeAliases(data) {
  const out = { ...data };
  if (out.designation && !out.role) out.role = out.designation;
  else if (out.role && !out.designation) out.designation = out.role;

  if (out.presentAddress && !out.address) out.address = out.presentAddress;
  else if (out.address && !out.presentAddress) out.presentAddress = out.address;

  return out;
}

// ── generateEmployeeId (mirrors employee.js static) ─────────────────────────
async function generateEmployeeId() {
  const rows = await prisma.employee.findMany({
    where: { employeeId: { startsWith: 'EMP-' } },
    select: { employeeId: true }
  });

  let maxSuffix = 0;
  rows.forEach((row) => {
    const match = /^EMP-(\d+)$/i.exec(String(row.employeeId || '').trim());
    if (match) maxSuffix = Math.max(maxSuffix, parseInt(match[1], 10));
  });

  return `EMP-${String(maxSuffix + 1).padStart(3, '0')}`;
}

function incrementEmployeeId(code) {
  const match = /^EMP-(\d+)$/i.exec(String(code || '').trim());
  const next = match ? parseInt(match[1], 10) + 1 : 1;
  return `EMP-${String(next).padStart(3, '0')}`;
}

// ── Shape normalisation ──────────────────────────────────────────────────────
function toShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.id,
    status: normaliseStatus(record.status),
    employeeType: normaliseEmployeeType(record.employeeType),
    salaryType: normaliseSalaryType(record.salaryType),
    baseSalary: record.baseSalary != null ? Number(record.baseSalary) : 0
  };
}

function toDocumentShape(record) {
  if (!record) return null;
  return { ...record, _id: record.id };
}

function toReferenceShape(record) {
  if (!record) return null;
  return { ...record, _id: record.id };
}

function parseIncludeTerminated(filters = {}) {
  return filters.includeTerminated === true
    || String(filters.includeTerminated || '').toLowerCase() === 'true';
}

/** Match Mongo default lists: hide terminated unless explicitly requested. */
function shouldExcludeTerminatedEmployees(filters = {}) {
  if (parseIncludeTerminated(filters)) return false;
  const status = filters.status !== undefined ? String(filters.status).toLowerCase() : '';
  if (status === 'terminated') return false;
  return true;
}

function mergeOperationalEmployeeWhere(baseWhere = {}, filters = {}) {
  if (!shouldExcludeTerminatedEmployees(filters)) {
    return baseWhere && Object.keys(baseWhere).length ? baseWhere : {};
  }
  const exclusion = { status: { not: 'TERMINATED' } };
  if (!baseWhere || Object.keys(baseWhere).length === 0) return exclusion;
  return { AND: [baseWhere, exclusion] };
}

// ── findAll ──────────────────────────────────────────────────────────────────
// filters: { status?, department?, designation?, employeeType?, search?, page?, limit? }
async function findAll(filters = {}) {
  const where = {};

  if (filters.status !== undefined) where.status = toStatusEnum(filters.status);
  if (filters.department) where.department = String(filters.department).trim();
  if (filters.designation) where.designation = String(filters.designation).trim();
  if (filters.employeeType !== undefined) {
    where.employeeType = toEmployeeTypeEnum(filters.employeeType);
  }

  const search = String(filters.search || '').trim();
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { employeeId: { contains: search, mode: 'insensitive' } },
      { role: { contains: search, mode: 'insensitive' } },
      { designation: { contains: search, mode: 'insensitive' } }
    ];
  }

  if (filters.hasAccess === true) {
    where.linkedAdminId = { not: null };
  } else if (filters.hasAccess === false) {
    where.linkedAdminId = null;
  }

  const query = {
    where: mergeOperationalEmployeeWhere(where, filters),
    orderBy: { createdAt: 'desc' }
  };

  const limit = Number(filters.limit);
  if (Number.isFinite(limit) && limit > 0) {
    const page = Math.max(1, Number(filters.page) || 1);
    query.skip = (page - 1) * limit;
    query.take = limit;
  }

  if (filters.orderByFullName) {
    query.orderBy = { fullName: 'asc' };
  }

  if (filters.includeNested) {
    query.include = {
      documents: { orderBy: { uploadedAt: 'desc' } },
      references: true,
      linkedAdmin: { select: { id: true, legacyId: true } }
    };
  }

  const records = await prisma.employee.findMany(query);
  return records.map(toShape);
}

function buildEmployeeWhere(filters = {}) {
  const where = {};

  if (filters.status !== undefined) where.status = toStatusEnum(filters.status);
  if (filters.department) where.department = String(filters.department).trim();
  if (filters.designation) where.designation = String(filters.designation).trim();
  if (filters.employeeType !== undefined) {
    where.employeeType = toEmployeeTypeEnum(filters.employeeType);
  }

  const search = String(filters.search || '').trim();
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { employeeId: { contains: search, mode: 'insensitive' } },
      { role: { contains: search, mode: 'insensitive' } },
      { designation: { contains: search, mode: 'insensitive' } }
    ];
  }

  if (filters.hasAccess === true) {
    where.linkedAdminId = { not: null };
  } else if (filters.hasAccess === false) {
    where.linkedAdminId = null;
  }

  return where;
}

async function count(filters = {}) {
  return prisma.employee.count({
    where: mergeOperationalEmployeeWhere(buildEmployeeWhere(filters), filters)
  });
}

async function aggregateStats(filters = {}) {
  const operationalWhere = mergeOperationalEmployeeWhere({}, filters);
  const activeWhere = mergeOperationalEmployeeWhere({ status: 'ACTIVE' }, filters);

  const [statusGroups, deptGroups, desGroupsRaw] = await Promise.all([
    prisma.employee.groupBy({
      by: ['status'],
      where: operationalWhere,
      _count: { _all: true }
    }),
    prisma.employee.groupBy({
      by: ['department'],
      where: activeWhere,
      _count: { _all: true },
      orderBy: { department: 'asc' }
    }),
    prisma.employee.groupBy({
      by: ['designation'],
      where: activeWhere,
      _count: { _all: true }
    })
  ]);

  const desGroups = [...desGroupsRaw].sort((a, b) => {
    const countDiff = (b._count._all || 0) - (a._count._all || 0);
    if (countDiff !== 0) return countDiff;
    return String(a.designation || '').localeCompare(String(b.designation || ''));
  });

  return { statusGroups, deptGroups, desGroups };
}

async function findDetailed(identifier) {
  const value = String(identifier || '').trim();
  if (!value) return null;

  let where;
  if (UUID_PATTERN.test(value)) {
    where = { id: value };
  } else {
    where = {
      OR: [{ legacyId: value }, { employeeId: value }]
    };
  }

  return prisma.employee.findFirst({
    where,
    include: {
      documents: { orderBy: { uploadedAt: 'desc' } },
      references: true,
      linkedAdmin: { select: { id: true, legacyId: true } }
    }
  });
}

// ── findById / findByEmployeeId ──────────────────────────────────────────────
async function findById(id) {
  if (!id) return null;
  const record = await prisma.employee.findUnique({ where: { id } });
  return toShape(record);
}

async function findByEmployeeId(employeeId) {
  const code = String(employeeId || '').trim();
  if (!code) return null;
  const record = await prisma.employee.findUnique({ where: { employeeId: code } });
  return toShape(record);
}

async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.employee.findUnique({
    where: { legacyId: String(legacyId) }
  });
  return toShape(record);
}

async function findDocumentByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.employeeDocument.findUnique({
    where: { legacyId: String(legacyId) }
  });
  return toDocumentShape(record);
}

// ── create ───────────────────────────────────────────────────────────────────
async function create(data) {
  const fullName = String(data.fullName || '').trim();
  if (!fullName) throw new Error('Employee full name is required.');
  if (!String(data.phone || '').trim()) throw new Error('Phone is required.');

  let aliases = syncEmployeeAliases({
    designation: String(data.designation ?? data.role ?? '').trim(),
    role: String(data.role ?? data.designation ?? '').trim(),
    presentAddress: String(data.presentAddress ?? '').trim(),
    address: String(data.address ?? '').trim()
  });

  const buildData = (employeeId) => ({
    employeeId,
    fullName,
    phone: String(data.phone).trim(),
    dateOfBirth: data.dateOfBirth ?? null,
    gender: toGenderEnum(data.gender),
    bloodGroup: toBloodGroupEnum(data.bloodGroup),
    maritalStatus: toMaritalStatusEnum(data.maritalStatus),
    religion: String(data.religion ?? '').trim(),
    nationalId: String(data.nationalId ?? '').trim(),
    photo: String(data.photo ?? '').trim(),
    photoPublicId: String(data.photoPublicId ?? '').trim(),
    alternatePhone: String(data.alternatePhone ?? '').trim(),
    email: String(data.email ?? '').trim().toLowerCase(),
    presentAddress: aliases.presentAddress || '',
    permanentAddress: String(data.permanentAddress ?? '').trim(),
    address: aliases.address || '',
    emergencyContactName: String(
      data.emergencyContactName ?? data.emergencyContact?.name ?? ''
    ).trim(),
    emergencyContactPhone: String(
      data.emergencyContactPhone ?? data.emergencyContact?.phone ?? ''
    ).trim(),
    emergencyContactRelation: String(
      data.emergencyContactRelation ?? data.emergencyContact?.relation ?? ''
    ).trim(),
    designation: aliases.designation || '',
    role: aliases.role || '',
    department: String(data.department ?? 'Operations').trim() || 'Operations',
    employeeType: data.employeeType !== undefined
      ? toEmployeeTypeEnum(data.employeeType)
      : 'PERMANENT',
    shift: String(data.shift ?? '').trim(),
    shiftId: data.shiftId ?? null,
    designationId: data.designationId ?? null,
    joiningDate: data.joiningDate ?? null,
    baseSalary: data.baseSalary != null ? data.baseSalary : 0,
    salaryType: data.salaryType !== undefined
      ? toSalaryTypeEnum(data.salaryType)
      : 'MONTHLY',
    bankName: String(data.bankName ?? '').trim(),
    bankAccountNumber: String(data.bankAccountNumber ?? '').trim(),
    bkashNumber: String(data.bkashNumber ?? '').trim(),
    linkedAdminId: data.linkedAdminId ?? null,
    status: data.status !== undefined ? toStatusEnum(data.status) : 'ACTIVE',
    notes: String(data.notes ?? '').trim(),
    createdBy: String(data.createdBy ?? '').trim(),
    legacyId: data.legacyId != null ? String(data.legacyId) : null
  });

  if (data.employeeId) {
    const record = await prisma.employee.create({
      data: buildData(String(data.employeeId).trim())
    });
    return toShape(record);
  }

  const MAX_ID_ATTEMPTS = 6;
  let employeeId = await generateEmployeeId();
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const record = await prisma.employee.create({ data: buildData(employeeId) });
      return toShape(record);
    } catch (err) {
      if (err.code === 'P2002' && attempt < MAX_ID_ATTEMPTS - 1) {
        employeeId = incrementEmployeeId(employeeId);
        continue;
      }
      throw err;
    }
  }

  throw new Error('Failed to generate a unique employeeId after 6 attempts.');
}

// ── update ───────────────────────────────────────────────────────────────────
async function update(id, data) {
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Employee not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  if (data.fullName !== undefined) {
    const v = String(data.fullName).trim();
    if (!v) throw new Error('Full name cannot be empty.');
    fields.fullName = v;
  }
  if (data.phone !== undefined) fields.phone = String(data.phone).trim();
  if (data.status !== undefined) fields.status = toStatusEnum(data.status);
  if (data.employeeType !== undefined) {
    fields.employeeType = toEmployeeTypeEnum(data.employeeType);
  }
  if (data.salaryType !== undefined) {
    fields.salaryType = toSalaryTypeEnum(data.salaryType);
  }
  if (data.baseSalary !== undefined) fields.baseSalary = data.baseSalary;
  if (data.email !== undefined) fields.email = String(data.email).trim().toLowerCase();
  if (data.department !== undefined) fields.department = String(data.department).trim();
  if (data.notes !== undefined) fields.notes = String(data.notes).trim();
  if (data.photo !== undefined) fields.photo = String(data.photo).trim();
  if (data.photoPublicId !== undefined) fields.photoPublicId = String(data.photoPublicId).trim();
  if (data.alternatePhone !== undefined) fields.alternatePhone = String(data.alternatePhone).trim();
  if (data.permanentAddress !== undefined) {
    fields.permanentAddress = String(data.permanentAddress).trim();
  }
  if (data.dateOfBirth !== undefined) fields.dateOfBirth = data.dateOfBirth ?? null;
  if (data.joiningDate !== undefined) fields.joiningDate = data.joiningDate ?? null;
  if (data.shift !== undefined) fields.shift = String(data.shift).trim();
  if (data.bankName !== undefined) fields.bankName = String(data.bankName).trim();
  if (data.bankAccountNumber !== undefined) {
    fields.bankAccountNumber = String(data.bankAccountNumber).trim();
  }
  if (data.bkashNumber !== undefined) fields.bkashNumber = String(data.bkashNumber).trim();

  applyPersonalIdentityFields(fields, data);

  if (data.emergencyContactName !== undefined || data.emergencyContact?.name !== undefined) {
    fields.emergencyContactName = String(
      data.emergencyContactName ?? data.emergencyContact?.name ?? ''
    ).trim();
  }
  if (data.emergencyContactPhone !== undefined || data.emergencyContact?.phone !== undefined) {
    fields.emergencyContactPhone = String(
      data.emergencyContactPhone ?? data.emergencyContact?.phone ?? ''
    ).trim();
  }
  if (data.emergencyContactRelation !== undefined || data.emergencyContact?.relation !== undefined) {
    fields.emergencyContactRelation = String(
      data.emergencyContactRelation ?? data.emergencyContact?.relation ?? ''
    ).trim();
  }

  if (
    data.designation !== undefined
    || data.role !== undefined
    || data.presentAddress !== undefined
    || data.address !== undefined
  ) {
    const aliases = syncEmployeeAliases({
      designation: data.designation ?? existing.designation,
      role: data.role ?? existing.role,
      presentAddress: data.presentAddress ?? existing.presentAddress,
      address: data.address ?? existing.address
    });
    fields.designation = aliases.designation;
    fields.role = aliases.role;
    fields.presentAddress = aliases.presentAddress;
    fields.address = aliases.address;
  }

  const record = await prisma.employee.update({
    where: { id },
    data: fields
  });

  if (normaliseStatus(record.status) === 'terminated' && record.linkedAdminId) {
    await suspendLinkedAdmin(record.linkedAdminId);
  }

  return toShape(record);
}

// ── suspendLinkedAdmin (mirrors employeeController.suspendLinkedAdminAccess) ─
async function suspendLinkedAdmin(adminId) {
  if (!adminId) return;
  // Sequential write — PrismaNeonHttp does not support $transaction over HTTP.
  await updateAdmin(adminId, { status: 'blocked' });
}

// ── terminate ────────────────────────────────────────────────────────────────
// Soft delete — status TERMINATED + block linked admin login.
async function terminate(id) {
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Employee not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const legacyStaffId = existing.legacyId || String(existing.id);
  const { cascadePostgresEmployeeHrm } = require('../services/employeeHrmCascadeService');
  await cascadePostgresEmployeeHrm(legacyStaffId, { draftsOnlyPayroll: true });

  const record = await prisma.employee.update({
    where: { id },
    data: { status: 'TERMINATED' }
  });

  if (record.linkedAdminId) {
    await suspendLinkedAdmin(record.linkedAdminId);
  }

  return toShape(record);
}

// ── remove ───────────────────────────────────────────────────────────────────
// Hard delete — EmployeeDocument / EmployeeReference Cascade per schema.prisma.
// linkedAdmin relation is SetNull from Admin side only; deleting Employee does
// not delete the linked Admin account.
async function remove(id) {
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    const err = new Error('Employee not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const legacyStaffId = employee.legacyId || String(employee.id);
  const { cascadePostgresEmployeeHrm } = require('../services/employeeHrmCascadeService');
  await cascadePostgresEmployeeHrm(legacyStaffId, { includeLeave: true });

  await prisma.employee.delete({ where: { id } });
  return { deleted: true, employeeId: employee.employeeId };
}

// ── Documents ────────────────────────────────────────────────────────────────
async function listDocuments(employeeId) {
  const records = await prisma.employeeDocument.findMany({
    where: { employeeId },
    orderBy: { uploadedAt: 'desc' }
  });
  return records.map(toDocumentShape);
}

async function addDocument(employeeId, docData) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true }
  });
  if (!employee) {
    const err = new Error('Employee not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const record = await prisma.employeeDocument.create({
    data: {
      employeeId,
      title: String(docData.title ?? '').trim(),
      fileUrl: String(docData.fileUrl ?? '').trim(),
      fileType: String(docData.fileType ?? 'image').trim() || 'image',
      publicId: String(docData.publicId ?? '').trim(),
      legacyId: docData.legacyId != null ? String(docData.legacyId) : null
    }
  });
  return toDocumentShape(record);
}

async function removeDocument(documentId) {
  const existing = await prisma.employeeDocument.findUnique({ where: { id: documentId } });
  if (!existing) {
    const err = new Error('Document not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await prisma.employeeDocument.delete({ where: { id: documentId } });
  return { deleted: true, id: documentId };
}

// ── References ───────────────────────────────────────────────────────────────
async function listReferences(employeeId) {
  const records = await prisma.employeeReference.findMany({
    where: { employeeId }
  });
  return records.map(toReferenceShape);
}

/** Replace embedded Mongo references[] on the PG EmployeeReference table. */
async function syncReferences(employeeId, references = []) {
  await prisma.employeeReference.deleteMany({ where: { employeeId } });

  const rows = (Array.isArray(references) ? references : [])
    .map((ref) => ({
      name: String(ref?.name ?? '').trim(),
      phone: String(ref?.phone ?? '').trim(),
      relation: String(ref?.relation ?? '').trim(),
      address: String(ref?.address ?? '').trim()
    }))
    .filter((ref) => ref.name || ref.phone)
    .slice(0, 5);

  if (!rows.length) return [];

  await prisma.employeeReference.createMany({
    data: rows.map((ref) => ({ employeeId, ...ref }))
  });

  return listReferences(employeeId);
}

async function addReference(employeeId, refData) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true }
  });
  if (!employee) {
    const err = new Error('Employee not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const record = await prisma.employeeReference.create({
    data: {
      employeeId,
      name: String(refData.name ?? '').trim(),
      phone: String(refData.phone ?? '').trim(),
      relation: String(refData.relation ?? '').trim(),
      address: String(refData.address ?? '').trim()
    }
  });
  return toReferenceShape(record);
}

async function removeReference(referenceId) {
  const existing = await prisma.employeeReference.findUnique({ where: { id: referenceId } });
  if (!existing) {
    const err = new Error('Reference not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await prisma.employeeReference.delete({ where: { id: referenceId } });
  return { deleted: true, id: referenceId };
}

// ── Admin account link (Grant / Revoke Access) ───────────────────────────────
async function linkAdminAccount(employeeId, adminId) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) {
    const err = new Error('Employee not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (employee.linkedAdminId) {
    const err = new Error('Access already granted.');
    err.code = 'ALREADY_LINKED';
    throw err;
  }

  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin) {
    const err = new Error('Admin account not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const taken = await prisma.employee.findFirst({
    where: { linkedAdminId: adminId, id: { not: employeeId } }
  });
  if (taken) {
    const err = new Error('Admin account is already linked to another employee.');
    err.code = 'ADMIN_IN_USE';
    throw err;
  }

  const record = await prisma.employee.update({
    where: { id: employeeId },
    data: { linkedAdminId: adminId }
  });
  return toShape(record);
}

async function unlinkAdminAccount(employeeId) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || !employee.linkedAdminId) {
    const err = new Error('No linked admin account.');
    err.code = 'NOT_LINKED';
    throw err;
  }

  const adminId = employee.linkedAdminId;
  // Sequential writes — mirrors unlinkSystemAccess (block admin, then clear link).
  await suspendLinkedAdmin(adminId);
  const record = await prisma.employee.update({
    where: { id: employeeId },
    data: { linkedAdminId: null }
  });
  return toShape(record);
}

module.exports = {
  generateEmployeeId,
  syncEmployeeAliases,
  mergeOperationalEmployeeWhere,
  shouldExcludeTerminatedEmployees,
  findAll,
  count,
  aggregateStats,
  findDetailed,
  buildEmployeeWhere,
  findById,
  findByEmployeeId,
  findByLegacyId,
  findDocumentByLegacyId,
  create,
  update,
  terminate,
  remove,
  listDocuments,
  addDocument,
  removeDocument,
  listReferences,
  syncReferences,
  addReference,
  removeReference,
  linkAdminAccount,
  unlinkAdminAccount,
  suspendLinkedAdmin
};
