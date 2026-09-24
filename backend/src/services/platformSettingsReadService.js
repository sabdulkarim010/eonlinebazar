/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: platformSettingsReadService.js
 * Description: PG-first platform admin settings read (GET /api/admin/platform-settings)
 *   with Mongo fallback and safe defaults when both databases fail.
 ********************************************************************/

'use strict';

const mongoose = require('mongoose');
const Admin = require('../models/admin');
const { routedRead } = require('./readRouter');
const { isPgReadEnabled } = require('../config/readCutoverFlags');
const { normalizeBrandingPublicUrl } = require('../utils/brandingPaths');

const DEFAULT_PLATFORM_ADMIN_SETTINGS = Object.freeze({
  username: 'admin',
  displayName: 'Super Admin',
  name: 'Super Admin',
  storeName: 'EonlineBazar',
  currency: 'BDT',
  currencySymbol: '৳',
  timezone: 'Asia/Dhaka',
  logoUrl: '',
  faviconUrl: '',
  email: '',
  role: 'superadmin',
  image: '',
  status: 'active'
});

const SECRET_FIELDS = [
  'otp',
  'otpExpiry',
  'totpSecret',
  'totpPendingSecret',
  'smsSetupOtp',
  'smsSetupOtpExpiry'
];

function getAdminRepository() {
  return require('../repositories/adminRepository');
}

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

function resolveUsername(username) {
  const resolved = String(username || 'admin').trim();
  return resolved || 'admin';
}

function shapePlatformAdmin(doc) {
  if (!doc) return null;
  const plain = typeof doc.toObject === 'function'
    ? doc.toObject({ getters: true })
    : { ...doc };
  delete plain.password;
  for (const field of SECRET_FIELDS) {
    delete plain[field];
  }
  plain.logoUrl = normalizeBrandingPublicUrl(plain.logoUrl);
  plain.faviconUrl = normalizeBrandingPublicUrl(plain.faviconUrl);
  return plain;
}

function buildDefaultPlatformSettings(username) {
  return {
    ...DEFAULT_PLATFORM_ADMIN_SETTINGS,
    username: resolveUsername(username)
  };
}

async function fetchAdminByUsernameMongo(username) {
  if (!isMongoConnected()) {
    const err = new Error('MongoDB is not connected');
    err.code = 'MONGO_UNAVAILABLE';
    throw err;
  }
  const admin = await Admin.findOne({ username: resolveUsername(username) })
    .select('-password')
    .lean();
  return shapePlatformAdmin(admin);
}

async function fetchAdminByUsernamePg(username) {
  const row = await getAdminRepository().findByUsername(username);
  return shapePlatformAdmin(row);
}

/**
 * Routed platform admin read — PG when READ_PG_ADMIN=true, else Mongo.
 * When PG is enabled but returns no row, falls back to Mongo (migration safety).
 */
async function fetchPlatformAdminSettings(username) {
  const resolvedUsername = resolveUsername(username);
  const admin = await routedRead(
    'admin',
    () => fetchAdminByUsernameMongo(resolvedUsername),
    () => fetchAdminByUsernamePg(resolvedUsername)
  );

  if (admin) return admin;

  if (isPgReadEnabled('admin')) {
    try {
      return await fetchAdminByUsernameMongo(resolvedUsername);
    } catch (mongoErr) {
      console.warn('[platformSettingsRead] Mongo secondary read failed:', mongoErr.message);
      return null;
    }
  }

  return null;
}

/**
 * Safe platform admin read — never throws.
 * @returns {{ admin: object|null, fallback: boolean, notFound?: boolean }}
 */
async function fetchPlatformAdminSettingsSafe(username) {
  const resolvedUsername = resolveUsername(username);

  try {
    const admin = await fetchPlatformAdminSettings(resolvedUsername);
    if (admin) {
      return { admin, fallback: false };
    }
    return { admin: null, fallback: false, notFound: true };
  } catch (primaryErr) {
    console.warn('[platformSettingsRead] routed read failed:', primaryErr.message);
  }

  try {
    const mongoAdmin = await fetchAdminByUsernameMongo(resolvedUsername);
    if (mongoAdmin) {
      return { admin: mongoAdmin, fallback: false };
    }
  } catch (mongoErr) {
    console.warn('[platformSettingsRead] Mongo fallback failed:', mongoErr.message);
  }

  try {
    const pgAdmin = await fetchAdminByUsernamePg(resolvedUsername);
    if (pgAdmin) {
      return { admin: pgAdmin, fallback: false };
    }
  } catch (pgErr) {
    console.warn('[platformSettingsRead] PG fallback failed:', pgErr.message);
  }

  return {
    admin: buildDefaultPlatformSettings(resolvedUsername),
    fallback: true
  };
}

module.exports = {
  DEFAULT_PLATFORM_ADMIN_SETTINGS,
  fetchPlatformAdminSettings,
  fetchPlatformAdminSettingsSafe,
  shapePlatformAdmin,
  buildDefaultPlatformSettings
};
