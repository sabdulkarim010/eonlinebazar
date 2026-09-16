/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: readShapeHelpers.js
 * Location: backend/src/services/readShapeHelpers.js
 * Description: Transform Postgres repository rows into the exact Mongoose
 *   .lean() shape API callers expect (_id = legacy Mongo ObjectId, etc.).
 ********************************************************************/

'use strict';

/** Replicates category.js / categoryRepository slug hook (no Prisma import). */
function slugifyCategory(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09FF\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/** Mongo _id from a backfilled Postgres row (legacyId holds the original _id). */
function mongoIdFromRow(row) {
  if (!row) return null;
  return row.legacyId != null ? String(row.legacyId) : String(row._id || row.id);
}

function normalisePoStatus(status) {
  if (!status) return status;
  const s = String(status).toLowerCase();
  if (s === 'partial_received') return 'partial';
  return s;
}

function decimalToNumber(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Mongoose __v on .lean() docs — verified 2026-09-15: all group-1 production rows are 0. */
const MONGOOSE_DOC_VERSION = 0;

// ── Category ────────────────────────────────────────────────────────────────

function buildCategoryIdMaps(rows) {
  const pgIdToLegacy = new Map();
  const pgIdToRow = new Map();
  (rows || []).forEach((row) => {
    pgIdToLegacy.set(row.id, mongoIdFromRow(row));
    pgIdToRow.set(row.id, row);
  });
  return { pgIdToLegacy, pgIdToRow };
}

function categoryToMongoShape(pgRow, maps, options = {}) {
  if (!pgRow) return null;

  const { pgIdToLegacy, pgIdToRow } = maps || buildCategoryIdMaps([pgRow]);
  const _id = mongoIdFromRow(pgRow);

  let parentCategory;
  const parentPgId = pgRow.parentCategoryId ?? pgRow.parentCategory ?? null;
  if (parentPgId) {
    if (options.populateParent) {
      const parentRow = pgIdToRow.get(parentPgId);
      if (parentRow) {
        parentCategory = { _id: mongoIdFromRow(parentRow), name: parentRow.name };
      }
    } else {
      const parentLegacy = pgIdToLegacy.get(parentPgId);
      if (parentLegacy) parentCategory = parentLegacy;
    }
  }

  const out = {
    _id,
    name: pgRow.name,
    slug: pgRow.slug,
    description: pgRow.description ?? '',
    color: pgRow.color ?? '#f97316',
    isActive: pgRow.isActive !== false,
    isFeatured: !!pgRow.isFeatured,
    showInNavbar: pgRow.showInNavbar !== false,
    showInHomepage: !!pgRow.showInHomepage,
    position: pgRow.position ?? 0,
    metaTitle: pgRow.metaTitle ?? '',
    metaDescription: pgRow.metaDescription ?? '',
    productCount: pgRow.productCount ?? 0,
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };

  // Tier 1 — omit keys Mongo .lean() omits when unset (null / no parent)
  if (pgRow.imageUrl != null) out.imageUrl = pgRow.imageUrl;
  if (pgRow.iconUrl != null) out.iconUrl = pgRow.iconUrl;
  if (pgRow.bannerImageUrl != null) out.bannerImageUrl = pgRow.bannerImageUrl;
  const customCashback = decimalToNumber(pgRow.customCashback);
  if (customCashback != null) out.customCashback = customCashback;
  if (parentCategory !== undefined) out.parentCategory = parentCategory;

  return out;
}

function categoryTreeSelectFields(cat) {
  const out = {
    _id: cat._id,
    name: cat.name,
    slug: cat.slug,
    description: cat.description,
    color: cat.color,
    position: cat.position,
    productCount: cat.productCount,
    showInNavbar: cat.showInNavbar,
    showInHomepage: cat.showInHomepage,
    isFeatured: cat.isFeatured
  };
  if (cat.imageUrl != null) out.imageUrl = cat.imageUrl;
  if (cat.iconUrl != null) out.iconUrl = cat.iconUrl;
  if (cat.parentCategory != null) out.parentCategory = cat.parentCategory;
  return out;
}

function matchCategoryBySlugParam(categories, rawParam) {
  const slug = String(rawParam || '').trim().toLowerCase();
  if (!slug) return null;

  if (/^[a-f0-9]{24}$/i.test(rawParam)) {
    const byId = categories.find((c) => String(c._id) === String(rawParam));
    if (byId) return byId;
  }

  let category = categories.find((c) => String(c.slug || '').toLowerCase() === slug) || null;
  if (category) return category;

  return categories.find((cat) => {
    const catSlug = String(cat.slug || '').toLowerCase();
    if (catSlug && catSlug === slug) return true;
    const fromName = slugifyCategory(cat.name);
    return fromName === slug;
  }) || null;
}

function mapCategoriesToMongo(rows, options = {}) {
  const maps = buildCategoryIdMaps(rows);
  return rows.map((row) => categoryToMongoShape(row, maps, options));
}

function mapCategoriesToMongoPopulated(rows) {
  return mapCategoriesToMongo(rows, { populateParent: true });
}

// ── Brand ───────────────────────────────────────────────────────────────────

function brandToMongoShape(pgRow) {
  if (!pgRow) return null;
  return {
    _id: mongoIdFromRow(pgRow),
    name: pgRow.name,
    slug: pgRow.slug ?? '',
    description: pgRow.description ?? '',
    status: pgRow.status === 'INACTIVE' || pgRow.status === 'inactive' ? 'inactive' : 'active',
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };
}

function mapBrandsToMongo(rows) {
  return (rows || []).map(brandToMongoShape);
}

// ── Supplier ────────────────────────────────────────────────────────────────

function supplierToMongoShape(pgRow) {
  if (!pgRow) return null;
  const out = {
    _id: mongoIdFromRow(pgRow),
    name: pgRow.name,
    contactPerson: pgRow.contactPerson ?? '',
    phone: pgRow.phone ?? '',
    email: pgRow.email ?? '',
    address: pgRow.address ?? '',
    notes: pgRow.notes ?? '',
    status: pgRow.status === 'INACTIVE' || pgRow.status === 'inactive' ? 'inactive' : 'active',
    suppliedProducts: pgRow.suppliedProducts ?? [],
    createdBy: pgRow.createdById ?? pgRow.createdBy ?? null,
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };
  if (pgRow.purchaseOrders) {
    out.purchaseOrders = pgRow.purchaseOrders.map(purchaseOrderToMongoShape);
  }
  return out;
}

function purchaseOrderToMongoShape(pgPo) {
  if (!pgPo) return pgPo;
  return {
    _id: mongoIdFromRow(pgPo),
    poNumber: pgPo.poNumber,
    status: normalisePoStatus(pgPo.status),
    totalCost: decimalToNumber(pgPo.totalCost) ?? pgPo.totalCost,
    expectedDate: pgPo.expectedDate ?? null,
    receivedDate: pgPo.receivedDate ?? null,
    createdAt: pgPo.createdAt,
    __v: MONGOOSE_DOC_VERSION
  };
}

function mapSuppliersToMongo(rows) {
  return (rows || []).map(supplierToMongoShape);
}

// ── Warehouse ───────────────────────────────────────────────────────────────

function warehouseToMongoShape(pgRow) {
  if (!pgRow) return null;
  return {
    _id: mongoIdFromRow(pgRow),
    name: pgRow.name,
    location: pgRow.location ?? '',
    address: pgRow.address ?? '',
    managerName: pgRow.managerName ?? '',
    phone: pgRow.phone ?? '',
    isDefault: !!pgRow.isDefault,
    status: pgRow.status === 'INACTIVE' || pgRow.status === 'inactive' ? 'inactive' : 'active',
    createdBy: pgRow.createdById ?? pgRow.createdBy ?? null,
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };
}

function mapWarehousesToMongo(rows) {
  return (rows || []).map(warehouseToMongoShape);
}

// ── Designation ─────────────────────────────────────────────────────────────

function designationToMongoShape(pgRow) {
  if (!pgRow) return null;
  const out = {
    _id: mongoIdFromRow(pgRow),
    name: pgRow.name,
    department: pgRow.department ?? 'Operations',
    description: pgRow.description ?? '',
    isActive: pgRow.isActive !== false,
    createdBy: pgRow.createdBy ?? '',
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };
  if (pgRow.employeeCount !== undefined) {
    out.employeeCount = pgRow.employeeCount;
  }
  return out;
}

function mapDesignationsToMongo(rows) {
  return (rows || []).map(designationToMongoShape);
}

// ── PageContent ─────────────────────────────────────────────────────────────

function decodeHtmlEntities(value) {
  let html = String(value ?? '');
  if (!html) return '';
  const map = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&apos;': "'"
  };
  for (let i = 0; i < 3; i += 1) {
    if (!/&(?:amp|lt|gt|quot|apos|#39|#x27);/i.test(html)) break;
    const next = html.replace(/&(?:amp|lt|gt|quot|apos|#39|#x27);/gi, (m) => map[m.toLowerCase()] || map[m] || m);
    if (next === html) break;
    html = next;
  }
  return html;
}

function pageContentFormat(pgRow) {
  const raw = pgRow.contentFormat;
  return raw === 'HTML' || raw === 'html' ? 'html' : 'markdown';
}

function pageContentToAdminShape(pgRow) {
  if (!pgRow) return null;
  const _id = mongoIdFromRow(pgRow);
  const out = {
    id: String(_id),
    slug: pgRow.slug,
    title: pgRow.title,
    subtitle: pgRow.subtitle || '',
    bodyMarkdown: pgRow.bodyMarkdown || '',
    bodyHtml: pgRow.bodyHtml || '',
    contentFormat: pageContentFormat(pgRow),
    isPublished: pgRow.isPublished !== false,
    isActive: pgRow.isPublished !== false,
    sortOrder: Number(pgRow.sortOrder) || 0,
    updatedAt: pgRow.updatedAt
  };
  if (pgRow.slug === 'contact') {
    const meta = pgRow.contactMeta || {};
    out.contactMeta = {
      address: meta.address ?? pgRow.contactMetaAddress ?? '',
      phone: meta.phone ?? pgRow.contactMetaPhone ?? '',
      email: meta.email ?? pgRow.contactMetaEmail ?? '',
      hours: meta.hours ?? pgRow.contactMetaHours ?? '',
      mapEmbedUrl: meta.mapEmbedUrl ?? pgRow.contactMetaMapEmbedUrl ?? ''
    };
  }
  return out;
}

/** Public shape — uses stored bodyHtml only (no markdown re-render on read). */
function pageContentToPublicShape(pgRow) {
  if (!pgRow) return null;
  if (pgRow.isPublished === false) return null;
  const html = decodeHtmlEntities(pgRow.bodyHtml || '');
  const out = {
    slug: pgRow.slug,
    title: pgRow.title,
    subtitle: pgRow.subtitle || '',
    bodyHtml: html,
    content: html,
    contentFormat: pageContentFormat(pgRow),
    isPublished: pgRow.isPublished !== false,
    updatedAt: pgRow.updatedAt
  };
  if (pgRow.slug === 'contact') {
    const meta = pgRow.contactMeta || {};
    out.contactMeta = {
      address: meta.address ?? pgRow.contactMetaAddress ?? '',
      phone: meta.phone ?? pgRow.contactMetaPhone ?? '',
      email: meta.email ?? pgRow.contactMetaEmail ?? '',
      hours: meta.hours ?? pgRow.contactMetaHours ?? '',
      mapEmbedUrl: meta.mapEmbedUrl ?? pgRow.contactMetaMapEmbedUrl ?? ''
    };
  }
  return out;
}

function mapPageContentsToAdminShape(rows) {
  return (rows || []).map(pageContentToAdminShape).filter(Boolean);
}

// ── NavbarLink ──────────────────────────────────────────────────────────────

function navbarLinkToAdminShape(pgRow) {
  if (!pgRow) return null;
  const _id = mongoIdFromRow(pgRow);
  return {
    id: String(_id),
    _id,
    title: pgRow.title,
    url: pgRow.url,
    slug: pgRow.slug || '',
    target: pgRow.target === 'BLANK' || pgRow.target === '_blank' ? '_blank' : '_self',
    isPublished: pgRow.isPublished === true,
    hasCustomPage: pgRow.hasCustomPage === true,
    pageHtml: pgRow.hasCustomPage === true ? (pgRow.pageHtml || '') : '',
    sortOrder: Number(pgRow.sortOrder) || 0,
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt
  };
}

function navbarLinkToPublicShape(pgRow) {
  if (!pgRow) return null;
  const _id = mongoIdFromRow(pgRow);
  return {
    id: String(_id),
    _id,
    title: pgRow.title,
    url: pgRow.url,
    slug: pgRow.slug || '',
    target: pgRow.target === 'BLANK' || pgRow.target === '_blank' ? '_blank' : '_self',
    hasCustomPage: pgRow.hasCustomPage === true,
    sortOrder: Number(pgRow.sortOrder) || 0
  };
}

function mapNavbarLinksToAdminShape(rows) {
  return (rows || []).map(navbarLinkToAdminShape).filter(Boolean);
}

function mapNavbarLinksToPublicShape(rows) {
  return (rows || []).map(navbarLinkToPublicShape).filter(Boolean);
}

// ── FooterSettings ──────────────────────────────────────────────────────────

const { sanitizeFooterIconUrl } = require('../utils/footerIconPaths');
const { DEFAULT_COPYRIGHT } = require('../models/FooterSettings');

function footerChildId(row) {
  if (!row) return '';
  return row.legacyId != null ? String(row.legacyId) : String(row.id);
}

function mapFooterColumnsAdmin(columns = []) {
  return columns.map((col) => ({
    id: footerChildId(col),
    columnTitle: col.columnTitle,
    isActive: col.isActive !== false,
    sortOrder: Number(col.sortOrder) || 0,
    links: (col.links || []).map((link) => ({
      id: footerChildId(link),
      label: link.label,
      url: link.url,
      isExternal: link.isExternal === true,
      isActive: link.isActive !== false
    }))
  }));
}

function mapFooterSocialLinksAdmin(socialLinks = []) {
  return socialLinks.map((item) => ({
    id: footerChildId(item),
    platform: item.platform,
    iconName: item.iconName || '',
    iconUrl: sanitizeFooterIconUrl(item.iconUrl || ''),
    linkUrl: item.linkUrl || '#',
    isActive: item.isActive !== false,
    sortOrder: Number(item.sortOrder) || 0
  }));
}

function mapFooterPaymentGatewaysAdmin(paymentGateways = []) {
  return paymentGateways.map((item) => ({
    id: footerChildId(item),
    name: item.name,
    iconUrl: sanitizeFooterIconUrl(item.iconUrl || ''),
    iconName: item.iconName || '',
    isActive: item.isActive !== false,
    sortOrder: Number(item.sortOrder) || 0
  }));
}

function getActivePaymentGatewaysFromPg(pgRow) {
  if (!pgRow || pgRow.paymentBadgesEnabled === false) return [];

  return (pgRow.paymentGateways || [])
    .filter((item) => item.isActive !== false && item.name)
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
    .map((item) => ({
      name: String(item.name).trim(),
      iconUrl: sanitizeFooterIconUrl(item.iconUrl || ''),
      iconName: item.iconName || String(item.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
    }))
    .filter((item) => item.name);
}

/** Zero FooterPaymentBadge rows → [] on read (tri-state distinction is write-time only). */
function getPaymentBadgesFromPg(pgRow) {
  if (!pgRow || pgRow.paymentBadgesEnabled === false) return [];

  const fromGateways = getActivePaymentGatewaysFromPg(pgRow).map((item) => ({ name: item.name }));
  if (fromGateways.length || (pgRow.paymentGateways || []).length) {
    return fromGateways;
  }

  return (pgRow.paymentBadges || [])
    .map((item) => ({ name: String(item?.name || '').trim() }))
    .filter((item) => item.name);
}

function footerSettingsToAdminShape(pgRow) {
  if (!pgRow) return null;
  return {
    columns: mapFooterColumnsAdmin(pgRow.columns || []),
    socialLinks: mapFooterSocialLinksAdmin(pgRow.socialLinks || []),
    copyrightText: pgRow.copyrightText || DEFAULT_COPYRIGHT,
    paymentBadgesEnabled: pgRow.paymentBadgesEnabled !== false,
    paymentGateways: mapFooterPaymentGatewaysAdmin(pgRow.paymentGateways || []),
    paymentBadges: getPaymentBadgesFromPg(pgRow),
    updatedAt: pgRow.updatedAt
  };
}

function footerSettingsToPublicShape(pgRow) {
  if (!pgRow) return null;
  const sortByOrder = (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);

  const columns = (pgRow.columns || [])
    .filter((col) => col.isActive !== false)
    .sort(sortByOrder)
    .map((col) => ({
      columnTitle: col.columnTitle,
      links: (col.links || [])
        .filter((link) => link.isActive !== false)
        .map((link) => ({
          label: link.label,
          url: link.url,
          isExternal: link.isExternal === true
        }))
    }))
    .filter((col) => col.links.length > 0);

  const socialLinks = (pgRow.socialLinks || [])
    .filter((item) => item.isActive !== false && item.linkUrl)
    .sort(sortByOrder)
    .map((item) => ({
      platform: item.platform,
      iconName: item.iconName || '',
      iconUrl: sanitizeFooterIconUrl(item.iconUrl || ''),
      linkUrl: item.linkUrl
    }));

  const paymentGateways = getActivePaymentGatewaysFromPg(pgRow);
  const paymentBadges = paymentGateways.map((badge) => ({ name: badge.name }));

  return {
    columns,
    socialLinks,
    copyrightText: pgRow.copyrightText || DEFAULT_COPYRIGHT,
    paymentBadgesEnabled: pgRow.paymentBadgesEnabled !== false,
    paymentGateways,
    paymentBadges
  };
}

// ── Banner + BannerSettings ─────────────────────────────────────────────────

function bannerToMongoShape(pgRow) {
  if (!pgRow) return null;
  return {
    _id: mongoIdFromRow(pgRow),
    title: pgRow.title ?? '',
    subtitle: pgRow.subtitle ?? '',
    imageUrl: pgRow.imageUrl ?? null,
    mobileImageUrl: pgRow.mobileImageUrl ?? null,
    backgroundColor: pgRow.backgroundColor ?? null,
    linkUrl: pgRow.linkUrl ?? null,
    linkText: pgRow.linkText ?? 'Shop Now',
    textColor: pgRow.textColor ?? '#ffffff',
    overlayOpacity: decimalToNumber(pgRow.overlayOpacity) ?? 0.3,
    position: pgRow.position ?? 0,
    isActive: pgRow.isActive !== false,
    createdAt: pgRow.createdAt,
    __v: MONGOOSE_DOC_VERSION
  };
}

function mapBannersToMongo(rows) {
  return (rows || []).map(bannerToMongoShape).filter(Boolean);
}

function bannerSettingsToMongoShape(pgRow) {
  if (!pgRow) return null;
  const transition = pgRow.transitionEffect;
  return {
    autoPlay: pgRow.autoPlay !== false,
    autoPlayInterval: pgRow.autoPlayInterval ?? 4000,
    showDots: pgRow.showDots !== false,
    showArrows: pgRow.showArrows !== false,
    height: pgRow.height ?? '300px',
    mobileHeight: pgRow.mobileHeight ?? '200px',
    transitionEffect: transition === 'FADE' || transition === 'fade' ? 'fade' : 'slide',
    updatedAt: pgRow.updatedAt
  };
}

// ── Settings singleton ────────────────────────────────────────────────────────

const SETTINGS_GATEWAY_KEYS = ['bKash', 'Nagad', 'Visa', 'MasterCard', 'COD'];

const SMS_ENUM_TO_MONGO = {
  GREENWEB_BD: 'Greenweb BD',
  BULKSMS_BD: 'BulkSMS BD',
  ALPHASMS: 'AlphaSMS',
  GENERIC_API: 'Generic API'
};

const WHATSAPP_ENUM_TO_MONGO = {
  CALLMEBOT: 'CallMeBot',
  ULTRAMSG: 'UltraMsg',
  GREEN_API: 'Green API',
  GENERIC: 'Generic'
};

function fromSmsEnum(value) {
  if (!value) return '';
  return SMS_ENUM_TO_MONGO[value] || '';
}

function fromWhatsAppEnum(value) {
  if (!value) return '';
  return WHATSAPP_ENUM_TO_MONGO[value] || '';
}

function buildPaymentGatewaysMap(pgRow) {
  const active = {
    bKash: pgRow.activeGatewayBKash !== false,
    Nagad: pgRow.activeGatewayNagad !== false,
    Visa: pgRow.activeGatewayVisa !== false,
    MasterCard: pgRow.activeGatewayMasterCard !== false,
    COD: pgRow.activeGatewayCod !== false
  };

  const gateways = {};
  for (const row of pgRow.paymentGateways || []) {
    gateways[row.gatewayKey] = {
      enabled: row.enabled !== false,
      name: String(row.name || row.gatewayKey).trim(),
      logoUrl: String(row.logoUrl || '').trim()
    };
  }

  for (const key of SETTINGS_GATEWAY_KEYS) {
    if (!gateways[key]) {
      gateways[key] = {
        enabled: active[key] !== false,
        name: key,
        logoUrl: ''
      };
    }
  }

  return { activePaymentGateways: active, paymentGateways: gateways };
}

function settingsToMongoShape(pgRow) {
  if (!pgRow) return null;

  const { activePaymentGateways, paymentGateways } = buildPaymentGatewaysMap(pgRow);

  return {
    key: pgRow.key || 'global',
    shopHomeCity: String(pgRow.shopHomeCity || 'Dhaka').trim(),
    deliveryInsideCity: decimalToNumber(pgRow.deliveryInsideCity) ?? 60,
    deliveryOutsideCity: decimalToNumber(pgRow.deliveryOutsideCity) ?? 120,
    freeShippingMinAmount: decimalToNumber(pgRow.freeShippingMinAmount) ?? 1000,
    freeShippingThreshold: pgRow.freeShippingThreshold != null
      ? decimalToNumber(pgRow.freeShippingThreshold)
      : decimalToNumber(pgRow.freeShippingMinAmount) ?? 1000,
    cashbackPercentage: decimalToNumber(pgRow.cashbackPercentage) ?? 1,
    takaToPointsRatio: Number(pgRow.takaToPointsRatio) || 100,
    pointsToTakaConversionRate: Number(pgRow.pointsToTakaConversionRate) || 10,
    refundUndoWindowHours: Number(pgRow.refundUndoWindowHours) || 72,
    announcementText: String(pgRow.announcementText || '').trim(),
    announcementDiscount: String(pgRow.announcementDiscount ?? '2000'),
    isAnnouncementActive: pgRow.isAnnouncementActive !== false,
    enableSmsNotifications: pgRow.enableSmsNotifications === true,
    smsGatewayProvider: fromSmsEnum(pgRow.smsGatewayProvider),
    smsApiKey: String(pgRow.smsApiKey || '').trim(),
    smsSenderId: String(pgRow.smsSenderId || '').trim(),
    defaultCourierProvider: String(pgRow.defaultCourierProvider || '').trim(),
    courierApiKey: String(pgRow.courierApiKey || '').trim(),
    courierSecretKey: String(pgRow.courierSecretKey || '').trim(),
    publicSupportWhatsApp: String(pgRow.publicSupportWhatsApp || '').trim(),
    privateAdminAlertWhatsApp: String(pgRow.privateAdminAlertWhatsApp || '').trim(),
    enableWhatsAppOrderAlerts: pgRow.enableWhatsAppOrderAlerts === true,
    whatsAppAlertProvider: fromWhatsAppEnum(pgRow.whatsAppAlertProvider),
    whatsAppAlertApiKey: String(pgRow.whatsAppAlertApiKey || '').trim(),
    whatsAppAlertInstanceId: String(pgRow.whatsAppAlertInstanceId || '').trim(),
    whatsAppAlertWebhookUrl: String(pgRow.whatsAppAlertWebhookUrl || '').trim(),
    activePaymentGateways,
    rateLimitEnabled: pgRow.rateLimitEnabled !== false,
    rateLimitWindowMs: pgRow.rateLimitWindowMs ?? 900000,
    rateLimitMaxRequests: pgRow.rateLimitMaxRequests ?? 1000,
    bypassAdminAndLocalhost: pgRow.bypassAdminAndLocalhost !== false,
    sandboxMode: pgRow.sandboxMode === true,
    serviceWorkerEnabled: pgRow.serviceWorkerEnabled !== false,
    paymentGateways,
    flashSaleEnabled: pgRow.flashSaleEnabled === true,
    flashSaleTitle: String(pgRow.flashSaleTitle || 'Flash Sale').trim(),
    flashSaleEndDate: pgRow.flashSaleEndDate ? new Date(pgRow.flashSaleEndDate) : null,
    flashSaleDiscountPercent: Number(pgRow.flashSaleDiscountPercent) || 0,
    flashSaleProductIds: Array.isArray(pgRow.flashSaleProductIds) ? pgRow.flashSaleProductIds : [],
    vipMinTotalSpent: Number(pgRow.vipMinTotalSpent) || 10000,
    vipMinOrderCount: Number(pgRow.vipMinOrderCount) || 5,
    frequentBuyerMinOrders: Number(pgRow.frequentBuyerMinOrders) || 3,
    referralRewardAmount: Number(pgRow.referralRewardAmount) || 100,
    enableTieredLoyalty: pgRow.enableTieredLoyalty === true,
    silverThreshold: Number(pgRow.silverThreshold) || 5000,
    goldThreshold: Number(pgRow.goldThreshold) || 15000,
    platinumThreshold: Number(pgRow.platinumThreshold) || 50000,
    silverCashback: decimalToNumber(pgRow.silverCashback) ?? 1.5,
    goldCashback: decimalToNumber(pgRow.goldCashback) ?? 2.5,
    platinumCashback: decimalToNumber(pgRow.platinumCashback) ?? 4.0,
    defaultProductsPerPage: pgRow.defaultProductsPerPage ?? 24,
    vatRate: decimalToNumber(pgRow.vatRate) ?? decimalToNumber(pgRow.vatPercentage) ?? 0,
    vatEnabled: pgRow.vatEnabled === true,
    vatPercentage: decimalToNumber(pgRow.vatPercentage) ?? decimalToNumber(pgRow.vatRate) ?? 0,
    vatInclusive: pgRow.vatInclusive !== false,
    taxRegistrationNumber: String(pgRow.taxRegistrationNumber || '').trim(),
    lastBackupAt: pgRow.lastBackupAt ? new Date(pgRow.lastBackupAt) : null,
    orderPrefix: String(pgRow.orderPrefix || 'ORD').trim(),
    maintenanceMode: pgRow.maintenanceMode === true,
    maintenanceMessage: String(pgRow.maintenanceMessage || '').trim()
      || 'We are currently performing scheduled maintenance. Please check back soon.',
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt
  };
}

// ── Security / Audit group ────────────────────────────────────────────────────

const ACTOR_TYPE_FROM_PG = {
  ADMIN: 'admin',
  CUSTOMER: 'customer',
  SYSTEM: 'system'
};

const RESOURCE_TYPE_FROM_PG = {
  PRODUCT: 'product',
  ORDER: 'order',
  CUSTOMER: 'customer',
  STAFF: 'staff',
  SETTING: 'setting',
  COUPON: 'coupon',
  BANNER: 'banner',
  CATEGORY: 'category',
  REVIEW: 'review',
  SUPPLIER: 'supplier',
  WAREHOUSE: 'warehouse',
  PURCHASE_ORDER: 'purchase_order',
  EXPENSE: 'expense',
  EXPENSE_CATEGORY: 'expense_category',
  ATTENDANCE: 'attendance',
  SHIFT: 'shift',
  PAYROLL: 'payroll',
  LEAVE: 'leave',
  EMPLOYEE: 'employee',
  DESIGNATION: 'designation'
};

const LOGIN_STATUS_FROM_PG = {
  SUCCESS: 'success',
  FAILED: 'failed',
  OTP_SENT: 'otp_sent',
  OTP_FAILED: 'otp_failed',
  BLOCKED: 'blocked'
};

const BLACKLIST_SOURCE_FROM_PG = {
  MANUAL: 'manual',
  AUTO: 'auto'
};

function fromActorType(value) {
  if (!value) return 'system';
  return ACTOR_TYPE_FROM_PG[value] || String(value).toLowerCase();
}

function fromResourceType(value) {
  if (!value) return null;
  return RESOURCE_TYPE_FROM_PG[value] || String(value).toLowerCase();
}

function fromLoginStatus(value) {
  if (!value) return 'failed';
  return LOGIN_STATUS_FROM_PG[value] || String(value).toLowerCase();
}

function fromBlacklistSource(value) {
  if (!value) return 'auto';
  return BLACKLIST_SOURCE_FROM_PG[value] || String(value).toLowerCase();
}

function securityLogToMongoShape(pgRow) {
  if (!pgRow) return null;
  return {
    _id: mongoIdFromRow(pgRow),
    action: pgRow.action,
    actor: pgRow.actor ?? 'system',
    actorType: fromActorType(pgRow.actorType),
    ipAddress: pgRow.ipAddress ?? 'Unknown',
    details: pgRow.details ?? '',
    resourceType: fromResourceType(pgRow.resourceType),
    resourceId: pgRow.resourceId ?? null,
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };
}

function mapSecurityLogsToMongo(rows) {
  return (rows || []).map(securityLogToMongoShape).filter(Boolean);
}

function loginAttemptToMongoShape(pgRow) {
  if (!pgRow) return null;
  return {
    _id: mongoIdFromRow(pgRow),
    username: pgRow.username ?? 'unknown',
    ipAddress: pgRow.ipAddress ?? 'Unknown',
    location: pgRow.location ?? 'Unknown Location',
    os: pgRow.os ?? 'Unknown OS',
    browser: pgRow.browser ?? 'Unknown Browser',
    deviceType: pgRow.deviceType ?? 'Desktop',
    userAgent: pgRow.userAgent ?? '',
    status: fromLoginStatus(pgRow.status),
    details: pgRow.details ?? '',
    createdAt: pgRow.createdAt,
    __v: MONGOOSE_DOC_VERSION
  };
}

function mapLoginAttemptsToMongo(rows) {
  return (rows || []).map(loginAttemptToMongoShape).filter(Boolean);
}

function blacklistedIpToMongoShape(pgRow) {
  if (!pgRow) return null;
  const shape = {
    _id: mongoIdFromRow(pgRow),
    ip: pgRow.ip,
    reason: pgRow.reason ?? 'Suspicious activity',
    source: fromBlacklistSource(pgRow.source),
    blockedBy: pgRow.blockedBy ?? 'system',
    blockedAt: pgRow.blockedAt,
    expiresAt: pgRow.expiresAt ?? null,
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };
  return shape;
}

function mapBlacklistedIpsToMongo(rows) {
  return (rows || []).map(blacklistedIpToMongoShape).filter(Boolean);
}

function stockAlertToMongoShape(pgRow) {
  if (!pgRow) return null;

  const lowStockProducts = [];
  const outOfStockProducts = [];

  for (const item of pgRow.items || []) {
    const productId = item.legacyProductId || '';
    if (item.kind === 'LOW_STOCK' || item.kind === 'low_stock') {
      lowStockProducts.push({
        name: item.name ?? '',
        productId,
        stock: item.stock != null ? Number(item.stock) : 0,
        threshold: item.threshold != null ? Number(item.threshold) : 0
      });
    } else {
      outOfStockProducts.push({
        name: item.name ?? '',
        productId
      });
    }
  }

  return {
    _id: mongoIdFromRow(pgRow),
    checkedAt: pgRow.checkedAt,
    lowStockCount: Number(pgRow.lowStockCount) || 0,
    outOfStockCount: Number(pgRow.outOfStockCount) || 0,
    lowStockProducts,
    outOfStockProducts,
    alertsSent: {
      email: pgRow.alertSentEmail === true,
      sms: pgRow.alertSentSms === true,
      whatsapp: pgRow.alertSentWhatsapp === true
    },
    createdAt: pgRow.createdAt,
    __v: MONGOOSE_DOC_VERSION
  };
}

function mapStockAlertsToMongo(rows) {
  return (rows || []).map(stockAlertToMongoShape).filter(Boolean);
}

// ── HRM — polymorphic staff legacy resolution ───────────────────────────────

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

function buildHrmStaffLegacyMaps(adminRows = [], employeeRows = []) {
  const admin = new Map();
  const employee = new Map();
  (adminRows || []).forEach((row) => {
    if (row?.id) admin.set(row.id, row.legacyId != null ? String(row.legacyId) : String(row.id));
  });
  (employeeRows || []).forEach((row) => {
    if (row?.id) employee.set(row.id, row.legacyId != null ? String(row.legacyId) : String(row.id));
  });
  return { admin, employee };
}

function legacyStaffIdFromRow(row, maps = null) {
  if (!row) return null;
  const isEmployee = row.staffType === 'EMPLOYEE' || row.staffType === 'employee';
  if (maps) {
    if (isEmployee && row.employeeId) {
      const legacy = maps.employee.get(row.employeeId);
      if (legacy) return legacy;
    }
    if (!isEmployee && row.adminId) {
      const legacy = maps.admin.get(row.adminId);
      if (legacy) return legacy;
    }
  }
  const stored = row.staffId != null ? String(row.staffId) : null;
  if (stored && OBJECT_ID_PATTERN.test(stored)) return stored;
  return stored;
}

function optionalString(value) {
  const s = value != null ? String(value).trim() : '';
  return s || undefined;
}

const BLOOD_GROUP_PG_TO_MONGO = {
  A_POSITIVE: 'A+',
  A_NEGATIVE: 'A-',
  B_POSITIVE: 'B+',
  B_NEGATIVE: 'B-',
  O_POSITIVE: 'O+',
  O_NEGATIVE: 'O-',
  AB_POSITIVE: 'AB+',
  AB_NEGATIVE: 'AB-'
};

function pgGenderToMongo(value) {
  if (value == null || value === '') return '';
  return String(value).toLowerCase();
}

function pgBloodGroupToMongo(value) {
  if (value == null || value === '') return '';
  return BLOOD_GROUP_PG_TO_MONGO[value] || String(value);
}

function pgMaritalStatusToMongo(value) {
  if (value == null || value === '') return '';
  return String(value).toLowerCase();
}

function employeeDocumentToMongoShape(doc) {
  if (!doc) return null;
  return {
    _id: mongoIdFromRow(doc),
    title: doc.title ?? '',
    fileUrl: doc.fileUrl ?? '',
    fileType: doc.fileType ?? 'image',
    publicId: doc.publicId ?? '',
    uploadedAt: doc.uploadedAt
  };
}

function employeeReferenceToMongoShape(ref) {
  if (!ref) return null;
  return {
    name: ref.name ?? '',
    phone: ref.phone ?? '',
    relation: ref.relation ?? '',
    address: ref.address ?? ''
  };
}

function employeeToMongoShape(pgRow, options = {}) {
  if (!pgRow) return null;

  const linkedAdminLegacy = pgRow.linkedAdmin?.legacyId != null
    ? String(pgRow.linkedAdmin.legacyId)
    : (pgRow.linkedAdminId && OBJECT_ID_PATTERN.test(String(pgRow.linkedAdminId))
      ? String(pgRow.linkedAdminId)
      : null);

  const out = {
    _id: mongoIdFromRow(pgRow),
    employeeId: pgRow.employeeId,
    fullName: pgRow.fullName,
    dateOfBirth: pgRow.dateOfBirth ?? null,
    gender: pgGenderToMongo(pgRow.gender),
    bloodGroup: pgBloodGroupToMongo(pgRow.bloodGroup),
    religion: pgRow.religion ?? '',
    maritalStatus: pgMaritalStatusToMongo(pgRow.maritalStatus),
    nationalId: pgRow.nationalId ?? '',
    photo: pgRow.photo ?? '',
    photoPublicId: pgRow.photoPublicId ?? '',
    phone: pgRow.phone,
    alternatePhone: pgRow.alternatePhone ?? '',
    email: pgRow.email ?? '',
    presentAddress: pgRow.presentAddress ?? '',
    permanentAddress: pgRow.permanentAddress ?? '',
    address: pgRow.address ?? pgRow.presentAddress ?? '',
    emergencyContact: {
      name: pgRow.emergencyContactName ?? '',
      phone: pgRow.emergencyContactPhone ?? '',
      relation: pgRow.emergencyContactRelation ?? ''
    },
    designation: pgRow.designation ?? '',
    role: pgRow.role ?? '',
    department: pgRow.department ?? 'Operations',
    employeeType: pgRow.employeeType
      ? String(pgRow.employeeType).toLowerCase().replace('part_time', 'part-time')
      : 'permanent',
    shift: pgRow.shift ?? '',
    joiningDate: pgRow.joiningDate ?? null,
    baseSalary: pgRow.baseSalary != null ? Number(pgRow.baseSalary) : 0,
    salaryType: pgRow.salaryType ? String(pgRow.salaryType).toLowerCase() : 'monthly',
    bankName: pgRow.bankName ?? '',
    bankAccountNumber: pgRow.bankAccountNumber ?? '',
    bkashNumber: pgRow.bkashNumber ?? '',
    linkedAdminId: linkedAdminLegacy || null,
    status: pgRow.status ? String(pgRow.status).toLowerCase() : 'active',
    notes: pgRow.notes ?? '',
    createdBy: pgRow.createdBy ?? '',
    documents: (options.documents || pgRow.documents || [])
      .map(employeeDocumentToMongoShape)
      .filter(Boolean),
    references: (options.references || pgRow.references || [])
      .map(employeeReferenceToMongoShape)
      .filter(Boolean),
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: options.version ?? pgRow.mongoVersion ?? MONGOOSE_DOC_VERSION
  };

  return out;
}

function mapEmployeesToMongo(rows, options = {}) {
  return (rows || []).map((row) => employeeToMongoShape(row, options)).filter(Boolean);
}

function attendanceToMongoShape(pgRow, maps = null) {
  if (!pgRow) return null;

  const out = {
    _id: mongoIdFromRow(pgRow),
    staffId: legacyStaffIdFromRow(pgRow, maps),
    staffType: pgRow.staffType === 'EMPLOYEE' ? 'employee' : 'admin',
    staffUsername: pgRow.staffUsername ?? '',
    date: pgRow.date,
    clockIn: pgRow.clockIn ?? null,
    clockOut: pgRow.clockOut ?? null,
    hoursWorked: pgRow.hoursWorked != null ? Number(pgRow.hoursWorked) : 0,
    status: pgRow.status
      ? String(pgRow.status).toLowerCase().replace('_', '-')
      : 'absent',
    isLate: pgRow.isLate === true,
    lateMinutes: Number(pgRow.lateMinutes) || 0,
    shift: pgRow.shift ? String(pgRow.shift).toLowerCase() : 'morning',
    shiftStart: pgRow.shiftStart ?? '09:00',
    shiftEnd: pgRow.shiftEnd ?? '18:00',
    notes: pgRow.notes ?? '',
    markedBy: pgRow.markedBy ?? 'self',
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };

  if (pgRow.gpsLat != null && pgRow.gpsLng != null) {
    out.gpsLocation = { lat: Number(pgRow.gpsLat), lng: Number(pgRow.gpsLng) };
  }

  return out;
}

function mapAttendanceToMongo(rows, maps = null) {
  return (rows || []).map((row) => attendanceToMongoShape(row, maps)).filter(Boolean);
}

function payrollToMongoShape(pgRow, maps = null) {
  if (!pgRow) return null;

  return {
    _id: mongoIdFromRow(pgRow),
    staffId: legacyStaffIdFromRow(pgRow, maps),
    staffType: pgRow.staffType === 'EMPLOYEE' ? 'employee' : 'admin',
    staffUsername: pgRow.staffUsername ?? '',
    staffName: pgRow.staffName ?? '',
    month: Number(pgRow.month),
    year: Number(pgRow.year),
    baseSalary: Number(pgRow.baseSalary) || 0,
    bonus: Number(pgRow.bonus) || 0,
    overtime: Number(pgRow.overtime) || 0,
    overtimeRate: Number(pgRow.overtimeRate) || 0,
    overtimeAmount: Number(pgRow.overtimeAmount) || 0,
    deductions: Number(pgRow.deductions) || 0,
    totalSalary: Number(pgRow.totalSalary) || 0,
    workingDays: Number(pgRow.workingDays) || 0,
    presentDays: Number(pgRow.presentDays) || 0,
    absentDays: Number(pgRow.absentDays) || 0,
    lateDays: Number(pgRow.lateDays) || 0,
    status: pgRow.status ? String(pgRow.status).toLowerCase() : 'draft',
    paidAt: pgRow.paidAt ?? null,
    paymentMethod: pgRow.paymentMethod ?? '',
    paySlipGenerated: pgRow.paySlipGenerated === true,
    notes: pgRow.notes ?? '',
    createdBy: pgRow.createdBy ?? '',
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };
}

function mapPayrollsToMongo(rows, maps = null) {
  return (rows || []).map((row) => payrollToMongoShape(row, maps)).filter(Boolean);
}

function leaveToMongoShape(pgRow, maps = null) {
  if (!pgRow) return null;

  return {
    _id: mongoIdFromRow(pgRow),
    staffId: legacyStaffIdFromRow(pgRow, maps),
    staffType: pgRow.staffType === 'EMPLOYEE' ? 'employee' : 'admin',
    staffUsername: pgRow.staffUsername ?? '',
    staffName: pgRow.staffName ?? '',
    leaveType: pgRow.leaveType ? String(pgRow.leaveType).toLowerCase() : 'casual',
    startDate: pgRow.startDate,
    endDate: pgRow.endDate,
    totalDays: Number(pgRow.totalDays) || 1,
    reason: pgRow.reason ?? '',
    status: pgRow.status ? String(pgRow.status).toLowerCase() : 'pending',
    approvedBy: pgRow.approvedBy ?? '',
    approvedAt: pgRow.approvedAt ?? null,
    rejectionReason: pgRow.rejectionReason ?? '',
    attachmentUrl: pgRow.attachmentUrl ?? '',
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };
}

function mapLeavesToMongo(rows, maps = null) {
  return (rows || []).map((row) => leaveToMongoShape(row, maps)).filter(Boolean);
}

// ── Newsletter ──────────────────────────────────────────────────────────────

function fromNewsletterSource(value) {
  if (!value) return 'footer_form';
  return String(value).toLowerCase();
}

function newsletterToMongoShape(pgRow) {
  if (!pgRow) return null;
  return {
    _id: mongoIdFromRow(pgRow),
    email: pgRow.email,
    name: pgRow.name ?? null,
    isActive: pgRow.isActive !== false,
    source: fromNewsletterSource(pgRow.source),
    subscribedAt: pgRow.subscribedAt,
    unsubscribedAt: pgRow.unsubscribedAt ?? null,
    unsubscribeToken: pgRow.unsubscribeToken ?? null,
    tags: Array.isArray(pgRow.tags) ? pgRow.tags : [],
    emailsSent: Number(pgRow.emailsSent) || 0,
    lastEmailAt: pgRow.lastEmailAt ?? null
  };
}

function mapNewslettersToMongo(rows) {
  return (rows || []).map(newsletterToMongoShape).filter(Boolean);
}

// ── EmailCampaign ───────────────────────────────────────────────────────────

function fromCampaignStatus(value) {
  const map = {
    DRAFT: 'draft',
    SCHEDULED: 'scheduled',
    SENDING: 'sending',
    SENT: 'sent',
    FAILED: 'failed'
  };
  return map[String(value || '').toUpperCase()] || 'draft';
}

function fromCampaignSegment(value) {
  const map = {
    ALL: 'all',
    VIP: 'vip',
    FREQUENT: 'frequent',
    INACTIVE: 'inactive',
    NEW: 'new'
  };
  return map[String(value || '').toUpperCase()] || 'all';
}

function fromCampaignChannel(value) {
  const map = { EMAIL: 'email', SMS: 'sms', WHATSAPP: 'whatsapp' };
  return map[String(value || '').toUpperCase()] || 'email';
}

function emailCampaignToMongoShape(pgRow, adminMap = null) {
  if (!pgRow) return null;

  const out = {
    _id: mongoIdFromRow(pgRow),
    title: pgRow.title,
    subject: pgRow.subject,
    htmlContent: pgRow.htmlContent,
    status: fromCampaignStatus(pgRow.status),
    targetTags: Array.isArray(pgRow.targetTags) ? pgRow.targetTags : [],
    targetSegment: fromCampaignSegment(pgRow.targetSegment),
    channel: fromCampaignChannel(pgRow.channel),
    whatsappTemplate: pgRow.whatsappTemplate ?? '',
    scheduledAt: pgRow.scheduledAt ?? null,
    sentAt: pgRow.sentAt ?? null,
    stats: {
      totalRecipients: Number(pgRow.statsTotalRecipients) || 0,
      sent: Number(pgRow.statsSent) || 0,
      failed: Number(pgRow.statsFailed) || 0
    },
    createdAt: pgRow.createdAt
  };

  const admin = pgRow.createdBy
    || (pgRow.createdById && adminMap ? adminMap.get(pgRow.createdById) : null);
  if (admin) {
    out.createdBy = {
      _id: admin.legacyId,
      username: admin.username,
      displayName: admin.displayName
    };
  } else {
    out.createdBy = null;
  }

  return out;
}

function mapEmailCampaignsToMongo(rows, adminMap = null) {
  return (rows || []).map((row) => emailCampaignToMongoShape(row, adminMap)).filter(Boolean);
}

// ── ContactMessage ──────────────────────────────────────────────────────────

function fromTicketStatus(value) {
  const map = {
    OPEN: 'open',
    IN_PROGRESS: 'in_progress',
    RESOLVED: 'resolved',
    CLOSED: 'closed'
  };
  return map[String(value || '').toUpperCase()] || 'open';
}

function fromTicketPriority(value) {
  const map = {
    LOW: 'low',
    NORMAL: 'normal',
    HIGH: 'high',
    URGENT: 'urgent'
  };
  return map[String(value || '').toUpperCase()] || 'normal';
}

/** Matches ContactMessage.toAdminObject() — uses `id`, not `_id`. */
function contactMessageToAdminShape(pgRow) {
  if (!pgRow) return null;
  const status = fromTicketStatus(pgRow.status);
  return {
    id: mongoIdFromRow(pgRow),
    ticketNumber: pgRow.ticketNumber || '',
    name: pgRow.name,
    email: pgRow.email,
    phone: pgRow.phone || '',
    subject: pgRow.subject || '',
    message: pgRow.message,
    status,
    priority: fromTicketPriority(pgRow.priority),
    assignedTo: pgRow.assignedTo || '',
    firstResponseAt: pgRow.firstResponseAt || null,
    resolvedAt: pgRow.resolvedAt || null,
    replyMessage: pgRow.replyMessage || '',
    repliedAt: pgRow.repliedAt || null,
    isRead: pgRow.isRead === true,
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt
  };
}

function mapContactMessagesToAdminShape(rows) {
  return (rows || []).map(contactMessageToAdminShape).filter(Boolean);
}

// ── Review ──────────────────────────────────────────────────────────────────

function resolveUserDisplayName(userRow) {
  if (!userRow) return '';
  return [userRow.firstName, userRow.lastName].filter(Boolean).join(' ').trim();
}

function reviewToMongoShape(pgRow, options = {}) {
  if (!pgRow) return null;

  const out = {
    _id: mongoIdFromRow(pgRow),
    productId: pgRow.legacyProductId || '',
    orderId: pgRow.legacyOrderId || '',
    rating: Number(pgRow.rating) || 0,
    comment: pgRow.comment,
    createdAt: pgRow.createdAt,
    updatedAt: pgRow.updatedAt,
    __v: MONGOOSE_DOC_VERSION
  };

  const photo = pgRow.photo ?? '';
  const isSandbox = pgRow.isSandbox === true;
  const isHidden = pgRow.isHidden === true;
  const adminNote = pgRow.adminNote ?? '';
  const moderatedAt = pgRow.moderatedAt ?? null;

  if (options.omitDefaultFields) {
    if (photo) out.photo = photo;
    if (isSandbox) out.isSandbox = true;
    if (isHidden) out.isHidden = true;
    if (adminNote) out.adminNote = adminNote;
    if (moderatedAt != null) out.moderatedAt = moderatedAt;
  } else {
    out.photo = photo;
    out.isSandbox = isSandbox;
    out.isHidden = isHidden;
    out.adminNote = adminNote;
    out.moderatedAt = moderatedAt;
  }

  if (options.populateUser !== undefined) {
    const u = options.populateUser;
    if (!u) {
      out.userId = null;
    } else {
      const legacy = u.legacyId != null ? String(u.legacyId) : null;
      out.userId = { _id: legacy };
      if (options.mongoosePopulateJson && legacy) {
        out.userId.id = legacy;
      }
      if (options.includeUserEmail) {
        out.userId.email = u.email || '';
        const adminName = resolveUserDisplayName(u);
        if (adminName) out.userId.name = adminName;
      } else if (options.mongoosePopulateJson) {
        const displayName = resolveUserDisplayName(u);
        if (displayName) out.userId.name = displayName;
      }
    }
  }

  return out;
}

function mapReviewsToMongo(rows, userMap = null, options = {}) {
  return (rows || []).map((row) => {
    const populatedUser = userMap && row.userId ? userMap.get(row.userId) : null;
    return reviewToMongoShape(row, {
      populateUser: populatedUser,
      includeUserEmail: options.includeUserEmail,
      omitDefaultFields: options.omitDefaultFields,
      mongoosePopulateJson: options.mongoosePopulateJson
    });
  }).filter(Boolean);
}

// ── User + owned tables (Stage 4 Step 6) ────────────────────────────────────

function normaliseUserGender(gender) {
  if (gender === 'MALE') return 'Male';
  if (gender === 'FEMALE') return 'Female';
  if (gender === 'OTHER') return 'Other';
  return gender || undefined;
}

function normaliseUserAccountStatus(status) {
  if (status === 'ACTIVE') return 'active';
  if (status === 'SUSPENDED') return 'suspended';
  if (status === 'BLOCKED') return 'blocked';
  return status ? String(status).toLowerCase() : status;
}

function normaliseUserLoyaltyTier(tier) {
  if (tier === 'NONE') return 'none';
  if (tier === 'SILVER') return 'silver';
  if (tier === 'GOLD') return 'gold';
  if (tier === 'PLATINUM') return 'platinum';
  return tier ? String(tier).toLowerCase() : tier;
}

function normaliseProfileUpdateType(value) {
  if (value === 'EMAIL') return 'email';
  if (value === 'MOBILE') return 'mobile';
  return value || null;
}

function userToMongoShape(pgRow, options = {}) {
  if (!pgRow) return null;

  const _id = mongoIdFromRow(pgRow);
  const out = {
    _id,
    firstName: pgRow.firstName,
    lastName: pgRow.lastName,
    email: pgRow.email,
    isVerified: pgRow.isVerified === true,
    avatar: pgRow.avatar ?? '',
    avatarPublicId: pgRow.avatarPublicId ?? '',
    phone: pgRow.phone ?? '',
    address: pgRow.address ?? '',
    district: pgRow.district ?? '',
    upazila: pgRow.upazila ?? '',
    thana: pgRow.thana ?? '',
    fullAddress: pgRow.fullAddress ?? '',
    walletBalance: decimalToNumber(pgRow.walletBalance) ?? 0,
    loyaltyPoints: pgRow.loyaltyPoints ?? 0,
    referralCode: pgRow.referralCode ?? null,
    referralEarnings: decimalToNumber(pgRow.referralEarnings) ?? 0,
    loyaltyTier: normaliseUserLoyaltyTier(pgRow.loyaltyTier) || 'none',
    tierUpgradedAt: pgRow.tierUpgradedAt ?? null,
    lifetimeSpend: decimalToNumber(pgRow.lifetimeSpend) ?? 0,
    tierCashbackRate: decimalToNumber(pgRow.tierCashbackRate) ?? 0,
    isSandbox: pgRow.isSandbox === true,
    isDeleted: pgRow.isDeleted === true,
    deletionReason: pgRow.deletionReason ?? '',
    createdAt: pgRow.createdAt,
    __v: MONGOOSE_DOC_VERSION
  };

  if (pgRow.isDeleted === true && pgRow.deletedAt) out.deletedAt = pgRow.deletedAt;

  const gender = normaliseUserGender(pgRow.gender);
  if (gender) out.gender = gender;
  if (pgRow.dateOfBirth) out.dateOfBirth = pgRow.dateOfBirth;
  if (pgRow.mobile != null && pgRow.mobile !== '') out.mobile = pgRow.mobile;
  if (pgRow.googleId) out.googleId = pgRow.googleId;
  if (pgRow.avatarUrl) out.avatarUrl = pgRow.avatarUrl;
  if (pgRow.lastLogin) out.lastLogin = pgRow.lastLogin;

  const accountStatus = normaliseUserAccountStatus(pgRow.accountStatus);
  if (accountStatus) out.accountStatus = accountStatus;

  if (pgRow.verificationToken) out.verificationToken = pgRow.verificationToken;
  if (pgRow.verificationTokenExpiry) out.verificationTokenExpiry = pgRow.verificationTokenExpiry;
  if (pgRow.resetPasswordOtp) out.resetPasswordOtp = pgRow.resetPasswordOtp;
  if (pgRow.resetPasswordExpires) out.resetPasswordExpires = pgRow.resetPasswordExpires;
  if (pgRow.profileUpdateOtp) out.profileUpdateOtp = pgRow.profileUpdateOtp;
  if (pgRow.profileUpdateOtpExpires) out.profileUpdateOtpExpires = pgRow.profileUpdateOtpExpires;
  const profileUpdateType = normaliseProfileUpdateType(pgRow.profileUpdateType);
  if (profileUpdateType) out.profileUpdateType = profileUpdateType;
  if (pgRow.pendingEmail) out.pendingEmail = pgRow.pendingEmail;
  if (pgRow.pendingMobile) out.pendingMobile = pgRow.pendingMobile;

  const referredByLegacy = options.referredByLegacy
    ?? pgRow.referredBy?.legacyId
    ?? null;
  if (referredByLegacy) out.referredBy = referredByLegacy;

  out.name = [pgRow.firstName, pgRow.lastName].filter(Boolean).join(' ').trim();

  if (options.includeEmbedded) {
    out.addresses = options.addresses ?? [];
    out.wishlist = options.wishlist ?? [];
    out.walletHistory = options.walletHistory ?? [];
  }

  return out;
}

function mapUsersToMongo(rows, options = {}) {
  return (rows || []).map((row) => userToMongoShape(row, options)).filter(Boolean);
}

function addressToMongoShape(pgRow) {
  if (!pgRow) return null;
  return {
    _id: mongoIdFromRow(pgRow) || pgRow.id,
    label: pgRow.label ?? 'Home',
    district: pgRow.district ?? '',
    upazilaOrThana: pgRow.upazilaOrThana ?? '',
    fullAddress: pgRow.fullAddress,
    phone: pgRow.phone ?? '',
    isDefault: pgRow.isDefault === true,
    createdAt: pgRow.createdAt
  };
}

function mapAddressesToMongo(rows) {
  return (rows || []).map(addressToMongoShape).filter(Boolean);
}

function wishlistItemEmbeddedToMongoShape(pgRow) {
  if (!pgRow) return null;
  const out = {
    productId: pgRow.legacyProductId || pgRow.productId,
    name: pgRow.name ?? '',
    price: decimalToNumber(pgRow.price) ?? 0,
    image: pgRow.image ?? '',
    icon: pgRow.icon ?? '📦',
    addedAt: pgRow.addedAt
  };
  const legacyId = pgRow.legacyId != null ? String(pgRow.legacyId) : null;
  if (legacyId) out._id = legacyId;
  return out;
}

function mapWishlistEmbeddedToMongo(rows) {
  return (rows || []).map(wishlistItemEmbeddedToMongoShape).filter(Boolean);
}

function walletTransactionToMongoShape(pgRow) {
  if (!pgRow) return null;
  const out = {
    type: pgRow.type ?? 'credit',
    amount: decimalToNumber(pgRow.amount) ?? 0,
    note: pgRow.note ?? '',
    referenceOrder: pgRow.referenceOrder ?? '',
    date: pgRow.date ?? pgRow.createdAt
  };
  const legacyId = pgRow.legacyId != null ? String(pgRow.legacyId) : null;
  if (legacyId) out._id = legacyId;
  return out;
}

function mapWalletTransactionsToMongo(rows) {
  return (rows || []).map(walletTransactionToMongoShape).filter(Boolean);
}

function cartItemEmbeddedToMongoShape(pgItem) {
  if (!pgItem) return null;
  const productLegacy = pgItem.product?.legacyId
    || pgItem.product?.productId
    || null;
  const out = {
    productId: productLegacy,
    name: pgItem.name,
    price: decimalToNumber(pgItem.price),
    image: pgItem.image ?? '',
    emojiIcon: pgItem.emojiIcon ?? null,
    variantImage: pgItem.variantImage ?? null,
    icon: pgItem.icon ?? '📦',
    quantity: pgItem.quantity ?? 1,
    selected: pgItem.selected !== false,
    variantId: pgItem.variantId ?? '',
    variantLabel: pgItem.variantLabel ?? '',
    variantAttribute: pgItem.variantAttribute ?? '',
    variantValue: pgItem.variantValue ?? '',
    variantSku: pgItem.variantSku ?? '',
    selectedColor: pgItem.selectedColor ?? '',
    selectedSize: pgItem.selectedSize ?? ''
  };
  // CartItem has no legacyId in Postgres — line _id is Mongo-only; omit to avoid UUID drift.
  return out;
}

function mapCartItemsEmbeddedToMongo(rows) {
  return (rows || []).map(cartItemEmbeddedToMongoShape).filter(Boolean);
}

module.exports = {
  mongoIdFromRow,
  buildCategoryIdMaps,
  categoryToMongoShape,
  categoryTreeSelectFields,
  matchCategoryBySlugParam,
  mapCategoriesToMongo,
  mapCategoriesToMongoPopulated,
  brandToMongoShape,
  mapBrandsToMongo,
  supplierToMongoShape,
  mapSuppliersToMongo,
  purchaseOrderToMongoShape,
  warehouseToMongoShape,
  mapWarehousesToMongo,
  designationToMongoShape,
  mapDesignationsToMongo,
  pageContentToAdminShape,
  pageContentToPublicShape,
  mapPageContentsToAdminShape,
  navbarLinkToAdminShape,
  navbarLinkToPublicShape,
  mapNavbarLinksToAdminShape,
  mapNavbarLinksToPublicShape,
  footerSettingsToAdminShape,
  footerSettingsToPublicShape,
  getPaymentBadgesFromPg,
  bannerToMongoShape,
  mapBannersToMongo,
  bannerSettingsToMongoShape,
  settingsToMongoShape,
  securityLogToMongoShape,
  mapSecurityLogsToMongo,
  loginAttemptToMongoShape,
  mapLoginAttemptsToMongo,
  blacklistedIpToMongoShape,
  mapBlacklistedIpsToMongo,
  stockAlertToMongoShape,
  mapStockAlertsToMongo,
  buildHrmStaffLegacyMaps,
  legacyStaffIdFromRow,
  employeeToMongoShape,
  mapEmployeesToMongo,
  attendanceToMongoShape,
  mapAttendanceToMongo,
  payrollToMongoShape,
  mapPayrollsToMongo,
  leaveToMongoShape,
  mapLeavesToMongo,
  newsletterToMongoShape,
  mapNewslettersToMongo,
  emailCampaignToMongoShape,
  mapEmailCampaignsToMongo,
  contactMessageToAdminShape,
  mapContactMessagesToAdminShape,
  reviewToMongoShape,
  mapReviewsToMongo,
  userToMongoShape,
  mapUsersToMongo,
  addressToMongoShape,
  mapAddressesToMongo,
  wishlistItemEmbeddedToMongoShape,
  mapWishlistEmbeddedToMongo,
  walletTransactionToMongoShape,
  mapWalletTransactionsToMongo,
  cartItemEmbeddedToMongoShape,
  mapCartItemsEmbeddedToMongo,
  fromNewsletterSource,
  fromCampaignStatus,
  fromCampaignSegment,
  fromCampaignChannel,
  fromTicketStatus,
  fromTicketPriority,
  fromResourceType,
  fromLoginStatus,
  fromActorType
};
