import axios from 'axios';
import useAuthStore from '../store/authStore';

// VITE_API_URL is the full API root:
// - production: https://eonlinebazar.com/chat-api  (nginx rewrites /chat-api/* → /api/*)
// - local:      http://localhost:5001/api
// Do NOT append /api here — that creates /chat-api/api/... double prefix in prod.
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const api = axios.create({
  baseURL,
  timeout: 20000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token =
    localStorage.getItem('chat_admin_token') ||
    useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      if (window.location.pathname !== '/chat-admin/login') {
        window.location.href = '/chat-admin/login';
      }
    }
    return Promise.reject(error);
  }
);

export async function fetchRooms(status) {
  const params = status ? { status } : undefined;
  const { data } = await api.get('/admin/rooms', { params });
  return data;
}

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

export async function changePassword(current_password, new_password) {
  const { data } = await api.post('/admin/me/change-password', {
    current_password,
    new_password,
  });
  return data;
}

export default api;
