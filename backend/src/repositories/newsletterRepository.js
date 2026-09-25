/********************************************************************
 * Project: EonlineBazar
 * File: newsletterRepository.js
 * Location: backend/src/repositories/newsletterRepository.js
 * Description: Prisma repository for Newsletter subscribers.
 *   Stage 2 Step 3, Part 6 — Marketing/Support dual-write (2026-09-14).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

function toShape(record) {
  if (!record) return null;
  return { ...record, _id: record.id };
}

function toSource(value) {
  const map = {
    footer_form: 'FOOTER_FORM',
    checkout: 'CHECKOUT',
    popup: 'POPUP',
    manual: 'MANUAL'
  };
  return map[String(value || '').toLowerCase()] || 'FOOTER_FORM';
}

function mapMongoToWrite(mongoDoc) {
  const plain = mongoDoc.toObject ? mongoDoc.toObject() : mongoDoc;
  return {
    email: String(plain.email || '').trim().toLowerCase(),
    name: plain.name != null ? String(plain.name).trim() || null : null,
    isActive: plain.isActive !== false,
    isConfirmed: plain.isConfirmed !== false,
    source: toSource(plain.source),
    subscribedAt: plain.subscribedAt ? new Date(plain.subscribedAt) : new Date(),
    unsubscribedAt: plain.unsubscribedAt ? new Date(plain.unsubscribedAt) : null,
    unsubscribeToken: plain.unsubscribeToken != null ? String(plain.unsubscribeToken) : null,
    confirmToken: plain.confirmToken != null ? String(plain.confirmToken) : null,
    confirmTokenExpiresAt: plain.confirmTokenExpiresAt ? new Date(plain.confirmTokenExpiresAt) : null,
    confirmedAt: plain.confirmedAt ? new Date(plain.confirmedAt) : null,
    tags: Array.isArray(plain.tags) ? plain.tags.map((t) => String(t)) : [],
    emailsSent: Number(plain.emailsSent) || 0,
    lastEmailAt: plain.lastEmailAt ? new Date(plain.lastEmailAt) : null,
    legacyId: mongoDoc._id != null ? String(mongoDoc._id) : null
  };
}

async function findByEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return null;
  const record = await prisma.newsletter.findUnique({ where: { email: value } });
  return toShape(record);
}

async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.newsletter.findUnique({
    where: { legacyId: String(legacyId) }
  });
  return toShape(record);
}

function buildNewsletterWhere(filters = {}) {
  const where = {};
  if (filters.isActive !== undefined) where.isActive = Boolean(filters.isActive);
  if (filters.tag) where.tags = { has: String(filters.tag).toLowerCase() };
  if (filters.search) {
    const term = String(filters.search).trim();
    where.OR = [
      { email: { contains: term, mode: 'insensitive' } },
      { name: { contains: term, mode: 'insensitive' } }
    ];
  }
  return where;
}

async function count(filters = {}) {
  return prisma.newsletter.count({ where: buildNewsletterWhere(filters) });
}

async function countByIsActive(isActive) {
  return prisma.newsletter.count({ where: { isActive: Boolean(isActive) } });
}

async function findPaginated(filters = {}, { skip = 0, take = 20 } = {}) {
  const records = await prisma.newsletter.findMany({
    where: buildNewsletterWhere(filters),
    orderBy: { subscribedAt: 'desc' },
    skip,
    take
  });
  return records.map(toShape);
}

async function findAll(filters = {}) {
  const records = await prisma.newsletter.findMany({
    where: buildNewsletterWhere(filters),
    orderBy: { subscribedAt: 'desc' }
  });
  return records.map(toShape);
}

async function create(data) {
  const email = String(data.email || '').trim().toLowerCase();
  if (!email) throw new Error('Newsletter email is required.');

  const record = await prisma.newsletter.create({
    data: {
      email,
      name: data.name != null ? String(data.name).trim() || null : null,
      isActive: data.isActive !== false,
      source: data.source ? toSource(data.source) : 'FOOTER_FORM',
      subscribedAt: data.subscribedAt ? new Date(data.subscribedAt) : new Date(),
      unsubscribedAt: data.unsubscribedAt ? new Date(data.unsubscribedAt) : null,
      unsubscribeToken: data.unsubscribeToken != null ? String(data.unsubscribeToken) : null,
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      emailsSent: Number(data.emailsSent) || 0,
      lastEmailAt: data.lastEmailAt ? new Date(data.lastEmailAt) : null,
      legacyId: data.legacyId != null ? String(data.legacyId) : null
    }
  });
  return toShape(record);
}

async function update(id, data) {
  const existing = await prisma.newsletter.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Newsletter subscriber not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  if (data.name !== undefined) fields.name = data.name != null ? String(data.name).trim() || null : null;
  if (data.isActive !== undefined) fields.isActive = Boolean(data.isActive);
  if (data.isConfirmed !== undefined) fields.isConfirmed = Boolean(data.isConfirmed);
  if (data.source !== undefined) fields.source = toSource(data.source);
  if (data.confirmToken !== undefined) {
    fields.confirmToken = data.confirmToken != null ? String(data.confirmToken) : null;
  }
  if (data.confirmTokenExpiresAt !== undefined) {
    fields.confirmTokenExpiresAt = data.confirmTokenExpiresAt ? new Date(data.confirmTokenExpiresAt) : null;
  }
  if (data.confirmedAt !== undefined) {
    fields.confirmedAt = data.confirmedAt ? new Date(data.confirmedAt) : null;
  }
  if (data.subscribedAt !== undefined) fields.subscribedAt = new Date(data.subscribedAt);
  if (data.unsubscribedAt !== undefined) {
    fields.unsubscribedAt = data.unsubscribedAt ? new Date(data.unsubscribedAt) : null;
  }
  if (data.unsubscribeToken !== undefined) {
    fields.unsubscribeToken = data.unsubscribeToken != null ? String(data.unsubscribeToken) : null;
  }
  if (data.tags !== undefined) fields.tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
  if (data.emailsSent !== undefined) fields.emailsSent = Number(data.emailsSent) || 0;
  if (data.lastEmailAt !== undefined) {
    fields.lastEmailAt = data.lastEmailAt ? new Date(data.lastEmailAt) : null;
  }

  const record = await prisma.newsletter.update({ where: { id }, data: fields });
  return toShape(record);
}

/** Soft-unsubscribe mirror — sets isActive false (matches Mongo unsubscribe). */
async function unsubscribe(id) {
  return update(id, { isActive: false, unsubscribedAt: new Date() });
}

async function remove(id) {
  const existing = await prisma.newsletter.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Newsletter subscriber not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await prisma.newsletter.delete({ where: { id } });
  return { deleted: true, email: existing.email };
}

/** Upsert by unique email — mirrors subscribe/reactivate/unsubscribe saves. */
async function upsertFromMongo(mongoDoc) {
  const mapped = mapMongoToWrite(mongoDoc);
  if (!mapped.email) throw new Error('Newsletter email is required.');

  const record = await prisma.newsletter.upsert({
    where: { email: mapped.email },
    create: mapped,
    update: mapped
  });
  return toShape(record);
}

module.exports = {
  findByEmail,
  findByLegacyId,
  findAll,
  findPaginated,
  count,
  countByIsActive,
  buildNewsletterWhere,
  create,
  update,
  unsubscribe,
  remove,
  upsertFromMongo,
  mapMongoToWrite,
  toSource
};
