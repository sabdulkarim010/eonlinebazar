/********************************************************************
 * Project: EonlineBazar
 * File: bannerRepository.js
 * Location: backend/src/repositories/bannerRepository.js
 * Description: Prisma repository for Banner + BannerSettings singleton.
 *
 *   Stage 2 Step 3, Part 3 — CMS/Settings dual-write (2026-09-14).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

const BANNER_SETTINGS_KEY = 'global';

function clampOverlayOpacity(value, fallback = 0.3) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function toBannerTransition(value) {
  return String(value || '').toLowerCase() === 'fade' ? 'FADE' : 'SLIDE';
}

function fromBannerTransition(value) {
  return value === 'FADE' ? 'fade' : 'slide';
}

function toBannerShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.id,
    overlayOpacity: record.overlayOpacity != null ? Number(record.overlayOpacity) : 0.3
  };
}

function toSettingsShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.id,
    transitionEffect: fromBannerTransition(record.transitionEffect)
  };
}

async function findAllBanners(filters = {}) {
  const where = {};
  if (filters.isActive !== undefined) where.isActive = filters.isActive;

  const records = await prisma.banner.findMany({
    where,
    orderBy: { position: 'asc' }
  });
  return records.map(toBannerShape);
}

async function findBannerById(id) {
  if (!id) return null;
  const record = await prisma.banner.findUnique({ where: { id } });
  return toBannerShape(record);
}

async function findBannerByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.banner.findUnique({
    where: { legacyId: String(legacyId) }
  });
  return toBannerShape(record);
}

async function createBanner(data) {
  const record = await prisma.banner.create({
    data: {
      title: String(data.title || '').trim(),
      subtitle: String(data.subtitle || '').trim(),
      imageUrl: data.imageUrl ?? null,
      mobileImageUrl: data.mobileImageUrl ?? null,
      backgroundColor: data.backgroundColor ?? null,
      linkUrl: data.linkUrl ?? null,
      linkText: String(data.linkText || 'Shop Now').trim(),
      textColor: String(data.textColor || '#ffffff').trim(),
      overlayOpacity: clampOverlayOpacity(data.overlayOpacity, 0.3),
      position: data.position !== undefined ? Number(data.position) : 0,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
      impressionCount: data.impressionCount !== undefined ? Number(data.impressionCount) : 0,
      clickCount: data.clickCount !== undefined ? Number(data.clickCount) : 0,
      legacyId: data.legacyId != null ? String(data.legacyId) : null
    }
  });
  return toBannerShape(record);
}

async function updateBanner(id, data) {
  const existing = await prisma.banner.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Banner not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  if (data.title !== undefined) fields.title = String(data.title).trim();
  if (data.subtitle !== undefined) fields.subtitle = String(data.subtitle).trim();
  if (data.imageUrl !== undefined) fields.imageUrl = data.imageUrl;
  if (data.mobileImageUrl !== undefined) fields.mobileImageUrl = data.mobileImageUrl;
  if (data.backgroundColor !== undefined) fields.backgroundColor = data.backgroundColor;
  if (data.linkUrl !== undefined) fields.linkUrl = data.linkUrl;
  if (data.linkText !== undefined) fields.linkText = String(data.linkText).trim();
  if (data.textColor !== undefined) fields.textColor = String(data.textColor).trim();
  if (data.overlayOpacity !== undefined) {
    fields.overlayOpacity = clampOverlayOpacity(data.overlayOpacity, Number(existing.overlayOpacity));
  }
  if (data.position !== undefined) fields.position = Number(data.position);
  if (data.isActive !== undefined) fields.isActive = Boolean(data.isActive);
  if (data.impressionCount !== undefined) fields.impressionCount = Number(data.impressionCount);
  if (data.clickCount !== undefined) fields.clickCount = Number(data.clickCount);

  const record = await prisma.banner.update({ where: { id }, data: fields });
  return toBannerShape(record);
}

async function removeBanner(id) {
  const existing = await prisma.banner.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Banner not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await prisma.banner.delete({ where: { id } });
  return { deleted: true };
}

async function findBannerSettings() {
  const record = await prisma.bannerSettings.findUnique({
    where: { key: BANNER_SETTINGS_KEY }
  });
  return toSettingsShape(record);
}

async function upsertBannerSettings(data) {
  const record = await prisma.bannerSettings.upsert({
    where: { key: BANNER_SETTINGS_KEY },
    create: {
      key: BANNER_SETTINGS_KEY,
      autoPlay: data.autoPlay !== false && data.autoPlay !== 'false',
      autoPlayInterval: Number.isFinite(Number(data.autoPlayInterval))
        ? Number(data.autoPlayInterval)
        : 4000,
      showDots: data.showDots !== false && data.showDots !== 'false',
      showArrows: data.showArrows !== false && data.showArrows !== 'false',
      height: String(data.height || '300px'),
      mobileHeight: String(data.mobileHeight || '200px'),
      transitionEffect: toBannerTransition(data.transitionEffect),
      updatedAt: new Date()
    },
    update: {
      autoPlay: data.autoPlay !== false && data.autoPlay !== 'false',
      autoPlayInterval: Number.isFinite(Number(data.autoPlayInterval))
        ? Number(data.autoPlayInterval)
        : 4000,
      showDots: data.showDots !== false && data.showDots !== 'false',
      showArrows: data.showArrows !== false && data.showArrows !== 'false',
      height: String(data.height || '300px'),
      mobileHeight: String(data.mobileHeight || '200px'),
      transitionEffect: toBannerTransition(data.transitionEffect),
      updatedAt: new Date()
    }
  });
  return toSettingsShape(record);
}

module.exports = {
  BANNER_SETTINGS_KEY,
  findAllBanners,
  findBannerById,
  findBannerByLegacyId,
  createBanner,
  updateBanner,
  removeBanner,
  findBannerSettings,
  upsertBannerSettings
};
