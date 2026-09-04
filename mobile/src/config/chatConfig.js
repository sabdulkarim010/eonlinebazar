import { API_ORIGIN } from '../services/api';

export const CHAT_SOCKET_PATH = '/chat-socket/socket.io';
export const CHAT_SESSION_KEY = 'cw_guest_session_id';
export const CHAT_ROOM_KEY_PREFIX = 'cw_room_id_';

export const ARIA_PERSONA = 'Aria';
export const ARIA_GREETING =
  'আসসালামু আলাইকুম! আমি Aria, EonlineBazar-এর সহায়িকা। আজ আপনাকে কীভাবে সাহায্য করতে পারি?';

export const ARIA_QUICK_REPLIES = [
  { label: '🚚 Delivery Charges', value: 'What are the delivery charges?' },
  { label: '📦 Track My Order', value: 'How do I track my order?' },
  { label: '🔄 Return Policy', value: 'Can I return a product?' },
  { label: '👤 Talk to Human', value: 'I want to talk to a live agent' },
];

function stripSlash(url = '') {
  return String(url || '').trim().replace(/\/+$/, '');
}

export function resolveChatApiUrl() {
  const env = process.env.EXPO_PUBLIC_CHAT_API_URL;
  if (env) return stripSlash(env);
  return `${stripSlash(API_ORIGIN)}/chat-api`;
}

export function resolveChatSocketUrl() {
  const env = process.env.EXPO_PUBLIC_CHAT_SOCKET_URL;
  if (env) return stripSlash(env);
  return stripSlash(API_ORIGIN);
}

/** Match web widget apiUrlFor() — nginx /chat-api rewrites /api/chat → /chat */
export function buildChatApiUrl(path) {
  const base = resolveChatApiUrl();
  let resolvedPath = path;
  if (/\/chat-api$/i.test(base) && resolvedPath.startsWith('/api/')) {
    resolvedPath = resolvedPath.replace(/^\/api/, '');
  }
  return `${base}${resolvedPath}`;
}
