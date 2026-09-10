/**
 * Resolve the chat Agent document for a request or socket connection.
 * Supports native chat-agent JWTs (id in payload) and main-store admin JWTs
 * (username + role: 'admin') by linking or auto-creating an Agent row.
 */

const crypto = require('crypto');
const Agent = require('../models/Agent.model');
const { getMainStoreApiUrl } = require('../config/storeApi');

function getStoreBaseUrl() {
  return getMainStoreApiUrl();
}

function isStoreAdminToken(decoded) {
  if (!decoded || typeof decoded !== 'object') return false;

  const role = String(decoded.role || '').toLowerCase();
  const accountRole = String(decoded.accountRole || '').toLowerCase();
  const adminRoles = new Set(['admin', 'superadmin', 'super_admin']);

  if (decoded.username && (adminRoles.has(role) || adminRoles.has(accountRole))) {
    return true;
  }

  return Boolean(decoded.username && !decoded.id && !decoded._id && !decoded.userId);
}

function mapStoreRoleToAgentRole(accountRole) {
  const role = String(accountRole || '').toLowerCase();
  if (role === 'superadmin') return 'SUPER_ADMIN';
  if (role === 'staff') return 'AGENT';
  return 'ADMIN';
}

async function fetchStoreAdminProfile(authorizationHeader) {
  const baseUrl = getStoreBaseUrl();
  if (!baseUrl || !authorizationHeader) return null;

  try {
    const response = await fetch(`${baseUrl}/api/admin/me`, {
      headers: {
        Accept: 'application/json',
        Authorization: authorizationHeader,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    return payload?.admin || payload?.data || null;
  } catch (err) {
    console.warn('[agentResolver] fetchStoreAdminProfile failed:', err.message);
    return null;
  }
}

function buildAgentQuery(decoded) {
  const clauses = [];
  const agentId = decoded?.id || decoded?._id;
  const adminId = decoded?.adminId || decoded?.storeAdminId;
  const email = decoded?.email ? String(decoded.email).toLowerCase() : null;
  const username = decoded?.username ? String(decoded.username).trim() : null;

  if (agentId) clauses.push({ _id: agentId });
  if (adminId) clauses.push({ adminId });
  if (email) clauses.push({ email });
  if (username) clauses.push({ storeAdminUsername: username });

  return clauses.length ? { $or: clauses } : null;
}

async function backfillAgentLink(agent, { adminId, storeAdminUsername } = {}) {
  const updates = {};
  if (adminId && !agent.adminId) updates.adminId = adminId;
  if (storeAdminUsername && !agent.storeAdminUsername) {
    updates.storeAdminUsername = storeAdminUsername;
  }
  if (!Object.keys(updates).length) return agent;
  return Agent.findByIdAndUpdate(agent._id, updates, { new: true }).select(
    '-password'
  );
}

async function createAgentFromStoreAdmin(storeAdmin, decoded) {
  const username = String(decoded.username || storeAdmin.username || '').trim();
  const emailRaw =
    storeAdmin.email ||
    decoded.email ||
    (username ? `${username}@staff.eonlinebazar.local` : '');
  const email = String(emailRaw).trim().toLowerCase();

  if (!email) return null;

  const existing = await Agent.findOne({
    $or: [{ email }, ...(username ? [{ storeAdminUsername: username }] : [])],
  }).select('-password');
  if (existing) {
    return backfillAgentLink(existing, {
      adminId: storeAdmin.id || storeAdmin._id,
      storeAdminUsername: username,
    });
  }

  const randomPassword = crypto.randomBytes(24).toString('hex');
  const agent = await Agent.create({
    adminId: storeAdmin.id || storeAdmin._id || null,
    storeAdminUsername: username || null,
    name:
      storeAdmin.displayName ||
      storeAdmin.name ||
      username ||
      'Support Agent',
    email,
    password: randomPassword,
    role: mapStoreRoleToAgentRole(
      storeAdmin.role || decoded.accountRole || decoded.role
    ),
    avatar: storeAdmin.image || storeAdmin.avatar || null,
    is_online: true,
  });

  console.log('[Chat] Auto-created agent for store admin:', username || email);
  return agent.select('-password');
}

/**
 * @param {object} decoded - verified JWT payload
 * @param {string} [authorizationHeader] - full Authorization header value
 */
async function resolveAgentFromToken(decoded, authorizationHeader = '') {
  if (!decoded) return null;

  const query = buildAgentQuery(decoded);
  if (query) {
    const existing = await Agent.findOne(query).select('-password');
    if (existing) {
      const linked = await backfillAgentLink(existing, {
        adminId: decoded.adminId || decoded.storeAdminId,
        storeAdminUsername: decoded.username,
      });
      if (isStoreAdminToken(decoded)) {
        const authHeader =
          authorizationHeader && authorizationHeader.startsWith('Bearer ')
            ? authorizationHeader
            : authorizationHeader
              ? `Bearer ${authorizationHeader}`
              : '';
        const storeAdmin = await fetchStoreAdminProfile(authHeader);
        const avatar = storeAdmin?.image || storeAdmin?.avatar || null;
        if (avatar && linked.avatar !== avatar) {
          linked.avatar = avatar;
          await Agent.findByIdAndUpdate(linked._id, { avatar });
        }
      }
      return linked;
    }
  }

  if (isStoreAdminToken(decoded)) {
    const authHeader =
      authorizationHeader && authorizationHeader.startsWith('Bearer ')
        ? authorizationHeader
        : authorizationHeader
          ? `Bearer ${authorizationHeader}`
          : '';
    const storeAdmin = await fetchStoreAdminProfile(authHeader);
    if (storeAdmin) {
      return createAgentFromStoreAdmin(storeAdmin, decoded);
    }

    // Store API unreachable — still allow socket/API auth from JWT claims
    const username = String(decoded.username || '').trim();
    if (username) {
      console.warn(
        '[agentResolver] store profile unavailable — linking agent from JWT for',
        username
      );
      return createAgentFromStoreAdmin(
        {
          username,
          email: decoded.email || null,
          role: decoded.accountRole || decoded.role,
          name: username,
        },
        decoded
      );
    }
  }

  return null;
}

async function resolveAgentFromRequest(req) {
  const header =
    req.headers?.authorization || req.headers?.Authorization || '';
  return resolveAgentFromToken(req.agent, header);
}

function toAgentAuthPayload(agent) {
  return {
    id: agent._id,
    email: agent.email,
    role: agent.role,
    name: agent.name,
    adminId: agent.adminId || null,
    storeAdminUsername: agent.storeAdminUsername || null,
  };
}

function getInternalApiKey() {
  return String(process.env.INTERNAL_API_KEY || '').trim();
}

/**
 * Fetch store admin profile by Mongo id via internal API (INTERNAL_API_KEY).
 * @param {string} adminId
 */
async function resolveAgent(adminId) {
  const baseUrl = getStoreBaseUrl();
  const apiKey = getInternalApiKey();
  const id = String(adminId || '').trim();
  if (!baseUrl || !apiKey || !id) return null;

  try {
    const response = await fetch(`${baseUrl}/api/internal/admin-profile/${encodeURIComponent(id)}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Internal-Api-Key': apiKey,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    return payload?.admin || payload?.data || null;
  } catch (err) {
    console.warn('[agentResolver] resolveAgent failed:', err.message);
    return null;
  }
}

/**
 * Upsert chat Agent from store admin profile snapshot.
 * @param {object} adminData
 */
async function syncAgentFromAdmin(adminData) {
  if (!adminData) return null;

  const adminId = adminData.id || adminData._id || null;
  const username = String(adminData.username || adminData.storeAdminUsername || '').trim();
  const emailRaw =
    adminData.email ||
    (username ? `${username}@staff.eonlinebazar.local` : '');
  const email = String(emailRaw).trim().toLowerCase();
  if (!email && !adminId) return null;

  const query = adminId
    ? { $or: [{ adminId: String(adminId) }, ...(username ? [{ storeAdminUsername: username }] : []), ...(email ? [{ email }] : [])] }
    : username
      ? { $or: [{ storeAdminUsername: username }, ...(email ? [{ email }] : [])] }
      : email
        ? { email }
        : null;

  if (!query) return null;

  const existing = await Agent.findOne(query).select('-password');
  const payload = {
    adminId: adminId ? String(adminId) : existing?.adminId || null,
    storeAdminUsername: username || existing?.storeAdminUsername || null,
    name:
      adminData.displayName ||
      adminData.name ||
      existing?.name ||
      username ||
      'Support Agent',
    avatar: adminData.image || adminData.avatar || existing?.avatar || null,
    role: mapStoreRoleToAgentRole(adminData.role || existing?.role),
  };

  if (existing) {
    return Agent.findByIdAndUpdate(existing._id, payload, { new: true }).select('-password');
  }

  const randomPassword = crypto.randomBytes(24).toString('hex');
  return Agent.create({
    ...payload,
    email: email || `${String(adminId)}@staff.eonlinebazar.local`,
    password: randomPassword,
    is_online: false,
  }).then((agent) => agent.select('-password'));
}

module.exports = {
  resolveAgentFromRequest,
  resolveAgentFromToken,
  resolveAgent,
  syncAgentFromAdmin,
  toAgentAuthPayload,
  isStoreAdminToken,
  fetchStoreAdminProfile,
};
