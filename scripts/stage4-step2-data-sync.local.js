#!/usr/bin/env node
'use strict';
/**
 * Stage 4 Step 2 — Postgres-only data sync (PageContent, FooterSettings, Settings).
 * Mongo read-only. No read-cutover flags.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const prisma = require('../backend/src/config/prismaClient');
const { upsertFromMongo } = require('../backend/src/repositories/footerSettingsRepository');

function toDate(value) {
  if (value == null) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function mapFooterMongoForUpsert(mongoDoc) {
  const plain = mongoDoc.toObject ? mongoDoc.toObject() : mongoDoc;
  return {
    copyrightText: plain.copyrightText,
    paymentBadgesEnabled: plain.paymentBadgesEnabled,
    columns: (plain.columns || []).map((col) => ({
      columnTitle: col.columnTitle,
      isActive: col.isActive,
      sortOrder: col.sortOrder,
      legacyId: col.legacyId != null ? String(col.legacyId) : String(col._id),
      links: (col.links || []).map((link) => ({
        label: link.label,
        url: link.url,
        isExternal: link.isExternal,
        isActive: link.isActive,
        legacyId: link.legacyId != null ? String(link.legacyId) : String(link._id)
      }))
    })),
    socialLinks: (plain.socialLinks || []).map((item) => ({
      platform: item.platform,
      iconName: item.iconName,
      iconUrl: item.iconUrl,
      linkUrl: item.linkUrl,
      isActive: item.isActive,
      sortOrder: item.sortOrder,
      legacyId: item.legacyId != null ? String(item.legacyId) : String(item._id)
    })),
    paymentGateways: (plain.paymentGateways || []).map((item) => ({
      name: item.name,
      iconUrl: item.iconUrl,
      iconName: item.iconName,
      isActive: item.isActive,
      sortOrder: item.sortOrder,
      legacyId: item.legacyId != null ? String(item.legacyId) : String(item._id)
    })),
    paymentBadges: Array.isArray(plain.paymentBadges)
      ? plain.paymentBadges
      : (plain.paymentGateways || []).map((g) => ({ name: g.name }))
  };
}

async function syncPageContentTimestamps(PageContent) {
  const mongoRows = await PageContent.find().lean();
  const updates = [];

  for (const m of mongoRows) {
    const legacyId = String(m._id);
    const pg = await prisma.pageContent.findUnique({ where: { legacyId } });
    if (!pg) throw new Error(`PageContent PG row missing for legacyId ${legacyId} (${m.slug})`);

    const createdAt = toDate(m.createdAt);
    const updatedAt = toDate(m.updatedAt);
    await prisma.pageContent.update({
      where: { id: pg.id },
      data: { createdAt, updatedAt }
    });
    updates.push({ slug: m.slug, legacyId, createdAt: createdAt?.toISOString(), updatedAt: updatedAt?.toISOString() });
  }

  return updates;
}

async function syncFooterSettings(FooterSettings) {
  const mongoDoc = await FooterSettings.getOrCreate();
  const mapped = mapFooterMongoForUpsert(mongoDoc);

  await upsertFromMongo(mapped, {
    replaceColumns: true,
    replaceSocialLinks: true,
    replacePaymentGateways: true,
    paymentBadgesMode: 'replace'
  });

  const root = await prisma.footerSettings.findUnique({ where: { key: 'global' } });
  await prisma.footerSettings.update({
    where: { id: root.id },
    data: {
      createdAt: toDate(mongoDoc.createdAt),
      updatedAt: toDate(mongoDoc.updatedAt)
    }
  });

  const colCount = await prisma.footerColumn.count({ where: { footerSettingsId: root.id } });
  const linkCount = await prisma.footerLink.count({
    where: { footerColumn: { footerSettingsId: root.id } }
  });
  const socialCount = await prisma.footerSocialLink.count({ where: { footerSettingsId: root.id } });
  const gwCount = await prisma.footerPaymentGateway.count({ where: { footerSettingsId: root.id } });
  const badgeCount = await prisma.footerPaymentBadge.count({ where: { footerSettingsId: root.id } });

  return {
    copyrightText: root.copyrightText,
    colCount,
    linkCount,
    socialCount,
    gwCount,
    badgeCount,
    createdAt: mongoDoc.createdAt,
    updatedAt: mongoDoc.updatedAt
  };
}

async function syncSettingsTimestamps(Settings) {
  const mongo = await Settings.getOrCreate();
  const pg = await prisma.settings.findUnique({ where: { key: 'global' } });
  if (!pg) throw new Error('Settings global row missing in Postgres');

  const thresholdBefore = pg.freeShippingThreshold;
  await prisma.settings.update({
    where: { id: pg.id },
    data: {
      createdAt: toDate(mongo.createdAt),
      updatedAt: toDate(mongo.updatedAt)
    }
  });

  const after = await prisma.settings.findUnique({ where: { key: 'global' } });
  return {
    createdAt: after.createdAt?.toISOString(),
    updatedAt: after.updatedAt?.toISOString(),
    freeShippingThresholdBefore: thresholdBefore != null ? Number(thresholdBefore) : null,
    freeShippingThresholdAfter: after.freeShippingThreshold != null ? Number(after.freeShippingThreshold) : null
  };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const PageContent = require('../backend/src/models/PageContent');
  const FooterSettings = require('../backend/src/models/FooterSettings');
  const Settings = require('../backend/src/models/Settings');

  console.log('=== A: PageContent timestamps ===');
  const pageUpdates = await syncPageContentTimestamps(PageContent);
  console.log(JSON.stringify({ count: pageUpdates.length, rows: pageUpdates }, null, 2));

  console.log('\n=== B: FooterSettings full resync ===');
  const footer = await syncFooterSettings(FooterSettings);
  console.log(JSON.stringify(footer, null, 2));

  console.log('\n=== C1-C2: Settings timestamps (C3 threshold unchanged) ===');
  const settings = await syncSettingsTimestamps(Settings);
  console.log(JSON.stringify(settings, null, 2));

  await mongoose.disconnect();
  await prisma.$disconnect();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
