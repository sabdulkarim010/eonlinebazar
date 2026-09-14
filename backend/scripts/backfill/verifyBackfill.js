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
  { name: 'StockAlert', mongoModel: StockAlert, postgresCount: () => prisma.stockAlert.count() },
  { name: 'User', mongoModel: User, postgresCount: () => prisma.user.count() },
  { name: 'Employee', mongoModel: Employee, postgresCount: () => prisma.employee.count() },
  { name: 'Attendance', mongoModel: Attendance, postgresCount: () => prisma.attendance.count() },
  { name: 'Payroll', mongoModel: Payroll, postgresCount: () => prisma.payroll.count() },
  { name: 'Leave', mongoModel: Leave, postgresCount: () => prisma.leave.count() },
  { name: 'Newsletter', mongoModel: Newsletter, postgresCount: () => prisma.newsletter.count() },
  { name: 'EmailCampaign', mongoModel: EmailCampaign, postgresCount: () => prisma.emailCampaign.count() },
  { name: 'ContactMessage', mongoModel: ContactMessage, postgresCount: () => prisma.contactMessage.count() },
  { name: 'Review', mongoModel: Review, postgresCount: () => prisma.review.count() },
  { name: 'Cart', mongoModel: Cart, postgresCount: () => prisma.cart.count() }
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

async function verifyUserOwnedChildren() {
  console.log('\n=== User owned-table verification (embedded arrays vs Postgres) ===\n');

  const mongoUsers = await User.find().lean();
  let mongoAddressTotal = 0;
  let mongoWishlistTotal = 0;
  let mongoWalletTotal = 0;

  for (const doc of mongoUsers) {
    mongoAddressTotal += Array.isArray(doc.addresses) ? doc.addresses.length : 0;
    mongoWishlistTotal += Array.isArray(doc.wishlist) ? doc.wishlist.length : 0;
    mongoWalletTotal += Array.isArray(doc.walletHistory) ? doc.walletHistory.length : 0;
  }

  const pgAddressTotal = await prisma.address.count();
  const pgWishlistTotal = await prisma.wishlistItem.count();
  const pgWalletTotal = await prisma.walletTransaction.count();

  console.log(`Mongo sum(user.addresses[]) across ${mongoUsers.length} users: ${mongoAddressTotal}`);
  console.log(`Postgres addresses row count: ${pgAddressTotal}`);
  console.log(`Mongo sum(user.wishlist[]) across ${mongoUsers.length} users: ${mongoWishlistTotal}`);
  console.log(`Postgres wishlist_items row count: ${pgWishlistTotal}`);
  console.log(`Mongo sum(user.walletHistory[]) across ${mongoUsers.length} users: ${mongoWalletTotal}`);
  console.log(`Postgres wallet_transactions row count: ${pgWalletTotal}`);

  return {
    mongoAddressTotal,
    pgAddressTotal,
    mongoWishlistTotal,
    pgWishlistTotal,
    mongoWalletTotal,
    pgWalletTotal
  };
}

async function verifyCartChildren() {
  console.log('\n=== CartItem verification ===\n');

  const mongoCarts = await Cart.find().lean();
  let mongoItemTotal = 0;
  for (const doc of mongoCarts) {
    mongoItemTotal += Array.isArray(doc.items) ? doc.items.length : 0;
  }

  const postgresItemTotal = await prisma.cartItem.count();

  console.log(`Mongo sum(cart.items[]) across ${mongoCarts.length} carts: ${mongoItemTotal}`);
  console.log(`Postgres cart_items row count: ${postgresItemTotal}`);
  console.log(
    `Note: Postgres may be lower when cart items referenced products not yet in Postgres (skipped per backfill rules).`
  );

  return { mongoCarts: mongoCarts.length, mongoItemTotal, postgresItemTotal };
}

async function verifyEmployeeChildren() {
  console.log('\n=== Employee sub-resource verification ===\n');

  const mongoEmployees = await Employee.find().lean();
  let mongoDocTotal = 0;
  let mongoRefTotal = 0;
  for (const doc of mongoEmployees) {
    mongoDocTotal += Array.isArray(doc.documents) ? doc.documents.length : 0;
    mongoRefTotal += Array.isArray(doc.references) ? doc.references.length : 0;
  }

  const pgDocTotal = await prisma.employeeDocument.count();
  const pgRefTotal = await prisma.employeeReference.count();

  console.log(`Mongo sum(employee.documents[]) across ${mongoEmployees.length} employees: ${mongoDocTotal}`);
  console.log(`Postgres employee_documents row count: ${pgDocTotal}`);
  console.log(`Mongo sum(employee.references[]) across ${mongoEmployees.length} employees: ${mongoRefTotal}`);
  console.log(`Postgres employee_references row count: ${pgRefTotal}`);

  return { mongoDocTotal, pgDocTotal, mongoRefTotal, pgRefTotal };
}

async function verifyReviewUserIdHealth() {
  console.log('\n=== Review userId health check ===\n');

  const totalReviews = await prisma.review.count();
  const withUserId = await prisma.review.count({ where: { userId: { not: null } } });
  const nullUserId = await prisma.review.count({ where: { userId: null } });

  console.log(`Total Review rows in Postgres: ${totalReviews}`);
  console.log(`Reviews with non-null userId: ${withUserId}`);
  console.log(`Reviews with null userId (FK gap / unresolved user): ${nullUserId}`);

  if (nullUserId > 0) {
    const sampleNull = await prisma.review.findMany({
      where: { userId: null },
      select: { legacyId: true, legacyProductId: true },
      take: 10
    });
    console.log('\nSample Reviews still missing userId (first 10):');
    console.log(JSON.stringify(sampleNull, null, 2));
  }

  return { totalReviews, withUserId, nullUserId };
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
    const userOwnedChildren = await verifyUserOwnedChildren();
    const cartChildren = await verifyCartChildren();
    const employeeChildren = await verifyEmployeeChildren();
    const reviewHealth = await verifyReviewUserIdHealth();
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
    console.log(
      `Review userId resolved: ${reviewHealth.withUserId}/${reviewHealth.totalReviews} (${reviewHealth.nullUserId} still null)`
    );
    console.log(
      `User owned tables — Address: PG ${userOwnedChildren.pgAddressTotal} vs Mongo ${userOwnedChildren.mongoAddressTotal}, ` +
      `WishlistItem: PG ${userOwnedChildren.pgWishlistTotal} vs Mongo ${userOwnedChildren.mongoWishlistTotal}, ` +
      `WalletTransaction: PG ${userOwnedChildren.pgWalletTotal} vs Mongo ${userOwnedChildren.mongoWalletTotal}`
    );
    console.log(
      `CartItem: PG ${cartChildren.postgresItemTotal} vs Mongo ${cartChildren.mongoItemTotal} (product-skip delta expected)`
    );
    console.log(
      `Employee children — documents: PG ${employeeChildren.pgDocTotal} vs Mongo ${employeeChildren.mongoDocTotal}, ` +
      `references: PG ${employeeChildren.pgRefTotal} vs Mongo ${employeeChildren.mongoRefTotal}`
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
