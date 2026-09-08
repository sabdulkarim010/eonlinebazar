const { loadSharedEnv } = require('./loadEnv');

loadSharedEnv();

/**
 * Main store backend base URL for internal CRM/profile calls.
 * Falls back to localhost :5000 when unset (local dev).
 */
function getMainStoreApiUrl() {
  const raw = process.env.MAIN_STORE_API_URL;
  if (raw && String(raw).trim()) {
    return String(raw).replace(/\/$/, '');
  }
  const storePort = process.env.STORE_PORT || '5000';
  return `http://localhost:${storePort}`;
}

module.exports = { getMainStoreApiUrl };
