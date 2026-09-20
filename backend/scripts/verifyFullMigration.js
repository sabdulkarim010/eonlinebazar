// Run: cd backend && node scripts/verifyFullMigration.js

/********************************************************************
 * Project: EonlineBazar — Database Migration
 * File: verifyFullMigration.js
 * Location: backend/scripts/verifyFullMigration.js
 * Description: Master pre-launch verification — Mongo vs Postgres counts,
 *   financial integrity, and read-cutover flag snapshot.
 ********************************************************************/

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const prisma = require('../src/config/prismaClient');
const { getReadCutoverFlags, GROUP_ENV } = require('../src/config/readCutoverFlags');

const Category = require('../src/models/category');
const Brand = require('../src/models/brand');
const Product = require('../src/models/product');
const User = require('../src/models/user');
const Order = require('../src/models/order');
const Cart = require('../src/models/cart');
const Review = require('../src/models/review');
const Employee = require('../src/models/employee');
const Supplier = require('../src/models/supplier');
const Warehouse = require('../src/models/warehouse');
const Designation = require('../src/models/designation');
const Coupon = require('../src/models/coupon');
const Attribute = require('../src/models/attribute');
const PaymentMethod = require('../src/models/PaymentMethod');
const PurchaseOrder = require('../src/models/purchaseOrder');
const ExpenseCategory = require('../src/models/expenseCategory');
const Expense = require('../src/models/expense');
const Note = require('../src/models/note');
const AdminNotification = require('../src/models/adminNotification');
const Settings = require('../src/models/Settings');
const Newsletter = require('../src/models/newsletter');
const ContactMessage = require('../src/models/ContactMessage');
const SecurityLog = require('../src/models/securityLog');
const StockAlert = require('../src/models/stockAlert');
const { Banner } = require('../src/models/banner');
const NavbarLink = require('../src/models/NavbarLink');
const PageContent = require('../src/models/PageContent');

const FINANCIAL_TOLERANCE = 0.01;

async function countMongoProductVariants() {
  const products = await Product.find().select('variants').lean();
  let total = 0;
  for (const doc of products) {
    total += Array.isArray(doc.variants) ? doc.variants.length : 0;
  }
  return total;
}

const COUNT_CHECKS = [
  { name: 'Category', mongoCount: () => Category.countDocuments(), pgCount: () => prisma.category.count() },
  { name: 'Brand', mongoCount: () => Brand.countDocuments(), pgCount: () => prisma.brand.count() },
  { name: 'Product', mongoCount: () => Product.countDocuments(), pgCount: () => prisma.product.count() },
  {
    name: 'ProductVariant',
    mongoCount: countMongoProductVariants,
    pgCount: () => prisma.productVariant.count()
  },
  { name: 'User', mongoCount: () => User.countDocuments(), pgCount: () => prisma.user.count() },
  { name: 'Order', mongoCount: () => Order.countDocuments(), pgCount: () => prisma.order.count() },
  { name: 'Cart', mongoCount: () => Cart.countDocuments(), pgCount: () => prisma.cart.count() },
  { name: 'Review', mongoCount: () => Review.countDocuments(), pgCount: () => prisma.review.count() },
  { name: 'Employee', mongoCount: () => Employee.countDocuments(), pgCount: () => prisma.employee.count() },
  { name: 'Supplier', mongoCount: () => Supplier.countDocuments(), pgCount: () => prisma.supplier.count() },
  { name: 'Warehouse', mongoCount: () => Warehouse.countDocuments(), pgCount: () => prisma.warehouse.count() },
  { name: 'Designation', mongoCount: () => Designation.countDocuments(), pgCount: () => prisma.designation.count() },
  { name: 'Coupon', mongoCount: () => Coupon.countDocuments(), pgCount: () => prisma.coupon.count() },
  { name: 'Attribute', mongoCount: () => Attribute.countDocuments(), pgCount: () => prisma.attribute.count() },
  { name: 'PaymentMethod', mongoCount: () => PaymentMethod.countDocuments(), pgCount: () => prisma.paymentMethod.count() },
  { name: 'PurchaseOrder', mongoCount: () => PurchaseOrder.countDocuments(), pgCount: () => prisma.purchaseOrder.count() },
  { name: 'ExpenseCategory', mongoCount: () => ExpenseCategory.countDocuments(), pgCount: () => prisma.expenseCategory.count() },
  { name: 'Expense', mongoCount: () => Expense.countDocuments(), pgCount: () => prisma.expense.count() },
  { name: 'Note', mongoCount: () => Note.countDocuments(), pgCount: () => prisma.note.count() },
  // AdminNotification: ephemeral — PG starts fresh, skip count check
  {
    name: 'AdminNotification',
    mongoCount: () => AdminNotification.countDocuments(),
    pgCount: () => prisma.adminNotification.count(),
    skipMismatchVerdict: true
  },
  // Settings: singleton in PG by design, skip count check
  {
    name: 'Settings',
    mongoCount: () => Settings.countDocuments(),
    pgCount: () => prisma.settings.count(),
    skipMismatchVerdict: true
  },
  { name: 'Newsletter', mongoCount: () => Newsletter.countDocuments(), pgCount: () => prisma.newsletter.count() },
  { name: 'ContactMessage', mongoCount: () => ContactMessage.countDocuments(), pgCount: () => prisma.contactMessage.count() },
  { name: 'SecurityLog', mongoCount: () => SecurityLog.countDocuments(), pgCount: () => prisma.securityLog.count() },
  { name: 'StockAlert', mongoCount: () => StockAlert.countDocuments(), pgCount: () => prisma.stockAlert.count() },
  { name: 'Banner', mongoCount: () => Banner.countDocuments(), pgCount: () => prisma.banner.count() },
  { name: 'NavbarLink', mongoCount: () => NavbarLink.countDocuments(), pgCount: () => prisma.navbarLink.count() },
  { name: 'PageContent', mongoCount: () => PageContent.countDocuments(), pgCount: () => prisma.pageContent.count() }
];

function matchIcon(match) {
  return match ? '✅' : '❌';
}

function pad(str, len) {
  return String(str).padEnd(len);
}

async function runCountComparison() {
  console.log('\n=== SECTION 1 — Count Comparison (Mongo vs PG) ===\n');

  const colModel = 20;
  const colCount = 12;
  const header =
    `| ${pad('Model', colModel)} | ${pad('Mongo count', colCount)} | ${pad('PG count', colCount)} | Match? |`;
  const separator =
    `|${'-'.repeat(colModel + 2)}|${'-'.repeat(colCount + 2)}|${'-'.repeat(colCount + 2)}|--------|`;

  console.log(header);
  console.log(separator);

  const rows = [];

  for (const check of COUNT_CHECKS) {
    const mongoCount = await check.mongoCount();
    const pgCount = await check.pgCount();
    const rawMatch = mongoCount === pgCount;
    const skipVerdict = check.skipMismatchVerdict === true;
    const match = skipVerdict ? true : rawMatch;
    const status = skipVerdict ? '⏭ SKIP' : `${matchIcon(rawMatch)}     `;

    rows.push({ name: check.name, mongoCount, pgCount, match, skipVerdict, rawMatch });

    console.log(
      `| ${pad(check.name, colModel)} | ${pad(mongoCount, colCount)} | ${pad(pgCount, colCount)} | ${status} |`
    );
  }

  return rows;
}

async function runFinancialCheck() {
  console.log('\n=== SECTION 2 — Financial Integrity Check ===\n');

  const mongoOrders = await Order.find({}).select('grandTotal').lean();
  let mongoGrandTotal = 0;
  for (const order of mongoOrders) {
    mongoGrandTotal += Number(order.grandTotal) || 0;
  }
  mongoGrandTotal = Math.round((mongoGrandTotal + Number.EPSILON) * 100) / 100;

  const pgAgg = await prisma.order.aggregate({
    _sum: { grandTotal: true }
  });
  const pgGrandTotal = pgAgg._sum.grandTotal != null
    ? Math.round(parseFloat(String(pgAgg._sum.grandTotal)) * 100) / 100
    : 0;

  const diff = Math.abs(mongoGrandTotal - pgGrandTotal);
  const pass = diff <= FINANCIAL_TOLERANCE;

  console.log(`Mongo SUM(grandTotal): ${mongoGrandTotal}`);
  console.log(`PG SUM(grandTotal):    ${pgGrandTotal}`);
  console.log(`Difference:            ${Math.round(diff * 100) / 100} (tolerance ±${FINANCIAL_TOLERANCE})`);
  console.log(`Result:                ${pass ? '✅ PASS' : '❌ FAIL'}`);

  return { mongoGrandTotal, pgGrandTotal, diff, pass };
}

function runFlagHealthCheck() {
  console.log('\n=== SECTION 3 — Dual-Write Health Check (read cutover flags) ===\n');

  const flags = getReadCutoverFlags();
  const entries = Object.entries(GROUP_ENV).map(([group, envKey]) => ({
    group,
    envKey,
    enabled: flags[group] === true
  }));

  let onCount = 0;
  for (const entry of entries) {
    const status = entry.enabled ? 'ON' : 'OFF';
    if (entry.enabled) onCount += 1;
    console.log(`  ${entry.envKey.padEnd(32)} (${entry.group.padEnd(20)}) = ${status}`);
  }

  console.log(`\nFlags ON:  ${onCount}`);
  console.log(`Flags OFF: ${entries.length - onCount}`);
  console.log(`Total:     ${entries.length}`);

  return { onCount, offCount: entries.length - onCount, total: entries.length };
}

function printFinalVerdict(countRows, financial, flags) {
  const mismatches = countRows.filter((r) => !r.skipVerdict && !r.rawMatch).length;
  const countsOk = mismatches === 0;
  const ready = countsOk && financial.pass;

  console.log('\n============================================');
  console.log(`  MIGRATION READY: ${ready ? 'YES ✅' : 'NO ❌'}`);
  console.log('============================================');
  console.log(`  Mismatches found: ${mismatches}`);
  console.log(`  Financial check: ${financial.pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Flags enabled: ${flags.onCount} of ${flags.total}`);
  console.log('============================================\n');

  return ready;
}

async function main() {
  console.log('[VERIFY-FULL-MIGRATION] Connecting to MongoDB and PostgreSQL...\n');
  await connectDB();

  try {
    const countRows = await runCountComparison();
    const financial = await runFinancialCheck();
    const flags = runFlagHealthCheck();
    const ready = printFinalVerdict(countRows, financial, flags);

    if (!ready) {
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
    console.log('[VERIFY-FULL-MIGRATION] Disconnected from MongoDB and PostgreSQL.');
  }
}

main().catch((err) => {
  console.error('[VERIFY-FULL-MIGRATION] Fatal error:', err);
  process.exit(1);
});
