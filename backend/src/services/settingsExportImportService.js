/********************************************************************
 * Project: EonlineBazar
 * File: settingsExportImportService.js
 * Description: Sanitized settings JSON export and validated import.
 ********************************************************************/

'use strict';

const Settings = require('../models/Settings');
const Category = require('../models/category');
const { fetchSettingsDocument } = require('./settingsReadService');
const { fetchPlatformAdminSettingsSafe } = require('./platformSettingsReadService');
const { dualWrite } = require('./dualWriteService');
const { invalidate, CACHE_KEYS } = require('./cacheService');
const {
  EXPORT_VERSION,
  sanitizeSettingsDocument,
  sanitizePlatformSettings,
  pickCategoryExportRow,
  pickImportableSettings,
  pickImportablePlatform,
  validateImportPayload,
  CATEGORY_EXPORT_FIELDS,
  CATEGORY_IMPORT_FIELDS
} = require('../utils/settingsExportSanitizer');

function getSettingsRepository() {
  return require('../repositories/settingsRepository');
}

function getSidebarLabelRepository() {
  return require('../repositories/sidebarLabelRepository');
}

function getCategoryRepository() {
  return require('../repositories/categoryRepository');
}

async function dualWriteSettingsUpsert(settings) {
  await dualWrite(
    () => settings.save(),
    async (saved) => {
      const plain = saved.toObject ? saved.toObject() : saved;
      await getSettingsRepository().upsertFromMongo(plain);
    },
    {
      model: 'Settings',
      operation: 'update',
      mongoId: (saved) => String(saved._id)
    }
  );
}

async function fetchCategoriesForExport() {
  try {
    const rows = await getCategoryRepository().findAll();
    return rows.map(pickCategoryExportRow).filter(Boolean);
  } catch (pgErr) {
    console.warn('[settingsExport] PG category read failed, falling back to Mongo:', pgErr.message);
    const rows = await Category.find({})
      .select(CATEGORY_EXPORT_FIELDS.join(' '))
      .sort({ position: 1, name: 1 })
      .lean();
    return rows.map(pickCategoryExportRow).filter(Boolean);
  }
}

async function buildSettingsExportPayload({ username } = {}) {
  const [settingsDoc, platformDoc, sidebarLabels, categories] = await Promise.all([
    fetchSettingsDocument(),
    fetchPlatformAdminSettingsSafe(username || 'admin'),
    getSidebarLabelRepository().findAllMap().catch(() => ({})),
    fetchCategoriesForExport()
  ]);

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    platform: sanitizePlatformSettings(platformDoc),
    settings: sanitizeSettingsDocument(settingsDoc),
    sidebarLabels: sidebarLabels || {},
    categories
  };
}

async function applyCategoryImportRows(rows = []) {
  if (!Array.isArray(rows) || !rows.length) {
    return { updated: 0, skipped: 0 };
  }

  const repo = getCategoryRepository();
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const slug = String(row?.slug || '').trim().toLowerCase();
    if (!slug) {
      skipped += 1;
      continue;
    }

    const existing = await repo.findBySlug(slug);
    if (!existing) {
      skipped += 1;
      continue;
    }

    const patch = {};
    for (const field of CATEGORY_IMPORT_FIELDS) {
      if (row[field] !== undefined) patch[field] = row[field];
    }
    if (!Object.keys(patch).length) {
      skipped += 1;
      continue;
    }

    await repo.update(existing._id || existing.id, patch);
    updated += 1;
  }

  return { updated, skipped };
}

async function applyPlatformImport(platformSection, username) {
  const patch = pickImportablePlatform(platformSection);
  if (!Object.keys(patch).length) return { updated: false };

  const resolvedUsername = String(username || 'admin').trim() || 'admin';
  const Admin = require('../models/admin');
  const { adminDualWrite, mirrorAdminUpdate } = require('../utils/adminDualWriteHelpers');

  const admin = await Admin.findOne({ username: resolvedUsername });
  if (!admin) {
    return { updated: false };
  }

  if (patch.storeName !== undefined) admin.storeName = String(patch.storeName).trim();
  if (patch.currency !== undefined) admin.currency = String(patch.currency).trim();
  if (patch.currencySymbol !== undefined) admin.currencySymbol = String(patch.currencySymbol).trim();
  if (patch.timezone !== undefined) admin.timezone = String(patch.timezone).trim();
  if (patch.logoUrl !== undefined) admin.logoUrl = String(patch.logoUrl).trim();
  if (patch.faviconUrl !== undefined) admin.faviconUrl = String(patch.faviconUrl).trim();

  await adminDualWrite(
    () => admin.save(),
    (saved) => mirrorAdminUpdate(saved, { operation: 'settingsImportPlatform' }),
    {
      operation: 'settingsImportPlatform',
      mongoId: (saved) => String(saved._id)
    }
  );

  if (patch.storeName !== undefined) {
    await invalidate(CACHE_KEYS.STORE_SETTINGS);
  }

  return { updated: true };
}

async function applySettingsImportPayload(payload, { username, actorId } = {}) {
  const validation = validateImportPayload(payload);
  if (!validation.valid) {
    const err = new Error(validation.message);
    err.statusCode = 400;
    throw err;
  }

  const settingsPatch = pickImportableSettings(payload.settings);
  const settings = await Settings.getOrCreate();

  for (const [key, value] of Object.entries(settingsPatch)) {
    if (key === 'notificationSettings') {
      settings.notificationSettings = {
        ...(settings.notificationSettings || {}),
        ...value
      };
      settings.markModified('notificationSettings');
      continue;
    }
    settings[key] = value;
  }

  if (settingsPatch.freeShippingThreshold != null) {
    settings.freeShippingMinAmount = Number(settingsPatch.freeShippingThreshold);
  } else if (settingsPatch.freeShippingMinAmount != null) {
    settings.freeShippingThreshold = Number(settingsPatch.freeShippingMinAmount);
  }

  await dualWriteSettingsUpsert(settings);
  await invalidate(CACHE_KEYS.STORE_SETTINGS);
  await invalidate(CACHE_KEYS.FLASH_SALE);

  const sidebarResult = payload.sidebarLabels && typeof payload.sidebarLabels === 'object'
    ? await getSidebarLabelRepository().bulkUpsertLabels(payload.sidebarLabels, actorId || 'import')
    : { saved: 0 };

  const categoryResult = await applyCategoryImportRows(payload.categories);
  const platformResult = await applyPlatformImport(payload.platform, username);

  return {
    settingsFields: Object.keys(settingsPatch).length,
    sidebarLabelsSaved: sidebarResult.saved || 0,
    categoriesUpdated: categoryResult.updated,
    categoriesSkipped: categoryResult.skipped,
    platformUpdated: platformResult.updated === true
  };
}

module.exports = {
  EXPORT_VERSION,
  buildSettingsExportPayload,
  validateImportPayload,
  applySettingsImportPayload
};
