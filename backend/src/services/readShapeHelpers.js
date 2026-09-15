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
      : null,
    cashbackPercentage: decimalToNumber(pgRow.cashbackPercentage) ?? 1,
    takaToPointsRatio: pgRow.takaToPointsRatio ?? 100,
    pointsToTakaConversionRate: pgRow.pointsToTakaConversionRate ?? 10,
    refundUndoWindowHours: pgRow.refundUndoWindowHours ?? 72,
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
    flashSaleDiscountPercent: pgRow.flashSaleDiscountPercent ?? 0,
    flashSaleProductIds: Array.isArray(pgRow.flashSaleProductIds) ? pgRow.flashSaleProductIds : [],
    vipMinTotalSpent: pgRow.vipMinTotalSpent ?? 10000,
    vipMinOrderCount: pgRow.vipMinOrderCount ?? 5,
    frequentBuyerMinOrders: pgRow.frequentBuyerMinOrders ?? 3,
    referralRewardAmount: pgRow.referralRewardAmount ?? 100,
    enableTieredLoyalty: pgRow.enableTieredLoyalty === true,
    silverThreshold: pgRow.silverThreshold ?? 5000,
    goldThreshold: pgRow.goldThreshold ?? 15000,
    platinumThreshold: pgRow.platinumThreshold ?? 50000,
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
  settingsToMongoShape
};
