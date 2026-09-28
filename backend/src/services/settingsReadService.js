/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: settingsReadService.js
 * Description: Routed Settings singleton reads (PG → Mongo → safe defaults).
 ********************************************************************/

'use strict';

const Settings = require('../models/Settings');
const { routedRead } = require('./readRouter');
const { settingsToMongoShape } = require('./readShapeHelpers');
const { getDefaultSettingsDocument } = require('../config/settingsDefaults');

function getSettingsRepository() {
  return require('../repositories/settingsRepository');
}

async function readFromPostgres() {
  const row = await getSettingsRepository().findByKey();
  if (!row) return null;
  return settingsToMongoShape(row);
}

async function readFromMongo() {
  const doc = await Settings.getOrCreate();
  return doc.toObject ? doc.toObject() : doc;
}

/**
 * Safe settings read — never throws; PG (when flagged) → Mongo → hardcoded defaults.
 */
async function fetchSettingsDocumentSafe() {
  try {
    const doc = await routedRead(
      'settings',
      readFromMongo,
      async () => {
        const shaped = await readFromPostgres();
        if (shaped) return shaped;
        return readFromMongo();
      }
    );
    if (doc) return doc;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[settingsReadService] routed read failed:', err.message);
    }
  }

  try {
    const mongoDoc = await readFromMongo();
    if (mongoDoc) return mongoDoc;
  } catch (mongoErr) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[settingsReadService] Mongo Settings fallback failed:', mongoErr.message);
    }
  }

  return getDefaultSettingsDocument();
}

/**
 * Fetch the global Settings document for read paths (same chain as safe read).
 */
async function fetchSettingsDocument() {
  return fetchSettingsDocumentSafe();
}

const { normalizeTaxSettingsFromDoc, getDefaultTaxSettings } = require('./taxSettingsService');

/**
 * Active tax configuration — safe defaults when DB is offline.
 */
async function getTaxSettings() {
  const doc = await fetchSettingsDocumentSafe();
  if (!doc || doc._fallbackDefaults) {
    return getDefaultTaxSettings();
  }
  return normalizeTaxSettingsFromDoc(doc);
}

module.exports = {
  fetchSettingsDocument,
  fetchSettingsDocumentSafe,
  getTaxSettings
};
