/**
 * Fetches customer profile and orders from the main EOnlineBazar store API.
 * Requires MAIN_STORE_API_URL and INTERNAL_API_KEY in ecommerce-chat env.
 */

const { getMainStoreApiUrl } = require('../config/storeApi');

const PROFILE_CACHE_MS = 5 * 60 * 1000;
const profileCache = new Map();

function getBaseUrl() {
  return getMainStoreApiUrl();
}

function internalHeaders(extra = {}) {
  const headers = { Accept: 'application/json', ...extra };
  const key = process.env.INTERNAL_API_KEY;
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function pickDefaultAddress(addresses = []) {
  if (!Array.isArray(addresses) || !addresses.length) return null;
  return addresses.find((a) => a && a.isDefault) || addresses[0];
}

function formatAddressSnapshot(addr) {
  if (!addr) return null;
  const parts = [addr.fullAddress, addr.upazilaOrThana, addr.district].filter(Boolean);
  return {
    label: addr.label || 'Home',
    fullAddress: addr.fullAddress || '',
    upazilaOrThana: addr.upazilaOrThana || '',
    district: addr.district || '',
    phone: addr.phone || '',
    formatted: parts.join(', '),
  };
}

function hydrateNameFromParts(firstName, lastName, legacyName) {
  const fromParts = [firstName, lastName].filter(Boolean).join(' ').trim();
  const legacy = legacyName ? String(legacyName).trim() : '';
  return fromParts || legacy || null;
}

function buildSnapshotFromUser(user, overrides = {}) {
  if (!user) return null;

  const defaultAddress = pickDefaultAddress(user.addresses);
  const legacyAddr =
    user.fullAddress || user.address
      ? formatAddressSnapshot({
          label: 'Home',
          fullAddress: user.fullAddress || user.address || '',
          upazilaOrThana: user.upazila || user.upazilaOrThana || user.thana || '',
          district: user.district || '',
          phone: user.mobile || user.phone || '',
        })
      : formatAddressSnapshot(defaultAddress);

  const name =
    overrides.name ||
    user.name ||
    hydrateNameFromParts(user.firstName, user.lastName, user.name) ||
    'Customer';

  const avatarUrl =
    overrides.avatarUrl ||
    user.avatarUrl ||
    user.avatar ||
    null;
  const image =
    overrides.image ||
    user.image ||
    avatarUrl ||
    user.avatar ||
    null;

  return {
    user_id: String(user._id || user.id || overrides.user_id || ''),
    name,
    email: overrides.email || user.email || null,
    mobile: overrides.mobile || user.mobile || user.phone || null,
    avatar: overrides.avatar || user.avatar || '',
    avatarUrl,
    image,
    profilePic: overrides.profilePic || image || avatarUrl || null,
    defaultAddress: legacyAddr,
    fetched_at: new Date(),
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.message || `Request failed (${response.status})`);
    err.status = response.status;
    throw err;
  }
  return data;
}

/**
 * Resolve registered user from customer JWT via main store /api/customer/profile.
 */
async function fetchProfileByAuthToken(authToken) {
  const baseUrl = getBaseUrl();
  if (!baseUrl || !authToken) return null;

  try {
    const profile = await fetchJson(`${baseUrl}/api/customer/profile`, {
      headers: internalHeaders({
        Authorization: `Bearer ${authToken}`,
      }),
    });
    return buildSnapshotFromUser(profile);
  } catch (err) {
    console.warn('[storeProfile] fetchProfileByAuthToken failed:', err.message);
    return null;
  }
}

/**
 * Fetch profile by user id via internal service route.
 */
async function fetchProfileByUserId(userId) {
  const baseUrl = getBaseUrl();
  if (!baseUrl || !userId) return null;

  const cacheKey = String(userId);
  const cached = profileCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PROFILE_CACHE_MS) {
    return cached.data;
  }

  try {
    const payload = await fetchJson(
      `${baseUrl}/api/internal/customers/${encodeURIComponent(userId)}`,
      { headers: internalHeaders() }
    );
    const data = payload?.data || payload;
    const snapshot = {
      user_id: String(data.user_id || data.id || userId),
      name: data.name || 'Customer',
      email: data.email || null,
      mobile: data.mobile || null,
      avatar: data.avatar || '',
      avatarUrl: data.avatarUrl || data.avatar || null,
      image: data.image || data.avatarUrl || data.avatar || null,
      profilePic: data.profilePic || data.image || data.avatarUrl || data.avatar || null,
      defaultAddress: data.defaultAddress || null,
      fetched_at: new Date(),
    };
    profileCache.set(cacheKey, { at: Date.now(), data: snapshot });
    return snapshot;
  } catch (err) {
    console.warn('[storeProfile] fetchProfileByUserId failed:', err.message);
    return null;
  }
}

async function fetchCustomerOrders(userId, limit = 5) {
  const baseUrl = getBaseUrl();
  if (!baseUrl || !userId) return [];

  try {
    const payload = await fetchJson(
      `${baseUrl}/api/internal/customers/${encodeURIComponent(userId)}/orders?limit=${limit}`,
      { headers: internalHeaders() }
    );
    return Array.isArray(payload?.orders)
      ? payload.orders
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
  } catch (err) {
    console.warn('[storeProfile] fetchCustomerOrders failed:', err.message);
    return [];
  }
}

async function fetchOrderById(orderId) {
  const baseUrl = getBaseUrl();
  if (!baseUrl || !orderId) return null;

  try {
    const payload = await fetchJson(
      `${baseUrl}/api/internal/orders/${encodeURIComponent(orderId)}`,
      { headers: internalHeaders() }
    );
    return payload?.data || payload?.order || payload;
  } catch (err) {
    console.warn('[storeProfile] fetchOrderById failed:', err.message);
    return null;
  }
}

/**
 * Build customer_profile snapshot from user_id and/or auth token + client hints.
 */
async function resolveCustomerProfile({
  user_id = null,
  auth_token = null,
  guest_name = null,
  guest_email = null,
  avatar = null,
  avatarUrl = null,
}) {
  let snapshot = null;

  if (auth_token) {
    snapshot = await fetchProfileByAuthToken(auth_token);
    if (snapshot && user_id && String(snapshot.user_id) !== String(user_id)) {
      snapshot = null;
    }
  }

  if (!snapshot && user_id) {
    snapshot = await fetchProfileByUserId(user_id);
  }

  if (!snapshot && user_id) {
    snapshot = buildSnapshotFromUser(
      { _id: user_id },
      {
        user_id,
        name: guest_name && guest_name !== 'Guest' ? guest_name : 'Customer',
        email: guest_email,
        avatar,
        avatarUrl,
      }
    );
  } else if (snapshot) {
    if (guest_name && guest_name !== 'Guest') snapshot.name = guest_name;
    if (guest_email) snapshot.email = guest_email;
    if (avatarUrl || avatar) {
      snapshot.avatarUrl = avatarUrl || avatar || snapshot.avatarUrl;
      snapshot.avatar = avatar || snapshot.avatar;
    }
  }

  return snapshot;
}

function invalidateProfileCache(userId) {
  if (userId) profileCache.delete(String(userId));
}

module.exports = {
  fetchProfileByAuthToken,
  fetchProfileByUserId,
  fetchCustomerOrders,
  fetchOrderById,
  resolveCustomerProfile,
  buildSnapshotFromUser,
  invalidateProfileCache,
};
