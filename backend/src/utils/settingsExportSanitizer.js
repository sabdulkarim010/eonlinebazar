/********************************************************************
 * Project: EonlineBazar
 * File: settingsExportSanitizer.js
 * Description: Sanitize settings payloads for JSON export/import —
 *   strip secrets and gate importable fields.
 ********************************************************************/

'use strict';

const EXPORT_VERSION = 1;

const SECRET_KEY_PATTERN = /(password|secret|apikey|api_key|privatekey|token|KeyEnc)/i;

const SETTINGS_IMPORT_ALLOWLIST = new Set([
  'shopHomeCity',
  'deliveryInsideCity',
  'deliveryOutsideCity',
  'freeShippingMinAmount',
  'freeShippingThreshold',
  'cashbackPercentage',
  'takaToPointsRatio',
  'pointsToTakaConversionRate',
  'refundUndoWindowHours',
  'announcementText',
  'announcementDiscount',
  'isAnnouncementActive',
  'enableSmsNotifications',
  'smsGatewayProvider',
  'smsSenderId',
  'defaultCourierProvider',
  'publicSupportWhatsApp',
  'privateAdminAlertWhatsApp',
  'enableWhatsAppOrderAlerts',
  'whatsAppAlertProvider',
  'whatsAppAlertInstanceId',
  'whatsAppAlertWebhookUrl',
  'activePaymentGateways',
  'paymentGateways',
  'rateLimitEnabled',
  'rateLimitWindowMs',
  'rateLimitMaxRequests',
  'bypassAdminAndLocalhost',
  'serviceWorkerEnabled',
  'flashSaleEnabled',
  'flashSaleTitle',
  'flashSaleEndDate',
  'flashSaleDiscountPercent',
  'flashSaleProductIds',
  'vipMinTotalSpent',
  'vipMinOrderCount',
  'frequentBuyerMinOrders',
  'referralRewardAmount',
  'enableTieredLoyalty',
  'silverThreshold',
  'goldThreshold',
  'platinumThreshold',
  'silverCashback',
  'goldCashback',
  'platinumCashback',
  'defaultProductsPerPage',
  'vatRate',
  'vatEnabled',
  'vatPercentage',
  'vatInclusive',
  'taxRegistrationNumber',
  'orderPrefix',
  'maintenanceMode',
  'maintenanceMessage',
  'maintenanceAllowedIPs',
  'attendanceSettings',
  'notificationSettings'
]);

const NOTIFICATION_IMPORT_ALLOWLIST = new Set([
  'emailProvider',
  'resendFromEmail',
  'brevoFromEmail',
  'waEnabled'
]);

const PLATFORM_IMPORT_ALLOWLIST = new Set([
  'storeName',
  'currency',
  'currencySymbol',
  'timezone',
  'logoUrl',
  'faviconUrl'
]);

const CATEGORY_EXPORT_FIELDS = [
  'slug',
  'name',
  'description',
  'position',
  'isActive',
  'showInNavbar',
  'showInHomepage',
  'isFeatured',
  'color',
  'parentCategoryId'
];

const CATEGORY_IMPORT_FIELDS = new Set(CATEGORY_EXPORT_FIELDS.filter((f) => f !== 'slug'));

function isSecretKey(key) {
  return SECRET_KEY_PATTERN.test(String(key || ''));
}

function deepStripSecrets(value, depth = 0) {
  if (value == null || depth > 10) return value;
  if (Array.isArray(value)) {
    return value.map((item) => deepStripSecrets(item, depth + 1));
  }
  if (typeof value !== 'object') return value;

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSecretKey(key)) continue;
    out[key] = deepStripSecrets(child, depth + 1);
  }
  return out;
}

function sanitizeSettingsDocument(doc) {
  const plain = doc?.toObject ? doc.toObject() : { ...(doc || {}) };
  delete plain._id;
  delete plain.__v;
  delete plain.key;
  delete plain.createdAt;
  delete plain.updatedAt;
  delete plain.lastBackupAt;
  delete plain.lastPostgresBackupAt;

  const sanitized = deepStripSecrets(plain);

  if (sanitized.notificationSettings && typeof sanitized.notificationSettings === 'object') {
    const ns = {};
    for (const key of NOTIFICATION_IMPORT_ALLOWLIST) {
      if (sanitized.notificationSettings[key] !== undefined) {
        ns[key] = sanitized.notificationSettings[key];
      }
    }
    sanitized.notificationSettings = ns;
  }

  return sanitized;
}

function sanitizePlatformSettings(doc) {
  if (!doc) return {};
  const plain = doc.toObject ? doc.toObject() : { ...doc };
  const out = {};
  for (const key of PLATFORM_IMPORT_ALLOWLIST) {
    if (plain[key] !== undefined) out[key] = plain[key];
  }
  return out;
}

function pickCategoryExportRow(row) {
  if (!row) return null;
  const out = {};
  for (const field of CATEGORY_EXPORT_FIELDS) {
    if (row[field] !== undefined) out[field] = row[field];
  }
  if (!out.slug && row.slug) out.slug = row.slug;
  return out.slug ? out : null;
}

function pickImportableSettings(section = {}) {
  const out = {};
  for (const [key, value] of Object.entries(section)) {
    if (!SETTINGS_IMPORT_ALLOWLIST.has(key)) continue;
    if (key === 'notificationSettings' && value && typeof value === 'object') {
      const ns = {};
      for (const [nsKey, nsVal] of Object.entries(value)) {
        if (NOTIFICATION_IMPORT_ALLOWLIST.has(nsKey) && !isSecretKey(nsKey)) {
          ns[nsKey] = nsVal;
        }
      }
      out.notificationSettings = ns;
      continue;
    }
    if (!isSecretKey(key)) {
      out[key] = value;
    }
  }
  return out;
}

function pickImportablePlatform(section = {}) {
  const out = {};
  for (const key of PLATFORM_IMPORT_ALLOWLIST) {
    if (section[key] !== undefined) out[key] = section[key];
  }
  return out;
}

function validateImportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, message: 'Import file must be a JSON object.' };
  }

  if (payload.version !== EXPORT_VERSION) {
    return {
      valid: false,
      message: `Unsupported backup version (${payload.version ?? 'missing'}). Expected version ${EXPORT_VERSION}.`
    };
  }

  if (!payload.settings || typeof payload.settings !== 'object') {
    return { valid: false, message: 'Backup is missing the settings section.' };
  }

  return { valid: true };
}

module.exports = {
  EXPORT_VERSION,
  SETTINGS_IMPORT_ALLOWLIST,
  NOTIFICATION_IMPORT_ALLOWLIST,
  PLATFORM_IMPORT_ALLOWLIST,
  CATEGORY_EXPORT_FIELDS,
  CATEGORY_IMPORT_FIELDS,
  sanitizeSettingsDocument,
  sanitizePlatformSettings,
  pickCategoryExportRow,
  pickImportableSettings,
  pickImportablePlatform,
  validateImportPayload,
  isSecretKey
};
