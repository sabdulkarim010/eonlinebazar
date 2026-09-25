/********************************************************************
 * Project: EonlineBazar
 * File: emailCampaignRepository.js
 * Location: backend/src/repositories/emailCampaignRepository.js
 * Description: Prisma repository for EmailCampaign rows.
 *   stats{} flattens to statsTotalRecipients / statsSent / statsFailed.
 *   Stage 2 Step 3, Part 6 — Marketing/Support dual-write (2026-09-14).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

function toShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.id,
    stats: {
      totalRecipients: record.statsTotalRecipients,
      sent: record.statsSent,
      failed: record.statsFailed
    }
  };
}

function toCampaignStatus(value) {
  const map = {
    draft: 'DRAFT',
    scheduled: 'SCHEDULED',
    sending: 'SENDING',
    sent: 'SENT',
    failed: 'FAILED'
  };
  return map[String(value || '').toLowerCase()] || 'DRAFT';
}

function toCampaignSegment(value) {
  const map = {
    all: 'ALL',
    vip: 'VIP',
    frequent: 'FREQUENT',
    inactive: 'INACTIVE',
    new: 'NEW'
  };
  return map[String(value || '').toLowerCase()] || 'ALL';
}

function toCampaignChannel(value) {
  const map = { email: 'EMAIL', sms: 'SMS', whatsapp: 'WHATSAPP' };
  return map[String(value || '').toLowerCase()] || 'EMAIL';
}

async function resolveCreatedById(mongoAdminId) {
  if (!mongoAdminId) return null;
  const row = await prisma.admin.findUnique({
    where: { legacyId: String(mongoAdminId) }
  });
  return row ? row.id : null;
}

function flattenStats(stats = {}) {
  return {
    statsTotalRecipients: Number(stats.totalRecipients) || 0,
    statsSent: Number(stats.sent) || 0,
    statsFailed: Number(stats.failed) || 0
  };
}

async function mapMongoToWrite(mongoDoc) {
  const plain = mongoDoc.toObject ? mongoDoc.toObject() : mongoDoc;
  const stats = flattenStats(plain.stats);
  const createdByRef = plain.createdBy?._id || plain.createdBy || null;

  return {
    title: String(plain.title || '').trim(),
    subject: String(plain.subject || '').trim(),
    htmlContent: String(plain.htmlContent || ''),
    templateData: plain.templateData && typeof plain.templateData === 'object' ? plain.templateData : undefined,
    status: toCampaignStatus(plain.status),
    targetTags: Array.isArray(plain.targetTags) ? plain.targetTags.map(String) : [],
    targetSegment: toCampaignSegment(plain.targetSegment),
    channel: toCampaignChannel(plain.channel),
    whatsappTemplate: String(plain.whatsappTemplate || ''),
    scheduledAt: plain.scheduledAt ? new Date(plain.scheduledAt) : null,
    sentAt: plain.sentAt ? new Date(plain.sentAt) : null,
    ...stats,
    createdById: await resolveCreatedById(createdByRef),
    createdAt: plain.createdAt ? new Date(plain.createdAt) : new Date(),
    legacyId: mongoDoc._id != null ? String(mongoDoc._id) : null
  };
}

async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.emailCampaign.findUnique({
    where: { legacyId: String(legacyId) }
  });
  return toShape(record);
}

async function findAll(filters = {}) {
  const where = {};
  if (filters.status) where.status = toCampaignStatus(filters.status);

  const records = await prisma.emailCampaign.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: {
        select: { legacyId: true, username: true, displayName: true }
      }
    }
  });
  return records.map(toShape);
}

async function create(data) {
  const title = String(data.title || '').trim();
  const subject = String(data.subject || '').trim();
  if (!title || !subject) throw new Error('Campaign title and subject are required.');

  const stats = flattenStats(data.stats);
  const createdByRef = data.createdBy?._id || data.createdBy || data.createdById || null;

  const record = await prisma.emailCampaign.create({
    data: {
      title,
      subject,
      htmlContent: String(data.htmlContent || ''),
      status: data.status ? toCampaignStatus(data.status) : 'DRAFT',
      targetTags: Array.isArray(data.targetTags) ? data.targetTags.map(String) : [],
      targetSegment: data.targetSegment ? toCampaignSegment(data.targetSegment) : 'ALL',
      channel: data.channel ? toCampaignChannel(data.channel) : 'EMAIL',
      whatsappTemplate: String(data.whatsappTemplate || ''),
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      sentAt: data.sentAt ? new Date(data.sentAt) : null,
      ...stats,
      createdById: await resolveCreatedById(createdByRef),
      legacyId: data.legacyId != null ? String(data.legacyId) : null
    }
  });
  return toShape(record);
}

async function update(id, data) {
  const existing = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Email campaign not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  if (data.title !== undefined) fields.title = String(data.title).trim();
  if (data.subject !== undefined) fields.subject = String(data.subject).trim();
  if (data.htmlContent !== undefined) fields.htmlContent = String(data.htmlContent);
  if (data.templateData !== undefined) {
    fields.templateData = data.templateData && typeof data.templateData === 'object' ? data.templateData : null;
  }
  if (data.status !== undefined) fields.status = toCampaignStatus(data.status);
  if (data.targetTags !== undefined) {
    fields.targetTags = Array.isArray(data.targetTags) ? data.targetTags.map(String) : [];
  }
  if (data.targetSegment !== undefined) fields.targetSegment = toCampaignSegment(data.targetSegment);
  if (data.channel !== undefined) fields.channel = toCampaignChannel(data.channel);
  if (data.whatsappTemplate !== undefined) fields.whatsappTemplate = String(data.whatsappTemplate);
  if (data.scheduledAt !== undefined) {
    fields.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
  }
  if (data.sentAt !== undefined) fields.sentAt = data.sentAt ? new Date(data.sentAt) : null;
  if (data.stats !== undefined) Object.assign(fields, flattenStats(data.stats));
  if (data.statsTotalRecipients !== undefined) {
    fields.statsTotalRecipients = Number(data.statsTotalRecipients) || 0;
  }
  if (data.statsSent !== undefined) fields.statsSent = Number(data.statsSent) || 0;
  if (data.statsFailed !== undefined) fields.statsFailed = Number(data.statsFailed) || 0;
  if (data.createdById !== undefined) fields.createdById = data.createdById;

  const record = await prisma.emailCampaign.update({ where: { id }, data: fields });
  return toShape(record);
}

/** Mirror exact Mongo saved state (used on create and per-batch send progress). */
async function upsertFromMongo(mongoDoc) {
  const mapped = await mapMongoToWrite(mongoDoc);
  const legacyId = mapped.legacyId;
  if (!legacyId) throw new Error('EmailCampaign legacyId is required for upsert.');

  const existing = await prisma.emailCampaign.findUnique({ where: { legacyId } });
  if (existing) {
    const record = await prisma.emailCampaign.update({
      where: { id: existing.id },
      data: mapped
    });
    return toShape(record);
  }

  const record = await prisma.emailCampaign.create({ data: mapped });
  return toShape(record);
}

module.exports = {
  findByLegacyId,
  findAll,
  create,
  update,
  upsertFromMongo,
  mapMongoToWrite,
  flattenStats,
  toCampaignStatus,
  toCampaignSegment,
  toCampaignChannel
};
