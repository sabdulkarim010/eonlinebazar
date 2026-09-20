/********************************************************************
 * Project: EonlineBazar
 * File: noteRepository.js
 * Location: backend/src/repositories/noteRepository.js
 * Description: Prisma repository for Note + NoteShoppingItem dual-write.
 * Stage 2 Step 3, Part 2.5 — 2026-09-20
 ********************************************************************/

'use strict';

const prisma = require('../config/prismaClient');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toNoteTypeEnum(value) {
  const map = {
    note: 'NOTE',
    general: 'GENERAL',
    expense: 'EXPENSE',
    income: 'INCOME',
    shopping: 'SHOPPING'
  };
  return map[String(value || 'note').toLowerCase()] || 'NOTE';
}

function fromNoteTypeEnum(value) {
  return String(value || 'NOTE').toLowerCase();
}

function toNoteCategoryEnum(value) {
  const map = {
    food: 'FOOD',
    transport: 'TRANSPORT',
    shopping: 'SHOPPING',
    bill: 'BILL',
    health: 'HEALTH',
    education: 'EDUCATION',
    other: 'OTHER'
  };
  return map[String(value || 'other').toLowerCase()] || 'OTHER';
}

function fromNoteCategoryEnum(value) {
  return String(value || 'OTHER').toLowerCase();
}

function toDecimalNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value.toNumber === 'function') return value.toNumber();
  return parseFloat(String(value)) || 0;
}

async function resolveUserId(mongoRef) {
  if (mongoRef == null || mongoRef === '') return null;
  const ref = String(mongoRef);

  let row = await prisma.user.findUnique({ where: { legacyId: ref } });
  if (row) return row.id;

  if (UUID_PATTERN.test(ref)) {
    row = await prisma.user.findUnique({ where: { id: ref } });
    if (row) return row.id;
  }

  return null;
}

function mapShoppingItem(item) {
  return {
    name: String(item.name || '').trim(),
    price: Number(item.price) || 0,
    checked: Boolean(item.checked)
  };
}

function toShape(record) {
  if (!record) return null;
  return {
    ...record,
    _id: record.legacyId || record.id,
    user: record.userId,
    type: fromNoteTypeEnum(record.type),
    category: fromNoteCategoryEnum(record.category),
    amount: record.amount != null ? toDecimalNumber(record.amount) : undefined,
    shoppingItems: (record.shoppingItems || []).map(mapShoppingItem)
  };
}

async function syncShoppingItems(noteId, items) {
  await prisma.noteShoppingItem.deleteMany({ where: { noteId } });

  for (const raw of items || []) {
    const item = mapShoppingItem(raw);
    if (!item.name) continue;
    // eslint-disable-next-line no-await-in-loop
    await prisma.noteShoppingItem.create({
      data: { noteId, ...item }
    });
  }
}

async function upsertNoteInPG(mongoDoc) {
  try {
    if (!mongoDoc || !mongoDoc._id) {
      console.error('[DUAL-WRITE-NOTE-FAIL] Missing mongoDoc or _id');
      return null;
    }

    const userRef = mongoDoc.user || mongoDoc.userId;
    const userId = await resolveUserId(userRef);
    if (!userId) {
      console.error('[DUAL-WRITE-NOTE-FAIL] User not found in PG', userRef);
      return null;
    }

    const legacyId = String(mongoDoc._id);
    const type = toNoteTypeEnum(mongoDoc.type);
    const amount = mongoDoc.amount != null && mongoDoc.amount !== undefined
      ? Number(mongoDoc.amount)
      : null;

    const data = {
      userId,
      title: String(mongoDoc.title || '').trim(),
      content: String(mongoDoc.content || '').trim(),
      type,
      amount,
      category: toNoteCategoryEnum(mongoDoc.category),
      tags: Array.isArray(mongoDoc.tags) ? mongoDoc.tags.map(String) : [],
      pinned: Boolean(mongoDoc.pinned),
      color: String(mongoDoc.color || '#FFFEF0'),
      date: mongoDoc.date ? new Date(mongoDoc.date) : new Date()
    };

    const record = await prisma.note.upsert({
      where: { legacyId },
      create: { legacyId, ...data },
      update: data
    });

    await syncShoppingItems(record.id, mongoDoc.shoppingItems);

    const withItems = await prisma.note.findUnique({
      where: { id: record.id },
      include: { shoppingItems: true }
    });

    return toShape(withItems);
  } catch (err) {
    console.error('[DUAL-WRITE-NOTE-FAIL]', err.message, mongoDoc?._id);
    return null;
  }
}

async function getNoteByMongoId(mongoId) {
  try {
    if (!mongoId) return null;

    const record = await prisma.note.findUnique({
      where: { legacyId: String(mongoId) },
      include: { shoppingItems: true }
    });

    return toShape(record);
  } catch (err) {
    console.error('[DUAL-WRITE-NOTE-FAIL] getByMongoId:', err.message);
    return null;
  }
}

async function listNotesFromPG(filters = {}) {
  try {
    const where = {};

    if (filters.userId) {
      const pgUserId = await resolveUserId(filters.userId);
      if (pgUserId) where.userId = pgUserId;
    }

    if (filters.type) {
      where.type = toNoteTypeEnum(filters.type);
    }

    const records = await prisma.note.findMany({
      where,
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      include: { shoppingItems: true }
    });

    return records.map(toShape);
  } catch (err) {
    console.error('[DUAL-WRITE-NOTE-FAIL] list:', err.message);
    return [];
  }
}

async function deleteNoteInPG(mongoId) {
  try {
    if (!mongoId) return false;

    await prisma.note.delete({ where: { legacyId: String(mongoId) } });
    return true;
  } catch (err) {
    if (err.code === 'P2025') return true;
    console.error('[DUAL-WRITE-NOTE-FAIL] delete:', err.message, mongoId);
    return false;
  }
}

module.exports = {
  upsertNoteInPG,
  getNoteByMongoId,
  listNotesFromPG,
  deleteNoteInPG
};
