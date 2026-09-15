/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: readCutoverFlags.js
 * Location: backend/src/config/readCutoverFlags.js
 * Description: Per-model-group feature flags for PostgreSQL read cutover.
 *   Each flag defaults OFF (Mongo reads). Set env var to 'true' and restart
 *   to enable Postgres reads for that group. Writes always dual-write.
 ********************************************************************/

'use strict';

/** Env var name for each cutover group (Stage 4 ordering). */
const GROUP_ENV = {
  category: 'READ_PG_CATEGORY',
  brand: 'READ_PG_BRAND',
  supplier: 'READ_PG_SUPPLIER',
  warehouse: 'READ_PG_WAREHOUSE',
  designation: 'READ_PG_DESIGNATION',
  pagecontent: 'READ_PG_PAGECONTENT',
  navbarlink: 'READ_PG_NAVBARLINK',
  footersettings: 'READ_PG_FOOTERSETTINGS',
  banner: 'READ_PG_BANNER',
  settings: 'READ_PG_SETTINGS'
};

/**
 * Read process.env on each call so Jest (and hosts with live env reload)
 * can flip flags without reloading this module.
 */
function isPgReadEnabled(group) {
  const envKey = GROUP_ENV[group];
  if (!envKey) return false;
  return process.env[envKey] === 'true';
}

/** Snapshot of current flag state (for logging / diagnostics). */
function getReadCutoverFlags() {
  return Object.fromEntries(
    Object.entries(GROUP_ENV).map(([group, envKey]) => [group, process.env[envKey] === 'true'])
  );
}

module.exports = {
  isPgReadEnabled,
  getReadCutoverFlags,
  GROUP_ENV
};
