'use strict';

/********************************************************************
 * SidebarLabel repository — PostgreSQL primary with MongoDB fallback.
 * Reads prefer PG; writes try PG first, fall back to Mongo on error.
 * Best-effort mirror keeps both stores in sync when the peer is reachable.
 ********************************************************************/

const mongoose = require('mongoose');
const SidebarLabel = require('../models/SidebarLabel');

function getPrisma() {
  return require('../config/prismaClient');
}

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

function toShape(record) {
  if (!record) return null;
  const plain = record.toObject ? record.toObject() : record;
  return {
    id: plain.id || plain._id?.toString?.() || plain._id,
    menuKey: plain.menuKey,
    label: plain.label,
    adminId: plain.adminId,
    updatedAt: plain.updatedAt
  };
}

function validateLabel(label) {
  const trimmed = String(label || '').trim();
  if (!trimmed || trimmed.length > 80) {
    return { error: 'Label must be 1–80 characters.' };
  }
  return { value: trimmed };
}

function validateMenuKey(menuKey) {
  const trimmed = String(menuKey || '').trim();
  if (!trimmed) {
    return { error: 'Menu key is required.' };
  }
  return { value: trimmed };
}

async function findAllMapPg() {
  const prisma = getPrisma();
  if (!prisma?.sidebarLabel?.findMany) {
    const err = new Error('SidebarLabel model not available on Prisma client');
    err.code = 'SIDEBAR_LABEL_UNAVAILABLE';
    throw err;
  }
  const rows = await prisma.sidebarLabel.findMany({
    orderBy: { menuKey: 'asc' }
  });
  return Object.fromEntries(rows.map((row) => [row.menuKey, row.label]));
}

async function findAllMapMongo() {
  if (!isMongoConnected()) {
    const err = new Error('MongoDB is not connected');
    err.code = 'MONGO_UNAVAILABLE';
    throw err;
  }
  const rows = await SidebarLabel.find().sort({ menuKey: 1 }).lean();
  return Object.fromEntries(rows.map((row) => [row.menuKey, row.label]));
}

async function findAllMap() {
  try {
    return await findAllMapPg();
  } catch (pgErr) {
    console.warn('[SidebarLabel] PG read failed, falling back to Mongo:', pgErr.message);
    try {
      return await findAllMapMongo();
    } catch (mongoErr) {
      console.warn('[SidebarLabel] Mongo read failed:', mongoErr.message);
      return {};
    }
  }
}

async function upsertLabelPg(menuKey, label, adminId) {
  const prisma = getPrisma();
  if (!prisma?.sidebarLabel?.upsert) {
    const err = new Error('SidebarLabel model not available on Prisma client');
    err.code = 'SIDEBAR_LABEL_UNAVAILABLE';
    throw err;
  }
  return prisma.sidebarLabel.upsert({
    where: { menuKey },
    create: { menuKey, label, adminId },
    update: { label, adminId }
  });
}

async function upsertLabelMongo(menuKey, label, adminId) {
  if (!isMongoConnected()) {
    const err = new Error('MongoDB is not connected');
    err.code = 'MONGO_UNAVAILABLE';
    throw err;
  }
  const record = await SidebarLabel.findOneAndUpdate(
    { menuKey },
    { menuKey, label, adminId },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean();
  return record;
}

async function mirrorLabelToMongo(menuKey, label, adminId) {
  if (!isMongoConnected()) return;
  await upsertLabelMongo(menuKey, label, adminId);
}

async function mirrorLabelToPg(menuKey, label, adminId) {
  await upsertLabelPg(menuKey, label, adminId);
}

/**
 * Upsert one label — PG primary, Mongo fallback, best-effort mirror to peer store.
 */
async function upsertLabel(menuKey, label, adminId) {
  const keyResult = validateMenuKey(menuKey);
  if (keyResult.error) {
    const err = new Error(keyResult.error);
    err.statusCode = 400;
    throw err;
  }
  const labelResult = validateLabel(label);
  if (labelResult.error) {
    const err = new Error(labelResult.error);
    err.statusCode = 400;
    throw err;
  }

  const key = keyResult.value;
  const normalizedLabel = labelResult.value;
  const actorId = String(adminId || 'superadmin');

  try {
    const pgRecord = await upsertLabelPg(key, normalizedLabel, actorId);
    await mirrorLabelToMongo(key, normalizedLabel, actorId).catch((mirrorErr) => {
      console.warn('[SidebarLabel] Mongo mirror after PG upsert failed:', mirrorErr.message);
    });
    return toShape(pgRecord);
  } catch (pgErr) {
    console.warn('[SidebarLabel] PG upsert failed, falling back to Mongo:', pgErr.message);
    try {
      const mongoRecord = await upsertLabelMongo(key, normalizedLabel, actorId);
      await mirrorLabelToPg(key, normalizedLabel, actorId).catch((mirrorErr) => {
        console.warn('[SidebarLabel] PG mirror after Mongo fallback failed:', mirrorErr.message);
      });
      return toShape(mongoRecord);
    } catch (mongoErr) {
      console.error('[SidebarLabel] Both PG and Mongo upsert failed:', mongoErr.message);
      throw mongoErr;
    }
  }
}

async function bulkUpsertLabels(labelsMap = {}, adminId) {
  if (!labelsMap || typeof labelsMap !== 'object' || Array.isArray(labelsMap)) {
    const err = new Error('labels must be a plain object.');
    err.statusCode = 400;
    throw err;
  }

  const entries = Object.entries(labelsMap);
  if (!entries.length) {
    return { saved: 0, labels: {} };
  }

  const saved = {};
  const errors = [];

  for (const [rawKey, rawLabel] of entries) {
    const keyResult = validateMenuKey(rawKey);
    if (keyResult.error) {
      errors.push({ menuKey: rawKey, message: keyResult.error });
      continue;
    }
    const labelResult = validateLabel(rawLabel);
    if (labelResult.error) {
      errors.push({ menuKey: keyResult.value, message: labelResult.error });
      continue;
    }

    try {
      const record = await upsertLabel(keyResult.value, labelResult.value, adminId);
      saved[keyResult.value] = record.label;
    } catch (err) {
      errors.push({ menuKey: keyResult.value, message: err.message || 'Save failed.' });
    }
  }

  if (!Object.keys(saved).length && errors.length) {
    const err = new Error(errors[0].message || 'Failed to save sidebar labels.');
    err.statusCode = 500;
    err.details = errors;
    throw err;
  }

  return {
    saved: Object.keys(saved).length,
    labels: saved,
    errors: errors.length ? errors : undefined
  };
}

async function deleteAllPg() {
  const prisma = getPrisma();
  if (!prisma?.sidebarLabel?.deleteMany) {
    const err = new Error('SidebarLabel model not available on Prisma client');
    err.code = 'SIDEBAR_LABEL_UNAVAILABLE';
    throw err;
  }
  const result = await prisma.sidebarLabel.deleteMany({});
  return result.count || 0;
}

async function deleteAllMongo() {
  if (!isMongoConnected()) {
    const err = new Error('MongoDB is not connected');
    err.code = 'MONGO_UNAVAILABLE';
    throw err;
  }
  const result = await SidebarLabel.deleteMany({});
  return result.deletedCount || 0;
}

async function deleteAll() {
  let pgRemoved = 0;
  let mongoRemoved = 0;
  let pgFailed = false;
  let mongoFailed = false;

  try {
    pgRemoved = await deleteAllPg();
  } catch (pgErr) {
    pgFailed = true;
    console.warn('[SidebarLabel] PG deleteAll failed:', pgErr.message);
  }

  try {
    mongoRemoved = await deleteAllMongo();
  } catch (mongoErr) {
    mongoFailed = true;
    console.warn('[SidebarLabel] Mongo deleteAll failed:', mongoErr.message);
  }

  if (pgFailed && mongoFailed) {
    const err = new Error('Failed to reset sidebar labels on both databases.');
    err.statusCode = 500;
    throw err;
  }

  return Math.max(pgRemoved, mongoRemoved);
}

module.exports = {
  findAllMap,
  upsertLabel,
  bulkUpsertLabels,
  deleteAll
};
