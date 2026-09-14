/********************************************************************
 * Project: EonlineBazar
 * File: pageContentRepository.js
 * Location: backend/src/repositories/pageContentRepository.js
 * Description: Prisma repository for PageContent (Neon/PostgreSQL).
 *   Replicates renderBodyHtml pre-save hook via markdownToHtml utility.
 *
 *   Stage 2 Step 3, Part 3 — CMS/Settings dual-write (2026-09-14).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');
const { markdownToHtml } = require('../utils/markdownToHtml');

function toContentFormat(value) {
  return String(value || '').toLowerCase() === 'html' ? 'HTML' : 'MARKDOWN';
}

function fromContentFormat(value) {
  return value === 'HTML' ? 'html' : 'markdown';
}

function toShape(record) {
  if (!record) return null;
  const out = { ...record, _id: record.id, contentFormat: fromContentFormat(record.contentFormat) };
  if (record.slug === 'contact') {
    out.contactMeta = {
      address: record.contactMetaAddress || '',
      phone: record.contactMetaPhone || '',
      email: record.contactMetaEmail || '',
      hours: record.contactMetaHours || '',
      mapEmbedUrl: record.contactMetaMapEmbedUrl || ''
    };
  }
  return out;
}

function resolveBodyHtml(data) {
  const format = toContentFormat(data.contentFormat);
  if (format === 'HTML') {
    return String(data.bodyHtml || '').slice(0, 200000);
  }
  const markdown = String(data.bodyMarkdown || '');
  return markdownToHtml(markdown);
}

function mapContactMeta(data, slug) {
  if (slug !== 'contact' && data.slug !== 'contact') {
    return {
      contactMetaAddress: '',
      contactMetaPhone: '',
      contactMetaEmail: '',
      contactMetaHours: '',
      contactMetaMapEmbedUrl: ''
    };
  }
  const meta = data.contactMeta || {};
  return {
    contactMetaAddress: String(meta.address ?? data.contactMetaAddress ?? '').trim(),
    contactMetaPhone: String(meta.phone ?? data.contactMetaPhone ?? '').trim(),
    contactMetaEmail: String(meta.email ?? data.contactMetaEmail ?? '').trim(),
    contactMetaHours: String(meta.hours ?? data.contactMetaHours ?? '').trim(),
    contactMetaMapEmbedUrl: String(meta.mapEmbedUrl ?? data.contactMetaMapEmbedUrl ?? '').trim()
  };
}

async function findAll(filters = {}) {
  const where = {};
  if (filters.isPublished !== undefined) where.isPublished = filters.isPublished;

  const records = await prisma.pageContent.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }]
  });
  return records.map(toShape);
}

async function findById(id) {
  if (!id) return null;
  const record = await prisma.pageContent.findUnique({ where: { id } });
  return toShape(record);
}

async function findBySlug(slug) {
  if (!slug) return null;
  const record = await prisma.pageContent.findUnique({
    where: { slug: String(slug).toLowerCase() }
  });
  return toShape(record);
}

async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.pageContent.findUnique({
    where: { legacyId: String(legacyId) }
  });
  return toShape(record);
}

async function create(data) {
  const slug = String(data.slug || '').toLowerCase();
  const title = String(data.title || '').trim();
  if (!slug || !title) throw new Error('Page slug and title are required.');

  const format = toContentFormat(data.contentFormat);
  const bodyMarkdown = format === 'HTML' ? '' : String(data.bodyMarkdown || '');
  const bodyHtml = resolveBodyHtml(data);

  const record = await prisma.pageContent.create({
    data: {
      slug,
      title,
      subtitle: String(data.subtitle || '').trim(),
      bodyMarkdown,
      bodyHtml,
      contentFormat: format,
      isPublished: data.isPublished !== undefined ? Boolean(data.isPublished) : true,
      sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : 0,
      updatedByAdmin: String(data.updatedByAdmin || '').trim(),
      legacyId: data.legacyId != null ? String(data.legacyId) : null,
      ...mapContactMeta(data, slug)
    }
  });
  return toShape(record);
}

async function update(id, data) {
  const existing = await prisma.pageContent.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Page not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  if (data.title !== undefined) fields.title = String(data.title).trim();
  if (data.subtitle !== undefined) fields.subtitle = String(data.subtitle).trim();
  if (data.isPublished !== undefined) fields.isPublished = Boolean(data.isPublished);
  if (data.sortOrder !== undefined) fields.sortOrder = Number(data.sortOrder);
  if (data.updatedByAdmin !== undefined) fields.updatedByAdmin = String(data.updatedByAdmin).trim();

  const nextFormat = data.contentFormat !== undefined
    ? toContentFormat(data.contentFormat)
    : existing.contentFormat;

  if (data.contentFormat !== undefined) fields.contentFormat = nextFormat;

  if (data.bodyHtml !== undefined && nextFormat === 'HTML') {
    fields.bodyHtml = String(data.bodyHtml || '').slice(0, 200000);
    fields.bodyMarkdown = '';
  } else if (data.bodyMarkdown !== undefined) {
    fields.bodyMarkdown = String(data.bodyMarkdown || '').slice(0, 50000);
    fields.bodyHtml = markdownToHtml(fields.bodyMarkdown);
    fields.contentFormat = 'MARKDOWN';
  } else if (data.contentFormat === 'html' || data.contentFormat === 'HTML') {
    fields.bodyHtml = String(data.bodyHtml ?? existing.bodyHtml).slice(0, 200000);
  }

  const slug = existing.slug;
  if (data.contactMeta !== undefined || slug === 'contact') {
    Object.assign(fields, mapContactMeta({ ...existing, ...data, slug }, slug));
  }

  const record = await prisma.pageContent.update({ where: { id }, data: fields });
  return toShape(record);
}

async function remove(id) {
  const existing = await prisma.pageContent.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Page not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await prisma.pageContent.delete({ where: { id } });
  return { deleted: true, slug: existing.slug };
}

module.exports = {
  findAll,
  findById,
  findBySlug,
  findByLegacyId,
  create,
  update,
  remove
};
