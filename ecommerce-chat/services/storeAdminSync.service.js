/**
 * Sync chat Agent profile fields to the main store Admin document.
 */

const { getMainStoreApiUrl } = require('../config/storeApi');

function getStoreBaseUrl() {
  return getMainStoreApiUrl();
}

function internalHeaders(extra = {}) {
  const headers = { Accept: 'application/json', ...extra };
  const key = process.env.INTERNAL_API_KEY;
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/**
 * Persist avatar URL on main store Admin.image (linked adminId via internal API).
 * Avoids PUT /api/admin/me/avatar on the store host — that path is proxied to chat.
 */
async function syncStoreAdminAvatar(agent, avatarUrl, _authorizationHeader = '') {
  const url = avatarUrl ? String(avatarUrl).trim() : '';
  if (!url || !agent) return false;

  const baseUrl = getStoreBaseUrl();
  if (!baseUrl) return false;

  const adminId = agent.adminId || agent.admin_id;
  if (!adminId || !process.env.INTERNAL_API_KEY) {
    return false;
  }

  try {
    const response = await fetch(
      `${baseUrl}/api/internal/admins/${encodeURIComponent(String(adminId))}/image`,
      {
        method: 'PUT',
        headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ image: url }),
      }
    );
    return response.ok;
  } catch (err) {
    console.warn('[storeAdminSync] internal admin image sync failed:', err.message);
    return false;
  }
}

module.exports = {
  syncStoreAdminAvatar,
};
