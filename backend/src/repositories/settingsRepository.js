/********************************************************************
 * Project: EonlineBazar
 * File: settingsRepository.js
 * Location: backend/src/repositories/settingsRepository.js
 * Description: Prisma repository for Settings singleton + payment gateway children.
 *
 *   Stage 2 Step 3, Part 3 — CMS/Settings dual-write (2026-09-14).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

const SETTINGS_KEY = 'global';

const GATEWAY_KEYS = ['bKash', 'Nagad', 'Visa', 'MasterCard', 'COD'];

const SMS_PROVIDER_MAP = {
  'Greenweb BD': 'GREENWEB_BD',
  'BulkSMS BD': 'BULKSMS_BD',
  AlphaSMS: 'ALPHASMS',
  'Generic API': 'GENERIC_API'
};

const WHATSAPP_PROVIDER_MAP = {
  CallMeBot: 'CALLMEBOT',
  UltraMsg: 'ULTRAMSG',
  'Green API': 'GREEN_API',
  Generic: 'GENERIC'
};

function toSmsEnum(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  return SMS_PROVIDER_MAP[v] || null;
}

function toWhatsAppEnum(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  return WHATSAPP_PROVIDER_MAP[v] || null;
}

function toShape(record) {
  if (!record) return null;
  return { ...record, _id: record.id };
}

async function findByKey(key = SETTINGS_KEY) {
  const record = await prisma.settings.findUnique({
    where: { key },
    include: { paymentGateways: true }
  });
  return toShape(record);
}

async function ensureGlobalRow() {
  let row = await prisma.settings.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) {
    row = await prisma.settings.create({ data: { key: SETTINGS_KEY } });
  }
  return row;
}

async function replacePaymentGatewayRows(settingsId, paymentGatewaysObj = {}, client = prisma) {
  await client.settingsPaymentGateway.deleteMany({ where: { settingsId } });
  for (const gatewayKey of GATEWAY_KEYS) {
    const entry = paymentGatewaysObj[gatewayKey] || {};
    await client.settingsPaymentGateway.create({
      data: {
        settingsId,
        gatewayKey,
        enabled: entry.enabled !== false,
        name: String(entry.name || gatewayKey).trim(),
        logoUrl: String(entry.logoUrl || '').trim()
      }
    });
  }
}

class RevisionMismatchError extends Error {
  constructor(currentRevision) {
    super('REVISION_MISMATCH');
    this.name = 'RevisionMismatchError';
    this.code = 'REVISION_MISMATCH';
    this.currentRevision = Number(currentRevision) || 0;
  }
}

async function getRevisionId(key = SETTINGS_KEY) {
  const row = await prisma.settings.findUnique({
    where: { key },
    select: { revisionId: true }
  });
  return Number(row?.revisionId) || 0;
}

function mapScalars(doc) {
  const active = doc.activePaymentGateways || {};
  return {
    shopHomeCity: String(doc.shopHomeCity || 'Dhaka').trim(),
    deliveryInsideCity: doc.deliveryInsideCity ?? 60,
    deliveryOutsideCity: doc.deliveryOutsideCity ?? 120,
    freeShippingMinAmount: doc.freeShippingMinAmount ?? 1000,
    freeShippingThreshold: doc.freeShippingThreshold ?? doc.freeShippingMinAmount ?? null,
    cashbackPercentage: doc.cashbackPercentage ?? 1,
    takaToPointsRatio: doc.takaToPointsRatio ?? 100,
    pointsToTakaConversionRate: doc.pointsToTakaConversionRate ?? 10,
    refundUndoWindowHours: doc.refundUndoWindowHours ?? 72,
    announcementText: String(doc.announcementText || '').trim(),
    announcementDiscount: String(doc.announcementDiscount ?? '2000'),
    isAnnouncementActive: doc.isAnnouncementActive !== false,
    enableSmsNotifications: doc.enableSmsNotifications === true,
    smsGatewayProvider: toSmsEnum(doc.smsGatewayProvider),
    smsApiKey: String(doc.smsApiKey || '').trim(),
    smsSenderId: String(doc.smsSenderId || '').trim(),
    defaultCourierProvider: String(doc.defaultCourierProvider || '').trim(),
    courierApiKey: String(doc.courierApiKey || '').trim(),
    courierSecretKey: String(doc.courierSecretKey || '').trim(),
    publicSupportWhatsApp: String(doc.publicSupportWhatsApp || '').trim(),
    privateAdminAlertWhatsApp: String(doc.privateAdminAlertWhatsApp || '').trim(),
    enableWhatsAppOrderAlerts: doc.enableWhatsAppOrderAlerts === true,
    whatsAppAlertProvider: toWhatsAppEnum(doc.whatsAppAlertProvider),
    whatsAppAlertApiKey: String(doc.whatsAppAlertApiKey || '').trim(),
    whatsAppAlertInstanceId: String(doc.whatsAppAlertInstanceId || '').trim(),
    whatsAppAlertWebhookUrl: String(doc.whatsAppAlertWebhookUrl || '').trim(),
    activeGatewayBKash: active.bKash !== false,
    activeGatewayNagad: active.Nagad !== false,
    activeGatewayVisa: active.Visa !== false,
    activeGatewayMasterCard: active.MasterCard !== false,
    activeGatewayCod: active.COD !== false,
    rateLimitEnabled: doc.rateLimitEnabled !== false,
    rateLimitWindowMs: doc.rateLimitWindowMs ?? 900000,
    rateLimitMaxRequests: doc.rateLimitMaxRequests ?? 1000,
    bypassAdminAndLocalhost: doc.bypassAdminAndLocalhost !== false,
    sandboxMode: doc.sandboxMode === true,
    serviceWorkerEnabled: doc.serviceWorkerEnabled !== false,
    flashSaleEnabled: doc.flashSaleEnabled === true,
    flashSaleTitle: String(doc.flashSaleTitle || 'Flash Sale').trim(),
    flashSaleEndDate: doc.flashSaleEndDate ? new Date(doc.flashSaleEndDate) : null,
    flashSaleDiscountPercent: doc.flashSaleDiscountPercent ?? 0,
    flashSaleProductIds: Array.isArray(doc.flashSaleProductIds) ? doc.flashSaleProductIds : [],
    vipMinTotalSpent: doc.vipMinTotalSpent ?? 10000,
    vipMinOrderCount: doc.vipMinOrderCount ?? 5,
    frequentBuyerMinOrders: doc.frequentBuyerMinOrders ?? 3,
    referralRewardAmount: doc.referralRewardAmount ?? 100,
    enableTieredLoyalty: doc.enableTieredLoyalty === true,
    silverThreshold: doc.silverThreshold ?? 5000,
    goldThreshold: doc.goldThreshold ?? 15000,
    platinumThreshold: doc.platinumThreshold ?? 50000,
    silverCashback: doc.silverCashback ?? 1.5,
    goldCashback: doc.goldCashback ?? 2.5,
    platinumCashback: doc.platinumCashback ?? 4.0,
    defaultProductsPerPage: doc.defaultProductsPerPage ?? 24,
    vatRate: doc.vatRate ?? doc.vatPercentage ?? 0,
    vatEnabled: doc.vatEnabled === true,
    vatPercentage: doc.vatPercentage ?? doc.vatRate ?? 0,
    vatInclusive: doc.vatInclusive !== false,
    taxRegistrationNumber: String(doc.taxRegistrationNumber || '').trim(),
    lastBackupAt: doc.lastBackupAt ? new Date(doc.lastBackupAt) : null,
    orderPrefix: String(doc.orderPrefix || 'ORD').trim(),
    maintenanceMode: doc.maintenanceMode === true,
    maintenanceMessage: String(doc.maintenanceMessage || '').trim()
      || 'We are currently performing scheduled maintenance. Please check back soon.',
    revisionId: doc.revisionId != null ? Number(doc.revisionId) : undefined,
    taxSettings: doc.taxSettings && typeof doc.taxSettings === 'object' ? doc.taxSettings : {}
  };
}

function parseExpectedRevision(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Mirror a saved Mongoose Settings document to Postgres (global singleton). */
async function upsertFromMongo(mongoDoc) {
  return upsertPrimary(mongoDoc, { skipRevisionCheck: true, incrementRevision: false });
}

/**
 * PostgreSQL-primary upsert with optional optimistic revision check.
 * @returns {Promise<{ revisionId: number, row: object }>}
 */
async function upsertPrimary(mongoDoc, options = {}) {
  const {
    expectedRevision = null,
    skipRevisionCheck = false,
    incrementRevision = true
  } = options;

  const expected = parseExpectedRevision(expectedRevision);

  return prisma.$transaction(async (tx) => {
    let root = await tx.settings.findUnique({ where: { key: SETTINGS_KEY } });
    if (!root) {
      root = await tx.settings.create({ data: { key: SETTINGS_KEY, revisionId: 0 } });
    }

    const currentRev = Number(root.revisionId) || 0;

    if (!skipRevisionCheck && expected != null && expected !== currentRev) {
      throw new RevisionMismatchError(currentRev);
    }

    const nextRev = incrementRevision ? currentRev + 1 : currentRev;
    const scalars = mapScalars(mongoDoc);
    if (incrementRevision) {
      scalars.revisionId = nextRev;
    } else if (scalars.revisionId === undefined) {
      delete scalars.revisionId;
    }

    await tx.settings.update({
      where: { id: root.id },
      data: scalars
    });
    await replacePaymentGatewayRows(root.id, mongoDoc.paymentGateways || {}, tx);

    const row = await tx.settings.findUnique({
      where: { id: root.id },
      include: { paymentGateways: true }
    });

    return { revisionId: nextRev, row: toShape(row) };
  });
}

module.exports = {
  SETTINGS_KEY,
  findByKey,
  upsertFromMongo,
  upsertPrimary,
  getRevisionId,
  RevisionMismatchError,
  replacePaymentGatewayRows
};
