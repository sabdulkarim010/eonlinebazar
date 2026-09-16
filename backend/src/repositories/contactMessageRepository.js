/********************************************************************
 * Project: EonlineBazar
 * File: contactMessageRepository.js
 * Location: backend/src/repositories/contactMessageRepository.js
 * Description: Prisma repository for ContactMessage support tickets.
 *   assignedTo stays a plain Admin username string (loose ref by design).
 *   Stage 2 Step 3, Part 6 — Marketing/Support dual-write (2026-09-14).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

function toShape(record) {
  if (!record) return null;
  return { ...record, _id: record.id };
}

function toTicketStatus(value) {
  const map = {
    open: 'OPEN',
    in_progress: 'IN_PROGRESS',
    resolved: 'RESOLVED',
    closed: 'CLOSED'
  };
  return map[String(value || '').toLowerCase()] || 'OPEN';
}

function toTicketPriority(value) {
  const map = {
    low: 'LOW',
    normal: 'NORMAL',
    high: 'HIGH',
    urgent: 'URGENT'
  };
  return map[String(value || '').toLowerCase()] || 'NORMAL';
}

function mapMongoToWrite(mongoDoc) {
  const plain = mongoDoc.toObject ? mongoDoc.toObject() : mongoDoc;
  return {
    name: String(plain.name || '').trim(),
    email: String(plain.email || '').trim().toLowerCase(),
    phone: String(plain.phone || ''),
    subject: String(plain.subject || ''),
    message: String(plain.message || ''),
    ticketNumber: plain.ticketNumber ? String(plain.ticketNumber) : null,
    status: toTicketStatus(plain.status),
    priority: toTicketPriority(plain.priority),
    assignedTo: String(plain.assignedTo || ''),
    firstResponseAt: plain.firstResponseAt ? new Date(plain.firstResponseAt) : null,
    resolvedAt: plain.resolvedAt ? new Date(plain.resolvedAt) : null,
    replyMessage: String(plain.replyMessage || ''),
    repliedAt: plain.repliedAt ? new Date(plain.repliedAt) : null,
    isRead: plain.isRead === true,
    legacyId: mongoDoc._id != null ? String(mongoDoc._id) : null
  };
}

async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.contactMessage.findUnique({
    where: { legacyId: String(legacyId) }
  });
  return toShape(record);
}

function buildContactMessageWhere(filters = {}) {
  const where = {};
  if (filters.status) where.status = toTicketStatus(filters.status);
  if (filters.priority) where.priority = toTicketPriority(filters.priority);
  if (filters.isRead !== undefined) where.isRead = Boolean(filters.isRead);
  if (filters.assignedTo !== undefined) where.assignedTo = String(filters.assignedTo);
  return where;
}

async function count(filters = {}) {
  return prisma.contactMessage.count({ where: buildContactMessageWhere(filters) });
}

/**
 * Mirrors listContactMessages inbox badge — NOT ticket stats unread.
 * Mongo: $or: [{ status: 'unread' }, { status: { $exists: false }, isRead: false }]
 * Postgres rows always have enum status; legacy `unread` is not stored after backfill.
 */
async function countUnreadInbox() {
  return 0;
}

async function aggregateTicketStats() {
  const [byStatus, byPriority, total, unassigned, unread] = await Promise.all([
    prisma.contactMessage.groupBy({
      by: ['status'],
      _count: { _all: true }
    }),
    prisma.contactMessage.groupBy({
      by: ['priority'],
      _count: { _all: true }
    }),
    prisma.contactMessage.count(),
    prisma.contactMessage.count({
      where: { OR: [{ assignedTo: '' }] }
    }),
    prisma.contactMessage.count({ where: { isRead: false } })
  ]);
  return { byStatus, byPriority, total, unassigned, unread };
}

async function findAll(filters = {}) {
  const records = await prisma.contactMessage.findMany({
    where: buildContactMessageWhere(filters),
    orderBy: { createdAt: 'desc' },
    take: filters.limit != null ? Number(filters.limit) : undefined
  });
  return records.map(toShape);
}

async function create(data) {
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const message = String(data.message || '').trim();
  if (!name || !email || !message) {
    throw new Error('Contact message name, email, and message are required.');
  }

  const record = await prisma.contactMessage.create({
    data: {
      name,
      email,
      phone: String(data.phone || ''),
      subject: String(data.subject || ''),
      message,
      ticketNumber: data.ticketNumber ? String(data.ticketNumber) : null,
      status: data.status ? toTicketStatus(data.status) : 'OPEN',
      priority: data.priority ? toTicketPriority(data.priority) : 'NORMAL',
      assignedTo: String(data.assignedTo || ''),
      firstResponseAt: data.firstResponseAt ? new Date(data.firstResponseAt) : null,
      resolvedAt: data.resolvedAt ? new Date(data.resolvedAt) : null,
      replyMessage: String(data.replyMessage || ''),
      repliedAt: data.repliedAt ? new Date(data.repliedAt) : null,
      isRead: data.isRead === true,
      legacyId: data.legacyId != null ? String(data.legacyId) : null
    }
  });
  return toShape(record);
}

async function update(id, data) {
  const existing = await prisma.contactMessage.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Contact message not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  if (data.name !== undefined) fields.name = String(data.name).trim();
  if (data.email !== undefined) fields.email = String(data.email).trim().toLowerCase();
  if (data.phone !== undefined) fields.phone = String(data.phone);
  if (data.subject !== undefined) fields.subject = String(data.subject);
  if (data.message !== undefined) fields.message = String(data.message);
  if (data.ticketNumber !== undefined) {
    fields.ticketNumber = data.ticketNumber ? String(data.ticketNumber) : null;
  }
  if (data.status !== undefined) fields.status = toTicketStatus(data.status);
  if (data.priority !== undefined) fields.priority = toTicketPriority(data.priority);
  if (data.assignedTo !== undefined) fields.assignedTo = String(data.assignedTo);
  if (data.firstResponseAt !== undefined) {
    fields.firstResponseAt = data.firstResponseAt ? new Date(data.firstResponseAt) : null;
  }
  if (data.resolvedAt !== undefined) {
    fields.resolvedAt = data.resolvedAt ? new Date(data.resolvedAt) : null;
  }
  if (data.replyMessage !== undefined) fields.replyMessage = String(data.replyMessage);
  if (data.repliedAt !== undefined) {
    fields.repliedAt = data.repliedAt ? new Date(data.repliedAt) : null;
  }
  if (data.isRead !== undefined) fields.isRead = Boolean(data.isRead);

  const record = await prisma.contactMessage.update({ where: { id }, data: fields });
  return toShape(record);
}

async function upsertFromMongo(mongoDoc) {
  const mapped = mapMongoToWrite(mongoDoc);
  const legacyId = mapped.legacyId;
  if (!legacyId) throw new Error('ContactMessage legacyId is required for upsert.');

  const existing = await prisma.contactMessage.findUnique({ where: { legacyId } });
  if (existing) {
    const record = await prisma.contactMessage.update({
      where: { id: existing.id },
      data: mapped
    });
    return toShape(record);
  }

  const record = await prisma.contactMessage.create({ data: mapped });
  return toShape(record);
}

async function remove(id) {
  const existing = await prisma.contactMessage.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Contact message not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await prisma.contactMessage.delete({ where: { id } });
  return { deleted: true, ticketNumber: existing.ticketNumber };
}

module.exports = {
  findByLegacyId,
  findAll,
  count,
  countUnreadInbox,
  aggregateTicketStats,
  buildContactMessageWhere,
  create,
  update,
  upsertFromMongo,
  remove,
  mapMongoToWrite,
  toTicketStatus,
  toTicketPriority
};
