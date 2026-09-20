/********************************************************************
 * Project: EonlineBazar
 * File: paymentMethodRepository.js
 * Location: backend/src/repositories/paymentMethodRepository.js
 * Author: Abdul Karim Sheikh
 * Description: Prisma repository for the PaymentMethod model (PostgreSQL).
 *   Mirrors PaymentMethod.js Mongoose model and paymentMethodService.js.
 *   Dual-write support — Stage 2 Step 3, Part 1.3 (2026-09-20).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

// ── Type mapping ─────────────────────────────────────────────────────────────
// Mongoose PaymentMethod.type: 'manual' | 'automated'
// Prisma PaymentMethodType enum: MANUAL | AUTOMATED
function toTypeEnum(mongoType) {
  const normalized = String(mongoType || 'manual').toLowerCase();
  return normalized === 'automated' ? 'AUTOMATED' : 'MANUAL';
}

function toMongoType(prismaType) {
  return prismaType === 'AUTOMATED' ? 'automated' : 'manual';
}

// Mongoose provider: 'sslcommerz' | 'aamarpay' | 'shurjopay' | 'stripe' | 'custom' | ''
// Prisma GatewayProvider enum: SSLCOMMERZ | AAMARPAY | SHURJOPAY | STRIPE | CUSTOM
function toProviderEnum(mongoProvider) {
  if (!mongoProvider) return null;
  const normalized = String(mongoProvider).toLowerCase();
  const map = {
    sslcommerz: 'SSLCOMMERZ',
    aamarpay: 'AAMARPAY',
    shurjopay: 'SHURJOPAY',
    stripe: 'STRIPE',
    custom: 'CUSTOM'
  };
  return map[normalized] || null;
}

function toMongoProvider(prismaProvider) {
  if (!prismaProvider) return '';
  const map = {
    SSLCOMMERZ: 'sslcommerz',
    AAMARPAY: 'aamarpay',
    SHURJOPAY: 'shurjopay',
    STRIPE: 'stripe',
    CUSTOM: 'custom'
  };
  return map[prismaProvider] || '';
}

// Mongoose feeType: 'flat' | 'percentage'
// Prisma FeeType enum: FLAT | PERCENTAGE
function toFeeTypeEnum(mongoFeeType) {
  const normalized = String(mongoFeeType || 'percentage').toLowerCase();
  return normalized === 'flat' ? 'FLAT' : 'PERCENTAGE';
}

function toMongoFeeType(prismaFeeType) {
  return prismaFeeType === 'FLAT' ? 'flat' : 'percentage';
}

// ── Shape normalisation ──────────────────────────────────────────────────────
// Returns a plain object shaped like Mongoose .lean() result for controller compatibility.
// Adds `_id` alias for `id`, maps Prisma enums back to Mongoose strings, and
// reconstructs the nested `apiConfig` subdocument from flattened PG fields.
function toMongoShape(record) {
  if (!record) return null;
  const out = {
    _id: record.id,
    id: record.id,
    legacyId: record.legacyId,
    name: record.name,
    code: record.code,
    logoUrl: record.logoUrl,
    type: toMongoType(record.type),
    provider: toMongoProvider(record.provider),
    instructions: record.instructions,
    accountNumber: record.accountNumber,
    processingFee: Number(record.processingFee),
    feeType: toMongoFeeType(record.feeType),
    sortOrder: record.sortOrder,
    isActive: record.isActive,
    description: record.description,
    createdByAdmin: record.createdByAdmin,
    updatedByAdmin: record.updatedByAdmin,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    // Reconstruct nested apiConfig subdocument from flattened PG fields
    apiConfig: {
      storeId: record.apiStoreId,
      storePassword: record.apiStorePassword,
      apiKey: record.apiKey,
      isSandbox: record.apiIsSandbox,
      webhookUrl: record.apiWebhookUrl
    }
  };
  return out;
}

// ── upsertPaymentMethodInPG ──────────────────────────────────────────────────
// Upserts by legacyId (MongoDB _id). If legacyId exists, updates; otherwise creates.
// Never throws — logs failure and returns null on error (dual-write safety).
async function upsertPaymentMethodInPG(mongoDoc) {
  try {
    if (!mongoDoc || !mongoDoc._id) {
      console.error('[DUAL-WRITE-PAYMENTMETHOD-FAIL] Missing mongoDoc or _id');
      return null;
    }

    const legacyId = String(mongoDoc._id);
    const apiConfig = mongoDoc.apiConfig || {};

    const data = {
      name: String(mongoDoc.name || '').trim(),
      code: String(mongoDoc.code || '').trim(),
      logoUrl: String(mongoDoc.logoUrl || ''),
      type: toTypeEnum(mongoDoc.type),
      provider: toProviderEnum(mongoDoc.provider),
      instructions: String(mongoDoc.instructions || ''),
      accountNumber: String(mongoDoc.accountNumber || ''),
      processingFee: Number(mongoDoc.processingFee) || 0,
      feeType: toFeeTypeEnum(mongoDoc.feeType),
      sortOrder: Number(mongoDoc.sortOrder) || 0,
      apiStoreId: String(apiConfig.storeId || ''),
      apiStorePassword: String(apiConfig.storePassword || ''),
      apiKey: String(apiConfig.apiKey || ''),
      apiIsSandbox: apiConfig.isSandbox !== false,
      apiWebhookUrl: String(apiConfig.webhookUrl || ''),
      isActive: mongoDoc.isActive === true,
      description: String(mongoDoc.description || ''),
      createdByAdmin: String(mongoDoc.createdByAdmin || ''),
      updatedByAdmin: String(mongoDoc.updatedByAdmin || ''),
      updatedAt: new Date()
    };

    const record = await prisma.paymentMethod.upsert({
      where: { legacyId },
      create: { ...data, legacyId },
      update: data
    });

    return toMongoShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-PAYMENTMETHOD-FAIL]', {
      legacyId: String(mongoDoc?._id),
      error: err.message
    });
    return null;
  }
}

// ── getPaymentMethodByMongoId ────────────────────────────────────────────────
// Retrieves a PaymentMethod from PostgreSQL by its original MongoDB _id (legacyId).
// Returns null if not found. Never throws.
async function getPaymentMethodByMongoId(mongoId) {
  try {
    if (!mongoId) return null;
    const record = await prisma.paymentMethod.findUnique({
      where: { legacyId: String(mongoId) }
    });
    return toMongoShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-PAYMENTMETHOD-FAIL]', {
      operation: 'getByMongoId',
      mongoId: String(mongoId),
      error: err.message
    });
    return null;
  }
}

// ── listPaymentMethodsFromPG ─────────────────────────────────────────────────
// Returns all PaymentMethods from PostgreSQL sorted by sortOrder then name.
// Mirrors PaymentMethod.findActiveSorted() behavior (but includes inactive too).
// Returns empty array on error. Never throws.
async function listPaymentMethodsFromPG(filters = {}) {
  try {
    const where = {};
    if (filters.isActive !== undefined) where.isActive = filters.isActive;
    if (filters.type !== undefined) where.type = toTypeEnum(filters.type);

    const records = await prisma.paymentMethod.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    });
    return records.map(toMongoShape);
  } catch (err) {
    console.error('[DUAL-WRITE-PAYMENTMETHOD-FAIL]', {
      operation: 'listFromPG',
      error: err.message
    });
    return [];
  }
}

// ── deletePaymentMethodInPG ──────────────────────────────────────────────────
// Deletes a PaymentMethod from PostgreSQL by its original MongoDB _id (legacyId).
// Never throws — logs failure and returns silently (dual-write safety).
async function deletePaymentMethodInPG(mongoId) {
  try {
    if (!mongoId) return;
    await prisma.paymentMethod.delete({
      where: { legacyId: String(mongoId) }
    });
  } catch (err) {
    // If not found, that's fine (idempotent delete)
    if (err.code === 'P2025') return;
    console.error('[DUAL-WRITE-PAYMENTMETHOD-FAIL]', {
      operation: 'delete',
      mongoId: String(mongoId),
      error: err.message
    });
  }
}

module.exports = {
  upsertPaymentMethodInPG,
  getPaymentMethodByMongoId,
  listPaymentMethodsFromPG,
  deletePaymentMethodInPG
};
