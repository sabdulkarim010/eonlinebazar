import axios from 'axios';
import useAuthStore from '../store/authStore';

const LOCAL_MAIN_ORIGIN = 'http://localhost:5000';

/** Site origin for same-host chat API (store :5000, nginx, or Vite dev :3000). */
export function getChatSiteOrigin() {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return LOCAL_MAIN_ORIGIN;
}

function isProductionApiUrl(url) {
  return /eonlinebazar\.com/i.test(String(url || ''));
}

/** Detect VITE_API_URL values that skip /api and cause 404 on chat routes. */
function isMisconfiguredDirectChatUrl(url) {
  const s = String(url || '')
    .trim()
    .replace(/\/$/, '');
  if (!s) return false;

  // e.g. http://localhost:5001 or http://127.0.0.1:5001 (missing /api prefix)
  if (/^https?:\/\/(?:[^/]*:5001|127\.0\.0\.1:5001)$/i.test(s)) {
    return true;
  }

  // Absolute dev URL without chat namespace (/api/chat-admin or /chat-api)
  if (
    /^https?:\/\//i.test(s) &&
    !isProductionApiUrl(s) &&
    !s.includes('/api/chat-admin') &&
    !s.includes('/chat-api') &&
    !/\/api$/i.test(s)
  ) {
    return true;
  }

  return false;
}

const CHAT_ADMIN_TOKEN_KEY = 'chat_admin_token';
const DEFAULT_CHAT_API_BASE = '/api/chat-admin';

/**
 * Chat admin JSON API root — proxied by main backend / nginx to ecommerce-chat.
 * Paths like `/admin/rooms` resolve to `/api/chat-admin/admin/rooms`.
 *
 * In the browser we always use same-origin relative paths so a misconfigured
 * VITE_API_URL (e.g. http://localhost:5001) cannot bypass the proxy layer.
 */
function resolveApiBaseUrl() {
  const readMeta = () => {
    if (typeof document === 'undefined') return '';
    return (
      document.querySelector('meta[name="chat-api-url"]')?.getAttribute('content') ||
      ''
    ).trim();
  };

  const meta = readMeta().replace(/\/$/, '');
  if (meta.startsWith('/api/chat-admin') || meta.startsWith('/chat-api')) {
    return meta;
  }

  if (typeof window !== 'undefined') {
    const viteUrl = String(import.meta.env.VITE_API_URL || '')
      .trim()
      .replace(/\/$/, '');

    if (
      viteUrl.startsWith('/api/chat-admin') ||
      viteUrl.startsWith('/chat-api')
    ) {
      return viteUrl;
    }

    if (
      viteUrl &&
      !isMisconfiguredDirectChatUrl(viteUrl) &&
      !isProductionApiUrl(viteUrl) &&
      /^https?:\/\//i.test(viteUrl) &&
      (viteUrl.includes('/api/chat-admin') || viteUrl.includes('/chat-api'))
    ) {
      return viteUrl;
    }

    return DEFAULT_CHAT_API_BASE;
  }

  return `${LOCAL_MAIN_ORIGIN}${DEFAULT_CHAT_API_BASE}`;
}

/** Avatar upload — same-origin relative path (proxied to chat :5001). */
export function resolveAvatarUploadUrl() {
  return '/api/admin/me/avatar';
}

const baseURL = resolveApiBaseUrl();

const api = axios.create({
  baseURL,
  timeout: 20000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Chat-Admin': '1',
  },
});

export function getChatAdminToken() {
  if (typeof localStorage === 'undefined') return '';
  return String(
    localStorage.getItem(CHAT_ADMIN_TOKEN_KEY) ||
      useAuthStore.getState().token ||
      ''
  ).trim();
}

function bearerAuthHeader() {
  const token = getChatAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Same-origin fetch for chat CRM routes with explicit Bearer token. */
async function chatAdminFetch(relativePath, options = {}) {
  const headers = {
    Accept: 'application/json',
    'X-Chat-Admin': '1',
    ...bearerAuthHeader(),
    ...(options.headers || {}),
  };
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers['Content-Type']
  ) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(relativePath, {
    credentials: 'include',
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `HTTP ${res.status}`);
    err.response = { status: res.status, data };
    throw err;
  }
  return data;
}

api.interceptors.request.use((config) => {
  Object.assign(config.headers, bearerAuthHeader());
  // Let the browser set multipart boundary — never send a manual Content-Type
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
    delete config.headers.common?.['Content-Type'];
    delete config.headers.post?.['Content-Type'];
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = String(error.config?.url || '');
    const isLoginRequest = url.includes('/admin/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      useAuthStore.getState().logout();
      if (window.location.pathname !== '/chat-admin/login') {
        window.location.href = '/chat-admin/login';
      }
    }
    return Promise.reject(error);
  }
);

export const fetchRooms = async (status = null) => {
  const params = status ? `?status=${status}` : '';
  const res = await api.get(`/admin/rooms${params}`);
  return res.data;
};

export async function fetchRoomDetail(roomId) {
  const { data } = await api.get(`/admin/rooms/${roomId}`);
  return data;
}

export async function fetchStats() {
  const { data } = await api.get('/admin/stats');
  return data;
}

export async function sendAgentMessage(roomId, message, attachments = []) {
  const { data } = await api.post(`/admin/rooms/${roomId}/messages`, {
    message,
    attachments,
  });
  return data;
}

export async function updateConfig(payload) {
  const { data } = await api.put('/admin/config', payload);
  return data;
}

export async function fetchConfig() {
  const { data } = await api.get('/admin/config');
  return data;
}

export async function fetchKnowledge(params) {
  const { data } = await api.get('/knowledge', { params });
  return data;
}

export async function createKnowledge(payload) {
  const { data } = await api.post('/knowledge', payload);
  return data;
}

export async function updateKnowledge(id, payload) {
  const { data } = await api.put(`/knowledge/${id}`, payload);
  return data;
}

export async function deleteKnowledge(id) {
  const { data } = await api.delete(`/knowledge/${id}`);
  return data;
}

export async function checkKnowledgeEmpty() {
  const { data } = await api.get('/knowledge/check-empty');
  return data;
}

export async function seedKnowledgeDefaults() {
  const { data } = await api.post('/knowledge/seed-defaults');
  return data;
}

export async function fetchAgents() {
  const { data } = await api.get('/admin/agents');
  return data;
}

export async function fetchOnlineAgents() {
  const { data } = await api.get('/admin/agents/online');
  return data;
}

export async function createAgent(payload) {
  const { data } = await api.post('/admin/agents', payload);
  return data;
}

export async function updateAgent(id, payload) {
  const { data } = await api.put(`/admin/agents/${id}`, payload);
  return data;
}

export async function deleteAgent(id) {
  const { data } = await api.delete(`/admin/agents/${id}`);
  return data;
}

export async function resetAgentPassword(id, new_password) {
  const { data } = await api.post(`/admin/agents/${id}/reset-password`, {
    new_password,
  });
  return data;
}

export async function fetchOrder(orderId) {
  return chatAdminFetch(
    `/api/chat-admin/orders/${encodeURIComponent(orderId)}`
  );
}

export async function fetchCustomerProfile(userId, { fresh = true } = {}) {
  const qs = fresh ? '?fresh=1' : '';
  return chatAdminFetch(
    `/api/admin/customers/${encodeURIComponent(userId)}${qs}`
  );
}

export async function fetchCustomerOrders(userId, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  return chatAdminFetch(
    `/api/admin/customers/${encodeURIComponent(userId)}/orders?${params}`
  );
}

export async function persistTag(roomId, tag) {
  const { data } = await api.patch(`/admin/rooms/${roomId}/tags`, {
    tag,
  });
  return data;
}

export async function fetchProfile() {
  const { data } = await api.get('/admin/me');
  return data;
}

export async function updateProfile(payload) {
  const { data } = await api.patch('/admin/me', payload);
  return data;
}

export async function uploadAgentAvatar(file) {
  const token = getChatAdminToken();
  const headers = { 'X-Chat-Admin': '1' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const form = new FormData();
  form.append('image', file);

  const res = await fetch(resolveAvatarUploadUrl(), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      data.message ||
        (res.status === 401
          ? 'Not authenticated — sign in again'
          : 'Photo upload failed')
    );
    err.response = { status: res.status, data };
    throw err;
  }
  return data;
}

export async function changePassword(
  current_password,
  new_password,
  confirm_password
) {
  const { data } = await api.post('/admin/me/change-password', {
    current_password,
    new_password,
    confirm_password,
  });
  return data;
}

export default api;
