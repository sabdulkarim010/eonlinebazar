import { create } from 'zustand';
import { persistTag as persistTagApi } from '../services/api';

const useChatStore = create((set, get) => ({
  rooms: [],
  activeRoomId: null,
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
    set({ rooms: rooms || [], unreadCounts });
  },

  setCounts: (counts) => set({ counts: { ...get().counts, ...counts } }),

  addOrUpdateRoom: (room) => {
    if (!room) return;
    const id = String(room._id || room.id);
    const rooms = [...get().rooms];
    const idx = rooms.findIndex((r) => String(r._id || r.id) === id);
    if (idx >= 0) {
      rooms[idx] = { ...rooms[idx], ...room };
    } else {
      rooms.unshift(room);
    }
    rooms.sort(
      (a, b) =>
        new Date(b.last_message_at || b.updatedAt || 0) -
        new Date(a.last_message_at || a.updatedAt || 0)
    );
    set({ rooms });
  },

  setActiveRoom: (roomId) => set({ activeRoomId: roomId ? String(roomId) : null }),

  addMessage: (roomId, message) => {
    if (!roomId || !message) return;
    const id = String(roomId);
    const existing = get().messages[id] || [];
    const msgId = String(message._id || message.id || '');
    if (msgId && existing.some((m) => String(m._id || m.id) === msgId)) {
      return;
    }

    // Drop matching optimistic tmp-* bubbles when the real socket message arrives
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
    const rooms = get().rooms.map((r) =>
      String(r._id || r.id) === id ? { ...r, status } : r
    );
    set({ rooms });
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

    if (payload.is_online === false) {
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

  /** Persist tag via API — do not only update local Zustand state. */
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
    const { rooms, activeRoomId } = get();
    if (!activeRoomId) return null;
    return rooms.find((r) => String(r._id || r.id) === activeRoomId) || null;
  },
}));

export default useChatStore;
