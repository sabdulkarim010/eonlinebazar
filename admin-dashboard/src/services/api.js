import axios from 'axios';
import useAuthStore from '../store/authStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001',
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
  const { data } = await api.get('/api/admin/rooms', { params });
  return data;
}

export async function fetchRoomDetail(roomId) {
  const { data } = await api.get(`/api/admin/rooms/${roomId}`);
  return data;
}

export async function fetchStats() {
  const { data } = await api.get('/api/admin/stats');
  return data;
}

export async function sendAgentMessage(roomId, message, attachments = []) {
  const { data } = await api.post(`/api/admin/rooms/${roomId}/messages`, {
    message,
    attachments,
  });
  return data;
}

export async function updateConfig(payload) {
  const { data } = await api.put('/api/admin/config', payload);
  return data;
}

export async function fetchConfig() {
  const { data } = await api.get('/api/admin/config');
  return data;
}

export async function fetchKnowledge(params) {
  const { data } = await api.get('/api/knowledge', { params });
  return data;
}

export async function createKnowledge(payload) {
  const { data } = await api.post('/api/knowledge', payload);
  return data;
}

export async function updateKnowledge(id, payload) {
  const { data } = await api.put(`/api/knowledge/${id}`, payload);
  return data;
}

export async function deleteKnowledge(id) {
  const { data } = await api.delete(`/api/knowledge/${id}`);
  return data;
}

export async function checkKnowledgeEmpty() {
  const { data } = await api.get('/api/knowledge/check-empty');
  return data;
}

export async function seedKnowledgeDefaults() {
  const { data } = await api.post('/api/knowledge/seed-defaults');
  return data;
}

export async function fetchAgents() {
  const { data } = await api.get('/api/admin/agents');
  return data;
}

export async function createAgent(payload) {
  const { data } = await api.post('/api/admin/agents', payload);
  return data;
}

export async function updateAgent(id, payload) {
  const { data } = await api.put(`/api/admin/agents/${id}`, payload);
  return data;
}

export async function deleteAgent(id) {
  const { data } = await api.delete(`/api/admin/agents/${id}`);
  return data;
}

export async function resetAgentPassword(id, new_password) {
  const { data } = await api.post(`/api/admin/agents/${id}/reset-password`, {
    new_password,
  });
  return data;
}

export async function fetchOrder(orderId) {
  const { data } = await api.get(`/api/orders/${orderId}`);
  return data;
}

export async function persistTag(roomId, tag) {
  const { data } = await api.patch(`/api/admin/rooms/${roomId}/tags`, {
    tag,
  });
  return data;
}

export default api;
