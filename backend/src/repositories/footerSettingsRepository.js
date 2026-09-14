/********************************************************************
 * Project: EonlineBazar
 * File: footerSettingsRepository.js
 * Location: backend/src/repositories/footerSettingsRepository.js
 * Description: Prisma repository for FooterSettings singleton + child tables.
 *
 *   paymentBadges tri-state (audit-critical):
 *     paymentBadgesMode 'skip'     — field absent in Mongo request; do NOT touch
 *                                    FooterPaymentBadge rows in Postgres.
 *     paymentBadgesMode 'replace'  — explicit [] or synced list; delete+recreate
 *                                    badge rows (empty array → zero rows).
 *
 *   Stage 2 Step 3, Part 3 — CMS/Settings dual-write (2026-09-14).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

const FOOTER_SETTINGS_KEY = 'global';

function toShape(record) {
  if (!record) return null;
  return { ...record, _id: record.id };
}

async function findByKey(key = FOOTER_SETTINGS_KEY) {
  const record = await prisma.footerSettings.findUnique({
    where: { key },
    include: {
      columns: { include: { links: true }, orderBy: { sortOrder: 'asc' } },
      socialLinks: { orderBy: { sortOrder: 'asc' } },
      paymentGateways: { orderBy: { sortOrder: 'asc' } },
      paymentBadges: true
    }
  });
  return toShape(record);
}

async function ensureGlobalRow() {
  let row = await prisma.footerSettings.findUnique({ where: { key: FOOTER_SETTINGS_KEY } });
  if (!row) {
    row = await prisma.footerSettings.create({ data: { key: FOOTER_SETTINGS_KEY } });
  }
  return row;
}

async function replaceColumns(footerSettingsId, columns = []) {
  await prisma.footerColumn.deleteMany({ where: { footerSettingsId } });
  for (const col of columns) {
    const column = await prisma.footerColumn.create({
      data: {
        footerSettingsId,
        columnTitle: String(col.columnTitle || '').trim(),
        isActive: col.isActive !== false,
        sortOrder: Number(col.sortOrder) || 0,
        legacyId: col.legacyId != null ? String(col.legacyId) : null
      }
    });
    const links = Array.isArray(col.links) ? col.links : [];
    for (const link of links) {
      if (!link?.label) continue;
      await prisma.footerLink.create({
        data: {
          footerColumnId: column.id,
          label: String(link.label).trim(),
          url: String(link.url || '#').trim(),
          isExternal: link.isExternal === true,
          isActive: link.isActive !== false,
          legacyId: link.legacyId != null ? String(link.legacyId) : null
        }
      });
    }
  }
}

async function replaceSocialLinks(footerSettingsId, socialLinks = []) {
  await prisma.footerSocialLink.deleteMany({ where: { footerSettingsId } });
  for (const item of socialLinks) {
    if (!item?.platform) continue;
    await prisma.footerSocialLink.create({
      data: {
        footerSettingsId,
        platform: String(item.platform).trim(),
        iconName: String(item.iconName || '').trim(),
        iconUrl: String(item.iconUrl || '').trim(),
        linkUrl: String(item.linkUrl || '#').trim(),
        isActive: item.isActive !== false,
        sortOrder: Number(item.sortOrder) || 0,
        legacyId: item.legacyId != null ? String(item.legacyId) : null
      }
    });
  }
}

async function replacePaymentGateways(footerSettingsId, paymentGateways = []) {
  await prisma.footerPaymentGateway.deleteMany({ where: { footerSettingsId } });
  for (const item of paymentGateways) {
    if (!item?.name) continue;
    await prisma.footerPaymentGateway.create({
      data: {
        footerSettingsId,
        name: String(item.name).trim(),
        iconUrl: String(item.iconUrl || '').trim(),
        iconName: String(item.iconName || '').trim(),
        isActive: item.isActive !== false,
        sortOrder: Number(item.sortOrder) || 0,
        legacyId: item.legacyId != null ? String(item.legacyId) : null
      }
    });
  }
}

async function replacePaymentBadges(footerSettingsId, badges = []) {
  await prisma.footerPaymentBadge.deleteMany({ where: { footerSettingsId } });
  for (const item of badges) {
    const name = String(item?.name || item || '').trim();
    if (!name) continue;
    await prisma.footerPaymentBadge.create({
      data: { footerSettingsId, name }
    });
  }
}

/**
 * Upsert the global footer settings row from a saved Mongoose document.
 *
 * @param {object} mongoDoc — saved FooterSettings mongoose document (plain or doc)
 * @param {object} [options]
 * @param {boolean} [options.replaceColumns]
 * @param {boolean} [options.replaceSocialLinks]
 * @param {boolean} [options.replacePaymentGateways]
 * @param {'skip'|'replace'} [options.paymentBadgesMode] — tri-state handler
 */
async function upsertFromMongo(mongoDoc, options = {}) {
  const root = await ensureGlobalRow();

  const fields = {};
  if (mongoDoc.copyrightText !== undefined) {
    fields.copyrightText = String(mongoDoc.copyrightText || '').trim();
  }
  if (mongoDoc.paymentBadgesEnabled !== undefined) {
    fields.paymentBadgesEnabled = mongoDoc.paymentBadgesEnabled !== false;
  }

  if (Object.keys(fields).length) {
    await prisma.footerSettings.update({ where: { id: root.id }, data: fields });
  }

  if (options.replaceColumns) {
    await replaceColumns(root.id, mongoDoc.columns || []);
  }
  if (options.replaceSocialLinks) {
    await replaceSocialLinks(root.id, mongoDoc.socialLinks || []);
  }
  if (options.replacePaymentGateways) {
    await replacePaymentGateways(root.id, mongoDoc.paymentGateways || []);
  }

  if (options.paymentBadgesMode === 'replace') {
    let badges = [];
    if (Array.isArray(mongoDoc.paymentBadges)) {
      badges = mongoDoc.paymentBadges;
    } else if (Array.isArray(mongoDoc.paymentGateways) && mongoDoc.paymentGateways.length) {
      badges = mongoDoc.paymentGateways.map((g) => ({ name: g.name }));
    }
    await replacePaymentBadges(root.id, badges);
  }

  return findByKey(FOOTER_SETTINGS_KEY);
}

module.exports = {
  FOOTER_SETTINGS_KEY,
  findByKey,
  upsertFromMongo,
  replacePaymentBadges
};
