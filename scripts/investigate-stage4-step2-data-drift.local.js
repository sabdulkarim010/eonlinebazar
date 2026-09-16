#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 2 — READ-ONLY investigation: Mongo vs Postgres data drift
 * for PageContent, FooterSettings, Settings. No writes. No flag changes.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const prisma = require('../backend/src/config/prismaClient');

function iso(d) {
  if (d == null) return null;
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toISOString();
}

function eqVal(a, b) {
  if (a == null && b == null) return true;
  if (a instanceof Date || b instanceof Date) return iso(a) === iso(b);
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

function dec(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : String(v);
}

async function investigatePageContent() {
  const PageContent = require('../backend/src/models/PageContent');
  const mongoRows = await PageContent.find().sort({ slug: 1 }).lean();
  const pgRows = await prisma.pageContent.findMany({ orderBy: { slug: 'asc' } });

  const pgByLegacy = new Map();
  const pgBySlug = new Map();
  for (const r of pgRows) {
    if (r.legacyId) pgByLegacy.set(r.legacyId, r);
    pgBySlug.set(r.slug, r);
  }

  const timestampDiffs = [];
  const otherDiffs = [];
  const mongoOnly = [];
  const pgOnly = [];

  for (const m of mongoRows) {
    const legacy = String(m._id);
    const pg = pgByLegacy.get(legacy) || pgBySlug.get(m.slug);
    if (!pg) {
      mongoOnly.push({ slug: m.slug, legacyId: legacy });
      continue;
    }
    const row = {
      slug: m.slug,
      legacyId: legacy,
      pgId: pg.id,
      mongoUpdatedAt: iso(m.updatedAt),
      pgUpdatedAt: iso(pg.updatedAt),
      mongoCreatedAt: iso(m.createdAt),
      pgCreatedAt: iso(pg.createdAt),
      updatedAtMatch: iso(m.updatedAt) === iso(pg.updatedAt),
      createdAtMatch: iso(m.createdAt) === iso(pg.createdAt)
    };
    if (!row.updatedAtMatch || !row.createdAtMatch) timestampDiffs.push(row);

    const fields = ['title', 'subtitle', 'bodyMarkdown', 'bodyHtml', 'isPublished', 'sortOrder'];
    const fieldDiffs = {};
    for (const f of fields) {
      let mv = m[f];
      let pv = pg[f];
      if (f === 'isPublished') {
        mv = m.isPublished !== false;
        pv = pg.isPublished !== false;
      }
      if (!eqVal(mv, pv)) fieldDiffs[f] = { mongo: mv, pg: pv };
    }
    if (Object.keys(fieldDiffs).length) otherDiffs.push({ slug: m.slug, legacyId: legacy, fieldDiffs });
  }

  for (const pg of pgRows) {
    if (!pg.legacyId) {
      pgOnly.push({ slug: pg.slug, pgId: pg.id, legacyId: null });
      continue;
    }
    const found = mongoRows.find((m) => String(m._id) === pg.legacyId);
    if (!found) pgOnly.push({ slug: pg.slug, pgId: pg.id, legacyId: pg.legacyId });
  }

  return {
    mongoCount: mongoRows.length,
    pgCount: pgRows.length,
    timestampDiffs,
    otherFieldDiffs: otherDiffs,
    mongoOnly,
    pgOnly,
    pattern: timestampDiffs.length === mongoRows.length && mongoRows.length > 0
      ? 'ALL rows have timestamp drift (likely backfill/dual-write wrote PG timestamps at sync time)'
      : 'Partial timestamp drift'
  };
}

async function investigateFooterSettings() {
  const FooterSettings = require('../backend/src/models/FooterSettings');
  const mongoDoc = await FooterSettings.findOne({ key: 'global' }).lean();

  const pgRoot = await prisma.footerSettings.findUnique({
    where: { key: 'global' },
    include: {
      columns: { include: { links: true }, orderBy: { sortOrder: 'asc' } },
      socialLinks: { orderBy: { sortOrder: 'asc' } },
      paymentGateways: { orderBy: { sortOrder: 'asc' } },
      paymentBadges: true
    }
  });

  const mongoSummary = mongoDoc ? {
    copyrightText: mongoDoc.copyrightText,
    paymentBadgesEnabled: mongoDoc.paymentBadgesEnabled !== false,
    columnCount: (mongoDoc.columns || []).length,
    columns: (mongoDoc.columns || []).map((c) => ({
      _id: String(c._id),
      columnTitle: c.columnTitle,
      linkCount: (c.links || []).length,
      links: (c.links || []).map((l) => ({ _id: String(l._id), label: l.label, url: l.url }))
    })),
    socialLinkCount: (mongoDoc.socialLinks || []).length,
    paymentGatewayCount: (mongoDoc.paymentGateways || []).length,
    paymentBadgeCount: Array.isArray(mongoDoc.paymentBadges) ? mongoDoc.paymentBadges.length : 'undefined',
    updatedAt: iso(mongoDoc.updatedAt),
    createdAt: iso(mongoDoc.createdAt)
  } : null;

  const pgSummary = pgRoot ? {
    pgId: pgRoot.id,
    copyrightText: pgRoot.copyrightText,
    paymentBadgesEnabled: pgRoot.paymentBadgesEnabled !== false,
    columnCount: (pgRoot.columns || []).length,
    columns: (pgRoot.columns || []).map((c) => ({
      id: c.id,
      legacyId: c.legacyId,
      columnTitle: c.columnTitle,
      linkCount: (c.links || []).length,
      links: (c.links || []).map((l) => ({
        id: l.id,
        legacyId: l.legacyId,
        label: l.label,
        url: l.url
      }))
    })),
    socialLinkCount: (pgRoot.socialLinks || []).length,
    paymentGatewayCount: (pgRoot.paymentGateways || []).length,
    paymentBadgeCount: (pgRoot.paymentBadges || []).length,
    updatedAt: iso(pgRoot.updatedAt),
    createdAt: iso(pgRoot.createdAt)
  } : null;

  const testPatterns = [];
  if (pgRoot?.copyrightText && /test/i.test(pgRoot.copyrightText)) {
    testPatterns.push({
      type: 'copyrightText',
      value: pgRoot.copyrightText,
      note: 'Contains "test" — likely footerSettingsRepository tri-state test residue'
    });
  }

  const allPgColumns = await prisma.footerColumn.findMany({
    include: { links: true },
    orderBy: { sortOrder: 'asc' }
  });
  const allPgSocial = await prisma.footerSocialLink.findMany({ orderBy: { sortOrder: 'asc' } });
  const allPgGateways = await prisma.footerPaymentGateway.findMany({ orderBy: { sortOrder: 'asc' } });
  const allPgBadges = await prisma.footerPaymentBadge.findMany();

  for (const col of allPgColumns) {
    if (col.legacyId == null) {
      testPatterns.push({
        type: 'FooterColumn',
        pgId: col.id,
        footerSettingsId: col.footerSettingsId,
        columnTitle: col.columnTitle,
        note: 'legacyId null — possible test-created column'
      });
    }
  }

  const orphanColumns = pgRoot
    ? allPgColumns.filter((c) => c.footerSettingsId !== pgRoot.id)
    : allPgColumns;

  return {
    mongoSummary,
    pgSummary,
    testPatterns,
    orphanColumns: orphanColumns.map((c) => ({
      pgId: c.id,
      footerSettingsId: c.footerSettingsId,
      columnTitle: c.columnTitle,
      legacyId: c.legacyId,
      linkCount: c.links?.length || 0
    })),
    childTableCounts: {
      footerColumn: allPgColumns.length,
      footerLink: await prisma.footerLink.count(),
      footerSocialLink: allPgSocial.length,
      footerPaymentGateway: allPgGateways.length,
      footerPaymentBadge: allPgBadges.length
    },
    copyrightMatch: mongoSummary && pgSummary
      ? mongoSummary.copyrightText === pgSummary.copyrightText
      : null
  };
}

const SETTINGS_SCALAR_FIELDS = [
  'shopHomeCity', 'deliveryInsideCity', 'deliveryOutsideCity',
  'freeShippingMinAmount', 'freeShippingThreshold',
  'cashbackPercentage', 'takaToPointsRatio', 'pointsToTakaConversionRate', 'refundUndoWindowHours',
  'announcementText', 'announcementDiscount', 'isAnnouncementActive',
  'enableSmsNotifications', 'smsGatewayProvider', 'smsApiKey', 'smsSenderId',
  'defaultCourierProvider', 'courierApiKey', 'courierSecretKey',
  'publicSupportWhatsApp', 'privateAdminAlertWhatsApp',
  'enableWhatsAppOrderAlerts', 'whatsAppAlertProvider', 'whatsAppAlertApiKey',
  'whatsAppAlertInstanceId', 'whatsAppAlertWebhookUrl',
  'rateLimitEnabled', 'rateLimitWindowMs', 'rateLimitMaxRequests', 'bypassAdminAndLocalhost',
  'sandboxMode', 'serviceWorkerEnabled',
  'flashSaleEnabled', 'flashSaleTitle', 'flashSaleEndDate', 'flashSaleDiscountPercent',
  'vipMinTotalSpent', 'vipMinOrderCount', 'frequentBuyerMinOrders', 'referralRewardAmount',
  'enableTieredLoyalty', 'silverThreshold', 'goldThreshold', 'platinumThreshold',
  'silverCashback', 'goldCashback', 'platinumCashback',
  'defaultProductsPerPage', 'vatRate', 'vatEnabled', 'vatPercentage', 'vatInclusive',
  'taxRegistrationNumber', 'lastBackupAt', 'orderPrefix', 'maintenanceMode', 'maintenanceMessage'
];

const PG_SCALAR_MAP = {
  activeGatewayBKash: 'activePaymentGateways.bKash',
  activeGatewayNagad: 'activePaymentGateways.Nagad',
  activeGatewayVisa: 'activePaymentGateways.Visa',
  activeGatewayMasterCard: 'activePaymentGateways.MasterCard',
  activeGatewayCod: 'activePaymentGateways.COD'
};

function mongoSettingsValue(mongo, field) {
  if (field.startsWith('activePaymentGateways.')) {
    const key = field.split('.')[1];
    return mongo.activePaymentGateways?.[key] !== false;
  }
  let v = mongo[field];
  if (field === 'freeShippingThreshold' && (v == null || v === '')) {
    v = mongo.freeShippingMinAmount;
  }
  if (v instanceof Date) return iso(v);
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v;
  return v == null ? null : String(v);
}

function pgSettingsValue(pg, field) {
  if (field.startsWith('activePaymentGateways.')) {
    const key = field.split('.')[1];
    const map = {
      bKash: pg.activeGatewayBKash,
      Nagad: pg.activeGatewayNagad,
      Visa: pg.activeGatewayVisa,
      MasterCard: pg.activeGatewayMasterCard,
      COD: pg.activeGatewayCod
    };
    return map[key] !== false;
  }
  let v = pg[field];
  if (['deliveryInsideCity', 'deliveryOutsideCity', 'freeShippingMinAmount', 'freeShippingThreshold',
    'cashbackPercentage', 'silverCashback', 'goldCashback', 'platinumCashback', 'vatRate', 'vatPercentage'].includes(field)) {
    return dec(v);
  }
  if (v instanceof Date) return iso(v);
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v;
  return v == null ? null : String(v);
}

function effectiveMongoSettings(doc) {
  const m = doc.toObject ? doc.toObject() : doc;
  const out = { ...m };
  if (out.freeShippingThreshold == null || out.freeShippingThreshold === '') {
    out.freeShippingThreshold = out.freeShippingMinAmount;
  }
  return out;
}

async function investigateSettings() {
  const Settings = require('../backend/src/models/Settings');
  const mongoDoc = await Settings.getOrCreate();
  const mongo = effectiveMongoSettings(mongoDoc);
  const pg = await prisma.settings.findUnique({
    where: { key: 'global' },
    include: { paymentGateways: true }
  });

  const scalarDiffs = [];
  const allFields = [
    ...SETTINGS_SCALAR_FIELDS,
    ...Object.values(PG_SCALAR_MAP)
  ];

  for (const field of allFields) {
    const mv = mongoSettingsValue(mongo, field);
    const pv = pgSettingsValue(pg, field);
    const match = eqVal(mv, pv) || (dec(mv) === dec(pv));
    if (!match) {
      scalarDiffs.push({ field, mongo: mv, postgres: pv });
    }
  }

  const mongoGateways = mongo.paymentGateways || {};
  const pgGatewayRows = pg.paymentGateways || [];
  const gatewayDiffs = [];
  for (const key of ['bKash', 'Nagad', 'Visa', 'MasterCard', 'COD']) {
    const m = mongoGateways[key] || {};
    const p = pgGatewayRows.find((r) => r.gatewayKey === key) || {};
    const entry = { gatewayKey: key };
    let diff = false;
    if ((m.enabled !== false) !== (p.enabled !== false)) {
      entry.enabled = { mongo: m.enabled !== false, pg: p.enabled !== false };
      diff = true;
    }
    if (String(m.name || key).trim() !== String(p.name || '').trim()) {
      entry.name = { mongo: m.name || key, pg: p.name || '' };
      diff = true;
    }
    if (String(m.logoUrl || '').trim() !== String(p.logoUrl || '').trim()) {
      entry.logoUrl = { mongo: m.logoUrl || '', pg: p.logoUrl || '' };
      diff = true;
    }
    if (diff) gatewayDiffs.push(entry);
  }

  const flashIdsMatch = JSON.stringify(mongo.flashSaleProductIds || [])
    === JSON.stringify(pg.flashSaleProductIds || []);

  const deliveryCritical = {};
  for (const k of ['freeShippingMinAmount', 'freeShippingThreshold', 'deliveryInsideCity', 'deliveryOutsideCity', 'shopHomeCity']) {
    deliveryCritical[k] = {
      mongo: dec(mongoSettingsValue(mongo, k)),
      postgres: dec(pgSettingsValue(pg, k))
    };
  }

  return {
    mongoId: String(mongo._id),
    pgId: pg.id,
    mongoUpdatedAt: iso(mongo.updatedAt),
    pgUpdatedAt: iso(pg.updatedAt),
    mongoCreatedAt: iso(mongo.createdAt),
    pgCreatedAt: iso(pg.createdAt),
    deliveryCritical,
    scalarDiffCount: scalarDiffs.length,
    scalarDiffs,
    gatewayDiffs,
    flashSaleProductIdsMatch: flashIdsMatch,
    mongoFlashSaleProductIds: mongo.flashSaleProductIds,
    pgFlashSaleProductIds: pg.flashSaleProductIds,
    priority: scalarDiffs.filter((d) =>
      ['freeShippingMinAmount', 'freeShippingThreshold', 'deliveryInsideCity', 'deliveryOutsideCity',
        'cashbackPercentage', 'announcementText', 'announcementDiscount', 'isAnnouncementActive'].includes(d.field)
    ),
    note: 'Mongo compared via Settings.getOrCreate().toObject() (effective app values, not sparse .lean())'
  };
}

async function investigateSettingsShapeParity() {
  const Settings = require('../backend/src/models/Settings');
  const { settingsToMongoShape } = require('../backend/src/services/readShapeHelpers');
  const { resolveFreeShippingThreshold } = require('../backend/src/utils/announcementSettings');
  const { toPublicSettings } = require('../backend/src/services/deliveryChargeService');

  const doc = await Settings.getOrCreate();
  const m = effectiveMongoSettings(doc);
  const pg = await prisma.settings.findUnique({
    where: { key: 'global' },
    include: { paymentGateways: true }
  });
  const shaped = settingsToMongoShape(pg);

  const skip = new Set(['_id', '__v', 'key', 'createdAt', 'updatedAt']);
  const shapeDiffs = [];
  const allKeys = new Set([...Object.keys(m), ...Object.keys(shaped || {})]);
  for (const k of [...allKeys].sort()) {
    if (skip.has(k) || k === 'paymentGateways' || k === 'activePaymentGateways') continue;
    const mv = m[k];
    const sv = shaped[k];
    if (!eqVal(mv, sv) && JSON.stringify(mv) !== JSON.stringify(sv)) {
      shapeDiffs.push({ field: k, mongoEffective: mv, pgShaped: sv });
    }
  }

  return {
    resolveFreeShippingThresholdBug: {
      mongoThresholdStored: doc.freeShippingThreshold,
      mongoMinAmount: doc.freeShippingMinAmount,
      resolveReturns: resolveFreeShippingThreshold(doc, doc.freeShippingMinAmount),
      toPublicSettingsMongo: toPublicSettings(doc),
      toPublicSettingsPgShaped: toPublicSettings(shaped),
      explanation: 'Mongo stores freeShippingThreshold=null; resolveFreeShippingThreshold treats Number(null) as 0 — verification diff is read-path logic, not Postgres storing wrong delivery data'
    },
    shapeDiffsAfterEffectiveMongo: shapeDiffs
  };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  console.log('\n========== PAGECONTENT ==========\n');
  const page = await investigatePageContent();
  console.log(JSON.stringify(page, null, 2));

  console.log('\n========== FOOTERSETTINGS ==========\n');
  const footer = await investigateFooterSettings();
  console.log(JSON.stringify(footer, null, 2));

  console.log('\n========== SETTINGS (FULL FIELD AUDIT) ==========\n');
  const settings = await investigateSettings();
  console.log(JSON.stringify(settings, null, 2));

  console.log('\n========== SETTINGS SHAPE / READ-PATH ANALYSIS ==========\n');
  const settingsShape = await investigateSettingsShapeParity();
  console.log(JSON.stringify(settingsShape, null, 2));

  await mongoose.disconnect();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
