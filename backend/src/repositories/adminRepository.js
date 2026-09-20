/********************************************************************
 * Project: EonlineBazar
 * File: adminRepository.js
 * Location: backend/src/repositories/adminRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for the Admin model (Neon/PostgreSQL).
 *   Mirrors staffController.js + admin.js Mongoose model.
 *   Reimplements the pre-save hashPassword hook and select:false secrecy
 *   for OTP/TOTP fields as explicit Prisma select clauses.
 *
 *   Wired for dual-write — Stage 2 Step 3, Part 9 (2026-09-14).
 ********************************************************************/

'use strict';

const bcrypt = require('bcryptjs');
const prisma = require('../config/prismaClient');

// ── Password security (mirrors admin.js exactly) ─────────────────────────────
const BCRYPT_ROUNDS = 12;

// Matches any bcrypt digest ($2a$ / $2b$ / $2y$) so we never double-hash and
// can detect legacy plaintext passwords written before hashing existed.
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/** True when the given value is already a bcrypt digest. */
function isHashed(value) {
  return BCRYPT_PATTERN.test(String(value || ''));
}

/**
 * Hash a plain-text password unless it is already a bcrypt digest.
 * Returns { password, passwordChangedAt } where passwordChangedAt is set only
 * when a new hash was produced (matching the Mongoose pre-save hook).
 */
async function preparePasswordField(value) {
  if (isHashed(value)) {
    return { password: String(value), passwordChangedAt: undefined };
  }
  const password = await bcrypt.hash(String(value), BCRYPT_ROUNDS);
  return { password, passwordChangedAt: new Date() };
}

// ── Enum mapping ─────────────────────────────────────────────────────────────
function normaliseRole(role) {
  if (role === 'SUPERADMIN') return 'superadmin';
  if (role === 'STAFF') return 'staff';
  return role ? String(role).toLowerCase() : role;
}

function normaliseStatus(status) {
  if (status === 'ACTIVE') return 'active';
  if (status === 'BLOCKED') return 'blocked';
  return status ? String(status).toLowerCase() : status;
}

function normaliseTwoFactorMethod(method) {
  if (method === 'EMAIL') return 'email';
  if (method === 'TOTP') return 'totp';
  if (method === 'SMS') return 'sms';
  return method ? String(method).toLowerCase() : method;
}

function toRoleEnum(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'staff') return 'STAFF';
  return 'SUPERADMIN';
}

function toStatusEnum(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'blocked') return 'BLOCKED';
  return 'ACTIVE';
}

function toTwoFactorMethodEnum(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'totp') return 'TOTP';
  if (v === 'sms') return 'SMS';
  return 'EMAIL';
}

// ── select:false secrecy reimplementation ────────────────────────────────────
// Mongoose hides these six fields unless explicitly opted in with .select('+field').
// Prisma has no column-level select:false — we simply omit them from default queries.
const SECRET_FIELDS = [
  'otp',
  'otpExpiry',
  'totpSecret',
  'totpPendingSecret',
  'smsSetupOtp',
  'smsSetupOtpExpiry'
];

// Safe default select — all columns except password and the six secret fields.
const SAFE_SELECT = {
  id: true,
  legacyId: true,
  username: true,
  name: true,
  role: true,
  permissions: true,
  status: true,
  createdBy: true,
  lastLoginAt: true,
  passwordChangedAt: true,
  email: true,
  phone: true,
  twoFactorMethod: true,
  twoFactorEnabled: true,
  totpVerified: true,
  image: true,
  displayName: true,
  storeName: true,
  currency: true,
  currencySymbol: true,
  timezone: true,
  logoUrl: true,
  faviconUrl: true,
  baseSalary: true,
  department: true,
  joiningDate: true,
  employeeId: true,
  createdAt: true,
  updatedAt: true
};

// ── Shape normalisation ──────────────────────────────────────────────────────
function normaliseBigIntFields(record) {
  if (!record) return record;
  const out = { ...record };
  if (out.otpExpiry != null) out.otpExpiry = Number(out.otpExpiry);
  if (out.smsSetupOtpExpiry != null) out.smsSetupOtpExpiry = Number(out.smsSetupOtpExpiry);
  if (out.baseSalary != null) out.baseSalary = Number(out.baseSalary);
  return out;
}

function toShape(record, { includeSecrets = false } = {}) {
  if (!record) return null;
  const out = normaliseBigIntFields(record);
  out._id = out.id;
  out.role = normaliseRole(out.role);
  out.status = normaliseStatus(out.status);
  out.twoFactorMethod = normaliseTwoFactorMethod(out.twoFactorMethod);

  if (!includeSecrets) {
    delete out.password;
    for (const field of SECRET_FIELDS) {
      delete out[field];
    }
  }

  return out;
}

function isSuperAdmin(record) {
  return normaliseRole(record?.role) === 'superadmin';
}

// ── findAll ──────────────────────────────────────────────────────────────────
// filters: { role?, status?, page?, limit? }
// Default sort: createdAt desc (matches staffController.listStaff).
// Optional page/limit enable pagination when callers supply them.
async function findAll(filters = {}) {
  const where = {};
  if (filters.role !== undefined) {
    where.role = toRoleEnum(filters.role);
  }
  if (filters.status !== undefined) {
    where.status = toStatusEnum(filters.status);
  }

  const query = {
    where,
    select: SAFE_SELECT,
    orderBy: { createdAt: 'desc' }
  };

  const limit = Number(filters.limit);
  if (Number.isFinite(limit) && limit > 0) {
    const page = Math.max(1, Number(filters.page) || 1);
    query.skip = (page - 1) * limit;
    query.take = limit;
  }

  const records = await prisma.admin.findMany(query);
  return records.map((r) => toShape(r));
}

// ── findById ─────────────────────────────────────────────────────────────────
async function findById(id) {
  if (!id) return null;
  const record = await prisma.admin.findUnique({
    where: { id },
    select: SAFE_SELECT
  });
  return toShape(record);
}

// ── findByIdWithSecrets ──────────────────────────────────────────────────────
// Opt-in query mirroring Mongoose .select('+otp +totpSecret …') for auth/2FA flows.
async function findByIdWithSecrets(id) {
  if (!id) return null;
  const record = await prisma.admin.findUnique({ where: { id } });
  return toShape(record, { includeSecrets: true });
}

// ── findByUsername ───────────────────────────────────────────────────────────
// Admin is keyed by username throughout the codebase (auth, RBAC, sessions).
async function findByUsername(username) {
  const normalized = String(username || '').trim().toLowerCase();
  if (!normalized) return null;
  const record = await prisma.admin.findUnique({
    where: { username: normalized },
    select: SAFE_SELECT
  });
  return toShape(record);
}

// ── findByUsernameWithSecrets ──────────────────────────────────────────────────
async function findByUsernameWithSecrets(username) {
  const normalized = String(username || '').trim().toLowerCase();
  if (!normalized) return null;
  const record = await prisma.admin.findUnique({ where: { username: normalized } });
  return toShape(record, { includeSecrets: true });
}

// ── create ───────────────────────────────────────────────────────────────────
// Always hashes plain-text passwords before the Prisma write (pre-save hook).
async function create(data) {
  const username = String(data.username || '').trim().toLowerCase();
  if (!username) throw new Error('Admin username is required.');
  if (!data.password) throw new Error('Admin password is required.');

  const { password, passwordChangedAt } = await preparePasswordField(data.password);

  const record = await prisma.admin.create({
    data: {
      legacyId: data.legacyId != null ? String(data.legacyId) : null,
      username,
      password,
      name: String(data.name ?? '').trim(),
      role: data.role !== undefined ? toRoleEnum(data.role) : 'SUPERADMIN',
      permissions: Array.isArray(data.permissions) ? data.permissions : [],
      status: data.status !== undefined ? toStatusEnum(data.status) : 'ACTIVE',
      createdBy: String(data.createdBy ?? '').trim(),
      lastLoginAt: data.lastLoginAt ?? null,
      passwordChangedAt: passwordChangedAt ?? data.passwordChangedAt ?? null,
      email: String(data.email ?? '').trim().toLowerCase(),
      phone: String(data.phone ?? '').trim(),
      twoFactorMethod: data.twoFactorMethod !== undefined
        ? toTwoFactorMethodEnum(data.twoFactorMethod)
        : 'EMAIL',
      twoFactorEnabled: data.twoFactorEnabled !== undefined
        ? Boolean(data.twoFactorEnabled)
        : true,
      otp: data.otp ?? null,
      otpExpiry: data.otpExpiry != null ? BigInt(data.otpExpiry) : null,
      totpSecret: data.totpSecret ?? null,
      totpPendingSecret: data.totpPendingSecret ?? null,
      totpVerified: data.totpVerified !== undefined ? Boolean(data.totpVerified) : false,
      smsSetupOtp: data.smsSetupOtp ?? null,
      smsSetupOtpExpiry: data.smsSetupOtpExpiry != null ? BigInt(data.smsSetupOtpExpiry) : null,
      image: String(data.image ?? '').trim(),
      displayName: String(data.displayName ?? 'Super Admin').trim(),
      storeName: String(data.storeName ?? 'EonlineBazar').trim(),
      currency: String(data.currency ?? 'BDT').trim(),
      currencySymbol: String(data.currencySymbol ?? '৳').trim(),
      timezone: String(data.timezone ?? 'Asia/Dhaka').trim(),
      logoUrl: String(data.logoUrl ?? '').trim(),
      faviconUrl: String(data.faviconUrl ?? '').trim(),
      baseSalary: data.baseSalary != null ? data.baseSalary : 0,
      department: String(data.department ?? '').trim(),
      joiningDate: data.joiningDate ?? null,
      employeeId: String(data.employeeId ?? '').trim()
    }
  });

  return toShape(record);
}

// ── update ───────────────────────────────────────────────────────────────────
// Hashes data.password when present and not already a bcrypt digest.
// When password is absent, the stored hash is left untouched.
async function update(id, data) {
  const existing = await prisma.admin.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Admin not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};

  if (data.username !== undefined) {
    fields.username = String(data.username).trim().toLowerCase();
  }
  if (data.name !== undefined) fields.name = String(data.name).trim();
  if (data.role !== undefined) fields.role = toRoleEnum(data.role);
  if (data.permissions !== undefined) {
    fields.permissions = Array.isArray(data.permissions) ? data.permissions : [];
  }
  if (data.status !== undefined) fields.status = toStatusEnum(data.status);
  if (data.createdBy !== undefined) fields.createdBy = String(data.createdBy).trim();
  if (data.lastLoginAt !== undefined) fields.lastLoginAt = data.lastLoginAt;
  if (data.email !== undefined) fields.email = String(data.email).trim().toLowerCase();
  if (data.phone !== undefined) fields.phone = String(data.phone).trim();
  if (data.twoFactorMethod !== undefined) {
    fields.twoFactorMethod = toTwoFactorMethodEnum(data.twoFactorMethod);
  }
  if (data.twoFactorEnabled !== undefined) {
    fields.twoFactorEnabled = Boolean(data.twoFactorEnabled);
  }
  if (data.totpVerified !== undefined) fields.totpVerified = Boolean(data.totpVerified);
  if (data.image !== undefined) fields.image = String(data.image).trim();
  if (data.displayName !== undefined) fields.displayName = String(data.displayName).trim();
  if (data.storeName !== undefined) fields.storeName = String(data.storeName).trim();
  if (data.currency !== undefined) fields.currency = String(data.currency).trim();
  if (data.currencySymbol !== undefined) {
    fields.currencySymbol = String(data.currencySymbol).trim();
  }
  if (data.timezone !== undefined) fields.timezone = String(data.timezone).trim();
  if (data.logoUrl !== undefined) fields.logoUrl = String(data.logoUrl).trim();
  if (data.faviconUrl !== undefined) fields.faviconUrl = String(data.faviconUrl).trim();
  if (data.baseSalary !== undefined) fields.baseSalary = data.baseSalary;
  if (data.department !== undefined) fields.department = String(data.department).trim();
  if (data.joiningDate !== undefined) fields.joiningDate = data.joiningDate;
  if (data.employeeId !== undefined) fields.employeeId = String(data.employeeId).trim();

  // Secret fields — only written when explicitly supplied (internal 2FA flows).
  if (data.otp !== undefined) fields.otp = data.otp;
  if (data.otpExpiry !== undefined) {
    fields.otpExpiry = data.otpExpiry != null ? BigInt(data.otpExpiry) : null;
  }
  if (data.totpSecret !== undefined) fields.totpSecret = data.totpSecret;
  if (data.totpPendingSecret !== undefined) fields.totpPendingSecret = data.totpPendingSecret;
  if (data.smsSetupOtp !== undefined) fields.smsSetupOtp = data.smsSetupOtp;
  if (data.smsSetupOtpExpiry !== undefined) {
    fields.smsSetupOtpExpiry = data.smsSetupOtpExpiry != null
      ? BigInt(data.smsSetupOtpExpiry)
      : null;
  }

  if (data.password !== undefined) {
    const prepared = await preparePasswordField(data.password);
    fields.password = prepared.password;
    if (prepared.passwordChangedAt) {
      fields.passwordChangedAt = prepared.passwordChangedAt;
    }
  }

  const record = await prisma.admin.update({ where: { id }, data: fields });
  return toShape(record);
}

// ── remove ───────────────────────────────────────────────────────────────────
// Mirrors staffController.deleteStaff / findStaffById guard:
//   • Super Admin accounts are out of reach — same 404 the controller returns.
//   • Staff accounts can be deleted permanently.
async function remove(id) {
  const account = await prisma.admin.findUnique({ where: { id } });
  if (!account || isSuperAdmin(account)) {
    const err = new Error('Admin account not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  await prisma.admin.delete({ where: { id } });
  return { deleted: true, username: account.username };
}

// ── verifyPassword ───────────────────────────────────────────────────────────
// Helper for future login logic — wraps bcrypt.compare against stored hash.
async function verifyPassword(plainTextPassword, storedHash) {
  const stored = String(storedHash || '');
  const plain = String(plainTextPassword || '');
  if (!stored || !plain) return false;
  if (!isHashed(stored)) return false;
  return bcrypt.compare(plain, stored);
}

async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.admin.findUnique({
    where: { legacyId: String(legacyId) },
    select: SAFE_SELECT
  });
  return toShape(record);
}

async function updateByLegacyId(legacyId, data) {
  const existing = await prisma.admin.findUnique({
    where: { legacyId: String(legacyId) }
  });
  if (!existing) {
    const err = new Error('Admin not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return update(existing.id, data);
}

async function removeByLegacyId(legacyId) {
  const existing = await prisma.admin.findUnique({
    where: { legacyId: String(legacyId) }
  });
  if (!existing) {
    const err = new Error('Admin account not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return remove(existing.id);
}

function mapMongoDocToWriteInput(mongoDoc, options = {}) {
  const plain = mongoDoc && typeof mongoDoc.toObject === 'function'
    ? mongoDoc.toObject({ getters: true })
    : { ...mongoDoc };

  const input = {
    legacyId: mongoDoc._id != null ? String(mongoDoc._id) : null,
    username: plain.username,
    name: plain.name,
    role: plain.role,
    permissions: plain.permissions,
    status: plain.status,
    createdBy: plain.createdBy,
    lastLoginAt: plain.lastLoginAt ?? null,
    email: plain.email,
    phone: plain.phone,
    twoFactorMethod: plain.twoFactorMethod,
    twoFactorEnabled: plain.twoFactorEnabled,
    totpVerified: plain.totpVerified,
    image: plain.image,
    displayName: plain.displayName,
    storeName: plain.storeName,
    currency: plain.currency,
    currencySymbol: plain.currencySymbol,
    timezone: plain.timezone,
    logoUrl: plain.logoUrl,
    faviconUrl: plain.faviconUrl,
    baseSalary: plain.baseSalary,
    department: plain.department,
    joiningDate: plain.joiningDate ?? null,
    employeeId: plain.employeeId
  };

  if (options.plainPassword) {
    input.password = String(options.plainPassword);
  }

  if (options.includeSecrets !== false) {
    if (plain.otp !== undefined) input.otp = plain.otp;
    if (plain.otpExpiry !== undefined) input.otpExpiry = plain.otpExpiry;
    if (plain.totpSecret !== undefined) input.totpSecret = plain.totpSecret;
    if (plain.totpPendingSecret !== undefined) input.totpPendingSecret = plain.totpPendingSecret;
    if (plain.smsSetupOtp !== undefined) input.smsSetupOtp = plain.smsSetupOtp;
    if (plain.smsSetupOtpExpiry !== undefined) input.smsSetupOtpExpiry = plain.smsSetupOtpExpiry;
  }

  if (options.fields && typeof options.fields === 'object') {
    Object.assign(input, options.fields);
  }

  return input;
}

function buildAdminEmployeeProfileShape(admin, employee) {
  const role = normaliseRole(admin?.role) || 'superadmin';
  const adminFallbackName = String(admin?.name || admin?.displayName || admin?.username || 'Admin').trim();
  const employeeName = String(employee?.fullName || '').trim();
  const displayName = employeeName || adminFallbackName;
  const adminImage = String(admin?.image || '').trim();
  const employeePhoto = String(employee?.photo || '').trim();

  return {
    adminId: admin?.legacyId || admin?.id || null,
    displayName,
    email: String(admin?.email || '').trim(),
    username: String(admin?.username || '').trim(),
    role,
    photo: employeePhoto || adminImage || null,
    employeeId: employee?.legacyId || employee?.id || null,
    employeeName: employee?.fullName || null,
    employeeCode: employee?.employeeId || null
  };
}

/**
 * Merged admin sidebar profile — prefers linked Employee photo over Admin.image.
 * adminId accepts Postgres UUID or Mongo legacyId.
 */
async function getAdminWithEmployeeData(adminId) {
  if (!adminId) return null;

  let admin = await prisma.admin.findUnique({
    where: { id: String(adminId) },
    select: SAFE_SELECT
  });
  if (!admin) {
    admin = await prisma.admin.findUnique({
      where: { legacyId: String(adminId) },
      select: SAFE_SELECT
    });
  }
  if (!admin) return null;

  const employeeSelect = {
    id: true,
    legacyId: true,
    fullName: true,
    photo: true,
    employeeId: true
  };

  let employee = await prisma.employee.findFirst({
    where: { linkedAdminId: admin.id },
    select: employeeSelect
  });

  if (!employee && admin.legacyId) {
    const Admin = require('../models/admin');
    const mongoAdmin = await Admin.findById(admin.legacyId).select('employeeRef').lean();
    const employeeRef = mongoAdmin?.employeeRef;
    if (employeeRef) {
      employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { id: String(employeeRef) },
            { legacyId: String(employeeRef) }
          ]
        },
        select: employeeSelect
      });
    }
  }

  return buildAdminEmployeeProfileShape(admin, employee);
}

/**
 * Link an Employee row to an Admin account (Postgres canonical FK on Employee).
 * Returns merged profile shape or throws with err.code for HTTP mapping.
 */
async function linkEmployeeToAdmin(adminId, employeeId) {
  let admin = await prisma.admin.findUnique({ where: { id: String(adminId) } });
  if (!admin) {
    admin = await prisma.admin.findUnique({ where: { legacyId: String(adminId) } });
  }
  if (!admin) {
    const err = new Error('Admin not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  let employee = await prisma.employee.findUnique({ where: { id: String(employeeId) } });
  if (!employee) {
    employee = await prisma.employee.findUnique({ where: { legacyId: String(employeeId) } });
  }
  if (!employee) {
    employee = await prisma.employee.findUnique({ where: { employeeId: String(employeeId) } });
  }
  if (!employee) {
    const err = new Error('Employee not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (employee.linkedAdminId && employee.linkedAdminId !== admin.id) {
    const err = new Error('Employee is already linked to another admin account.');
    err.code = 'ALREADY_LINKED';
    throw err;
  }

  const previousEmployee = await prisma.employee.findFirst({
    where: { linkedAdminId: admin.id, id: { not: employee.id } }
  });
  if (previousEmployee) {
    await prisma.employee.update({
      where: { id: previousEmployee.id },
      data: { linkedAdminId: null }
    });
  }

  const updatedEmployee = await prisma.employee.update({
    where: { id: employee.id },
    data: { linkedAdminId: admin.id },
    select: {
      id: true,
      legacyId: true,
      fullName: true,
      photo: true,
      employeeId: true
    }
  });

  return buildAdminEmployeeProfileShape(admin, updatedEmployee);
}

async function upsertFromMongo(mongoDoc, options = {}) {
  const legacyId = mongoDoc._id != null ? String(mongoDoc._id) : null;
  if (!legacyId) throw new Error('Admin legacyId is required for upsertFromMongo.');

  const existing = await prisma.admin.findUnique({ where: { legacyId } });
  const input = mapMongoDocToWriteInput(mongoDoc, options);

  if (existing) {
    const updateData = { ...input };
    delete updateData.legacyId;
    if (!options.plainPassword) delete updateData.password;
    return update(existing.id, updateData);
  }

  if (!options.plainPassword) {
    throw new Error('plainPassword is required when creating Admin from Mongo.');
  }

  return create({
    ...input,
    password: options.plainPassword
  });
}

module.exports = {
  BCRYPT_ROUNDS,
  BCRYPT_PATTERN,
  isHashed,
  SECRET_FIELDS,
  buildAdminEmployeeProfileShape,
  findAll,
  findById,
  findByIdWithSecrets,
  findByUsername,
  findByUsernameWithSecrets,
  create,
  update,
  remove,
  verifyPassword,
  findByLegacyId,
  updateByLegacyId,
  removeByLegacyId,
  getAdminWithEmployeeData,
  linkEmployeeToAdmin,
  mapMongoDocToWriteInput,
  upsertFromMongo
};
