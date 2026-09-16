#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 6 — Postgres-only User + Address data sync (local, not committed).
 * Mongo read-only. Copies authoritative referralCode, User.createdAt, and
 * Address.createdAt from Mongo embedded subdocs by legacyId.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const prisma = require('../backend/src/config/prismaClient');

function toDate(value) {
  if (value == null) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function normalizeReferralCode(value) {
  if (value == null || value === '') return null;
  return String(value).trim().toUpperCase();
}

async function syncUsers(User) {
  const mongoRows = await User.find().select('_id referralCode createdAt email').lean();
  const stats = {
    usersScanned: mongoRows.length,
    usersUpdated: 0,
    referralCodeUpdated: 0,
    createdAtUpdated: 0,
    skippedNoPg: 0,
    referralClashes: 0,
    unchanged: 0
  };

  for (const mongoUser of mongoRows) {
    const legacyId = String(mongoUser._id);
    const pg = await prisma.user.findUnique({ where: { legacyId } });
    if (!pg) {
      stats.skippedNoPg += 1;
      continue;
    }

    const data = {};
    const mongoCreated = toDate(mongoUser.createdAt);
    if (mongoCreated && pg.createdAt?.getTime() !== mongoCreated.getTime()) {
      data.createdAt = mongoCreated;
      stats.createdAtUpdated += 1;
    }

    const full = await User.findById(mongoUser._id).lean();
    if (full) {
      const { firstName, lastName } = deriveUserNames(full);
      const scalarFields = {
        firstName,
        lastName,
        mobile: full.mobile != null ? String(full.mobile).trim() : null,
        gender: full.gender === 'Female' ? 'FEMALE' : full.gender === 'Other' ? 'OTHER' : full.gender === 'Male' ? 'MALE' : null,
        avatar: String(full.avatar ?? '').trim(),
        avatarPublicId: String(full.avatarPublicId ?? '').trim(),
        phone: String(full.phone ?? '').trim(),
        address: String(full.address ?? '').trim(),
        district: String(full.district ?? '').trim(),
        upazila: String(full.upazila ?? '').trim(),
        thana: String(full.thana ?? '').trim(),
        fullAddress: String(full.fullAddress ?? '').trim(),
        walletBalance: full.walletBalance != null ? full.walletBalance : 0,
        loyaltyPoints: full.loyaltyPoints != null ? Number(full.loyaltyPoints) : 0,
        referralEarnings: full.referralEarnings != null ? full.referralEarnings : 0,
        lifetimeSpend: full.lifetimeSpend != null ? full.lifetimeSpend : 0,
        tierCashbackRate: full.tierCashbackRate != null ? full.tierCashbackRate : 0,
        isVerified: full.isVerified === true,
        isSandbox: full.isSandbox === true,
        isDeleted: full.isDeleted === true,
        verificationToken: full.verificationToken ?? null,
        verificationTokenExpiry: toDate(full.verificationTokenExpiry) ?? null,
        resetPasswordOtp: full.resetPasswordOtp ?? null,
        resetPasswordExpires: toDate(full.resetPasswordExpires) ?? null,
        profileUpdateOtp: full.profileUpdateOtp ?? null,
        profileUpdateOtpExpires: toDate(full.profileUpdateOtpExpires) ?? null,
        profileUpdateType: full.profileUpdateType === 'email'
          ? 'EMAIL'
          : full.profileUpdateType === 'mobile'
            ? 'MOBILE'
            : null,
        pendingEmail: full.pendingEmail ?? null,
        pendingMobile: full.pendingMobile ?? null,
        googleId: full.googleId ?? null,
        avatarUrl: full.avatarUrl ?? null,
        lastLogin: toDate(full.lastLogin) ?? null
      };
      Object.entries(scalarFields).forEach(([key, value]) => {
        const pgVal = pg[key];
        const pgTime = pgVal instanceof Date ? pgVal.getTime() : pgVal;
        const valTime = value instanceof Date ? value.getTime() : value;
        if (pgTime !== valTime) data[key] = value;
      });

      if (full.referredBy) {
        const referrer = await prisma.user.findUnique({
          where: { legacyId: String(full.referredBy) },
          select: { id: true }
        });
        if (referrer && pg.referredById !== referrer.id) {
          data.referredById = referrer.id;
        }
      } else if (pg.referredById) {
        data.referredById = null;
      }
    }

    const mongoCode = normalizeReferralCode(mongoUser.referralCode);
    const pgCode = normalizeReferralCode(pg.referralCode);
    if (mongoCode && mongoCode !== pgCode) {
      const clash = await prisma.user.findFirst({
        where: {
          referralCode: mongoCode,
          NOT: { id: pg.id }
        },
        select: { id: true, legacyId: true, email: true, referralCode: true }
      });

      if (clash) {
        stats.referralClashes += 1;
        console.warn('[REFERRAL-CLASH]', {
          targetLegacyId: legacyId,
          targetEmail: mongoUser.email,
          desiredCode: mongoCode,
          heldByLegacyId: clash.legacyId,
          heldByEmail: clash.email,
          heldCode: clash.referralCode
        });
        await prisma.user.update({
          where: { id: clash.id },
          data: { referralCode: null }
        });
      }
      data.referralCode = mongoCode;
      stats.referralCodeUpdated += 1;
    } else if (!mongoCode && pgCode) {
      data.referralCode = null;
      stats.referralCodeUpdated += 1;
    }

    if (Object.keys(data).length === 0) {
      stats.unchanged += 1;
      continue;
    }

    await prisma.user.update({ where: { id: pg.id }, data });
    stats.usersUpdated += 1;
    console.log('SYNC User', legacyId, Object.keys(data).join(', '));
  }

  return stats;
}

async function syncWalletTransactions(User) {
  const mongoRows = await User.find({ 'walletHistory.0': { $exists: true } })
    .select('_id walletHistory')
    .lean();
  const stats = { users: 0, scanned: 0, recreated: 0 };

  for (const mongoUser of mongoRows) {
    const legacyId = String(mongoUser._id);
    const pgUser = await prisma.user.findUnique({ where: { legacyId } });
    if (!pgUser) continue;
    stats.users += 1;

    await prisma.walletTransaction.deleteMany({ where: { userId: pgUser.id } });

    for (const txn of mongoUser.walletHistory || []) {
      stats.scanned += 1;
      const txnLegacyId = txn._id != null ? String(txn._id) : null;
      await prisma.walletTransaction.create({
        data: {
          userId: pgUser.id,
          legacyId: txnLegacyId,
          type: String(txn.type || 'credit'),
          amount: txn.amount != null ? txn.amount : 0,
          note: String(txn.note || ''),
          referenceOrder: String(txn.referenceOrder || ''),
          date: toDate(txn.date) || new Date()
        }
      });
      stats.recreated += 1;
    }
  }

  return stats;
}

async function syncAddresses(User) {
  const mongoRows = await User.find({ 'addresses.0': { $exists: true } })
    .select('_id addresses')
    .lean();

  const stats = {
    usersWithAddresses: mongoRows.length,
    addressesScanned: 0,
    addressesUpdated: 0,
    skippedNoPg: 0,
    unchanged: 0
  };

  for (const mongoUser of mongoRows) {
    for (const addr of mongoUser.addresses || []) {
      stats.addressesScanned += 1;
      const legacyId = addr._id != null ? String(addr._id) : null;
      if (!legacyId) continue;

      const pg = await prisma.address.findUnique({ where: { legacyId } });
      if (!pg) {
        stats.skippedNoPg += 1;
        continue;
      }

      const mongoCreated = toDate(addr.createdAt);
      if (!mongoCreated || pg.createdAt?.getTime() === mongoCreated.getTime()) {
        stats.unchanged += 1;
        continue;
      }

      await prisma.address.update({
        where: { id: pg.id },
        data: { createdAt: mongoCreated }
      });
      stats.addressesUpdated += 1;
      console.log('SYNC Address', legacyId);
    }
  }

  return stats;
}

function deriveUserNames(plain = {}) {
  const first = String(plain.firstName || '').trim();
  const last = String(plain.lastName || '').trim();
  if (first && last) return { firstName: first, lastName: last };
  const localPart = String(plain.email || 'customer').split('@')[0] || 'Customer';
  return {
    firstName: first || localPart.slice(0, 80) || 'Customer',
    lastName: last || 'User'
  };
}

async function backfillMissingUsers(User) {
  const userRepo = require('../backend/src/repositories/userRepository');
  const mongoRows = await User.find().select('_id email').lean();
  const stats = { scanned: mongoRows.length, backfilled: 0, addressesMirrored: 0 };

  for (const row of mongoRows) {
    const legacyId = String(row._id);
    const existing = await prisma.user.findUnique({ where: { legacyId } });
    if (existing) continue;

    const full = await User.findById(row._id);
    if (!full) continue;
    const plain = full.toObject();
    const { firstName, lastName } = deriveUserNames(plain);

    await prisma.user.create({
      data: {
        legacyId,
        firstName,
        lastName,
        email: String(plain.email || '').trim().toLowerCase(),
        referralCode: normalizeReferralCode(plain.referralCode),
        walletBalance: plain.walletBalance != null ? plain.walletBalance : 0,
        loyaltyPoints: plain.loyaltyPoints != null ? Number(plain.loyaltyPoints) : 0,
        referralEarnings: plain.referralEarnings != null ? plain.referralEarnings : 0,
        lifetimeSpend: plain.lifetimeSpend != null ? plain.lifetimeSpend : 0,
        tierCashbackRate: plain.tierCashbackRate != null ? plain.tierCashbackRate : 0,
        isVerified: plain.isVerified === true,
        isSandbox: plain.isSandbox === true,
        isDeleted: plain.isDeleted === true,
        createdAt: toDate(plain.createdAt) || new Date()
      }
    });
    stats.backfilled += 1;
    console.log('BACKFILL User', legacyId, row.email);

    for (const addr of full.addresses || []) {
      // eslint-disable-next-line no-await-in-loop
      await userRepo.upsertAddressFromMongo(legacyId, addr);
      stats.addressesMirrored += 1;
    }
  }

  return stats;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('../backend/src/models/user');

  console.log('=== Stage 4 Step 6 — User + Address data sync ===');
  const backfillStats = await backfillMissingUsers(User);
  console.log('Backfill:', JSON.stringify(backfillStats, null, 2));

  const userStats = await syncUsers(User);
  console.log('User sync:', JSON.stringify(userStats, null, 2));

  const walletStats = await syncWalletTransactions(User);
  console.log('Wallet txn sync:', JSON.stringify(walletStats, null, 2));

  const addressStats = await syncAddresses(User);
  console.log('Address sync:', JSON.stringify(addressStats, null, 2));

  await mongoose.disconnect();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
