/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: settingsReadService.js
 * Description: Routed Settings singleton reads (Mongo default; Postgres when
 *   READ_PG_SETTINGS=true). Used by controllers and read-only service helpers.
 ********************************************************************/

'use strict';

const Settings = require('../models/Settings');
const { routedRead } = require('./readRouter');
const { settingsToMongoShape } = require('./readShapeHelpers');

function getSettingsRepository() {
  return require('../repositories/settingsRepository');
}

/**
 * Fetch the global Settings document for read paths.
 * Returns a Mongoose document from Mongo, or a plain object with the same fields from Postgres.
 */
async function fetchSettingsDocument() {
  return routedRead(
    'settings',
    () => Settings.getOrCreate(),
    async () => {
      const row = await getSettingsRepository().findByKey();
      if (!row) {
        return Settings.getOrCreate();
      }
      const shaped = settingsToMongoShape(row);
      if (!shaped) {
        return Settings.getOrCreate();
      }
      return shaped;
    }
  );
}

/**
 * Safe settings read — never throws; returns plain object or null.
 */
async function fetchSettingsDocumentSafe() {
  try {
    return await fetchSettingsDocument();
  } catch (err) {
    console.warn('[settingsReadService] fetchSettingsDocument failed:', err.message);
    try {
      return await Settings.getOrCreate();
    } catch (mongoErr) {
      console.warn('[settingsReadService] Mongo Settings fallback failed:', mongoErr.message);
      return null;
    }
  }
}

module.exports = { fetchSettingsDocument, fetchSettingsDocumentSafe };
