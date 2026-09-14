/********************************************************************
 * Project: EonlineBazar
 * File: loginAttemptRepository.js
 * Location: backend/src/repositories/loginAttemptRepository.js
 * Description: Prisma repository for LoginAttempt audit records.
 *   Mongo 30-day TTL has no Postgres equivalent — sweep job is out of scope.
 *
 *   Stage 2 Step 3, Part 4 — Security/Audit dual-write (2026-09-14).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

const STATUS_MAP = {
  success: 'SUCCESS',
  failed: 'FAILED',
  otp_sent: 'OTP_SENT',
  otp_failed: 'OTP_FAILED',
  blocked: 'BLOCKED'
};

function toStatus(value) {
  const key = String(value || 'failed').toLowerCase();
  return STATUS_MAP[key] || 'FAILED';
}

function toShape(record) {
  if (!record) return null;
  return { ...record, _id: record.id };
}

async function findAll(filters = {}) {
  const where = {};
  if (filters.ip) where.ipAddress = String(filters.ip).trim();
  if (filters.username) where.username = String(filters.username).trim();
  if (filters.status) where.status = toStatus(filters.status);
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  const take = Number.isFinite(Number(filters.limit)) ? Number(filters.limit) : undefined;
  const skip = Number.isFinite(Number(filters.offset)) ? Number(filters.offset) : undefined;

  const records = await prisma.loginAttempt.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    skip
  });
  return records.map(toShape);
}

async function create(data) {
  const record = await prisma.loginAttempt.create({
    data: {
      username: String(data.username || 'unknown').trim(),
      ipAddress: String(data.ipAddress || 'Unknown').trim(),
      location: String(data.location || 'Unknown Location').trim(),
      os: String(data.os || 'Unknown OS').trim(),
      browser: String(data.browser || 'Unknown Browser').trim(),
      deviceType: String(data.deviceType || 'Desktop').trim(),
      userAgent: String(data.userAgent || '').trim(),
      status: toStatus(data.status),
      details: String(data.details || '').trim(),
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
