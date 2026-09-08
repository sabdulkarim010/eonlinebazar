import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import useChatStore from '../store/chatStore';
import { fetchRooms } from './api';

const LOCAL_MAIN_ORIGIN = 'http://localhost:5000';

function isLocalDevHost() {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function isProductionApiUrl(url) {
  return /eonlinebazar\.com/i.test(String(url || ''));
}

function resolveSocketUrl() {
  const envUrl = String(import.meta.env.VITE_SOCKET_URL || '')
    .trim()
    .replace(/\/$/, '');

  if (typeof window !== 'undefined') {
    const origin = window.location.origin.replace(/\/$/, '');

    // Production: same-origin proxy (nginx / store :5000 → chat :5001)
    if (!isLocalDevHost()) {
      return origin;
    }

    // Local dev: honor VITE_SOCKET_URL when it targets chat :5001 directly
    if (envUrl && !isProductionApiUrl(envUrl)) {
      if (/^https?:\/\/(?:127\.0\.0\.1|localhost):5001$/i.test(envUrl)) {
        return envUrl;
      }
      // :5000 in env → use page origin so /chat-socket proxy on store/Vite applies
      if (/^https?:\/\/(?:127\.0\.0\.1|localhost):5000$/i.test(envUrl)) {
        return origin;
      }
    }

    return origin;
  }

  const readMeta = () => {
    if (typeof document === 'undefined') return '';
    return (
      document.querySelector('meta[name="chat-api-url"]')?.getAttribute('content') ||
      ''
    ).trim();
  };

  let raw =
    envUrl ||
    import.meta.env.VITE_API_URL ||
    readMeta() ||
    '';

  if (!raw || (/\/chat-admin/i.test(String(raw)) && !raw.includes('/api/chat-admin'))) {
    raw = LOCAL_MAIN_ORIGIN;
  }

  return String(raw)
    .replace(/\/$/, '')
    .replace(/\/chat-api$/i, '')
    .replace(/\/api\/chat-admin$/i, '');
}

let socket = null;
const typingClearTimers = {};

/** Generate a 3-beep notification with Web Audio API (no audio file). */
export function playAlertSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const freqs = [880, 1046.5, 1318.5];
    const startAt = ctx.currentTime;

    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, startAt);
      const t0 = startAt + i * 0.22;
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    });

    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    // ignore audio errors (autoplay policy, etc.)
  }
}

function showBrowserNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: '/chat-admin/favicon.png',
      tag: 'chat-handover',
    });
  } catch {
    // ignore
  }
}

function roomIdOf(payload) {
  if (!payload) return '';
  if (payload.room_id) return String(payload.room_id);
  if (payload.room?._id || payload.room?.id) {
    return String(payload.room._id || payload.room.id);
  }
  if (payload.message?.room_id) return String(payload.message.room_id);
  return '';
}

function normalizeMessagePayload(payload) {
  if (!payload) return null;
  const roomId = roomIdOf(payload);
  const message =
    payload.message ??
    (payload.sender_type || payload.message != null ? payload : null);
  if (!roomId || !message) return null;
  if (payload.message) return payload;
  return { room_id: roomId, message: payload, room: payload.room };
}

function joinAdminRooms(sock) {
  if (!sock?.connected) return;
  sock.emit('join_admin_room');
  const activeRoomId = useChatStore.getState().activeRoomId;
  if (activeRoomId) {
    sock.emit('join_room', { room_id: activeRoomId });
  }
}

/** Pull fresh tab counts + room rows from REST so inbox badges stay in sync with socket events. */
async function syncInboxFromServer(preferredStatus) {
  const store = useChatStore.getState();
  const status = preferredStatus || store.activeInboxTab || 'WAITING_FOR_AGENT';
  try {
    const data = await fetchRooms(status);
    if (data?.counts) store.setCounts(data.counts);
    if (Array.isArray(data?.rooms) && store.activeInboxTab === status) {
      store.setRooms(data.rooms);
    }
  } catch (err) {
    console.warn('[socket] inbox sync failed:', err.message);
  }
}

function bindListeners(sock) {
  const seenMessageIds = new Set();

  const handleIncomingMessage = (eventName, payload) => {
    const normalized = normalizeMessagePayload(payload);
    if (!normalized) {
      console.warn(`[socket] ${eventName}: ignored — could not normalize`, payload);
      return;
    }

    const roomId = roomIdOf(normalized);
    const message = normalized.message;
    const msgId = String(message._id || message.id || '');

    const currentAgent = useAuthStore.getState().agent;
    const currentAgentId = String(currentAgent?._id || currentAgent?.id || '');
    if (
      message.sender_type === 'AGENT' &&
      currentAgentId &&
      String(message.sender_id || '') === currentAgentId
    ) {
      return;
    }

    if (msgId) {
      const dedupeKey = `${roomId}:${msgId}`;
      if (seenMessageIds.has(dedupeKey)) return;
      seenMessageIds.add(dedupeKey);
      if (seenMessageIds.size > 500) {
        seenMessageIds.clear();
      }
    }

    console.log(`📩 ${eventName} → applyRealtimeMessage`, { roomId, sender: message.sender_type });
    useChatStore.getState().applyRealtimeMessage(normalized);

    if (message.sender_type === 'USER') {
      const roomStatus = normalized?.room?.status;
      const tab = useChatStore.getState().activeInboxTab;
      syncInboxFromServer(
        roomStatus === 'WAITING_FOR_AGENT' ? 'WAITING_FOR_AGENT' : tab
      );
    }

    const after = useChatStore.getState();
    if (after.activeRoomId !== roomId && message.sender_type !== 'AGENT') {
      after.incrementUnread(roomId);
    }
  };

  const handleRoomUpdated = (payload) => {
    const store = useChatStore.getState();
    const room = payload?.room || payload;
    if (room) store.addOrUpdateRoom(room);
    const roomId = roomIdOf(payload);
    const status = payload?.status || room?.status;
    if (roomId && status) store.updateRoomStatus(roomId, status);
    if (room?.status === 'WAITING_FOR_AGENT') {
      syncInboxFromServer('WAITING_FOR_AGENT');
    }
  };

  const handleNewChat = (payload) => {
    const store = useChatStore.getState();
    const room = payload?.room || payload;
    if (!room) return;
    store.addOrUpdateRoom(room);
    syncInboxFromServer(
      room.status === 'WAITING_FOR_AGENT' ? 'WAITING_FOR_AGENT' : store.activeInboxTab
    );
    if (room.status === 'WAITING_FOR_AGENT') {
      playAlertSound();
      store.pushNotification({
        type: 'new_chat',
        title: 'New chat',
        body: `${room.guest_name || 'Customer'} started a chat`,
        room_id: roomIdOf(payload),
      });
    } else if (room.status === 'BOT') {
      store.pushNotification({
        type: 'new_chat',
        title: 'New AI chat',
        body: `${room.guest_name || 'Guest'} started chatting with the bot`,
        room_id: roomIdOf(payload),
      });
    }
  };

  sock.off('connect');
  sock.on('connect', () => {
    console.log('✅ Admin Socket Connected with ID:', sock.id);
    console.log('📡 Socket target:', `${resolveSocketUrl()}/admin`, 'path=/chat-socket/socket.io');
    joinAdminRooms(sock);
    const agent = useAuthStore.getState().agent;
    const presence = useAuthStore.getState().presence || 'online';
    const agentId = agent?.id || agent?._id;
    if (agentId) {
      // Server auto-marks agent online on socket connect — avoid duplicate agent_online emit.
      useChatStore.getState().setOnlineAgents({
        agent_id: agentId,
        name: agent?.name,
        role: agent?.role,
        is_online: presence !== 'offline',
        status: presence,
      });
    }
  });

  sock.off('new_message');
  sock.off('chat_message');
  sock.off('admin_message');
  sock.on('new_message', (payload) => handleIncomingMessage('new_message', payload));
  sock.on('admin_message', (payload) => handleIncomingMessage('admin_message', payload));

  sock.on('chat_history', (payload) => {
    const store = useChatStore.getState();
    const roomId = roomIdOf(payload);
    if (!roomId) return;
    if (payload.room) store.addOrUpdateRoom(payload.room);
    if (Array.isArray(payload.messages)) {
      store.setMessages(roomId, payload.messages);
    }
  });

  const handleHandoverEvent = (payload) => {
    const store = useChatStore.getState();
    const room = payload?.room;
    const roomId = roomIdOf(payload);
    if (room) {
      const id = String(room._id || room.id);
      store.updateRoomStatus(id, 'WAITING_FOR_AGENT');
      store.addOrUpdateRoom({ ...room, status: 'WAITING_FOR_AGENT' });
    } else if (roomId) {
      store.updateRoomStatus(roomId, 'WAITING_FOR_AGENT');
      store.addOrUpdateRoom({ _id: roomId, status: 'WAITING_FOR_AGENT' });
    }

    syncInboxFromServer('WAITING_FOR_AGENT');

    playAlertSound();
    const guest = room?.guest_name || 'Customer';
    showBrowserNotification('New live request', `${guest} wants a live agent`);
    store.pushNotification({
      type: 'waiting',
      title: 'New live request',
      body: `${guest} is waiting`,
      room_id: roomId || room?._id,
    });
    toast('🔔 New live request!', {
      duration: 5000,
      style: {
        background: '#fff7ed',
        color: '#9a3412',
        border: '1px solid #fdba74',
        fontWeight: 600,
      },
    });
  };

  sock.on('new_handover_request', handleHandoverEvent);
  sock.on('handover_started', handleHandoverEvent);
  sock.on('waiting_for_agent', handleHandoverEvent);

  sock.on('new_chat', handleNewChat);
  sock.on('new_room', handleNewChat);

  sock.on('room_updated', handleRoomUpdated);
  sock.on('chat_updated', handleRoomUpdated);

  sock.on('room_status_changed', handleRoomUpdated);

  sock.on('chat_taken', (payload) => {
    const store = useChatStore.getState();
    if (payload?.room) store.addOrUpdateRoom(payload.room);
    const roomId = roomIdOf(payload);
    if (roomId) store.updateRoomStatus(roomId, 'ACTIVE');
    if (payload?.message) store.addMessage(roomId, payload.message);
    store.pushNotification({
      type: 'joined',
      title: 'Agent joined',
      body: `${payload?.agent_name || payload?.room?.assigned_agent_id?.name || 'Agent'} took the chat`,
      room_id: roomId,
    });
  });

  sock.on('chat_resolved', (payload) => {
    const store = useChatStore.getState();
    if (payload?.room) store.addOrUpdateRoom(payload.room);
    const roomId = roomIdOf(payload);
    if (roomId) store.updateRoomStatus(roomId, 'RESOLVED');
    if (payload?.message) store.addMessage(roomId, payload.message);
    if (roomId && store.activeRoomId === roomId) {
      store.setActiveRoom(null);
      store.setMobileView('list');
    }
    store.pushNotification({
      type: 'resolved',
      title: 'Chat resolved',
      body: `${payload?.room?.guest_name || 'Customer'}'s chat was resolved`,
      room_id: roomId,
    });
  });

  sock.on('agent_status_change', (payload) => {
    useChatStore.getState().setOnlineAgents(payload);
  });

  sock.on('rating_submitted', (payload) => {
    toast.success(
      `⭐ Customer rated${payload?.rating ? `: ${payload.rating}` : ''}`
    );
    const roomId = roomIdOf(payload);
    if (roomId && payload?.rating != null) {
      useChatStore.getState().addOrUpdateRoom({
        _id: roomId,
        rating: payload.rating,
        is_rated: true,
      });
    }
    useChatStore.getState().pushNotification({
      type: 'rating',
      title: 'New rating',
      body: `Customer gave ${payload?.rating || ''} stars`,
      room_id: roomId,
    });
  });

  sock.on('chat_transferred', (payload) => {
    const roomId = roomIdOf(payload);
    toast(
      `↗️ Chat transfer: ${payload?.from_agent || '?'} → ${payload?.to_agent || '?'}`
    );
    if (roomId) {
      useChatStore.getState().addOrUpdateRoom({
        _id: roomId,
        ...(payload?.room || {}),
      });
    }
    useChatStore.getState().pushNotification({
      type: 'transfer',
      title: 'Chat transfer',
      body: `${payload?.from_agent || '?'} → ${payload?.to_agent || '?'}`,
      room_id: roomId,
    });
  });

  sock.on('take_chat_failed', (payload) => {
    toast.error(payload?.message || 'Could not take chat');
  });

  const startTyping = (room_id, name) => {
    if (!room_id) return;
    const id = String(room_id);
    useChatStore.getState().setTyping(id, true, name || 'Guest');
    clearTimeout(typingClearTimers[id]);
    typingClearTimers[id] = setTimeout(() => {
      useChatStore.getState().setTyping(id, false);
      delete typingClearTimers[id];
    }, 4000);
  };

  const stopTyping = (room_id) => {
    if (!room_id) return;
    const id = String(room_id);
    clearTimeout(typingClearTimers[id]);
    delete typingClearTimers[id];
    useChatStore.getState().setTyping(id, false);
  };

  sock.on('customer_typing', ({ room_id, name }) => startTyping(room_id, name));
  sock.on('user_typing', ({ room_id, name }) => startTyping(room_id, name));
  sock.on('customer_stopped_typing', ({ room_id }) => stopTyping(room_id));
  sock.on('user_stopped_typing', ({ room_id }) => stopTyping(room_id));

  sock.on('disconnect', () => {
    console.warn('[socket] disconnected');
  });

  sock.on('connect_error', (err) => {
    console.error('❌ Admin Socket Connect Error:', err.message);
    console.error('Tried to connect to:', `${resolveSocketUrl()}/admin`, 'path=/chat-socket/socket.io');
  });

  sock.onAny((event, ...args) =>
    console.log('📩 Incoming Socket Event:', event, args)
  );
}

export function connectSocket() {
  const token = String(localStorage.getItem('chat_admin_token') || '').trim();

  if (!token) return null;

  if (socket?.connected) return socket;

  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }

  const socketUrl = resolveSocketUrl();
  // Always use chat microservice path — proxied by store :5000 or Vite dev to :5001
  socket = io(`${socketUrl}/admin`, {
    path: '/chat-socket/socket.io',
    auth: { token },
    extraHeaders: {
      Authorization: `Bearer ${token}`,
      'X-Chat-Admin': '1',
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
  });

  bindListeners(socket);
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function joinActiveRoom(roomId) {
  const sock = getSocket();
  if (!sock?.connected || !roomId) return;
  sock.emit('join_admin_room');
  sock.emit('join_room', { room_id: String(roomId) });
}

export function getSocket() {
  return socket;
}

export function emitPresence(status) {
  const sock = getSocket();
  useAuthStore.getState().setPresence(status);
  if (!sock?.connected) return;
  if (status === 'away') sock.emit('agent_away');
  else if (status === 'offline') sock.emit('agent_offline');
  else sock.emit('agent_online');
}

export default {
  connectSocket,
  disconnectSocket,
  getSocket,
  joinActiveRoom,
  playAlertSound,
  emitPresence,
};
