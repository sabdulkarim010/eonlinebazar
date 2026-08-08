import { create } from 'zustand';
import { persistTag as persistTagApi } from '../services/api';

const MAX_NOTIFICATIONS = 10;

const useChatStore = create((set, get) => ({
  rooms: [],
  activeRoomId: null,
  activeRoom: null,
  messages: {},
  stats: {
    total_today: 0,
    resolved_today: 0,
    waiting_for_agent: 0,
    avg_rating: null,
  },
  onlineAgents: [],
  unreadCounts: {},
  typingRooms: {},
  notifications: [],
  unreadNotifications: 0,
  globalSearch: '',
  mobileView: 'list', // list | chat | context
  counts: {
    BOT: 0,
    WAITING_FOR_AGENT: 0,
    ACTIVE: 0,
    RESOLVED: 0,
  },

  setRooms: (rooms) => {
    const unreadCounts = {};
    (rooms || []).forEach((room) => {
      const id = room._id || room.id;
      if (room.unread_count > 0) unreadCounts[id] = room.unread_count;
    });
    const nextRooms = rooms || [];
    const activeRoomId = get().activeRoomId;
    const activeFromList = activeRoomId
      ? nextRooms.find((r) => String(r._id || r.id) === activeRoomId)
      : null;
    set({
      rooms: nextRooms,
      unreadCounts,
      ...(activeFromList
        ? { activeRoom: { ...activeFromList, _id: activeRoomId } }
        : {}),
    });
  },

  setCounts: (counts) => set({ counts: { ...get().counts, ...counts } }),

  adjustCounts: (fromStatus, toStatus) => {
    const counts = { ...get().counts };
    if (fromStatus && Object.prototype.hasOwnProperty.call(counts, fromStatus)) {
      counts[fromStatus] = Math.max(0, (counts[fromStatus] || 0) - 1);
    }
    if (toStatus && Object.prototype.hasOwnProperty.call(counts, toStatus)) {
      counts[toStatus] = (counts[toStatus] || 0) + 1;
    }
    set({ counts });
  },

  addOrUpdateRoom: (room) => {
    if (!room) return;
    const id = String(room._id || room.id);
    const rooms = get().rooms;
    const exists = rooms.some((r) => String(r._id || r.id) === id);
    const newRooms = exists
      ? rooms.map((r) =>
          String(r._id || r.id) === id ? { ...r, ...room } : r
        )
      : [room, ...rooms];
    newRooms.sort(
      (a, b) =>
        new Date(b.last_message_at || b.updatedAt || 0) -
        new Date(a.last_message_at || a.updatedAt || 0)
    );
    set({ rooms: newRooms });
    if (get().activeRoomId === id) {
      set({
        activeRoom: { ...(get().activeRoom || {}), ...room, _id: id },
      });
    }
  },

  setActiveRoom: (roomId, roomObj = null) => {
    const id = roomId ? String(roomId) : null;
    set({
      activeRoomId: id,
      activeRoom: roomObj
        ? { ...roomObj, _id: id }
        : id
          ? get().rooms.find((r) => String(r._id || r.id) === id) ||
            get().activeRoom
          : null,
      mobileView: id ? 'chat' : 'list',
    });
  },

  setMobileView: (mobileView) => set({ mobileView }),

  setGlobalSearch: (globalSearch) => set({ globalSearch }),

  addMessage: (roomId, message) => {
    if (!roomId || !message) return;
    const id = String(roomId);
    const existing = get().messages[id] || [];
    const msgId = String(message._id || message.id || '');
    if (msgId && existing.some((m) => String(m._id || m.id) === msgId)) {
      return;
    }

    let next = existing;
    if (msgId && !msgId.startsWith('tmp-')) {
      next = existing.filter((m) => {
        const mid = String(m._id || m.id || '');
        if (!mid.startsWith('tmp-')) return true;
        const sameSender =
          String(m.sender_type || '') === String(message.sender_type || '') &&
          String(m.sender_id || '') === String(message.sender_id || '');
        const sameText =
          String(m.message || '').trim() === String(message.message || '').trim();
        return !(sameSender && sameText);
      });
    }

    set({
      messages: {
        ...get().messages,
        [id]: [...next, message],
      },
    });

    const preview =
      message.message ||
      (message.attachments?.length ? '[Attachment]' : '');
    if (preview) {
      get().addOrUpdateRoom({
        _id: id,
        last_message: preview,
        last_message_at:
          message.createdAt || message.created_at || new Date().toISOString(),
      });
    }
  },

  setMessages: (roomId, messages) => {
    if (!roomId) return;
    const list = messages || [];
    const seen = new Set();
    const deduped = [];
    list.forEach((m) => {
      const mid = String(m?._id || m?.id || '');
      if (mid) {
        if (seen.has(mid)) return;
        seen.add(mid);
      }
      deduped.push(m);
    });
    set({
      messages: {
        ...get().messages,
        [String(roomId)]: deduped,
      },
    });
  },

  updateRoomStatus: (roomId, status) => {
    if (!roomId || !status) return;
    const id = String(roomId);
    const existing =
      get().rooms.find((r) => String(r._id || r.id) === id) ||
      (get().activeRoomId === id ? get().activeRoom : null);
    const fromStatus = existing?.status;
    if (fromStatus !== status) {
      get().adjustCounts(fromStatus || null, status);
    }
    const rooms = get().rooms.map((r) =>
      String(r._id || r.id) === id ? { ...r, status } : r
    );
    const patch = { rooms };
    if (get().activeRoomId === id) {
      patch.activeRoom = { ...(get().activeRoom || {}), _id: id, status };
    }
    set(patch);
  },

  incrementUnread: (roomId) => {
    if (!roomId) return;
    const id = String(roomId);
    if (get().activeRoomId === id) return;
    const unreadCounts = { ...get().unreadCounts };
    unreadCounts[id] = (unreadCounts[id] || 0) + 1;
    set({ unreadCounts });
  },

  clearUnread: (roomId) => {
    if (!roomId) return;
    const id = String(roomId);
    const unreadCounts = { ...get().unreadCounts };
    delete unreadCounts[id];
    set({ unreadCounts });
    get().addOrUpdateRoom({ _id: id, unread_count: 0 });
  },

  setStats: (stats) =>
    set({
      stats: {
        ...get().stats,
        ...stats,
      },
    }),

  setOnlineAgents: (payload) => {
    if (Array.isArray(payload)) {
      set({ onlineAgents: payload });
      return;
    }

    const agents = [...get().onlineAgents];
    const agentId = String(payload.agent_id || payload.id || '');
    if (!agentId) return;

    const idx = agents.findIndex(
      (a) => String(a.agent_id || a.id || a._id) === agentId
    );

    if (payload.is_online === false || payload.status === 'offline') {
      set({
        onlineAgents: agents.filter(
          (a) => String(a.agent_id || a.id || a._id) !== agentId
        ),
      });
      return;
    }

    const entry = {
      agent_id: agentId,
      id: agentId,
      name: payload.name,
      role: payload.role,
      status: payload.status || 'online',
      active_chats: payload.active_chats ?? 0,
      is_online: true,
    };

    if (idx >= 0) agents[idx] = { ...agents[idx], ...entry };
    else agents.push(entry);

    set({ onlineAgents: agents });
  },

  setTyping: (roomId, isTyping, name = 'Guest') => {
    if (!roomId) return;
    const id = String(roomId);
    const typingRooms = { ...get().typingRooms };
    if (isTyping) typingRooms[id] = { name, at: Date.now() };
    else delete typingRooms[id];
    set({ typingRooms });
  },

  pushNotification: (event) => {
    if (!event) return;
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(),
      read: false,
      ...event,
    };
    const notifications = [item, ...get().notifications].slice(
      0,
      MAX_NOTIFICATIONS
    );
    set({
      notifications,
      unreadNotifications: get().unreadNotifications + 1,
    });
  },

  markNotificationsRead: () => {
    set({
      notifications: get().notifications.map((n) => ({ ...n, read: true })),
      unreadNotifications: 0,
    });
  },

  clearNotifications: () => {
    set({ notifications: [], unreadNotifications: 0 });
  },

  persistTag: async (roomId, tag) => {
    if (!roomId || !tag) return null;
    const data = await persistTagApi(roomId, tag);
    if (data?.room) {
      get().addOrUpdateRoom(data.room);
    } else {
      const room = get().rooms.find(
        (r) => String(r._id || r.id) === String(roomId)
      );
      const tags = Array.from(new Set([...(room?.tags || []), tag]));
      get().addOrUpdateRoom({ _id: roomId, tags });
    }
    return data;
  },

  getActiveRoom: () => {
    const { rooms, activeRoomId, activeRoom } = get();
    if (!activeRoomId) return null;
    return (
      activeRoom ||
      rooms.find((r) => String(r._id || r.id) === activeRoomId) ||
      null
    );
  },
}));

export default useChatStore;
