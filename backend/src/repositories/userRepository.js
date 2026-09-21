/********************************************************************
 * Project: EonlineBazar
 * File: userRepository.js
 * Location: backend/src/repositories/userRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for the User model (Neon/PostgreSQL).
 *   Mirrors customerAdminController.js + user.js Mongoose model.
 *   Reimplements the ensureReferralCode pre-save hook as a plain JS function.
 *   Sub-resource helpers: addresses, wishlist, wallet credit/debit.
 *
 *   NOT YET WIRED INTO THE APP — Stage 2 Step 2, Part 3 (2026-09-13).
 *   The live database is still MongoDB; this file is additive / isolated.
 *
 *   Future gap: VIP / Frequent / Inactive customer segmentation (depends on
 *   migrated Order data + Settings thresholds) is NOT implemented here.
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

// ── Referral code generation (mirrors user.js exactly) ───────────────────────
// Referral codes intentionally exclude ambiguous characters (0/O, 1/I) so they
// can be read aloud or shared over the phone without confusion.
const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_MAX_ATTEMPTS = 6;

function generateReferralCode(length = REFERRAL_CODE_LENGTH) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += REFERRAL_CODE_ALPHABET[Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Assign a unique referral code, retrying up to 6 times on collision — same
 * loop as user.js ensureReferralCode pre-save hook.
 * @param {() => string} [pickCandidate] — injectable for tests (defaults to generateReferralCode)
 */
async function resolveUniqueReferralCode(pickCandidate = generateReferralCode) {
  let attempts = 0;
  while (attempts < REFERRAL_MAX_ATTEMPTS) {
    const candidate = pickCandidate();
    // eslint-disable-next-line no-await-in-loop
    const clash = await prisma.user.findUnique({ where: { referralCode: candidate } });
    if (!clash) return candidate;
    attempts += 1;
  }
  const err = new Error('Failed to generate a unique referral code after 6 attempts.');
  err.code = 'REFERRAL_CODE_EXHAUSTED';
  throw err;
}

// ── Enum mapping ─────────────────────────────────────────────────────────────
function normaliseGender(gender) {
  if (gender === 'MALE') return 'Male';
  if (gender === 'FEMALE') return 'Female';
  if (gender === 'OTHER') return 'Other';
  return gender || null;
}

function normaliseAccountStatus(status) {
  if (status === 'ACTIVE') return 'active';
  if (status === 'SUSPENDED') return 'suspended';
  if (status === 'BLOCKED') return 'blocked';
  return status ? String(status).toLowerCase() : status;
}

function normaliseLoyaltyTier(tier) {
  if (tier === 'NONE') return 'none';
  if (tier === 'SILVER') return 'silver';
  if (tier === 'GOLD') return 'gold';
  if (tier === 'PLATINUM') return 'platinum';
  return tier ? String(tier).toLowerCase() : tier;
}

function toGenderEnum(value) {
  const v = String(value || '');
  if (v === 'Female') return 'FEMALE';
  if (v === 'Other') return 'OTHER';
  if (v === 'Male') return 'MALE';
  return null;
}

function toAccountStatusEnum(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'suspended') return 'SUSPENDED';
  if (v === 'blocked') return 'BLOCKED';
  return 'ACTIVE';
}

function toLoyaltyTierEnum(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'silver') return 'SILVER';
  if (v === 'gold') return 'GOLD';
  if (v === 'platinum') return 'PLATINUM';
  return 'NONE';
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONGO_OID_PATTERN = /^[0-9a-fA-F]{24}$/;

// ── Shape normalisation ──────────────────────────────────────────────────────
function toDecimalNumber(value) {
  if (value == null) return value;
  return Number(value);
}

function toShape(record, { includePassword = false } = {}) {
  if (!record) return null;
  const out = { ...record, _id: record.id };

  out.gender = normaliseGender(out.gender);
  out.accountStatus = normaliseAccountStatus(out.accountStatus);
  out.loyaltyTier = normaliseLoyaltyTier(out.loyaltyTier);
  out.walletBalance = toDecimalNumber(out.walletBalance);
  out.referralEarnings = toDecimalNumber(out.referralEarnings);
  out.lifetimeSpend = toDecimalNumber(out.lifetimeSpend);
  out.tierCashbackRate = toDecimalNumber(out.tierCashbackRate);

  // Virtual `name` getter from user.js — computed, not stored in Postgres.
  out.name = [out.firstName, out.lastName].filter(Boolean).join(' ').trim();

  if (!includePassword) delete out.password;

  return out;
}

function toAddressShape(record) {
  if (!record) return null;
  return { ...record, _id: record.id };
}

function toWishlistShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.id,
    price: toDecimalNumber(record.price)
  };
}

function toWalletTxnShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.id,
    amount: toDecimalNumber(record.amount)
  };
}

// Default list select — mirrors getAllCustomers `.select('-password')`.
const LIST_SELECT = {
  id: true,
  legacyId: true,
  firstName: true,
  lastName: true,
  gender: true,
  dateOfBirth: true,
  mobile: true,
  email: true,
  googleId: true,
  avatarUrl: true,
  lastLogin: true,
  isVerified: true,
  accountStatus: true,
  avatar: true,
  avatarPublicId: true,
  phone: true,
  address: true,
  district: true,
  upazila: true,
  thana: true,
  fullAddress: true,
  walletBalance: true,
  loyaltyPoints: true,
  referralCode: true,
  referredById: true,
  referralEarnings: true,
  loyaltyTier: true,
  tierUpgradedAt: true,
  lifetimeSpend: true,
  tierCashbackRate: true,
  isSandbox: true,
  isDeleted: true,
  deletedAt: true,
  deletionReason: true,
  verificationToken: true,
  verificationTokenExpiry: true,
  resetPasswordOtp: true,
  resetPasswordExpires: true,
  profileUpdateOtp: true,
  profileUpdateOtpExpires: true,
  profileUpdateType: true,
  pendingEmail: true,
  pendingMobile: true,
  createdAt: true
};

// ── findAll ──────────────────────────────────────────────────────────────────
// filters: { search?, tier?, loyaltyTier?, accountStatus?, isDeleted?, page?, limit?, cursor? }
// Sort: createdAt desc, id desc (matches getAllCustomers).
// VIP / Frequent / Inactive segmentation is intentionally omitted — requires Order data.
async function findAll(filters = {}) {
  const where = {};

  const tier = filters.tier ?? filters.loyaltyTier;
  if (tier !== undefined && tier !== '') {
    where.loyaltyTier = toLoyaltyTierEnum(tier);
  }
  if (filters.accountStatus !== undefined) {
    where.accountStatus = toAccountStatusEnum(filters.accountStatus);
  }
  if (filters.isDeleted !== undefined) {
    where.isDeleted = Boolean(filters.isDeleted);
  }

  const search = String(filters.search || '').trim();
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { mobile: { contains: search, mode: 'insensitive' } }
    ];
  }

  const cursor = String(filters.cursor || '').trim();
  if (cursor) {
    let cursorDoc = null;
    if (UUID_PATTERN.test(cursor)) {
      cursorDoc = await prisma.user.findUnique({
        where: { id: cursor },
        select: { createdAt: true, id: true }
      });
    } else if (MONGO_OID_PATTERN.test(cursor)) {
      cursorDoc = await prisma.user.findUnique({
        where: { legacyId: cursor },
        select: { createdAt: true, id: true }
      });
    }
    if (cursorDoc) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { createdAt: { lt: cursorDoc.createdAt } },
            {
              createdAt: cursorDoc.createdAt,
              legacyId: { lt: cursorDoc.legacyId || '' }
            }
          ]
        }
      ];
    }
  }

  const query = {
    where,
    select: LIST_SELECT,
    orderBy: [{ createdAt: 'desc' }, { legacyId: 'desc' }]
  };

  const explicitTake = Number(filters.take);
  const limit = Number(filters.limit);
  if (Number.isFinite(explicitTake) && explicitTake > 0) {
    query.take = Math.min(Math.max(explicitTake, 1), 101);
  } else if (Number.isFinite(limit) && limit > 0) {
    const page = Math.max(1, Number(filters.page) || 1);
    query.skip = (page - 1) * limit;
    query.take = limit;
  }

  const records = await prisma.user.findMany(query);
  return records.map((r) => toShape(r));
}

// ── countAll ─────────────────────────────────────────────────────────────────
// Same filters as findAll (without page/limit/cursor/take).
async function countAll(filters = {}) {
  const where = {};

  const tier = filters.tier ?? filters.loyaltyTier;
  if (tier !== undefined && tier !== '') {
    where.loyaltyTier = toLoyaltyTierEnum(tier);
  }
  if (filters.accountStatus !== undefined) {
    where.accountStatus = toAccountStatusEnum(filters.accountStatus);
  }
  if (filters.isDeleted !== undefined) {
    where.isDeleted = Boolean(filters.isDeleted);
  }

  const search = String(filters.search || '').trim();
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { mobile: { contains: search, mode: 'insensitive' } }
    ];
  }

  return prisma.user.count({ where });
}

// ── findById ─────────────────────────────────────────────────────────────────
async function findById(id) {
  if (!id) return null;
  const record = await prisma.user.findUnique({
    where: { id },
    select: LIST_SELECT
  });
  return toShape(record);
}

// ── findByEmail ──────────────────────────────────────────────────────────────
async function findByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const record = await prisma.user.findUnique({
    where: { email: normalized },
    select: LIST_SELECT
  });
  return toShape(record);
}

// ── findByReferralCode ───────────────────────────────────────────────────────
async function findByReferralCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return null;
  const record = await prisma.user.findUnique({
    where: { referralCode: normalized },
    select: LIST_SELECT
  });
  return toShape(record);
}

async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.user.findUnique({
    where: { legacyId: String(legacyId) },
    select: LIST_SELECT
  });
  return toShape(record);
}

function logUserFkMissing(mongoRefId) {
  console.error('[DUAL-WRITE-FK-MISSING]', {
    timestamp: new Date().toISOString(),
    model: 'User',
    field: 'userId',
    mongoRefId: String(mongoRefId),
    message: 'User not yet in Postgres'
  });
}

async function resolvePostgresUserId(mongoUserId) {
  const ref = String(mongoUserId || '').trim();
  if (!ref) return null;
  const row = await prisma.user.findUnique({ where: { legacyId: ref } });
  if (!row) {
    logUserFkMissing(ref);
    return null;
  }
  return row.id;
}

async function resolveReferredById(mongoReferrerId) {
  if (!mongoReferrerId) return null;
  const row = await prisma.user.findUnique({
    where: { legacyId: String(mongoReferrerId) }
  });
  return row ? row.id : null;
}

// ── create ───────────────────────────────────────────────────────────────────
// Generates a unique referralCode on every create unless one is already supplied
// (mirrors ensureReferralCode — skips when referralCode is already set).
async function create(data) {
  const firstName = String(data.firstName || '').trim();
  const lastName = String(data.lastName || '').trim();
  const email = String(data.email || '').trim().toLowerCase();

  if (!firstName) throw new Error('First name is required.');
  if (!lastName) throw new Error('Last name is required.');
  if (!email) throw new Error('Email is required.');

  let referralCode = data.referralCode
    ? String(data.referralCode).trim().toUpperCase()
    : null;
  if (!referralCode) {
    referralCode = await resolveUniqueReferralCode();
  }

  const record = await prisma.user.create({
    data: {
      firstName,
      lastName,
      email,
      referralCode,
      gender: data.gender !== undefined ? toGenderEnum(data.gender) : null,
      dateOfBirth: data.dateOfBirth ?? null,
      mobile: data.mobile != null ? String(data.mobile).trim() : null,
      password: data.password ?? null,
      googleId: data.googleId ?? null,
      avatarUrl: data.avatarUrl ?? null,
      lastLogin: data.lastLogin ?? null,
      isVerified: data.isVerified !== undefined ? Boolean(data.isVerified) : false,
      accountStatus: data.accountStatus !== undefined
        ? toAccountStatusEnum(data.accountStatus)
        : 'ACTIVE',
      avatar: String(data.avatar ?? '').trim(),
      avatarPublicId: String(data.avatarPublicId ?? '').trim(),
      phone: String(data.phone ?? '').trim(),
      address: String(data.address ?? '').trim(),
      district: String(data.district ?? '').trim(),
      upazila: String(data.upazila ?? '').trim(),
      thana: String(data.thana ?? '').trim(),
      fullAddress: String(data.fullAddress ?? '').trim(),
      walletBalance: data.walletBalance != null ? data.walletBalance : 0,
      loyaltyPoints: data.loyaltyPoints != null ? Number(data.loyaltyPoints) : 0,
      referredById: data.referredById ?? data.referredBy ?? null,
      referralEarnings: data.referralEarnings != null ? data.referralEarnings : 0,
      loyaltyTier: data.loyaltyTier !== undefined
        ? toLoyaltyTierEnum(data.loyaltyTier)
        : 'NONE',
      tierUpgradedAt: data.tierUpgradedAt ?? null,
      lifetimeSpend: data.lifetimeSpend != null ? data.lifetimeSpend : 0,
      tierCashbackRate: data.tierCashbackRate != null ? data.tierCashbackRate : 0,
      isSandbox: data.isSandbox !== undefined ? Boolean(data.isSandbox) : false,
      isDeleted: data.isDeleted !== undefined ? Boolean(data.isDeleted) : false,
      deletedAt: data.deletedAt ?? null,
      deletionReason: String(data.deletionReason ?? '').trim(),
      legacyId: data.legacyId != null ? String(data.legacyId) : null
    }
  });

  return toShape(record);
}

async function mapMongoUserToWrite(mongoDoc) {
  const plain = mongoDoc.toObject ? mongoDoc.toObject() : mongoDoc;
  const referredByRef = plain.referredBy?._id || plain.referredBy || null;

  return {
    firstName: String(plain.firstName || '').trim(),
    lastName: String(plain.lastName || '').trim(),
    email: String(plain.email || '').trim().toLowerCase(),
    referralCode: plain.referralCode
      ? String(plain.referralCode).trim().toUpperCase()
      : undefined,
    gender: plain.gender,
    dateOfBirth: plain.dateOfBirth ?? null,
    mobile: plain.mobile != null ? String(plain.mobile).trim() : null,
    password: plain.password ?? null,
    googleId: plain.googleId ?? null,
    avatarUrl: plain.avatarUrl ?? null,
    lastLogin: plain.lastLogin ?? null,
    isVerified: plain.isVerified === true,
    accountStatus: plain.accountStatus,
    avatar: String(plain.avatar ?? '').trim(),
    avatarPublicId: String(plain.avatarPublicId ?? '').trim(),
    phone: String(plain.phone ?? '').trim(),
    address: String(plain.address ?? '').trim(),
    district: String(plain.district ?? '').trim(),
    upazila: String(plain.upazila ?? '').trim(),
    thana: String(plain.thana ?? '').trim(),
    fullAddress: String(plain.fullAddress ?? '').trim(),
    walletBalance: plain.walletBalance != null ? plain.walletBalance : 0,
    loyaltyPoints: plain.loyaltyPoints != null ? Number(plain.loyaltyPoints) : 0,
    referredById: await resolveReferredById(referredByRef),
    referralEarnings: plain.referralEarnings != null ? plain.referralEarnings : 0,
    loyaltyTier: plain.loyaltyTier,
    tierUpgradedAt: plain.tierUpgradedAt ?? null,
    lifetimeSpend: plain.lifetimeSpend != null ? plain.lifetimeSpend : 0,
    tierCashbackRate: plain.tierCashbackRate != null ? plain.tierCashbackRate : 0,
    isSandbox: plain.isSandbox === true,
    isDeleted: plain.isDeleted === true,
    deletedAt: plain.deletedAt ?? null,
    deletionReason: String(plain.deletionReason ?? '').trim(),
    legacyId: mongoDoc._id != null ? String(mongoDoc._id) : null
  };
}

async function upsertFromMongo(mongoDoc) {
  const mapped = await mapMongoUserToWrite(mongoDoc);
  const legacyId = mapped.legacyId;
  if (!legacyId) throw new Error('User legacyId is required for upsert.');

  const existing = await findByLegacyId(legacyId);
  if (existing) {
    const { referralCode, legacyId: _lid, ...updateFields } = mapped;
    return update(existing.id, updateFields);
  }

  return create(mapped);
}

async function mirrorAccountDeletion(mongoDoc) {
  await upsertFromMongo(mongoDoc);
  const pgUser = await findByLegacyId(String(mongoDoc._id));
  if (!pgUser) return;

  await prisma.cart.deleteMany({ where: { userId: pgUser.id } });
  await prisma.address.deleteMany({ where: { userId: pgUser.id } });
  await prisma.wishlistItem.deleteMany({ where: { userId: pgUser.id } });
  await prisma.walletTransaction.deleteMany({ where: { userId: pgUser.id } });
}

// ── update ───────────────────────────────────────────────────────────────────
// referralCode is immutable after creation — any supplied value is ignored.
async function update(id, data) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('User not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // referralCode is assigned once at creation and must never change via generic update.
  if (data.referralCode !== undefined) {
    // Intentionally ignored — not written to the database.
  }

  const fields = {};

  if (data.firstName !== undefined) {
    const v = String(data.firstName).trim();
    if (!v) throw new Error('First name cannot be empty.');
    fields.firstName = v;
  }
  if (data.lastName !== undefined) {
    const v = String(data.lastName).trim();
    if (!v) throw new Error('Last name cannot be empty.');
    fields.lastName = v;
  }
  if (data.email !== undefined) fields.email = String(data.email).trim().toLowerCase();
  if (data.gender !== undefined) fields.gender = toGenderEnum(data.gender);
  if (data.dateOfBirth !== undefined) fields.dateOfBirth = data.dateOfBirth;
  if (data.mobile !== undefined) {
    fields.mobile = data.mobile != null ? String(data.mobile).trim() : null;
  }
  if (data.password !== undefined) fields.password = data.password;
  if (data.googleId !== undefined) fields.googleId = data.googleId;
  if (data.avatarUrl !== undefined) fields.avatarUrl = data.avatarUrl;
  if (data.lastLogin !== undefined) fields.lastLogin = data.lastLogin;
  if (data.isVerified !== undefined) fields.isVerified = Boolean(data.isVerified);
  if (data.accountStatus !== undefined) {
    fields.accountStatus = toAccountStatusEnum(data.accountStatus);
  }
  if (data.avatar !== undefined) fields.avatar = String(data.avatar).trim();
  if (data.avatarPublicId !== undefined) {
    fields.avatarPublicId = String(data.avatarPublicId).trim();
  }
  if (data.phone !== undefined) fields.phone = String(data.phone).trim();
  if (data.address !== undefined) fields.address = String(data.address).trim();
  if (data.district !== undefined) fields.district = String(data.district).trim();
  if (data.upazila !== undefined) fields.upazila = String(data.upazila).trim();
  if (data.thana !== undefined) fields.thana = String(data.thana).trim();
  if (data.fullAddress !== undefined) fields.fullAddress = String(data.fullAddress).trim();
  if (data.loyaltyPoints !== undefined) fields.loyaltyPoints = Number(data.loyaltyPoints);
  if (data.referredById !== undefined || data.referredBy !== undefined) {
    fields.referredById = data.referredById ?? data.referredBy ?? null;
  }
  if (data.referralEarnings !== undefined) fields.referralEarnings = data.referralEarnings;
  if (data.loyaltyTier !== undefined) fields.loyaltyTier = toLoyaltyTierEnum(data.loyaltyTier);
  if (data.tierUpgradedAt !== undefined) fields.tierUpgradedAt = data.tierUpgradedAt;
  if (data.lifetimeSpend !== undefined) fields.lifetimeSpend = data.lifetimeSpend;
  if (data.tierCashbackRate !== undefined) fields.tierCashbackRate = data.tierCashbackRate;
  if (data.isSandbox !== undefined) fields.isSandbox = Boolean(data.isSandbox);
  if (data.isDeleted !== undefined) fields.isDeleted = Boolean(data.isDeleted);
  if (data.deletedAt !== undefined) fields.deletedAt = data.deletedAt;
  if (data.deletionReason !== undefined) {
    fields.deletionReason = String(data.deletionReason).trim();
  }

  const record = await prisma.user.update({ where: { id }, data: fields });
  return toShape(record);
}

// ── remove ───────────────────────────────────────────────────────────────────
// Plain delete() — child rows Cascade per schema.prisma:
//   Address, WishlistItem, WalletTransaction, UserSession, Note, Cart (+ CartItem).
// Order / Review / CouponRedemption use SetNull and survive user deletion.
async function remove(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    const err = new Error('User not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  await prisma.user.delete({ where: { id } });
  return { deleted: true, email: user.email };
}

// ══════════════════════════════════════════════════════════════════════════════
// Addresses
// ══════════════════════════════════════════════════════════════════════════════

async function listAddresses(userId, { sort = 'defaultFirst' } = {}) {
  const orderBy = sort === 'mongoEmbedded'
    ? { createdAt: 'asc' }
    : [{ isDefault: 'desc' }, { createdAt: 'desc' }];
  const records = await prisma.address.findMany({
    where: { userId },
    orderBy
  });
  return records.map(toAddressShape);
}

async function addAddress(userId, addressData) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    const err = new Error('User not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fullAddress = String(addressData.fullAddress || '').trim();
  if (!fullAddress) throw new Error('Full address is required.');

  const isDefault = addressData.isDefault === true;

  // Demote other defaults when adding a new default (sequential — no $transaction over HTTP).
  if (isDefault) {
    await prisma.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false }
    });
  }

  const record = await prisma.address.create({
    data: {
      userId,
      label: String(addressData.label ?? 'Home').trim() || 'Home',
      district: String(addressData.district ?? '').trim(),
      upazilaOrThana: String(
        addressData.upazilaOrThana ?? addressData.upazila ?? addressData.thana ?? ''
      ).trim(),
      fullAddress,
      phone: String(addressData.phone ?? '').trim(),
      isDefault,
      legacyId: addressData.legacyId != null ? String(addressData.legacyId) : null
    }
  });
  return toAddressShape(record);
}

async function findAddressByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.address.findUnique({ where: { legacyId: String(legacyId) } });
  return toAddressShape(record);
}

async function upsertAddressFromMongo(mongoUserLegacyId, addressSubdoc) {
  const pgUserId = await resolvePostgresUserId(mongoUserLegacyId);
  if (!pgUserId) return null;

  const plain = addressSubdoc.toObject ? addressSubdoc.toObject() : addressSubdoc;
  const legacyId = plain._id != null ? String(plain._id) : null;
  const payload = {
    label: plain.label,
    district: plain.district,
    upazilaOrThana: plain.upazilaOrThana ?? plain.upazila ?? plain.thana,
    fullAddress: plain.fullAddress,
    phone: plain.phone,
    isDefault: plain.isDefault === true,
    legacyId
  };

  if (legacyId) {
    const existing = await findAddressByLegacyId(legacyId);
    if (existing) return updateAddress(existing.id, payload);
  }

  return addAddress(pgUserId, payload);
}

async function removeAddressByLegacyId(legacyId) {
  const existing = await findAddressByLegacyId(legacyId);
  if (!existing) return { deleted: false };
  return removeAddress(existing.id);
}

async function updateAddress(addressId, data) {
  const existing = await prisma.address.findUnique({ where: { id: addressId } });
  if (!existing) {
    const err = new Error('Address not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  if (data.label !== undefined) fields.label = String(data.label).trim() || 'Home';
  if (data.district !== undefined) fields.district = String(data.district).trim();
  if (data.upazilaOrThana !== undefined) {
    fields.upazilaOrThana = String(data.upazilaOrThana).trim();
  } else if (data.upazila !== undefined) {
    fields.upazilaOrThana = String(data.upazila).trim();
  } else if (data.thana !== undefined) {
    fields.upazilaOrThana = String(data.thana).trim();
  }
  if (data.fullAddress !== undefined) {
    const v = String(data.fullAddress).trim();
    if (!v) throw new Error('Full address cannot be empty.');
    fields.fullAddress = v;
  }
  if (data.phone !== undefined) fields.phone = String(data.phone).trim();

  if (data.isDefault !== undefined && data.isDefault === true) {
    await prisma.address.updateMany({
      where: { userId: existing.userId, isDefault: true, id: { not: addressId } },
      data: { isDefault: false }
    });
    fields.isDefault = true;
  } else if (data.isDefault === false) {
    fields.isDefault = false;
  }

  const record = await prisma.address.update({ where: { id: addressId }, data: fields });
  return toAddressShape(record);
}

async function removeAddress(addressId) {
  const existing = await prisma.address.findUnique({ where: { id: addressId } });
  if (!existing) {
    const err = new Error('Address not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await prisma.address.delete({ where: { id: addressId } });
  return { deleted: true, id: addressId };
}

// ══════════════════════════════════════════════════════════════════════════════
// Wishlist
// ══════════════════════════════════════════════════════════════════════════════

async function listWishlist(userId) {
  const records = await prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: { addedAt: 'desc' }
  });
  return records.map(toWishlistShape);
}

async function listWalletTransactions(userId) {
  const records = await prisma.walletTransaction.findMany({
    where: { userId: String(userId) },
    orderBy: [{ date: 'desc' }, { id: 'desc' }]
  });
  return records.map(toWalletTxnShape);
}

async function countReferralsByReferredByLegacyId(referrerLegacyId) {
  if (!referrerLegacyId) return 0;
  const referrer = await prisma.user.findUnique({
    where: { legacyId: String(referrerLegacyId) },
    select: { id: true }
  });
  if (!referrer) return 0;
  return prisma.user.count({ where: { referredById: referrer.id } });
}

async function addToWishlist(userId, productId, snapshot = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    const err = new Error('User not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const legacyProductId = String(productId || '').trim();
  if (!legacyProductId) throw new Error('Product id is required.');

  let productFk = null;
  let product = await prisma.product.findUnique({
    where: { legacyId: legacyProductId },
    select: { id: true }
  });
  if (!product) {
    product = await prisma.product.findUnique({
      where: { productId: legacyProductId },
      select: { id: true }
    });
  }
  if (!product && UUID_PATTERN.test(legacyProductId)) {
    product = await prisma.product.findUnique({
      where: { id: legacyProductId },
      select: { id: true }
    });
  }
  if (product) productFk = product.id;
  else {
    console.error('[DUAL-WRITE-FK-MISSING]', {
      timestamp: new Date().toISOString(),
      model: 'WishlistItem',
      field: 'productId',
      mongoRefId: legacyProductId,
      message: 'Product not yet in Postgres'
    });
  }

  const existing = await prisma.wishlistItem.findFirst({
    where: {
      userId,
      OR: [
        { legacyProductId },
        ...(productFk ? [{ productId: productFk }] : [])
      ]
    }
  });
  if (existing) return toWishlistShape(existing);

  const record = await prisma.wishlistItem.create({
    data: {
      userId,
      legacyProductId,
      productId: productFk,
      name: String(snapshot.name ?? '').trim(),
      price: snapshot.price != null ? snapshot.price : 0,
      image: String(snapshot.image ?? '').trim(),
      icon: String(snapshot.icon ?? '📦').trim() || '📦',
      legacyId: snapshot.legacyId != null ? String(snapshot.legacyId) : null
    }
  });
  return toWishlistShape(record);
}

async function removeFromWishlist(userId, productId) {
  const legacyProductId = String(productId || '').trim();
  if (!legacyProductId) throw new Error('Product id is required.');

  const item = await prisma.wishlistItem.findFirst({
    where: {
      userId,
      OR: [
        { legacyProductId },
        ...(UUID_PATTERN.test(legacyProductId) ? [{ productId: legacyProductId }] : [])
      ]
    }
  });

  if (!item) {
    const err = new Error('Wishlist item not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  await prisma.wishlistItem.delete({ where: { id: item.id } });
  return { deleted: true, id: item.id };
}

// ══════════════════════════════════════════════════════════════════════════════
// Wallet
// ══════════════════════════════════════════════════════════════════════════════

async function creditWallet(userId, amount, type, description) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    const err = new Error('User not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    const err = new Error('Credit amount must be a positive number.');
    err.code = 'INVALID_AMOUNT';
    throw err;
  }

  const currentBalance = Number(user.walletBalance);
  const newBalance = currentBalance + amt;

  // Sequential writes — PrismaNeonHttp does not support $transaction over HTTP
  // (same limitation documented in warehouseRepository.setDefault).
  await prisma.user.update({
    where: { id: userId },
    data: { walletBalance: newBalance }
  });

  const transaction = await prisma.walletTransaction.create({
    data: {
      userId,
      type: String(type || 'credit'),
      amount: amt,
      note: String(description || '').trim()
    }
  });

  return {
    walletBalance: newBalance,
    transaction: toWalletTxnShape(transaction)
  };
}

async function debitWallet(userId, amount, type, description) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    const err = new Error('User not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    const err = new Error('Debit amount must be a positive number.');
    err.code = 'INVALID_AMOUNT';
    throw err;
  }

  const currentBalance = Number(user.walletBalance);
  const newBalance = currentBalance - amt;

  if (newBalance < 0) {
    const err = new Error('Insufficient wallet balance.');
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }

  // Sequential writes — see creditWallet comment.
  await prisma.user.update({
    where: { id: userId },
    data: { walletBalance: newBalance }
  });

  const transaction = await prisma.walletTransaction.create({
    data: {
      userId,
      type: String(type || 'debit'),
      amount: amt,
      note: String(description || '').trim()
    }
  });

  return {
    walletBalance: newBalance,
    transaction: toWalletTxnShape(transaction)
  };
}

/** Mirror Mongo wallet mutation — sync balance/points and append latest history row. */
async function mirrorWalletFromMongo(mongoUserDoc) {
  const pgUser = await findByLegacyId(String(mongoUserDoc._id));
  if (!pgUser) {
    logUserFkMissing(mongoUserDoc._id);
    return null;
  }

  await prisma.user.update({
    where: { id: pgUser.id },
    data: {
      walletBalance: mongoUserDoc.walletBalance != null ? mongoUserDoc.walletBalance : 0,
      loyaltyPoints: mongoUserDoc.loyaltyPoints != null ? Number(mongoUserDoc.loyaltyPoints) : 0
    }
  });

  const history = Array.isArray(mongoUserDoc.walletHistory) ? mongoUserDoc.walletHistory : [];
  const latest = history[0];
  if (!latest) return { walletBalance: mongoUserDoc.walletBalance };

  const legacyTxnId = latest._id != null ? String(latest._id) : null;
  if (legacyTxnId) {
    const existing = await prisma.walletTransaction.findUnique({
      where: { legacyId: legacyTxnId }
    });
    if (existing) return { walletBalance: mongoUserDoc.walletBalance };
  }

  await prisma.walletTransaction.create({
    data: {
      userId: pgUser.id,
      type: String(latest.type || 'credit'),
      amount: latest.amount != null ? latest.amount : 0,
      note: String(latest.note || '').trim(),
      referenceOrder: String(latest.referenceOrder || '').trim(),
      date: latest.date ? new Date(latest.date) : new Date(),
      legacyId: legacyTxnId
    }
  });

  return { walletBalance: mongoUserDoc.walletBalance };
}

module.exports = {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  REFERRAL_MAX_ATTEMPTS,
  generateReferralCode,
  resolveUniqueReferralCode,
  findAll,
  countAll,
  findById,
  findByEmail,
  findByReferralCode,
  findByLegacyId,
  resolvePostgresUserId,
  mapMongoUserToWrite,
  upsertFromMongo,
  mirrorAccountDeletion,
  create,
  update,
  remove,
  listAddresses,
  addAddress,
  updateAddress,
  removeAddress,
  findAddressByLegacyId,
  upsertAddressFromMongo,
  removeAddressByLegacyId,
  listWishlist,
  listWalletTransactions,
  countReferralsByReferredByLegacyId,
  addToWishlist,
  removeFromWishlist,
  creditWallet,
  debitWallet,
  mirrorWalletFromMongo
};
