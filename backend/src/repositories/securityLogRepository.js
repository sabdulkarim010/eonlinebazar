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
const { fromResourceType } = require('../services/readShapeHelpers');
const { buildSettingsHistoryPrismaWhere } = require('../utils/settingsHistoryFilter');

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

function escapeContainsFragment(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildWhere(filters = {}) {
  const where = {};
  if (filters.actorType) {
    where.actorType = toActorType(filters.actorType);
  }
  if (filters.actor) {
    where.actor = String(filters.actor).trim();
  }
  if (filters.resourceType) {
    where.resourceType = toResourceType(filters.resourceType);
  }
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }
  if (filters.hrmActionType) {
    where.details = { contains: `"hrmActionType":"${escapeContainsFragment(filters.hrmActionType)}"` };
  }
  if (filters.targetStaffId) {
    const sid = escapeContainsFragment(filters.targetStaffId);
    const staffClause = {
      OR: [
        { resourceId: String(filters.targetStaffId).trim() },
        { details: { contains: `"targetStaffId":"${sid}"` } }
      ]
    };
    if (where.details) {
      where.AND = [{ details: where.details }, staffClause];
      delete where.details;
    } else {
      Object.assign(where, staffClause);
    }
  }
  if (filters.hrmResourceTypesOnly) {
    const hrmTypes = ['EMPLOYEE', 'PAYROLL', 'LEAVE'];
    const typeClause = { resourceType: { in: hrmTypes } };
    if (where.AND) {
      where.AND.push(typeClause);
    } else if (where.OR) {
      where.AND = [{ OR: where.OR }, typeClause];
      delete where.OR;
    } else {
      where.resourceType = typeClause.resourceType;
    }
  }
  return where;
}

async function findAll(filters = {}) {
  const take = Number.isFinite(Number(filters.limit)) ? Number(filters.limit) : undefined;
  const skip = Number.isFinite(Number(filters.offset)) ? Number(filters.offset) : undefined;

  const records = await prisma.securityLog.findMany({
    where: buildWhere(filters),
    orderBy: { createdAt: 'desc' },
    take,
    skip
  });
  return records.map(toShape);
}

async function count(filters = {}) {
  return prisma.securityLog.count({ where: buildWhere(filters) });
}

async function findSettingsHistory({ limit, offset } = {}) {
  const take = Number.isFinite(Number(limit)) ? Number(limit) : undefined;
  const skip = Number.isFinite(Number(offset)) ? Number(offset) : undefined;

  const records = await prisma.securityLog.findMany({
    where: buildSettingsHistoryPrismaWhere(),
    orderBy: { createdAt: 'desc' },
    take,
    skip
  });
  return records.map(toShape);
}

async function countSettingsHistory() {
  return prisma.securityLog.count({ where: buildSettingsHistoryPrismaWhere() });
}

async function distinctActors(exclude = ['', 'system']) {
  const rows = await prisma.securityLog.findMany({
    where: {
      actor: { notIn: exclude }
    },
    distinct: ['actor'],
    select: { actor: true },
    orderBy: { actor: 'asc' }
  });
  return rows.map((r) => r.actor).filter((a) => a != null && a !== '');
}

async function countStaffAuditGroups() {
  const groups = await prisma.securityLog.groupBy({
    by: ['actor'],
    where: { actorType: 'ADMIN' }
  });
  return groups.length;
}

async function findStaffAuditGroups({ skip = 0, limit = 25 } = {}) {
  const groups = await prisma.securityLog.groupBy({
    by: ['actor'],
    where: { actorType: 'ADMIN' },
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: 'desc' } },
    skip,
    take: limit
  });

  const data = [];
  for (const group of groups) {
    const typeCounts = await prisma.securityLog.groupBy({
      by: ['resourceType'],
      where: { actorType: 'ADMIN', actor: group.actor },
      _count: { _all: true }
    });
    const breakdown = {};
    typeCounts.forEach((row) => {
      const key = row.resourceType ? (fromResourceType(row.resourceType) || 'other') : 'other';
      breakdown[key] = row._count._all;
    });
    data.push({
      actor: group.actor,
      totalActions: group._count._all,
      lastActivityAt: group._max.createdAt,
      resourceBreakdown: breakdown
    });
  }
  return data;
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
  count,
  findSettingsHistory,
  countSettingsHistory,
  distinctActors,
  countStaffAuditGroups,
  findStaffAuditGroups,
  create,
  buildWhere,
  toActorType,
  toResourceType
};
