/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: readCutoverFlags.js
 * Location: backend/src/config/readCutoverFlags.js
 * Description: Per-model-group feature flags for PostgreSQL read cutover.
 *   Each flag defaults OFF (Mongo reads). Set env var to 'true' and restart
 *   to enable Postgres reads for that group. Writes always dual-write.
 ********************************************************************/

'use strict';

/** Env var name for each cutover group (Stage 4 ordering). */
const GROUP_ENV = {
  category: 'READ_PG_CATEGORY',
  brand: 'READ_PG_BRAND',
  supplier: 'READ_PG_SUPPLIER',
  warehouse: 'READ_PG_WAREHOUSE',
  designation: 'READ_PG_DESIGNATION',
  pagecontent: 'READ_PG_PAGECONTENT',
  navbarlink: 'READ_PG_NAVBARLINK',
  footersettings: 'READ_PG_FOOTERSETTINGS',
  banner: 'READ_PG_BANNER',
  settings: 'READ_PG_SETTINGS',
  securitylog: 'READ_PG_SECURITYLOG',
  loginattempt: 'READ_PG_LOGINATTEMPT',
  blacklistedip: 'READ_PG_BLACKLISTEDIP',
  stockalert: 'READ_PG_STOCKALERT',
  employee: 'READ_PG_EMPLOYEE',
  attendance: 'READ_PG_ATTENDANCE',
  payroll: 'READ_PG_PAYROLL',
  leave: 'READ_PG_LEAVE',
  newsletter: 'READ_PG_NEWSLETTER',
  emailcampaign: 'READ_PG_EMAILCAMPAIGN',
  contactmessage: 'READ_PG_CONTACTMESSAGE',
  review: 'READ_PG_REVIEW',
  attribute: 'READ_PG_ATTRIBUTE',
  coupon: 'READ_PG_COUPON',
  paymentmethod: 'READ_PG_PAYMENT_METHOD',
  expensecategory: 'READ_PG_EXPENSE_CATEGORY',
  expense: 'READ_PG_EXPENSE',
  purchaseorder: 'READ_PG_PURCHASE_ORDER',
  shift: 'READ_PG_SHIFT',
  note: 'READ_PG_NOTE',
  adminnotification: 'READ_PG_ADMIN_NOTIFICATION',
  usersession: 'READ_PG_USER_SESSION',
  adminsession: 'READ_PG_ADMIN_SESSION',
  product: 'READ_PG_PRODUCT',
  user: 'READ_PG_USER',
  address: 'READ_PG_ADDRESS',
  wishlist: 'READ_PG_WISHLIST',
  wallet: 'READ_PG_WALLET',
  cart: 'READ_PG_CART',
  order: 'READ_PG_ORDER',
  financeanalytics: 'READ_PG_FINANCE_ANALYTICS',
  profitloss: 'READ_PG_PROFIT_LOSS',
  accountssummary: 'READ_PG_ACCOUNTS_SUMMARY',
  crm: 'READ_PG_CRM',
  enterprisesummary: 'READ_PG_ENTERPRISE_SUMMARY',
  admin: 'READ_PG_ADMIN'
};

/**
 * Read process.env on each call so Jest (and hosts with live env reload)
 * can flip flags without reloading this module.
 */
function isPgReadEnabled(group) {
  const envKey = GROUP_ENV[group];
  if (!envKey) return false;
  return process.env[envKey] === 'true';
}

/** Snapshot of current flag state (for logging / diagnostics). */
function getReadCutoverFlags() {
  return Object.fromEntries(
    Object.entries(GROUP_ENV).map(([group, envKey]) => [group, process.env[envKey] === 'true'])
  );
}

module.exports = {
  isPgReadEnabled,
  getReadCutoverFlags,
  GROUP_ENV
};
