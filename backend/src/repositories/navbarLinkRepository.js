/********************************************************************
 * Project: EonlineBazar
 * File: navbarLinkRepository.js
 * Location: backend/src/repositories/navbarLinkRepository.js
 * Description: Prisma repository for NavbarLink (Neon/PostgreSQL).
 *
 *   Stage 2 Step 3, Part 3 — CMS/Settings dual-write (2026-09-14).
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

function slugifyNavbarLink(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toLinkTarget(value) {
  return String(value || '').trim() === '_blank' ? 'BLANK' : 'SELF';
}

function fromLinkTarget(value) {
  return value === 'BLANK' ? '_blank' : '_self';
}

function toShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.id,
    target: fromLinkTarget(record.target)
  };
}

async function findAll(filters = {}) {
  const where = {};
  if (filters.isPublished !== undefined) where.isPublished = filters.isPublished;

  const records = await prisma.navbarLink.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }]
  });
  return records.map(toShape);
}

async function findById(id) {
  if (!id) return null;
  const record = await prisma.navbarLink.findUnique({ where: { id } });
  return toShape(record);
}

async function findByLegacyId(legacyId) {
  if (!legacyId) return null;
  const record = await prisma.navbarLink.findUnique({
    where: { legacyId: String(legacyId) }
  });
  return toShape(record);
}

async function create(data) {
  const title = String(data.title || '').trim();
  if (!title) throw new Error('Navbar link title is required.');

  const slug = data.slug
    ? slugifyNavbarLink(data.slug)
    : slugifyNavbarLink(title);

  const record = await prisma.navbarLink.create({
    data: {
      title,
      url: String(data.url || '').trim(),
      slug,
      target: toLinkTarget(data.target),
      isPublished: data.isPublished !== undefined ? Boolean(data.isPublished) : true,
      hasCustomPage: data.hasCustomPage !== undefined ? Boolean(data.hasCustomPage) : false,
      pageHtml: String(data.pageHtml || '').slice(0, 200000),
      sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : 0,
      legacyId: data.legacyId != null ? String(data.legacyId) : null
    }
  });
  return toShape(record);
}

async function update(id, data) {
  const existing = await prisma.navbarLink.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Navbar link not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = {};
  if (data.title !== undefined) fields.title = String(data.title).trim();
  if (data.url !== undefined) fields.url = String(data.url).trim();
  if (data.slug !== undefined) fields.slug = slugifyNavbarLink(data.slug);
  if (data.target !== undefined) fields.target = toLinkTarget(data.target);
  if (data.isPublished !== undefined) fields.isPublished = Boolean(data.isPublished);
  if (data.hasCustomPage !== undefined) fields.hasCustomPage = Boolean(data.hasCustomPage);
  if (data.pageHtml !== undefined) fields.pageHtml = String(data.pageHtml || '').slice(0, 200000);
  if (data.sortOrder !== undefined) fields.sortOrder = Number(data.sortOrder);

  const record = await prisma.navbarLink.update({ where: { id }, data: fields });
  return toShape(record);
}

async function remove(id) {
  const existing = await prisma.navbarLink.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Navbar link not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await prisma.navbarLink.delete({ where: { id } });
  return { deleted: true, title: existing.title };
}

module.exports = {
  slugifyNavbarLink,
  findAll,
  findById,
  findByLegacyId,
  create,
  update,
  remove
};
