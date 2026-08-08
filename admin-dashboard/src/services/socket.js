import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import useChatStore from '../store/chatStore';

const PROD_CHAT_API = 'https://eonlinebazar.com';
const LOCAL_CHAT_API = 'http://localhost:5001';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? PROD_CHAT_API : LOCAL_CHAT_API);

let socket = null;
let listenersBound = false;
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
      icon: '/vite.svg',
      tag: 'chat-handover',
    });
  } catch {
    // ignore
  }
}

function roomIdOf(payload) {
  return String(
    payload?.room_id ||
      payload?.room?._id ||
      payload?.room?.id ||
      payload?._id ||
      ''
  );
}

function bindListeners(sock) {
  if (listenersBound) return;
  listenersBound = true;

  sock.on('connect', () => {
    const agent = useAuthStore.getState().agent;
    const agentId = agent?.id || agent?._id;
    if (agentId) {
      sock.emit('agent_online', { agent_id: agentId });
      useChatStore.getState().setOnlineAgents({
        agent_id: agentId,
        name: agent?.name,
        is_online: true,
      });
    }
  });

  sock.on('new_message', (payload) => {
    const store = useChatStore.getState();
    const roomId = roomIdOf(payload);
    const message = payload?.message || payload;
    if (!roomId || !message) return;

    store.addMessage(roomId, message);
    if (payload.room) store.addOrUpdateRoom(payload.room);

    if (store.activeRoomId !== roomId && message.sender_type !== 'AGENT') {
      store.incrementUnread(roomId);
    }
  });

  sock.on('new_handover_request', (payload) => {
    const store = useChatStore.getState();
    const room = payload?.room;
    if (room) {
      store.addOrUpdateRoom({ ...room, status: 'WAITING_FOR_AGENT' });
      store.updateRoomStatus(room._id || room.id, 'WAITING_FOR_AGENT');
    }

    playAlertSound();
    showBrowserNotification(
      'নতুন লাইভ রিকোয়েস্ট',
      `${room?.guest_name || 'কাস্টমার'} লাইভ এজেন্ট চান`
    );
    toast('🔔 নতুন লাইভ রিকোয়েস্ট!', {
      duration: 5000,
      style: {
        background: '#fff7ed',
        color: '#9a3412',
        border: '1px solid #fdba74',
        fontWeight: 600,
      },
    });
  });

  sock.on('room_updated', (payload) => {
    const room = payload?.room || payload;
    if (room) useChatStore.getState().addOrUpdateRoom(room);
  });

  sock.on('room_status_changed', (payload) => {
    const roomId = roomIdOf(payload);
    const status = payload?.status || payload?.room?.status;
    if (roomId && status) {
      useChatStore.getState().updateRoomStatus(roomId, status);
    }
    if (payload?.room) useChatStore.getState().addOrUpdateRoom(payload.room);
  });

  sock.on('chat_taken', (payload) => {
    const store = useChatStore.getState();
    if (payload?.room) store.addOrUpdateRoom(payload.room);
    const roomId = roomIdOf(payload);
    if (roomId) store.updateRoomStatus(roomId, 'ACTIVE');
    if (payload?.message) store.addMessage(roomId, payload.message);
  });

  sock.on('chat_resolved', (payload) => {
    const store = useChatStore.getState();
    if (payload?.room) store.addOrUpdateRoom(payload.room);
    const roomId = roomIdOf(payload);
    if (roomId) store.updateRoomStatus(roomId, 'RESOLVED');
    if (payload?.message) store.addMessage(roomId, payload.message);
  });

  sock.on('agent_status_change', (payload) => {
    useChatStore.getState().setOnlineAgents(payload);
  });

  sock.on('rating_submitted', (payload) => {
    toast.success(
      `⭐ কাস্টমার রেটিং দিয়েছেন${payload?.rating ? `: ${payload.rating}` : ''}`
    );
    const roomId = roomIdOf(payload);
    if (roomId && payload?.rating != null) {
      useChatStore.getState().addOrUpdateRoom({
        _id: roomId,
        rating: payload.rating,
        is_rated: true,
      });
    }
  });

  sock.on('chat_transferred', (payload) => {
    const roomId = roomIdOf(payload);
    toast(
      `↗️ চ্যাট ট্রান্সফার: ${payload?.from_agent || '?'} → ${payload?.to_agent || '?'}`
    );
    if (roomId) {
      useChatStore.getState().addOrUpdateRoom({
        _id: roomId,
        ...(payload?.room || {}),
      });
    }
  });

  sock.on('take_chat_failed', (payload) => {
    toast.error(payload?.message || 'চ্যাট নেওয়া যায়নি');
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
    console.error('[socket] connect_error', err.message);
  });
}

export function connectSocket() {
  const token =
    localStorage.getItem('token') || useAuthStore.getState().token;

  if (!token) return null;

  if (socket?.connected) return socket;

  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }

  socket = io(`${SOCKET_URL}/admin`, {
    auth: { token },
    extraHeaders: {
      Authorization: `Bearer ${token}`,
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
    socket.disconnect();
  }
}

export function getSocket() {
  return socket;
}

export default {
  connectSocket,
  disconnectSocket,
  getSocket,
  playAlertSound,
};
