/********************************************************************
 * Project: EonlineBazar
 * File: verifyBackfill.js
 * Location: backend/scripts/backfill/verifyBackfill.js
 * Description: Compare MongoDB vs Postgres after Stage 3 backfill runs.
 *
 * Usage: node backend/scripts/backfill/verifyBackfill.js
 ********************************************************************/

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const prisma = require('../../src/config/prismaClient');

const Designation = require('../../src/models/designation');
const Brand = require('../../src/models/brand');
const Warehouse = require('../../src/models/warehouse');
const Supplier = require('../../src/models/supplier');
const Category = require('../../src/models/category');
const PageContent = require('../../src/models/PageContent');
const NavbarLink = require('../../src/models/NavbarLink');
const { Banner } = require('../../src/models/banner');
const SecurityLog = require('../../src/models/securityLog');
const LoginAttempt = require('../../src/models/loginAttempt');
const BlacklistedIp = require('../../src/models/blacklistedIp');
const StockAlert = require('../../src/models/stockAlert');
const categoryRepo = require('../../src/repositories/categoryRepository');
const bannerRepo = require('../../src/repositories/bannerRepository');
const footerSettingsRepo = require('../../src/repositories/footerSettingsRepository');
const settingsRepo = require('../../src/repositories/settingsRepository');

const COUNT_MODELS = [
  { name: 'Designation', mongoModel: Designation, postgresCount: () => prisma.designation.count() },
  { name: 'Brand', mongoModel: Brand, postgresCount: () => prisma.brand.count() },
  { name: 'Warehouse', mongoModel: Warehouse, postgresCount: () => prisma.warehouse.count() },
  { name: 'Supplier', mongoModel: Supplier, postgresCount: () => prisma.supplier.count() },
  { name: 'Category', mongoModel: Category, postgresCount: () => prisma.category.count() },
  { name: 'PageContent', mongoModel: PageContent, postgresCount: () => prisma.pageContent.count() },
  { name: 'NavbarLink', mongoModel: NavbarLink, postgresCount: () => prisma.navbarLink.count() },
  { name: 'Banner', mongoModel: Banner, postgresCount: () => prisma.banner.count() },
  { name: 'SecurityLog', mongoModel: SecurityLog, postgresCount: () => prisma.securityLog.count() },
  { name: 'LoginAttempt', mongoModel: LoginAttempt, postgresCount: () => prisma.loginAttempt.count() },
  { name: 'BlacklistedIP', mongoModel: BlacklistedIp, postgresCount: () => prisma.blacklistedIp.count() },
  { name: 'StockAlert', mongoModel: StockAlert, postgresCount: () => prisma.stockAlert.count() }
];

const SINGLETON_MODELS = [
  {
    name: 'BannerSettings',
    findPostgres: () => bannerRepo.findBannerSettings(),
    countGlobal: () => prisma.bannerSettings.count({ where: { key: 'global' } })
  },
  {
    name: 'FooterSettings',
    findPostgres: () => footerSettingsRepo.findByKey(footerSettingsRepo.FOOTER_SETTINGS_KEY),
    countGlobal: () => prisma.footerSettings.count({ where: { key: 'global' } })
  },
  {
    name: 'Settings',
    findPostgres: () => settingsRepo.findByKey(settingsRepo.SETTINGS_KEY),
    countGlobal: () => prisma.settings.count({ where: { key: 'global' } })
  }
];

async function verifyCounts() {
  console.log('\n=== MongoDB vs Postgres row counts ===\n');

  const rows = [];

  for (const { name, mongoModel, postgresCount } of COUNT_MODELS) {
    const mongoCount = await mongoModel.countDocuments();
    const pgCount = await postgresCount();
    const diff = pgCount - mongoCount;
    const match = mongoCount === pgCount;

    rows.push({ name, mongoCount, pgCount, diff, match });
    console.log(
      `${name}: Mongo=${mongoCount} Postgres=${pgCount} diff=${diff >= 0 ? '+' : ''}${diff} ${match ? '✓' : 'MISMATCH'}`
    );
  }

  return rows;
}

async function verifySingletons() {
  console.log('\n=== Singleton key=global verification ===\n');

  const results = [];

  for (const { name, findPostgres, countGlobal } of SINGLETON_MODELS) {
    const globalCount = await countGlobal();
    const row = await findPostgres();
    const ok = globalCount === 1 && row != null;

    results.push({ name, globalCount, ok });
    console.log(
      `${name}: Postgres rows with key=global: ${globalCount} ${globalCount === 1 ? '✓' : 'ERROR (expected exactly 1)'}`
    );
  }

  return results;
}

async function verifyCategoryParents() {
  console.log('\n=== Category parentCategoryId verification ===\n');

  const withParentInMongo = await Category.countDocuments({ parentCategory: { $ne: null } });
  console.log(`Mongo categories with parentCategory set: ${withParentInMongo}`);

  const mongoChildren = await Category.find({ parentCategory: { $ne: null } }).lean();
  let linked = 0;
  let missingPostgresRow = 0;
  let nullParentDespiteMongoParent = 0;
  const problemIds = [];

  for (const doc of mongoChildren) {
    const legacyId = String(doc._id);
    const row = await categoryRepo.findByLegacyId(legacyId);

    if (!row) {
      missingPostgresRow += 1;
      problemIds.push({ legacyId, issue: 'no_postgres_row' });
      continue;
    }

    if (row.parentCategoryId) {
      linked += 1;
    } else {
      nullParentDespiteMongoParent += 1;
      problemIds.push({
        legacyId,
        issue: 'null_parentCategoryId',
        mongoParentLegacyId: String(doc.parentCategory)
      });
    }
  }

  console.log(`Postgres rows with non-null parentCategoryId (among Mongo children): ${linked}`);
  console.log(`Mongo children with no Postgres row at all: ${missingPostgresRow}`);
  console.log(
    `Mongo children still null parentCategoryId in Postgres (parent likely failed backfill): ${nullParentDespiteMongoParent}`
  );

  if (problemIds.length) {
    console.log('\nProblem records (first 20):');
    console.log(JSON.stringify(problemIds.slice(0, 20), null, 2));
  }

  return {
    withParentInMongo,
    linked,
    missingPostgresRow,
    nullParentDespiteMongoParent,
    problemIds
  };
}

async function verifyStockAlertChildren() {
  console.log('\n=== StockAlert child-row verification ===\n');

  const mongoAlerts = await StockAlert.find().lean();
  let mongoItemTotal = 0;

  for (const doc of mongoAlerts) {
    const low = Array.isArray(doc.lowStockProducts) ? doc.lowStockProducts.length : 0;
    const out = Array.isArray(doc.outOfStockProducts) ? doc.outOfStockProducts.length : 0;
    mongoItemTotal += low + out;
  }

  const postgresItemTotal = await prisma.stockAlertItem.count();

  console.log(`Mongo sum(lowStockProducts + outOfStockProducts) across ${mongoAlerts.length} alerts: ${mongoItemTotal}`);
  console.log(`Postgres stock_alert_items row count: ${postgresItemTotal}`);
  console.log(`Difference (Postgres − Mongo expected): ${postgresItemTotal - mongoItemTotal}`);

  return { mongoAlerts: mongoAlerts.length, mongoItemTotal, postgresItemTotal };
}

async function main() {
  await connectDB();

  try {
    const counts = await verifyCounts();
    const singletons = await verifySingletons();
    const categoryParents = await verifyCategoryParents();
    const stockAlertChildren = await verifyStockAlertChildren();

    console.log('\n=== Verification complete ===\n');
    const allMatch = counts.every((r) => r.match);
    const singletonsOk = singletons.every((s) => s.ok);
    const parentsOk = categoryParents.nullParentDespiteMongoParent === 0
      && categoryParents.missingPostgresRow === 0;

    console.log(`All row counts match: ${allMatch ? 'YES' : 'NO (see diffs — extra Postgres test rows or failed backfills are expected)'}`);
    console.log(`Singleton key=global uniqueness: ${singletonsOk ? 'YES' : 'NO (investigate duplicate or missing singleton rows)'}`);
    console.log(`Category parent links complete: ${parentsOk ? 'YES' : 'NO (investigate problem records)'}`);
    console.log(
      `StockAlert child rows vs Mongo array sum: ${stockAlertChildren.postgresItemTotal === stockAlertChildren.mongoItemTotal ? 'MATCH' : 'MISMATCH (see counts above)'}`
    );
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[VERIFY] Fatal error:', err);
  process.exit(1);
});
