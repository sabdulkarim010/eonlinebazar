/********************************************************************
 * Project: EonlineBazar
 * File: runBackfill.js
 * Location: backend/scripts/backfill/runBackfill.js
 * Description: Stage 3 backfill entry point — dependency-ordered groups.
 *
 * Step 1: Designation, Brand, Warehouse, Supplier, Category
 * Step 2: CMS/Settings + Security/Audit groups
 * Step 3: User (+ owned tables), HRM, Marketing/Support groups
 * Step 4: Admin, Product (+ sub-resources), gap repair
 *
 * TODO Stage 3 Step 5+: Order, …
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

const User = require('../../src/models/user');
const Cart = require('../../src/models/cart');
const Employee = require('../../src/models/employee');
const Attendance = require('../../src/models/attendance');
const Payroll = require('../../src/models/payroll');
const Leave = require('../../src/models/leave');
const Newsletter = require('../../src/models/newsletter');
const EmailCampaign = require('../../src/models/emailCampaign');
const ContactMessage = require('../../src/models/ContactMessage');
const Review = require('../../src/models/review');
const Admin = require('../../src/models/admin');
const Product = require('../../src/models/product');

const userRepo = require('../../src/repositories/userRepository');
const adminRepo = require('../../src/repositories/adminRepository');
const productRepo = require('../../src/repositories/productRepository');
const employeeRepo = require('../../src/repositories/employeeRepository');
const attendanceRepo = require('../../src/repositories/attendanceRepository');
const payrollRepo = require('../../src/repositories/payrollRepository');
const leaveRepo = require('../../src/repositories/leaveRepository');
const newsletterRepo = require('../../src/repositories/newsletterRepository');
const emailCampaignRepo = require('../../src/repositories/emailCampaignRepository');
const contactMessageRepo = require('../../src/repositories/contactMessageRepository');
const reviewRepo = require('../../src/repositories/reviewRepository');
const cartRepo = require('../../src/repositories/cartRepository');

const { staffFields, UUID_PATTERN } = require('../../src/repositories/hrmStaffResolver');

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

// ── Stage 3 Step 3 — in-memory FK map helpers ───────────────────────────────

async function buildLegacyIdMap(modelKey) {
  const rows = await prisma[modelKey].findMany({
    where: { legacyId: { not: null } },
    select: { id: true, legacyId: true }
  });
  return new Map(rows.map((r) => [String(r.legacyId), r.id]));
}

/** legacyId → postgres id, plus productId field → postgres id (Review/cart/wishlist). */
async function buildProductLookupMaps() {
  const rows = await prisma.product.findMany({
    where: { OR: [{ legacyId: { not: null } }, { productId: { not: '' } }] },
    select: { id: true, legacyId: true, productId: true }
  });
  const byLegacyId = new Map();
  const byProductId = new Map();
  for (const row of rows) {
    if (row.legacyId) byLegacyId.set(String(row.legacyId), row.id);
    if (row.productId) byProductId.set(String(row.productId), row.id);
  }
  return { byLegacyId, byProductId };
}

function resolveProductIdFromMaps(ref, productMaps) {
  const key = String(ref || '').trim();
  if (!key) return null;
  return productMaps.byLegacyId.get(key)
    || productMaps.byProductId.get(key)
    || null;
}

/** Admin rows keyed by legacyId and username (attendance/payroll/leave polymorphic staff). */
async function buildAdminStaffMaps() {
  const rows = await prisma.admin.findMany({
    select: {
      id: true,
      legacyId: true,
      username: true,
      name: true,
      displayName: true,
      baseSalary: true
    }
  });
  const byLegacyId = new Map();
  const byUsername = new Map();
  const byId = new Map();
  for (const row of rows) {
    byId.set(row.id, row);
    if (row.legacyId) byLegacyId.set(String(row.legacyId), row);
    if (row.username) byUsername.set(String(row.username).toLowerCase(), row);
  }
  return { byLegacyId, byUsername, byId };
}

/** Employee rows keyed by legacyId, employeeId code, and postgres id. */
async function buildEmployeeStaffMaps() {
  const rows = await prisma.employee.findMany({
    select: {
      id: true,
      legacyId: true,
      employeeId: true,
      fullName: true,
      baseSalary: true
    }
  });
  const byLegacyId = new Map();
  const byEmployeeId = new Map();
  const byId = new Map();
  for (const row of rows) {
    byId.set(row.id, row);
    if (row.legacyId) byLegacyId.set(String(row.legacyId), row);
    if (row.employeeId) byEmployeeId.set(String(row.employeeId), row);
  }
  return { byLegacyId, byEmployeeId, byId };
}

function resolveStaffSubjectFromMaps(plain, adminMaps, employeeMaps) {
  const staffType = String(plain.staffType || 'admin').toLowerCase();

  if (staffType === 'employee') {
    const ref = String(plain.staffId || plain.employeeId || plain.staffUsername || '').trim();
    if (!ref) return null;

    let employee = employeeMaps.byLegacyId.get(ref)
      || employeeMaps.byEmployeeId.get(ref)
      || (UUID_PATTERN.test(ref) ? employeeMaps.byId.get(ref) : null);
    if (!employee) return null;

    return {
      staffType: 'employee',
      staffId: employee.id,
      staffUsername: employee.employeeId,
      staffName: employee.fullName,
      adminId: null,
      employeeId: employee.id
    };
  }

  const staffIdRef = String(plain.staffId || '').trim();
  const usernameRef = String(plain.staffUsername || '').trim();

  let admin = staffIdRef
    ? (adminMaps.byLegacyId.get(staffIdRef)
      || (UUID_PATTERN.test(staffIdRef) ? adminMaps.byId.get(staffIdRef) : null))
    : null;
  if (!admin && usernameRef) {
    admin = adminMaps.byUsername.get(usernameRef.toLowerCase());
  }
  if (!admin) return null;

  return {
    staffType: 'admin',
    staffId: admin.id,
    staffUsername: admin.username,
    staffName: admin.name || admin.displayName || admin.username,
    adminId: admin.id,
    employeeId: null
  };
}

function mapUser(doc) {
  return {
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email,
    referralCode: doc.referralCode
      ? String(doc.referralCode).trim().toUpperCase()
      : undefined,
    gender: doc.gender,
    dateOfBirth: doc.dateOfBirth ?? null,
    mobile: doc.mobile,
    password: doc.password ?? null,
    googleId: doc.googleId ?? null,
    avatarUrl: doc.avatarUrl ?? null,
    lastLogin: doc.lastLogin ?? null,
    isVerified: doc.isVerified === true,
    accountStatus: doc.accountStatus,
    avatar: doc.avatar,
    avatarPublicId: doc.avatarPublicId,
    phone: doc.phone,
    address: doc.address,
    district: doc.district,
    upazila: doc.upazila,
    thana: doc.thana,
    fullAddress: doc.fullAddress,
    walletBalance: doc.walletBalance != null ? doc.walletBalance : 0,
    loyaltyPoints: doc.loyaltyPoints != null ? Number(doc.loyaltyPoints) : 0,
    referredById: null,
    referralEarnings: doc.referralEarnings != null ? doc.referralEarnings : 0,
    loyaltyTier: doc.loyaltyTier,
    tierUpgradedAt: doc.tierUpgradedAt ?? null,
    lifetimeSpend: doc.lifetimeSpend != null ? doc.lifetimeSpend : 0,
    tierCashbackRate: doc.tierCashbackRate != null ? doc.tierCashbackRate : 0,
    isSandbox: doc.isSandbox === true,
    isDeleted: doc.isDeleted === true,
    deletedAt: doc.deletedAt ?? null,
    deletionReason: doc.deletionReason,
    legacyId: String(doc._id)
  };
}

function mapEmployee(doc, adminMaps) {
  const linkedRef = doc.linkedAdminId ? String(doc.linkedAdminId).trim() : null;
  const linkedAdmin = linkedRef
    ? adminMaps.byLegacyId.get(linkedRef)
      || (UUID_PATTERN.test(linkedRef) ? adminMaps.byId.get(linkedRef) : null)
    : null;

  return {
    employeeId: doc.employeeId,
    fullName: doc.fullName,
    phone: doc.phone,
    dateOfBirth: doc.dateOfBirth ?? null,
    religion: doc.religion,
    nationalId: doc.nationalId,
    photo: doc.photo,
    photoPublicId: doc.photoPublicId,
    alternatePhone: doc.alternatePhone,
    email: doc.email,
    presentAddress: doc.presentAddress,
    permanentAddress: doc.permanentAddress,
    address: doc.address,
    emergencyContact: doc.emergencyContact,
    designation: doc.designation,
    role: doc.role,
    department: doc.department,
    employeeType: doc.employeeType,
    shift: doc.shift,
    joiningDate: doc.joiningDate ?? null,
    baseSalary: doc.baseSalary != null ? doc.baseSalary : 0,
    salaryType: doc.salaryType,
    bankName: doc.bankName,
    bankAccountNumber: doc.bankAccountNumber,
    bkashNumber: doc.bkashNumber,
    linkedAdminId: linkedAdmin ? linkedAdmin.id : null,
    status: doc.status,
    notes: doc.notes,
    createdBy: doc.createdBy,
    legacyId: String(doc._id)
  };
}

function mapNewsletter(doc) {
  const plain = doc;
  return {
    email: plain.email,
    name: plain.name,
    isActive: plain.isActive,
    source: plain.source,
    subscribedAt: plain.subscribedAt,
    unsubscribedAt: plain.unsubscribedAt,
    unsubscribeToken: plain.unsubscribeToken,
    tags: plain.tags,
    emailsSent: plain.emailsSent,
    lastEmailAt: plain.lastEmailAt,
    legacyId: String(doc._id)
  };
}

function mapContactMessageDoc(doc) {
  const plain = doc;
  return {
    name: plain.name,
    email: plain.email,
    phone: plain.phone,
    subject: plain.subject,
    message: plain.message,
    ticketNumber: plain.ticketNumber,
    status: plain.status,
    priority: plain.priority,
    assignedTo: plain.assignedTo,
    firstResponseAt: plain.firstResponseAt,
    resolvedAt: plain.resolvedAt,
    replyMessage: plain.replyMessage,
    repliedAt: plain.repliedAt,
    isRead: plain.isRead,
    legacyId: String(doc._id)
  };
}

function mapReviewDoc(doc, userMap, productMaps) {
  const userRef = doc.userId?._id || doc.userId || null;
  const productRef = doc.productId || null;
  const resolvedUserId = userRef ? (userMap.get(String(userRef)) ?? null) : null;
  const resolvedProductId = productRef
    ? resolveProductIdFromMaps(productRef, productMaps)
    : null;

  return {
    userId: resolvedUserId ?? undefined,
    productId: resolvedProductId ?? undefined,
    legacyProductId: String(productRef || ''),
    legacyOrderId: String(doc.orderId || ''),
    rating: doc.rating,
    comment: doc.comment,
    photo: doc.photo,
    isSandbox: doc.isSandbox,
    isHidden: doc.isHidden,
    adminNote: doc.adminNote,
    moderatedAt: doc.moderatedAt,
    legacyId: String(doc._id)
  };
}

function mapCartItem(cartId, item, productPgId) {
  const plain = item;
  return {
    cartId,
    productId: productPgId,
    name: String(plain.name || 'Product').trim(),
    price: plain.price != null ? plain.price : 0,
    image: String(plain.image || ''),
    emojiIcon: plain.emojiIcon != null ? String(plain.emojiIcon) : null,
    variantImage: plain.variantImage != null ? String(plain.variantImage) : null,
    icon: String(plain.icon || plain.emojiIcon || '📦').trim() || '📦',
    quantity: Number(plain.quantity) || 1,
    selected: plain.selected !== false,
    variantId: String(plain.variantId || ''),
    variantLabel: String(plain.variantLabel || ''),
    variantAttribute: String(plain.variantAttribute || ''),
    variantValue: String(plain.variantValue || ''),
    variantSku: String(plain.variantSku || ''),
    selectedColor: String(plain.selectedColor || plain.color || ''),
    selectedSize: String(plain.selectedSize || plain.size || '')
  };
}

async function backfillUserReferredByPass(userMap) {
  const summary = {
    modelName: 'User (referredBy pass)',
    totalFound: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };

  console.log('User (referredBy pass): wiring referredById from in-memory user map…');

  const cursor = User.find({ referredBy: { $ne: null } }).cursor();
  for await (const doc of cursor) {
    summary.totalFound += 1;
    const legacyId = String(doc._id);
    const referrerLegacy = doc.referredBy ? String(doc.referredBy) : null;
    const pgUserId = userMap.get(legacyId);
    const pgReferrerId = referrerLegacy ? userMap.get(referrerLegacy) : null;

    if (!pgUserId || !pgReferrerId) {
      summary.skipped += 1;
      continue;
    }

    try {
      const existing = await userRepo.findByLegacyId(legacyId);
      if (!existing || existing.referredById === pgReferrerId) {
        summary.skipped += 1;
        continue;
      }
      await userRepo.update(existing.id, { referredById: pgReferrerId });
      summary.updated += 1;
    } catch (err) {
      summary.failed += 1;
      summary.failedIds.push(legacyId);
      console.error(`[BACKFILL-FAIL] User referredBy legacyId=${legacyId}:`, err.message || err);
    }
  }

  return summary;
}

async function backfillUserOwnedResources(userMap, productMaps) {
  const addressSummary = {
    modelName: 'Address',
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };
  const wishlistSummary = {
    modelName: 'WishlistItem',
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };
  const walletSummary = {
    modelName: 'WalletTransaction',
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };
  const cartSummary = {
    modelName: 'Cart',
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };
  const cartItemSummary = {
    modelName: 'CartItem',
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };

  console.log('User owned resources: addresses, wishlist, wallet txns, carts…');

  const userCount = await User.countDocuments();
  let usersProcessed = 0;
  const slowStart = Date.now();
  const SLOW_MS = 5 * 60 * 1000;

  let lastId = null;
  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await User.find(query).sort({ _id: 1 }).limit(100).lean();
    if (!batch.length) break;

    for (const doc of batch) {
      const userLegacyId = String(doc._id);
      const pgUserId = userMap.get(userLegacyId);
      if (!pgUserId) continue;

      const addresses = Array.isArray(doc.addresses) ? doc.addresses : [];
      for (const addr of addresses) {
        addressSummary.totalFound += 1;
        const addrLegacyId = addr._id != null ? String(addr._id) : null;
        try {
          if (addrLegacyId) {
            const existing = await userRepo.findAddressByLegacyId(addrLegacyId);
            if (existing) {
              addressSummary.skipped += 1;
              continue;
            }
          }
          await userRepo.addAddress(pgUserId, {
            label: addr.label,
            district: addr.district,
            upazilaOrThana: addr.upazilaOrThana ?? addr.upazila ?? addr.thana,
            fullAddress: addr.fullAddress,
            phone: addr.phone,
            isDefault: addr.isDefault,
            legacyId: addrLegacyId
          });
          addressSummary.created += 1;
        } catch (err) {
          addressSummary.failed += 1;
          if (addrLegacyId) addressSummary.failedIds.push(addrLegacyId);
          console.error(`[BACKFILL-FAIL] Address legacyId=${addrLegacyId}:`, err.message || err);
        }
      }

      const wishlist = Array.isArray(doc.wishlist) ? doc.wishlist : [];
      for (const item of wishlist) {
        wishlistSummary.totalFound += 1;
        const itemLegacyId = item._id != null ? String(item._id) : null;
        const legacyProductId = String(item.productId || '').trim();
        try {
          if (itemLegacyId) {
            const existing = await prisma.wishlistItem.findUnique({
              where: { legacyId: itemLegacyId }
            });
            if (existing) {
              wishlistSummary.skipped += 1;
              continue;
            }
          }
          const productFk = resolveProductIdFromMaps(legacyProductId, productMaps);
          await prisma.wishlistItem.create({
            data: {
              userId: pgUserId,
              legacyProductId,
              productId: productFk,
              name: String(item.name ?? '').trim(),
              price: item.price != null ? item.price : 0,
              image: String(item.image ?? '').trim(),
              icon: String(item.icon ?? '📦').trim() || '📦',
              addedAt: item.addedAt ? new Date(item.addedAt) : new Date(),
              legacyId: itemLegacyId
            }
          });
          wishlistSummary.created += 1;
        } catch (err) {
          wishlistSummary.failed += 1;
          if (itemLegacyId) wishlistSummary.failedIds.push(itemLegacyId);
          console.error(`[BACKFILL-FAIL] WishlistItem legacyId=${itemLegacyId}:`, err.message || err);
        }
      }

      const walletHistory = Array.isArray(doc.walletHistory) ? doc.walletHistory : [];
      for (const txn of walletHistory) {
        walletSummary.totalFound += 1;
        const txnLegacyId = txn._id != null ? String(txn._id) : null;
        try {
          if (txnLegacyId) {
            const existing = await prisma.walletTransaction.findUnique({
              where: { legacyId: txnLegacyId }
            });
            if (existing) {
              walletSummary.skipped += 1;
              continue;
            }
          }
          await prisma.walletTransaction.create({
            data: {
              userId: pgUserId,
              type: String(txn.type || 'credit'),
              amount: txn.amount != null ? txn.amount : 0,
              note: String(txn.note || '').trim(),
              referenceOrder: String(txn.referenceOrder || '').trim(),
              date: txn.date ? new Date(txn.date) : new Date(),
              legacyId: txnLegacyId
            }
          });
          walletSummary.created += 1;
        } catch (err) {
          walletSummary.failed += 1;
          if (txnLegacyId) walletSummary.failedIds.push(txnLegacyId);
          console.error(`[BACKFILL-FAIL] WalletTransaction legacyId=${txnLegacyId}:`, err.message || err);
        }
      }
    }

    usersProcessed += batch.length;
    lastId = batch[batch.length - 1]._id;

    if (Date.now() - slowStart > SLOW_MS && usersProcessed < userCount) {
      console.warn(
        `[BACKFILL-WARN] User sub-resources still running after 5 min ` +
        `(${usersProcessed}/${userCount} users). Continuing — monitor progress.`
      );
    }
  }

  let cartLastId = null;
  while (true) {
    const query = cartLastId ? { _id: { $gt: cartLastId } } : {};
    const batch = await Cart.find(query).sort({ _id: 1 }).limit(100).lean();
    if (!batch.length) break;

    for (const doc of batch) {
      cartSummary.totalFound += 1;
      const legacyId = String(doc._id);
      const pgUserId = userMap.get(String(doc.userId));
      if (!pgUserId) {
        cartSummary.failed += 1;
        cartSummary.failedIds.push(legacyId);
        console.error(`[BACKFILL-FAIL] Cart legacyId=${legacyId}: user not in Postgres`);
        continue;
      }

      try {
        const existing = await cartRepo.findByLegacyId(legacyId);
        if (existing) {
          cartSummary.skipped += 1;
          continue;
        }

        const items = Array.isArray(doc.items) ? doc.items : [];
        const resolvedItems = [];
        for (const item of items) {
          cartItemSummary.totalFound += 1;
          const productRef = item.productId?._id || item.productId;
          const productPgId = resolveProductIdFromMaps(productRef, productMaps);
          if (!productPgId) {
            cartItemSummary.skipped += 1;
            console.warn(
              `[BACKFILL-SKIP] CartItem cart=${legacyId} product=${productRef}: product not in Postgres`
            );
            continue;
          }
          resolvedItems.push({ item, productPgId });
        }

        const cart = await prisma.cart.create({
          data: {
            legacyId,
            userId: pgUserId,
            lastActivityAt: doc.lastActivityAt ? new Date(doc.lastActivityAt) : new Date(),
            abandonedNotifiedAt: doc.abandonedNotifiedAt
              ? new Date(doc.abandonedNotifiedAt)
              : null
          }
        });
        cartSummary.created += 1;

        for (const { item, productPgId } of resolvedItems) {
          await prisma.cartItem.create({
            data: mapCartItem(cart.id, item, productPgId)
          });
          cartItemSummary.created += 1;
        }
      } catch (err) {
        cartSummary.failed += 1;
        cartSummary.failedIds.push(legacyId);
        console.error(`[BACKFILL-FAIL] Cart legacyId=${legacyId}:`, err.message || err);
      }
    }

    cartLastId = batch[batch.length - 1]._id;
  }

  return [addressSummary, wishlistSummary, walletSummary, cartSummary, cartItemSummary];
}

async function backfillEmployeeSubResources() {
  const docSummary = {
    modelName: 'EmployeeDocument',
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };
  const refSummary = {
    modelName: 'EmployeeReference',
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };

  console.log('Employee sub-resources: documents and references…');

  let lastId = null;
  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await Employee.find(query).sort({ _id: 1 }).limit(50).lean();
    if (!batch.length) break;

    for (const doc of batch) {
      const empLegacyId = String(doc._id);
      const pgEmployee = await employeeRepo.findByLegacyId(empLegacyId);
      if (!pgEmployee) continue;

      const documents = Array.isArray(doc.documents) ? doc.documents : [];
      for (const sub of documents) {
        docSummary.totalFound += 1;
        const subLegacyId = sub._id != null ? String(sub._id) : null;
        try {
          if (subLegacyId) {
            const existing = await employeeRepo.findDocumentByLegacyId(subLegacyId);
            if (existing) {
              docSummary.skipped += 1;
              continue;
            }
          }
          await employeeRepo.addDocument(pgEmployee.id, {
            title: sub.title,
            fileUrl: sub.fileUrl,
            fileType: sub.fileType,
            publicId: sub.publicId,
            legacyId: subLegacyId
          });
          docSummary.created += 1;
        } catch (err) {
          docSummary.failed += 1;
          if (subLegacyId) docSummary.failedIds.push(subLegacyId);
          console.error(`[BACKFILL-FAIL] EmployeeDocument legacyId=${subLegacyId}:`, err.message || err);
        }
      }

      const references = Array.isArray(doc.references) ? doc.references : [];
      if (references.length) {
        const existingCount = await prisma.employeeReference.count({
          where: { employeeId: pgEmployee.id }
        });
        if (existingCount >= references.length) {
          refSummary.skipped += references.length;
          refSummary.totalFound += references.length;
        } else {
          for (const ref of references) {
            refSummary.totalFound += 1;
            try {
              await employeeRepo.addReference(pgEmployee.id, {
                name: ref.name,
                phone: ref.phone,
                relation: ref.relation,
                address: ref.address
              });
              refSummary.created += 1;
            } catch (err) {
              refSummary.failed += 1;
              refSummary.failedIds.push(empLegacyId);
              console.error(`[BACKFILL-FAIL] EmployeeReference employee=${empLegacyId}:`, err.message || err);
            }
          }
        }
      }
    }

    lastId = batch[batch.length - 1]._id;
  }

  return [docSummary, refSummary];
}

async function backfillAttendanceWithMaps(adminMaps, employeeMaps) {
  const summary = {
    modelName: 'Attendance',
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };

  const normalizeDate = attendanceRepo.normalizeDate
    || ((input) => {
      const d = input ? new Date(input) : new Date();
      if (Number.isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d;
    });

  let lastId = null;
  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await Attendance.find(query).sort({ _id: 1 }).limit(200).lean();
    if (!batch.length) break;
    summary.totalFound += batch.length;

    for (const doc of batch) {
      const legacyId = String(doc._id);
      try {
        const existingByLegacy = await attendanceRepo.findByLegacyId(legacyId);
        if (existingByLegacy) {
          summary.skipped += 1;
          continue;
        }

        const subject = resolveStaffSubjectFromMaps(doc, adminMaps, employeeMaps);
        if (!subject) {
          summary.failed += 1;
          summary.failedIds.push(legacyId);
          console.error(`[BACKFILL-FAIL] Attendance legacyId=${legacyId}: staff not found`);
          continue;
        }

        const date = normalizeDate(doc.date);
        if (!date) throw new Error('Invalid date');

        const statusMap = {
          present: 'PRESENT',
          absent: 'ABSENT',
          late: 'LATE',
          'half-day': 'HALF_DAY',
          holiday: 'HOLIDAY'
        };
        const shiftMap = {
          morning: 'MORNING',
          evening: 'EVENING',
          night: 'NIGHT',
          custom: 'CUSTOM'
        };

        const data = {
          ...staffFields(subject),
          date,
          clockIn: doc.clockIn ? new Date(doc.clockIn) : null,
          clockOut: doc.clockOut ? new Date(doc.clockOut) : null,
          hoursWorked: doc.hoursWorked != null ? Number(doc.hoursWorked) : 0,
          status: statusMap[String(doc.status || 'absent').toLowerCase()] || 'ABSENT',
          isLate: doc.isLate === true,
          lateMinutes: Number(doc.lateMinutes) || 0,
          shift: shiftMap[String(doc.shift || 'morning').toLowerCase()] || 'MORNING',
          shiftStart: String(doc.shiftStart || '09:00').trim(),
          shiftEnd: String(doc.shiftEnd || '18:00').trim(),
          notes: String(doc.notes || '').trim(),
          markedBy: String(doc.markedBy || 'self').trim(),
          legacyId
        };

        const gps = doc.gpsLocation || {};
        const lat = Number(gps.lat);
        const lng = Number(gps.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          data.gpsLat = lat;
          data.gpsLng = lng;
        }

        await prisma.attendance.create({ data });
        summary.created += 1;
      } catch (err) {
        summary.failed += 1;
        summary.failedIds.push(legacyId);
        console.error(`[BACKFILL-FAIL] Attendance legacyId=${legacyId}:`, err.message || err);
      }
    }

    lastId = batch[batch.length - 1]._id;
    console.log(
      `Attendance: ${summary.totalFound} processed (created=${summary.created}, skipped=${summary.skipped}, failed=${summary.failed})`
    );
  }

  return summary;
}

async function backfillPayrollWithMaps(adminMaps, employeeMaps) {
  const summary = {
    modelName: 'Payroll',
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };

  const statusMap = { draft: 'DRAFT', approved: 'APPROVED', paid: 'PAID' };

  let lastId = null;
  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await Payroll.find(query).sort({ _id: 1 }).limit(100).lean();
    if (!batch.length) break;
    summary.totalFound += batch.length;

    for (const doc of batch) {
      const legacyId = String(doc._id);
      try {
        const existingByLegacy = await payrollRepo.findByLegacyId(legacyId);
        if (existingByLegacy) {
          summary.skipped += 1;
          continue;
        }

        const subject = resolveStaffSubjectFromMaps(doc, adminMaps, employeeMaps);
        if (!subject) {
          summary.failed += 1;
          summary.failedIds.push(legacyId);
          console.error(`[BACKFILL-FAIL] Payroll legacyId=${legacyId}: staff not found`);
          continue;
        }

        const month = Number(doc.month);
        const year = Number(doc.year);

        await prisma.payroll.create({
          data: {
            ...staffFields(subject),
            staffName: String(doc.staffName || subject.staffName || '').trim(),
            month,
            year,
            baseSalary: doc.baseSalary ?? 0,
            bonus: doc.bonus ?? 0,
            overtime: doc.overtime ?? 0,
            overtimeRate: doc.overtimeRate ?? 0,
            overtimeAmount: doc.overtimeAmount ?? 0,
            deductions: doc.deductions ?? 0,
            totalSalary: doc.totalSalary ?? 0,
            workingDays: doc.workingDays ?? 0,
            presentDays: doc.presentDays ?? 0,
            absentDays: doc.absentDays ?? 0,
            lateDays: doc.lateDays ?? 0,
            status: statusMap[String(doc.status || 'draft').toLowerCase()] || 'DRAFT',
            paidAt: doc.paidAt ? new Date(doc.paidAt) : null,
            paymentMethod: String(doc.paymentMethod || '').trim(),
            notes: String(doc.notes || '').trim(),
            createdBy: String(doc.createdBy || '').trim(),
            legacyId
          }
        });
        summary.created += 1;
      } catch (err) {
        summary.failed += 1;
        summary.failedIds.push(legacyId);
        console.error(`[BACKFILL-FAIL] Payroll legacyId=${legacyId}:`, err.message || err);
      }
    }

    lastId = batch[batch.length - 1]._id;
    console.log(
      `Payroll: ${summary.totalFound} processed (created=${summary.created}, skipped=${summary.skipped}, failed=${summary.failed})`
    );
  }

  return summary;
}

async function backfillLeaveWithMaps(adminMaps, employeeMaps) {
  const summary = {
    modelName: 'Leave',
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };

  const leaveTypeMap = { casual: 'CASUAL', sick: 'SICK', annual: 'ANNUAL', unpaid: 'UNPAID' };
  const leaveStatusMap = { pending: 'PENDING', approved: 'APPROVED', rejected: 'REJECTED' };

  let lastId = null;
  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await Leave.find(query).sort({ _id: 1 }).limit(100).lean();
    if (!batch.length) break;
    summary.totalFound += batch.length;

    for (const doc of batch) {
      const legacyId = String(doc._id);
      try {
        const existingByLegacy = await leaveRepo.findByLegacyId(legacyId);
        if (existingByLegacy) {
          summary.skipped += 1;
          continue;
        }

        const subject = resolveStaffSubjectFromMaps(doc, adminMaps, employeeMaps);
        if (!subject) {
          summary.failed += 1;
          summary.failedIds.push(legacyId);
          console.error(`[BACKFILL-FAIL] Leave legacyId=${legacyId}: staff not found`);
          continue;
        }

        await prisma.leave.create({
          data: {
            ...staffFields(subject),
            staffName: String(doc.staffName || subject.staffName || '').trim(),
            leaveType: leaveTypeMap[String(doc.leaveType || 'casual').toLowerCase()] || 'CASUAL',
            startDate: new Date(doc.startDate),
            endDate: new Date(doc.endDate),
            totalDays: doc.totalDays != null ? Number(doc.totalDays) : 1,
            reason: String(doc.reason || '').trim(),
            attachmentUrl: String(doc.attachmentUrl || '').trim(),
            status: leaveStatusMap[String(doc.status || 'pending').toLowerCase()] || 'PENDING',
            approvedBy: String(doc.approvedBy || '').trim(),
            approvedAt: doc.approvedAt ? new Date(doc.approvedAt) : null,
            rejectionReason: String(doc.rejectionReason || '').trim(),
            legacyId
          }
        });
        summary.created += 1;
      } catch (err) {
        summary.failed += 1;
        summary.failedIds.push(legacyId);
        console.error(`[BACKFILL-FAIL] Leave legacyId=${legacyId}:`, err.message || err);
      }
    }

    lastId = batch[batch.length - 1]._id;
    console.log(
      `Leave: ${summary.totalFound} processed (created=${summary.created}, skipped=${summary.skipped}, failed=${summary.failed})`
    );
  }

  return summary;
}

async function backfillReviewsWithMaps(userMap, productMaps) {
  const summary = {
    modelName: 'Review',
    totalFound: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };

  let lastId = null;
  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await Review.find(query).sort({ _id: 1 }).limit(200).lean();
    if (!batch.length) break;
    summary.totalFound += batch.length;

    for (const doc of batch) {
      const legacyId = String(doc._id);
      try {
        const mapped = mapReviewDoc(doc, userMap, productMaps);
        const existing = await reviewRepo.findByLegacyId(legacyId);

        if (existing) {
          const fkPatch = {};
          if (!existing.userId && mapped.userId) fkPatch.userId = mapped.userId;
          if (!existing.productId && mapped.productId) fkPatch.productId = mapped.productId;

          if (Object.keys(fkPatch).length) {
            await prisma.review.update({ where: { id: existing.id }, data: fkPatch });
            summary.updated += 1;
          } else {
            summary.skipped += 1;
          }
          continue;
        }

        await reviewRepo.create(mapped);
        summary.created += 1;
      } catch (err) {
        summary.failed += 1;
        summary.failedIds.push(legacyId);
        console.error(`[BACKFILL-FAIL] Review legacyId=${legacyId}:`, err.message || err);
      }
    }

    lastId = batch[batch.length - 1]._id;
    console.log(
      `Review: ${summary.totalFound} processed (created=${summary.created}, updated=${summary.updated}, skipped=${summary.skipped}, failed=${summary.failed})`
    );
  }

  return summary;
}

// ── Stage 3 Step 4 — Admin, Product, gap repair ─────────────────────────────

async function findProductByLegacyId(legacyId) {
  if (!legacyId) return null;
  return prisma.product.findUnique({ where: { legacyId: String(legacyId) } });
}

async function buildCategoryLookupMaps() {
  const rows = await prisma.category.findMany({
    select: { id: true, legacyId: true, name: true }
  });
  const byLegacyId = new Map();
  const byName = new Map();
  for (const row of rows) {
    if (row.legacyId) byLegacyId.set(String(row.legacyId), row.id);
    if (row.name) byName.set(String(row.name).trim().toLowerCase(), row.id);
  }
  return { byLegacyId, byName };
}

function mapAdmin(doc) {
  const input = adminRepo.mapMongoDocToWriteInput(doc, { includeSecrets: true });
  return {
    ...input,
    password: String(doc.password || ''),
    passwordChangedAt: doc.passwordChangedAt ?? null
  };
}

function normalizeVariantAttributes(attrs) {
  if (!attrs) return {};
  if (attrs instanceof Map) return Object.fromEntries(attrs.entries());
  if (typeof attrs === 'object') return { ...attrs };
  return {};
}

function mapProduct(doc, fkMaps) {
  const brandRef = doc.brand?._id || doc.brand || null;
  const supplierRef = doc.supplierId?._id || doc.supplierId || null;
  const warehouseRef = doc.warehouseId?._id || doc.warehouseId || null;
  const createdByRef = doc.createdBy?._id || doc.createdBy || null;
  const categoryName = String(doc.category || 'General').trim();

  return {
    productId: doc.productId,
    name: doc.name,
    slug: doc.slug,
    price: doc.price,
    buyingPrice: doc.buyingPrice != null ? doc.buyingPrice : 0,
    categoryName,
    categoryId: fkMaps.category.byName.get(categoryName.toLowerCase()) ?? null,
    brandId: brandRef ? (fkMaps.brand.get(String(brandRef)) ?? null) : null,
    brandName: doc.brandName,
    hasVariants: doc.hasVariants === true,
    stockQuantity: doc.stockQuantity != null ? Number(doc.stockQuantity) : 0,
    lowStockThreshold: doc.lowStockThreshold != null ? Number(doc.lowStockThreshold) : 10,
    supplierId: supplierRef ? (fkMaps.supplier.get(String(supplierRef)) ?? null) : null,
    warehouseId: warehouseRef ? (fkMaps.warehouse.get(String(warehouseRef)) ?? null) : null,
    reorderPoint: doc.reorderPoint != null ? Number(doc.reorderPoint) : 5,
    stock: doc.stock != null ? Number(doc.stock) : 0,
    description: doc.description,
    detailedDescription: doc.detailedDescription,
    highlights: doc.highlights,
    tags: doc.tags,
    weight: doc.weight != null ? Number(doc.weight) : null,
    status: doc.status,
    createdById: createdByRef ? (fkMaps.admin.get(String(createdByRef)) ?? null) : null,
    icon: doc.icon,
    image: doc.image,
    images: doc.images,
    legacyId: String(doc._id),
    rating: doc.rating != null ? doc.rating : 0,
    numOfReviews: doc.numOfReviews != null ? Number(doc.numOfReviews) : 0
  };
}

async function createProductBackfill(payload) {
  const { legacyId, rating, numOfReviews, ...createPayload } = payload;
  const created = await productRepo.create(createPayload);
  const patch = {};
  if (legacyId) patch.legacyId = legacyId;
  if (rating != null) patch.rating = rating;
  if (numOfReviews != null) patch.numOfReviews = numOfReviews;
  if (Object.keys(patch).length) {
    await prisma.product.update({ where: { id: created.id }, data: patch });
  }
  return { ...created, ...patch };
}

async function backfillProductSubResources(mongoDoc, pgProductId, fkMaps) {
  const variantSummary = { totalFound: 0, created: 0, skipped: 0, failed: 0 };
  const costSummary = { totalFound: 0, created: 0, skipped: 0, failed: 0 };
  const embeddedSummary = { totalFound: 0, created: 0, skipped: 0, failed: 0 };

  const variants = Array.isArray(mongoDoc.variants) ? mongoDoc.variants : [];
  const existingVariantCount = await prisma.productVariant.count({
    where: { productId: pgProductId }
  });

  if (existingVariantCount >= variants.length && variants.length > 0) {
    variantSummary.skipped = variants.length;
    variantSummary.totalFound = variants.length;
  } else {
    for (const variant of variants) {
      variantSummary.totalFound += 1;
      try {
        const sku = String(variant.sku || '').trim();
        if (sku) {
          const dup = await prisma.productVariant.findFirst({
            where: { productId: pgProductId, sku }
          });
          if (dup) {
            variantSummary.skipped += 1;
            continue;
          }
        }
        await productRepo.addVariant(pgProductId, {
          name: variant.name,
          sku: variant.sku,
          price: variant.price,
          buyingPrice: variant.buyingPrice,
          stock: variant.stock,
          image: variant.image,
          attribute: variant.attribute,
          value: variant.value,
          attributes: normalizeVariantAttributes(variant.attributes)
        });
        variantSummary.created += 1;
      } catch (err) {
        variantSummary.failed += 1;
        console.error(`[BACKFILL-FAIL] ProductVariant product=${mongoDoc._id}:`, err.message || err);
      }
    }
  }

  const costHistory = Array.isArray(mongoDoc.costHistory) ? mongoDoc.costHistory : [];
  const existingCostCount = await prisma.productCostHistory.count({
    where: { productId: pgProductId }
  });

  if (existingCostCount >= costHistory.length && costHistory.length > 0) {
    costSummary.skipped = costHistory.length;
    costSummary.totalFound = costHistory.length;
  } else {
    for (const entry of costHistory) {
      costSummary.totalFound += 1;
      try {
        const supplierRef = entry.supplierId?._id || entry.supplierId || null;
        const supplierPgId = supplierRef ? fkMaps.supplier.get(String(supplierRef)) : null;
        const dup = await prisma.productCostHistory.findFirst({
          where: {
            productId: pgProductId,
            cost: entry.cost != null ? entry.cost : 0,
            date: entry.date ? new Date(entry.date) : undefined
          }
        });
        if (dup) {
          costSummary.skipped += 1;
          continue;
        }
        await prisma.productCostHistory.create({
          data: {
            productId: pgProductId,
            supplierId: supplierPgId,
            cost: entry.cost != null ? entry.cost : 0,
            date: entry.date ? new Date(entry.date) : new Date()
          }
        });
        costSummary.created += 1;
      } catch (err) {
        costSummary.failed += 1;
        console.error(`[BACKFILL-FAIL] ProductCostHistory product=${mongoDoc._id}:`, err.message || err);
      }
    }
  }

  const reviews = Array.isArray(mongoDoc.reviews) ? mongoDoc.reviews : [];
  const existingEmbeddedCount = await prisma.productEmbeddedReview.count({
    where: { productId: pgProductId }
  });

  if (existingEmbeddedCount >= reviews.length && reviews.length > 0) {
    embeddedSummary.skipped = reviews.length;
    embeddedSummary.totalFound = reviews.length;
  } else {
    for (const review of reviews) {
      embeddedSummary.totalFound += 1;
      try {
        const reviewLegacyId = review._id != null ? String(review._id) : null;
        if (reviewLegacyId) {
          const existing = await prisma.productEmbeddedReview.findUnique({
            where: { legacyId: reviewLegacyId }
          });
          if (existing) {
            embeddedSummary.skipped += 1;
            continue;
          }
        }
        const userRef = review.user?._id || review.user || null;
        const userPgId = userRef ? fkMaps.user.get(String(userRef)) : null;
        const row = await productRepo.addEmbeddedReview(pgProductId, {
          userId: userPgId,
          name: review.name,
          rating: review.rating,
          comment: review.comment
        });
        if (reviewLegacyId || review.createdAt) {
          await prisma.productEmbeddedReview.update({
            where: { id: row.id },
            data: {
              ...(reviewLegacyId ? { legacyId: reviewLegacyId } : {}),
              ...(review.createdAt ? { createdAt: new Date(review.createdAt) } : {})
            }
          });
        }
        embeddedSummary.created += 1;
      } catch (err) {
        embeddedSummary.failed += 1;
        console.error(`[BACKFILL-FAIL] ProductEmbeddedReview product=${mongoDoc._id}:`, err.message || err);
      }
    }
  }

  return { variantSummary, costSummary, embeddedSummary };
}

async function backfillProductsWithSubResources(fkMaps) {
  const summary = {
    modelName: 'Product',
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };
  const variantRollup = { totalFound: 0, created: 0, skipped: 0, failed: 0 };
  const costRollup = { totalFound: 0, created: 0, skipped: 0, failed: 0 };
  const embeddedRollup = { totalFound: 0, created: 0, skipped: 0, failed: 0 };

  const mongoCount = await Product.countDocuments();
  console.log(`Product: ${mongoCount} documents in MongoDB`);
  const slowStart = Date.now();
  const SLOW_MS = 5 * 60 * 1000;

  let lastId = null;
  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await Product.find(query).sort({ _id: 1 }).limit(50).lean();
    if (!batch.length) break;
    summary.totalFound += batch.length;

    for (const doc of batch) {
      const legacyId = String(doc._id);
      try {
        let pgProduct = await findProductByLegacyId(legacyId);
        if (pgProduct) {
          summary.skipped += 1;
        } else {
          const payload = mapProduct(doc, fkMaps);
          pgProduct = await createProductBackfill(payload);
          summary.created += 1;
        }

        const subs = await backfillProductSubResources(doc, pgProduct.id, fkMaps);
        variantRollup.totalFound += subs.variantSummary.totalFound;
        variantRollup.created += subs.variantSummary.created;
        variantRollup.skipped += subs.variantSummary.skipped;
        variantRollup.failed += subs.variantSummary.failed;
        costRollup.totalFound += subs.costSummary.totalFound;
        costRollup.created += subs.costSummary.created;
        costRollup.skipped += subs.costSummary.skipped;
        costRollup.failed += subs.costSummary.failed;
        embeddedRollup.totalFound += subs.embeddedSummary.totalFound;
        embeddedRollup.created += subs.embeddedSummary.created;
        embeddedRollup.skipped += subs.embeddedSummary.skipped;
        embeddedRollup.failed += subs.embeddedSummary.failed;
      } catch (err) {
        summary.failed += 1;
        summary.failedIds.push(legacyId);
        console.error(`[BACKFILL-FAIL] Product legacyId=${legacyId}:`, err.message || err);
      }
    }

    lastId = batch[batch.length - 1]._id;
    console.log(
      `Product: ${summary.totalFound} processed (created=${summary.created}, skipped=${summary.skipped}, failed=${summary.failed})`
    );

    if (Date.now() - slowStart > SLOW_MS) {
      console.warn('[BACKFILL-WARN] Product backfill exceeded 5 minutes — monitor progress.');
    }
  }

  return [
    summary,
    { modelName: 'ProductVariant', ...variantRollup },
    { modelName: 'ProductVariantAttribute', note: 'created via addVariant() per variant' },
    { modelName: 'ProductCostHistory', ...costRollup },
    { modelName: 'ProductEmbeddedReview', ...embeddedRollup }
  ];
}

async function verifyAdminPasswordHashPreservation() {
  const summary = {
    modelName: 'Admin (password hash check)',
    checked: 0,
    preserved: 0,
    mismatched: 0,
    isHashedDetected: adminRepo.isHashed ? 'yes' : 'unknown'
  };

  const mongoAdmins = await Admin.find().lean();
  for (const doc of mongoAdmins) {
    const legacyId = String(doc._id);
    const pgRow = await prisma.admin.findUnique({
      where: { legacyId },
      select: { id: true, password: true }
    });
    if (!pgRow) continue;

    summary.checked += 1;
    const mongoHash = String(doc.password || '');
    const pgHash = String(pgRow.password || '');
    const detectedAsHash = adminRepo.isHashed(mongoHash);

    if (mongoHash === pgHash && detectedAsHash) {
      summary.preserved += 1;
    } else {
      summary.mismatched += 1;
      console.error(
        `[BACKFILL-WARN] Admin legacyId=${legacyId}: hash mismatch or not detected as bcrypt ` +
        `(isHashed=${detectedAsHash}, equal=${mongoHash === pgHash})`
      );
    }
  }

  console.log(
    `Admin password hash preservation: ${summary.preserved}/${summary.checked} identical ` +
    `(isHashed() correctly detects Mongo bcrypt digests — no double-hash)`
  );

  return summary;
}

async function repairCartItems(userMap, productMaps) {
  const summary = {
    modelName: 'CartItem (gap repair)',
    totalFound: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    failedIds: [],
    cartItemsBefore: await prisma.cartItem.count()
  };

  let lastId = null;
  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await Cart.find(query).sort({ _id: 1 }).limit(100).lean();
    if (!batch.length) break;

    for (const doc of batch) {
      const cartLegacyId = String(doc._id);
      const cart = await cartRepo.findByLegacyId(cartLegacyId);
      if (!cart) continue;

      const items = Array.isArray(doc.items) ? doc.items : [];
      for (const item of items) {
        summary.totalFound += 1;
        const productRef = item.productId?._id || item.productId;
        const productPgId = resolveProductIdFromMaps(productRef, productMaps);
        if (!productPgId) {
          summary.skipped += 1;
          continue;
        }

        const variantId = String(item.variantId || '');
        try {
          const existing = await prisma.cartItem.findFirst({
            where: { cartId: cart.id, productId: productPgId, variantId }
          });
          if (existing) {
            summary.skipped += 1;
            continue;
          }
          await prisma.cartItem.create({
            data: mapCartItem(cart.id, item, productPgId)
          });
          summary.created += 1;
        } catch (err) {
          summary.failed += 1;
          summary.failedIds.push(`${cartLegacyId}:${productRef}`);
          console.error(`[BACKFILL-FAIL] CartItem repair cart=${cartLegacyId}:`, err.message || err);
        }
      }
    }

    lastId = batch[batch.length - 1]._id;
  }

  summary.cartItemsAfter = await prisma.cartItem.count();
  summary.netNew = summary.cartItemsAfter - summary.cartItemsBefore;
  console.log(
    `CartItem repair: created=${summary.created}, net new Postgres rows=${summary.netNew} ` +
    `(before=${summary.cartItemsBefore}, after=${summary.cartItemsAfter})`
  );

  return summary;
}

async function repairReviewProductIds(productMaps) {
  const summary = {
    modelName: 'Review (productId repair)',
    totalFound: 0,
    repaired: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };

  const rows = await prisma.review.findMany({
    where: { productId: null, legacyId: { not: null } }
  });
  summary.totalFound = rows.length;

  for (const row of rows) {
    try {
      const mongoDoc = await Review.findById(row.legacyId).lean();
      if (!mongoDoc?.productId) {
        summary.skipped += 1;
        continue;
      }
      const productPgId = resolveProductIdFromMaps(mongoDoc.productId, productMaps);
      if (!productPgId) {
        summary.skipped += 1;
        continue;
      }
      await prisma.review.update({
        where: { id: row.id },
        data: { productId: productPgId }
      });
      summary.repaired += 1;
    } catch (err) {
      summary.failed += 1;
      summary.failedIds.push(row.legacyId);
      console.error(`[BACKFILL-FAIL] Review productId repair legacyId=${row.legacyId}:`, err.message || err);
    }
  }

  return summary;
}

async function repairWishlistProductIds(productMaps) {
  const summary = {
    modelName: 'WishlistItem (productId repair)',
    totalFound: 0,
    repaired: 0,
    skipped: 0,
    failed: 0,
    failedIds: []
  };

  const rows = await prisma.wishlistItem.findMany({
    where: { productId: null }
  });
  summary.totalFound = rows.length;

  for (const row of rows) {
    try {
      const productPgId = resolveProductIdFromMaps(row.legacyProductId, productMaps);
      if (!productPgId) {
        summary.skipped += 1;
        continue;
      }
      await prisma.wishlistItem.update({
        where: { id: row.id },
        data: { productId: productPgId }
      });
      summary.repaired += 1;
    } catch (err) {
      summary.failed += 1;
      summary.failedIds.push(row.legacyId || row.id);
      console.error(`[BACKFILL-FAIL] WishlistItem productId repair id=${row.id}:`, err.message || err);
    }
  }

  return summary;
}

async function runStep4Group() {
  const results = [];

  console.log('\n=== Stage 3 Step 4 — Backfill group: Admin, Product, gap repair ===\n');

  results.push(await backfillModel({
    modelName: 'Admin',
    mongoModel: Admin,
    findByLegacyId: adminRepo.findByLegacyId,
    createInPostgres: adminRepo.create,
    mapMongoToPostgres: mapAdmin
  }));

  results.push(await verifyAdminPasswordHashPreservation());

  const adminMaps = await buildAdminStaffMaps();
  const employeeMaps = await buildEmployeeStaffMaps();
  console.log(
    `HRM re-attempt after Admin backfill — admin map: ${adminMaps.byLegacyId.size} by legacyId`
  );

  results.push(await backfillAttendanceWithMaps(adminMaps, employeeMaps));
  results.push(await backfillPayrollWithMaps(adminMaps, employeeMaps));
  results.push(await backfillLeaveWithMaps(adminMaps, employeeMaps));

  const fkMaps = {
    category: await buildCategoryLookupMaps(),
    brand: await buildLegacyIdMap('brand'),
    supplier: await buildLegacyIdMap('supplier'),
    warehouse: await buildLegacyIdMap('warehouse'),
    admin: await buildLegacyIdMap('admin'),
    user: await buildLegacyIdMap('user')
  };
  console.log(
    `Product FK maps — category names: ${fkMaps.category.byName.size}, brand: ${fkMaps.brand.size}, ` +
    `supplier: ${fkMaps.supplier.size}, warehouse: ${fkMaps.warehouse.size}, admin: ${fkMaps.admin.size}`
  );

  results.push(...(await backfillProductsWithSubResources(fkMaps)));

  const productMaps = await buildProductLookupMaps();
  const userMap = await buildLegacyIdMap('user');
  console.log(
    `Gap repair maps — products: ${productMaps.byLegacyId.size} legacyId, ${productMaps.byProductId.size} productId`
  );

  results.push(await repairCartItems(userMap, productMaps));
  results.push(await repairReviewProductIds(productMaps));
  results.push(await repairWishlistProductIds(productMaps));

  // Final HRM pass — staffUsername fallback resolves stale staffId references
  const adminMapsFinal = await buildAdminStaffMaps();
  const employeeMapsFinal = await buildEmployeeStaffMaps();
  results.push(await backfillAttendanceWithMaps(adminMapsFinal, employeeMapsFinal));

  return results;
}

async function runStep3Group() {
  const results = [];

  console.log('\n=== Stage 3 Step 3 — Backfill group: User, HRM, Marketing/Support ===\n');

  const productMaps = await buildProductLookupMaps();
  console.log(
    `Product FK map loaded: ${productMaps.byLegacyId.size} by legacyId, ${productMaps.byProductId.size} by productId`
  );

  let adminMaps = await buildAdminStaffMaps();
  console.log(`Admin staff map loaded: ${adminMaps.byLegacyId.size} by legacyId, ${adminMaps.byUsername.size} by username`);

  // ── Step 1: User (must go first) ───────────────────────────────────────────
  results.push(await backfillModel({
    modelName: 'User',
    mongoModel: User,
    findByLegacyId: userRepo.findByLegacyId,
    createInPostgres: userRepo.create,
    mapMongoToPostgres: mapUser
  }));

  const userMap = await buildLegacyIdMap('user');
  console.log(`User FK map loaded: ${userMap.size} rows`);

  results.push(await backfillUserReferredByPass(userMap));
  results.push(...(await backfillUserOwnedResources(userMap, productMaps)));

  // ── Step 2: HRM ────────────────────────────────────────────────────────────
  results.push(await backfillModel({
    modelName: 'Employee',
    mongoModel: Employee,
    findByLegacyId: employeeRepo.findByLegacyId,
    createInPostgres: employeeRepo.create,
    mapMongoToPostgres: (doc) => mapEmployee(doc, adminMaps)
  }));

  adminMaps = await buildAdminStaffMaps();
  const employeeMaps = await buildEmployeeStaffMaps();
  console.log(`Employee staff map loaded: ${employeeMaps.byLegacyId.size} rows`);

  results.push(...(await backfillEmployeeSubResources()));

  results.push(await backfillAttendanceWithMaps(adminMaps, employeeMaps));
  results.push(await backfillPayrollWithMaps(adminMaps, employeeMaps));
  results.push(await backfillLeaveWithMaps(adminMaps, employeeMaps));

  // ── Step 3: Marketing/Support ──────────────────────────────────────────────
  results.push(await backfillModel({
    modelName: 'Newsletter',
    mongoModel: Newsletter,
    findByLegacyId: newsletterRepo.findByLegacyId,
    createInPostgres: newsletterRepo.create,
    mapMongoToPostgres: mapNewsletter
  }));

  results.push(await backfillModel({
    modelName: 'EmailCampaign',
    mongoModel: EmailCampaign,
    findByLegacyId: emailCampaignRepo.findByLegacyId,
    createInPostgres: (mongoDoc) => emailCampaignRepo.upsertFromMongo(mongoDoc),
    mapMongoToPostgres: (mongoDoc) => mongoDoc
  }));

  results.push(await backfillModel({
    modelName: 'ContactMessage',
    mongoModel: ContactMessage,
    findByLegacyId: contactMessageRepo.findByLegacyId,
    createInPostgres: contactMessageRepo.create,
    mapMongoToPostgres: mapContactMessageDoc
  }));

  results.push(await backfillReviewsWithMaps(userMap, productMaps));

  return results;
}

async function runAll() {
  const allResults = [];

  allResults.push(...(await runStep1Group()));
  allResults.push(...(await runStep2Group()));
  allResults.push(...(await runStep3Group()));
  allResults.push(...(await runStep4Group()));

  return allResults;
}

async function main() {
  await connectDB();

  try {
    const results = await runAll();

    console.log('\n=== Backfill summary ===\n');
    for (const r of results) {
      console.log(JSON.stringify(r, null, 2));
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
