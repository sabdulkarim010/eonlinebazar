/********************************************************************
 * Project: EonlineBazar
 * File: securityLogRepository.js
 * Location: backend/src/repositories/securityLogRepository.js
 * Description: Prisma repository for SecurityLog (append-only audit trail).
 *   Actor stays a plain String — deliberately unlinked per audit.
 *
 *   Stage 2 Step 3, Part 4 — Security/Audit dual-write (2026-09-14).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

const ACTOR_TYPE_MAP = {
  admin: 'ADMIN',
  customer: 'CUSTOMER',
  system: 'SYSTEM'
};

const RESOURCE_TYPE_MAP = {
  product: 'PRODUCT',
  order: 'ORDER',
  customer: 'CUSTOMER',
  staff: 'STAFF',
  setting: 'SETTING',
  coupon: 'COUPON',
  banner: 'BANNER',
  category: 'CATEGORY',
  review: 'REVIEW',
  supplier: 'SUPPLIER',
  warehouse: 'WAREHOUSE',
  purchase_order: 'PURCHASE_ORDER',
  expense: 'EXPENSE',
  expense_category: 'EXPENSE_CATEGORY',
  attendance: 'ATTENDANCE',
  shift: 'SHIFT',
  payroll: 'PAYROLL',
  leave: 'LEAVE',
  employee: 'EMPLOYEE',
  designation: 'DESIGNATION'
};

function toActorType(value) {
  const key = String(value || 'system').toLowerCase();
  return ACTOR_TYPE_MAP[key] || 'SYSTEM';
}

function toResourceType(value) {
  if (value == null || value === '') return null;
  const key = String(value).toLowerCase();
  return RESOURCE_TYPE_MAP[key] || null;
}

function toShape(record) {
  if (!record) return null;
  return { ...record, _id: record.id };
}

async function findAll(filters = {}) {
  const where = {};
  if (filters.actorType) {
    where.actorType = toActorType(filters.actorType);
  }
  if (filters.resourceType) {
    where.resourceType = toResourceType(filters.resourceType);
  }
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  const take = Number.isFinite(Number(filters.limit)) ? Number(filters.limit) : undefined;
  const skip = Number.isFinite(Number(filters.offset)) ? Number(filters.offset) : undefined;

  const records = await prisma.securityLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    skip
  });
  return records.map(toShape);
}

async function create(data) {
  const record = await prisma.securityLog.create({
    data: {
      action: String(data.action || '').trim(),
      actor: String(data.actor || 'system').trim(),
      actorType: toActorType(data.actorType),
      ipAddress: String(data.ipAddress || 'Unknown').trim(),
      details: String(data.details || '').trim(),
      resourceType: toResourceType(data.resourceType),
      resourceId: data.resourceId != null && data.resourceId !== ''
        ? String(data.resourceId).trim()
        : null,
      legacyId: data.legacyId != null ? String(data.legacyId) : null,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined
    }
  });
  return toShape(record);
}

module.exports = {
  findAll,
  create
};
