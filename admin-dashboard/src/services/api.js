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

function isLocalDevHost() {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function isProductionApiUrl(url) {
  return /eonlinebazar\.com/i.test(String(url || ''));
}

/**
 * Chat admin JSON API root — proxied by main backend / nginx to ecommerce-chat.
 * Paths like `/admin/rooms` resolve to `/api/chat-admin/admin/rooms`.
 */
function resolveApiBaseUrl() {
  const readMeta = () => {
    if (typeof document === 'undefined') return '';
    return (
      document.querySelector('meta[name="chat-api-url"]')?.getAttribute('content') ||
      ''
    ).trim();
  };

  let url = (import.meta.env.VITE_API_URL || readMeta() || '').trim();
  url = url.replace(/\/$/, '');

  // Never use production API host when the dashboard is running locally
  if (url && isLocalDevHost() && isProductionApiUrl(url)) {
    url = readMeta() || '';
  }

  if (url && /\/chat-admin/i.test(url) && !url.includes('/api/chat-admin')) {
    url = '';
  }

  if (url) {
    if (/\/chat-api\/api$/i.test(url)) {
      url = url.replace(/\/api$/i, '');
    }
    // Relative paths — same origin (localhost:5000, :3000 Vite, or production)
    if (url.startsWith('/api/chat-admin') || url.startsWith('/chat-api')) {
      return `${getChatSiteOrigin()}${url}`;
    }
    if (/^https?:\/\//i.test(url)) {
      return url;
    }
  }

  if (typeof window !== 'undefined') {
    const { pathname } = window.location;
    if (pathname.startsWith('/chat-admin')) {
      return `${getChatSiteOrigin()}/api/chat-admin`;
    }
  }

  return `${LOCAL_MAIN_ORIGIN}/api/chat-admin`;
}

/** Avatar upload — same origin so main backend proxy streams multipart to chat :5001. */
export function resolveAvatarUploadUrl() {
  return `${getChatSiteOrigin()}/api/admin/me/avatar`;
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

function authHeaders() {
  const token =
    localStorage.getItem('chat_admin_token') ||
    useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

api.interceptors.request.use((config) => {
  const token =
    localStorage.getItem('chat_admin_token') ||
    useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
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
  const { data } = await api.get(`/orders/${orderId}`);
  return data;
}

export async function fetchCustomerProfile(userId, { fresh = true } = {}) {
  const { data } = await api.get(`/admin/customers/${userId}`, {
    params: fresh ? { fresh: '1' } : undefined,
  });
  return data;
}

export async function fetchCustomerOrders(userId, limit = 20) {
  const { data } = await api.get(`/admin/customers/${userId}/orders`, {
    params: { limit },
  });
  return data;
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
  const form = new FormData();
  form.append('image', file);
  // Same-origin POST — proxy streams raw FormData (no manual Content-Type)
  const { data } = await axios.post(resolveAvatarUploadUrl(), form, {
    withCredentials: true,
    headers: {
      ...authHeaders(),
      'X-Chat-Admin': '1',
    },
    timeout: 20000,
    transformRequest: [(body, headers) => {
      if (body instanceof FormData) {
        delete headers['Content-Type'];
        delete headers.common?.['Content-Type'];
        delete headers.post?.['Content-Type'];
      }
      return body;
    }],
  });
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
