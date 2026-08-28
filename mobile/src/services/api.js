import axios from 'axios';

const DEFAULT_API_URL = 'https://eonlinebazar.com/api';

function toApiBaseUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_API_URL;
  if (/\/api$/i.test(trimmed)) return trimmed;
  return `${trimmed}/api`;
}

export const API_BASE_URL = toApiBaseUrl(process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL);
export const API_ORIGIN = API_BASE_URL.replace(/\/api$/i, '');

export function resolveApiOrigin() {
  return API_ORIGIN;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
