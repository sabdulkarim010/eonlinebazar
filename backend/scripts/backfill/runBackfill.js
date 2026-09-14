/********************************************************************
 * Project: EonlineBazar
 * File: runBackfill.js
 * Location: backend/scripts/backfill/runBackfill.js
 * Description: Stage 3 backfill entry point — dependency-ordered groups.
 *
 * Step 1: Designation, Brand, Warehouse, Supplier, Category
 * Step 2: CMS/Settings + Security/Audit groups
 *
 * TODO Stage 3 Step 3+: Attribute, Admin, Employee, Product, User, Order, …
 *   Extend runAll() below following DATABASE_MIGRATION_AUDIT.md Stage 3 order.
 *
 * Usage: node backend/scripts/backfill/runBackfill.js
 ********************************************************************/

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const prisma = require('../../src/config/prismaClient');
const { backfillModel } = require('./backfillRunner');

const Designation = require('../../src/models/designation');
const Brand = require('../../src/models/brand');
const Warehouse = require('../../src/models/warehouse');
const Supplier = require('../../src/models/supplier');
const Category = require('../../src/models/category');

const designationRepo = require('../../src/repositories/designationRepository');
const brandRepo = require('../../src/repositories/brandRepository');
const warehouseRepo = require('../../src/repositories/warehouseRepository');
const supplierRepo = require('../../src/repositories/supplierRepository');
const categoryRepo = require('../../src/repositories/categoryRepository');

const PageContent = require('../../src/models/PageContent');
const NavbarLink = require('../../src/models/NavbarLink');
const { Banner, BannerSettings } = require('../../src/models/banner');
const FooterSettings = require('../../src/models/FooterSettings');
const Settings = require('../../src/models/Settings');
const SecurityLog = require('../../src/models/securityLog');
const LoginAttempt = require('../../src/models/loginAttempt');
const BlacklistedIp = require('../../src/models/blacklistedIp');
const StockAlert = require('../../src/models/stockAlert');

const pageContentRepo = require('../../src/repositories/pageContentRepository');
const navbarLinkRepo = require('../../src/repositories/navbarLinkRepository');
const bannerRepo = require('../../src/repositories/bannerRepository');
const footerSettingsRepo = require('../../src/repositories/footerSettingsRepository');
const settingsRepo = require('../../src/repositories/settingsRepository');
const securityLogRepo = require('../../src/repositories/securityLogRepository');
const loginAttemptRepo = require('../../src/repositories/loginAttemptRepository');
const blacklistedIpRepo = require('../../src/repositories/blacklistedIpRepository');
const stockAlertRepo = require('../../src/repositories/stockAlertRepository');

// ── Prisma legacyId lookups (repositories without findByLegacyId export) ───────

async function findSecurityLogByLegacyId(legacyId) {
  if (!legacyId) return null;
  return prisma.securityLog.findUnique({ where: { legacyId: String(legacyId) } });
}

async function findLoginAttemptByLegacyId(legacyId) {
  if (!legacyId) return null;
  return prisma.loginAttempt.findUnique({ where: { legacyId: String(legacyId) } });
}

async function findStockAlertByLegacyId(legacyId) {
  if (!legacyId) return null;
  return prisma.stockAlert.findUnique({ where: { legacyId: String(legacyId) } });
}

// ── Mongo → Postgres mappers (shapes match each repository create() signature) ──

function mapDesignation(doc) {
  return {
    name: doc.name,
    department: doc.department,
    description: doc.description,
    isActive: doc.isActive,
    createdBy: doc.createdBy,
    legacyId: String(doc._id)
  };
}

function mapBrand(doc) {
  return {
    name: doc.name,
    description: doc.description,
    status: doc.status,
    legacyId: String(doc._id)
  };
}

function mapWarehouse(doc) {
  return {
    name: doc.name,
    location: doc.location,
    address: doc.address,
    managerName: doc.managerName,
    phone: doc.phone,
    status: doc.status,
    isDefault: doc.isDefault,
    // Admin not backfilled yet — FK resolved in a later Stage 3 step
    createdById: null,
    legacyId: String(doc._id)
  };
}

function mapSupplier(doc) {
  return {
    name: doc.name,
    contactPerson: doc.contactPerson,
    phone: doc.phone,
    email: doc.email,
    address: doc.address,
    notes: doc.notes,
    status: doc.status,
    createdById: null,
    legacyId: String(doc._id)
  };
}

/** Pass 1 — parentCategoryId intentionally omitted (null). */
function mapCategoryPass1(doc) {
  return {
    name: doc.name,
    description: doc.description,
    parentCategoryId: null,
    color: doc.color,
    isActive: doc.isActive,
    isFeatured: doc.isFeatured,
    showInNavbar: doc.showInNavbar,
    showInHomepage: doc.showInHomepage,
    position: doc.position,
    customCashback: doc.customCashback,
    metaTitle: doc.metaTitle,
    metaDescription: doc.metaDescription,
    imageUrl: doc.imageUrl,
    iconUrl: doc.iconUrl,
    bannerImageUrl: doc.bannerImageUrl,
    legacyId: String(doc._id)
  };
}

// ── Category Pass 2 — wire parentCategoryId via parent legacyId lookup ─────────

async function backfillCategoryParents(batchSize = 100) {
  const summary = {
    modelName: 'Category (parent pass)',
    totalFound: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };

  let lastId = null;
  let processed = 0;

  while (true) {
    const query = lastId
      ? { _id: { $gt: lastId }, parentCategory: { $ne: null } }
      : { parentCategory: { $ne: null } };

    const batch = await Category
      .find(query)
      .sort({ _id: 1 })
      .limit(batchSize)
      .lean();

    if (!batch.length) break;

    summary.totalFound += batch.length;

    for (const doc of batch) {
      const legacyId = String(doc._id);
      const parentLegacyId = doc.parentCategory ? String(doc.parentCategory) : null;

      try {
        const row = await categoryRepo.findByLegacyId(legacyId);
        if (!row) {
          summary.skipped += 1;
          continue;
        }

        if (row.parentCategoryId) {
          summary.skipped += 1;
          continue;
        }

        const parentRow = parentLegacyId
          ? await categoryRepo.findByLegacyId(parentLegacyId)
          : null;

        if (!parentRow) {
          summary.failed += 1;
          summary.failedIds.push(legacyId);
          console.error(
            `[BACKFILL-FAIL] Category parent pass legacyId=${legacyId}: parent ${parentLegacyId} not in Postgres`
          );
          continue;
        }

        await categoryRepo.update(row.id, { parentCategoryId: parentRow.id });
        summary.updated += 1;
      } catch (err) {
        summary.failed += 1;
        summary.failedIds.push(legacyId);
        console.error(`[BACKFILL-FAIL] Category parent pass legacyId=${legacyId}:`, err.message || err);
      }
    }

    processed += batch.length;
    lastId = batch[batch.length - 1]._id;
    console.log(
      `${summary.modelName}: ${processed}/${summary.totalFound} processed (updated=${summary.updated}, skipped=${summary.skipped}, failed=${summary.failed})`
    );
  }

  return summary;
}

function mapPageContent(doc) {
  return {
    slug: doc.slug,
    title: doc.title,
    subtitle: doc.subtitle,
    bodyMarkdown: doc.bodyMarkdown,
    bodyHtml: doc.bodyHtml,
    contentFormat: doc.contentFormat,
    isPublished: doc.isPublished,
    sortOrder: doc.sortOrder,
    updatedByAdmin: doc.updatedByAdmin,
    contactMeta: doc.contactMeta,
    legacyId: String(doc._id)
  };
}

function mapNavbarLink(doc) {
  return {
    title: doc.title,
    url: doc.url,
    slug: doc.slug,
    target: doc.target,
    isPublished: doc.isPublished,
    hasCustomPage: doc.hasCustomPage,
    pageHtml: doc.pageHtml,
    sortOrder: doc.sortOrder,
    legacyId: String(doc._id)
  };
}

function mapBanner(doc) {
  return {
    title: doc.title,
    subtitle: doc.subtitle,
    imageUrl: doc.imageUrl,
    mobileImageUrl: doc.mobileImageUrl,
    backgroundColor: doc.backgroundColor,
    linkUrl: doc.linkUrl,
    linkText: doc.linkText,
    textColor: doc.textColor,
    overlayOpacity: doc.overlayOpacity,
    position: doc.position,
    isActive: doc.isActive,
    legacyId: String(doc._id)
  };
}

function mapSecurityLog(doc) {
  return {
    action: doc.action,
    actor: doc.actor,
    actorType: doc.actorType,
    ipAddress: doc.ipAddress,
    details: doc.details,
    resourceType: doc.resourceType,
    resourceId: doc.resourceId,
    legacyId: String(doc._id),
    createdAt: doc.createdAt
  };
}

function mapLoginAttempt(doc) {
  return {
    username: doc.username,
    ipAddress: doc.ipAddress,
    location: doc.location,
    os: doc.os,
    browser: doc.browser,
    deviceType: doc.deviceType,
    userAgent: doc.userAgent,
    status: doc.status,
    details: doc.details,
    legacyId: String(doc._id),
    createdAt: doc.createdAt
  };
}

function mapStockAlert(doc) {
  return {
    checkedAt: doc.checkedAt,
    lowStockCount: doc.lowStockCount,
    outOfStockCount: doc.outOfStockCount,
    lowStockProducts: doc.lowStockProducts,
    outOfStockProducts: doc.outOfStockProducts,
    alertsSent: doc.alertsSent,
    legacyId: String(doc._id),
    createdAt: doc.createdAt
  };
}

// ── Singleton backfills (key='global', skip if Postgres row already exists) ───

async function backfillBannerSettingsSingleton() {
  const summary = {
    modelName: 'BannerSettings',
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };

  console.log('BannerSettings: starting singleton backfill…');

  const existing = await bannerRepo.findBannerSettings();
  if (existing) {
    summary.totalFound = 1;
    summary.skipped = 1;
    console.log('BannerSettings: skipped (key=global already in Postgres)');
    return summary;
  }

  const mongoCount = await BannerSettings.countDocuments();
  summary.totalFound = mongoCount > 0 ? 1 : 0;

  if (mongoCount === 0) {
    console.log('BannerSettings: 0 documents in MongoDB');
    return summary;
  }

  try {
    const doc = await BannerSettings.findOne().lean();
    await bannerRepo.upsertBannerSettings(doc);
    summary.created = 1;
    console.log('BannerSettings: created key=global from Mongo document');
  } catch (err) {
    summary.failed = 1;
    summary.failedIds.push('global');
    console.error('[BACKFILL-FAIL] BannerSettings global:', err.message || err);
  }

  return summary;
}

async function backfillFooterSettingsSingleton() {
  const summary = {
    modelName: 'FooterSettings',
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };

  console.log('FooterSettings: starting singleton backfill…');

  const existing = await footerSettingsRepo.findByKey(footerSettingsRepo.FOOTER_SETTINGS_KEY);
  if (existing) {
    summary.totalFound = 1;
    summary.skipped = 1;
    console.log('FooterSettings: skipped (key=global already in Postgres)');
    return summary;
  }

  const doc = await FooterSettings.findOne({ key: footerSettingsRepo.FOOTER_SETTINGS_KEY }).lean()
    || await FooterSettings.findOne().lean();

  summary.totalFound = doc ? 1 : 0;

  if (!doc) {
    console.log('FooterSettings: 0 documents in MongoDB');
    return summary;
  }

  try {
    const paymentBadgesMode = doc.paymentBadges === undefined ? 'skip' : 'replace';
    await footerSettingsRepo.upsertFromMongo(doc, {
      replaceColumns: true,
      replaceSocialLinks: true,
      replacePaymentGateways: true,
      paymentBadgesMode
    });
    summary.created = 1;
    console.log(`FooterSettings: created key=global (paymentBadgesMode=${paymentBadgesMode})`);
  } catch (err) {
    summary.failed = 1;
    summary.failedIds.push('global');
    console.error('[BACKFILL-FAIL] FooterSettings global:', err.message || err);
  }

  return summary;
}

async function backfillSettingsSingleton() {
  const summary = {
    modelName: 'Settings',
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };

  console.log('Settings: starting singleton backfill…');

  const existing = await settingsRepo.findByKey(settingsRepo.SETTINGS_KEY);
  if (existing) {
    summary.totalFound = 1;
    summary.skipped = 1;
    console.log('Settings: skipped (key=global already in Postgres)');
    return summary;
  }

  const doc = await Settings.findOne({ key: settingsRepo.SETTINGS_KEY }).lean()
    || await Settings.findOne().lean();

  summary.totalFound = doc ? 1 : 0;

  if (!doc) {
    console.log('Settings: 0 documents in MongoDB');
    return summary;
  }

  try {
    await settingsRepo.upsertFromMongo(doc);
    summary.created = 1;
    console.log('Settings: created key=global from Mongo document');
  } catch (err) {
    summary.failed = 1;
    summary.failedIds.push('global');
    console.error('[BACKFILL-FAIL] Settings global:', err.message || err);
  }

  return summary;
}

async function runStep1Group() {
  const results = [];

  console.log('\n=== Stage 3 Step 1 — Backfill group: Designation, Brand, Warehouse, Supplier, Category ===\n');

  results.push(await backfillModel({
    modelName: 'Designation',
    mongoModel: Designation,
    findByLegacyId: designationRepo.findByLegacyId,
    createInPostgres: designationRepo.create,
    mapMongoToPostgres: mapDesignation
  }));

  results.push(await backfillModel({
    modelName: 'Brand',
    mongoModel: Brand,
    findByLegacyId: brandRepo.findByLegacyId,
    createInPostgres: brandRepo.create,
    mapMongoToPostgres: mapBrand
  }));

  results.push(await backfillModel({
    modelName: 'Warehouse',
    mongoModel: Warehouse,
    findByLegacyId: warehouseRepo.findByLegacyId,
    createInPostgres: warehouseRepo.create,
    mapMongoToPostgres: mapWarehouse
  }));

  results.push(await backfillModel({
    modelName: 'Supplier',
    mongoModel: Supplier,
    findByLegacyId: supplierRepo.findByLegacyId,
    createInPostgres: supplierRepo.create,
    mapMongoToPostgres: mapSupplier
  }));

  console.log('\n--- Category Pass 1 (create rows, parentCategoryId=null) ---\n');

  results.push(await backfillModel({
    modelName: 'Category',
    mongoModel: Category,
    findByLegacyId: categoryRepo.findByLegacyId,
    createInPostgres: categoryRepo.create,
    mapMongoToPostgres: mapCategoryPass1
  }));

  console.log('\n--- Category Pass 2 (wire parentCategoryId from parent legacyId) ---\n');

  const parentPass = await backfillCategoryParents();
  results.push(parentPass);

  return results;
}

async function runStep2Group() {
  const results = [];

  console.log('\n=== Stage 3 Step 2 — Backfill group: CMS/Settings + Security/Audit ===\n');

  results.push(await backfillModel({
    modelName: 'PageContent',
    mongoModel: PageContent,
    findByLegacyId: pageContentRepo.findByLegacyId,
    createInPostgres: pageContentRepo.create,
    mapMongoToPostgres: mapPageContent
  }));

  results.push(await backfillModel({
    modelName: 'NavbarLink',
    mongoModel: NavbarLink,
    findByLegacyId: navbarLinkRepo.findByLegacyId,
    createInPostgres: navbarLinkRepo.create,
    mapMongoToPostgres: mapNavbarLink
  }));

  results.push(await backfillModel({
    modelName: 'Banner',
    mongoModel: Banner,
    findByLegacyId: bannerRepo.findBannerByLegacyId,
    createInPostgres: bannerRepo.createBanner,
    mapMongoToPostgres: mapBanner
  }));

  results.push(await backfillBannerSettingsSingleton());
  results.push(await backfillFooterSettingsSingleton());
  results.push(await backfillSettingsSingleton());

  const securityLogCount = await SecurityLog.countDocuments();
  console.log(`SecurityLog: ${securityLogCount} documents in MongoDB`);
  if (securityLogCount > 100000) {
    console.warn(
      `[BACKFILL-WARN] SecurityLog collection is very large (${securityLogCount}). ` +
      'Backfill may take a long time; monitor batch progress below.'
    );
  }

  results.push(await backfillModel({
    modelName: 'SecurityLog',
    mongoModel: SecurityLog,
    findByLegacyId: findSecurityLogByLegacyId,
    createInPostgres: securityLogRepo.create,
    mapMongoToPostgres: mapSecurityLog,
    batchSize: 500
  }));

  results.push(await backfillModel({
    modelName: 'LoginAttempt',
    mongoModel: LoginAttempt,
    findByLegacyId: findLoginAttemptByLegacyId,
    createInPostgres: loginAttemptRepo.create,
    mapMongoToPostgres: mapLoginAttempt,
    batchSize: 500
  }));

  results.push(await backfillModel({
    modelName: 'BlacklistedIP',
    mongoModel: BlacklistedIp,
    findByLegacyId: blacklistedIpRepo.findByLegacyId,
    createInPostgres: (doc) => blacklistedIpRepo.upsertFromMongo(doc),
    mapMongoToPostgres: (doc) => doc
  }));

  results.push(await backfillModel({
    modelName: 'StockAlert',
    mongoModel: StockAlert,
    findByLegacyId: findStockAlertByLegacyId,
    createInPostgres: stockAlertRepo.create,
    mapMongoToPostgres: mapStockAlert
  }));

  return results;
}

// TODO Stage 3 Step 3+: Attribute, Admin, Employee, …
// TODO Stage 3 Step N: Order, Product (last — most connected)

async function runAll() {
  const allResults = [];

  allResults.push(...(await runStep1Group()));
  allResults.push(...(await runStep2Group()));

  return allResults;
}

async function main() {
  await connectDB();

  try {
    const results = await runAll();

    console.log('\n=== Backfill summary ===\n');
    for (const r of results) {
      if (r.updated !== undefined) {
        console.log(JSON.stringify({
          modelName: r.modelName,
          totalFound: r.totalFound,
          updated: r.updated,
          skipped: r.skipped,
          failed: r.failed,
          failedIds: r.failedIds
        }, null, 2));
      } else {
        console.log(JSON.stringify(r, null, 2));
      }
    }
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[BACKFILL] Fatal error:', err);
  process.exit(1);
});
