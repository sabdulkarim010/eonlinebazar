/********************************************************************
 * Project: EonlineBazar
 * File: blacklistedIpRepository.js
 * Location: backend/src/repositories/blacklistedIpRepository.js
 * Description: Prisma repository for BlacklistedIp rows.
 *   null expiresAt = permanent ban (must not default to a placeholder date).
 *   Mongo TTL sweep on expiresAt is out of scope for this task.
 *
 *   Stage 2 Step 3, Part 4 — Security/Audit dual-write (2026-09-14).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

function toSource(value) {
  return String(value || 'auto').toLowerCase() === 'manual' ? 'MANUAL' : 'AUTO';
}

/** Preserve null for permanent bans; only coerce when a real date is provided. */
function normalizeExpiresAt(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toShape(record) {
  if (!record) return null;
  return { ...record, _id: record.id };
}

async function findAll() {
  const records = await prisma.blacklistedIp.findMany({
    orderBy: { blockedAt: 'desc' }
  });
  return records.map(toShape);
}

async function findByIp(ip) {
  const value = String(ip || '').trim();
  if (!value) return null;
  const record = await prisma.blacklistedIp.findUnique({ where: { ip: value } });
  return toShape(record);
}

async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.blacklistedIp.findUnique({
    where: { legacyId: String(legacyId) }
  });
  return toShape(record);
}

async function upsertFromMongo(mongoDoc) {
  const plain = mongoDoc.toObject ? mongoDoc.toObject() : mongoDoc;
  const ip = String(plain.ip || '').trim();
  if (!ip) throw new Error('Blacklisted IP address is required.');

  const expiresAt = normalizeExpiresAt(plain.expiresAt);
  const shared = {
    reason: String(plain.reason || 'Suspicious activity').trim(),
    source: toSource(plain.source),
    blockedBy: String(plain.blockedBy || 'system').trim(),
    blockedAt: plain.blockedAt ? new Date(plain.blockedAt) : new Date(),
    expiresAt
  };

  const record = await prisma.blacklistedIp.upsert({
    where: { ip },
    create: {
      ip,
      ...shared,
      legacyId: mongoDoc._id != null ? String(mongoDoc._id) : null
    },
    update: {
      ...shared,
      legacyId: mongoDoc._id != null ? String(mongoDoc._id) : undefined
    }
  });
  return toShape(record);
}

async function remove(id) {
  const existing = await prisma.blacklistedIp.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Blacklist entry not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await prisma.blacklistedIp.delete({ where: { id } });
  return { deleted: true, ip: existing.ip };
}

module.exports = {
  findAll,
  findByIp,
  findByLegacyId,
  upsertFromMongo,
  remove,
  normalizeExpiresAt
};
