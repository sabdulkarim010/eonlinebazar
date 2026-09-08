import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { extractRoomId, startChatSession } from '../api/chat';
import {
  ARIA_PERSONA,
  ARIA_QUICK_REPLIES,
  CHAT_ROOM_KEY_PREFIX,
  CHAT_SESSION_KEY,
  CHAT_SOCKET_PATH,
  buildChatApiUrl,
  resolveChatSocketUrl,
} from '../config/chatConfig';

const STORAGE_RATED = 'cw_rated_rooms';

const STORAGE_ROOM_GENERAL = `${CHAT_ROOM_KEY_PREFIX}GENERAL`;

function resolveRoomStorageKey(orderContext) {
  if (orderContext?.orderId) {
    return `${CHAT_ROOM_KEY_PREFIX}ORDER_${orderContext.orderId}`;
  }
  return STORAGE_ROOM_GENERAL;
}

function createUuid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function normalizeSenderType(raw) {
  const type = String(raw || 'BOT').toUpperCase();
  if (type === 'CUSTOMER' || type === 'GUEST') return 'USER';
  if (type === 'AI' || type === 'BOT_MESSAGE') return 'BOT';
  if (type === 'HUMAN' || type === 'SUPPORT') return 'AGENT';
  return type;
}

function normalizeMessage(raw) {
  if (!raw) return null;
  const id = raw._id || raw.id || `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const attachments = Array.isArray(raw.attachments) ? raw.attachments : [];
  const messageType = raw.message_type || raw.messageType || (attachments.length ? 'image' : 'text');
  return {
    id: String(id),
    senderType: normalizeSenderType(raw.sender_type || raw.senderType || raw.type),
    senderName: raw.sender_name || raw.senderName || '',
    senderAvatar:
      raw.sender_avatar ||
      raw.senderAvatar ||
      (raw.agent && (raw.agent.avatar || raw.agent.avatarUrl)) ||
      null,
    text: String(raw.message || raw.content || raw.text || '').trim(),
    createdAt: raw.created_at || raw.createdAt || raw.timestamp || new Date().toISOString(),
    quickReplies: Array.isArray(raw.quick_replies || raw.quickReplies)
      ? raw.quick_replies || raw.quickReplies
      : [],
    attachments,
    messageType,
    isPending: Boolean(raw.isPending),
  };
}

async function getRatedRooms() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_RATED);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function markRoomRated(roomId) {
  if (!roomId) return;
  try {
    const rooms = await getRatedRooms();
    if (!rooms.includes(String(roomId))) {
      rooms.push(String(roomId));
      await AsyncStorage.setItem(STORAGE_RATED, JSON.stringify(rooms));
    }
  } catch {
    /* ignore */
  }
}

function sortMessages(list) {
  return [...list].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

async function getOrCreateGuestSessionId() {
  try {
    const existing = await AsyncStorage.getItem(CHAT_SESSION_KEY);
    if (existing) return existing;
    const id = createUuid();
    await AsyncStorage.setItem(CHAT_SESSION_KEY, id);
    return id;
  } catch {
    return createUuid();
  }
}

async function readPersistedRoomId(storageKey = STORAGE_ROOM_GENERAL) {
  try {
    return await AsyncStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

async function persistRoomId(roomId, storageKey = STORAGE_ROOM_GENERAL) {
  try {
    if (roomId) {
      await AsyncStorage.setItem(storageKey, String(roomId));
    } else {
      await AsyncStorage.removeItem(storageKey);
    }
  } catch {
    /* ignore storage errors */
  }
}

function buildOrderMetadata(orderContext) {
  if (!orderContext) return null;
  return {
    order_number: orderContext.orderNumber || orderContext.orderId || null,
    order_mongo_id: orderContext.orderId || null,
    status: orderContext.orderStatus || null,
    total_amount: orderContext.orderTotal ?? null,
    items: (orderContext.orderItems || []).map((item) => ({
      name: item.name || 'Item',
      quantity: Number(item.qty ?? item.quantity) || 1,
      price: Number(item.price) || 0,
    })),
  };
}

export function useAriaChat({ user, guestName = 'Guest', orderContext = null, authToken = null, productContext = null }) {
  const [messages, setMessages] = useState([]);
  const [connectionState, setConnectionState] = useState('connecting');
  const [roomStatus, setRoomStatus] = useState('BOT');
  const [agentName, setAgentName] = useState(null);
  const [agentAvatarUrl, setAgentAvatarUrl] = useState(null);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [usedQuickReplyIds, setUsedQuickReplyIds] = useState([]);
  const [hasRated, setHasRated] = useState(false);
  const [roomId, setRoomId] = useState(null);

  const socketRef = useRef(null);
  const roomIdRef = useRef(null);
  const guestSessionRef = useRef(null);
  const renderedIdsRef = useRef(new Set());
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);
  const bootstrappingRef = useRef(null);
  const orderContextRef = useRef(orderContext);
  orderContextRef.current = orderContext;
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;
  const productContextRef = useRef(productContext);
  productContextRef.current = productContext;
  const roomStorageKey = useMemo(
    () => resolveRoomStorageKey(orderContext),
    [orderContext?.orderId]
  );

  const displayName = useMemo(
    () => guestName || user?.name || 'Guest',
    [guestName, user?.name]
  );

  const statusLabel = useMemo(() => {
    if (connectionState === 'connecting') return 'Connecting…';
    if (connectionState === 'error') return 'Offline';
    if (roomStatus === 'WAITING_FOR_AGENT') return 'Waiting for agent…';
    if (roomStatus === 'ACTIVE' && agentName) return `Connected with ${agentName}`;
    if (roomStatus === 'RESOLVED') return 'Chat ended';
    return 'Online';
  }, [agentName, connectionState, roomStatus]);

  const waitingForAgent = roomStatus === 'WAITING_FOR_AGENT';

  const appendMessage = useCallback((raw, { replaceTmpText } = {}) => {
    const normalized = normalizeMessage(raw);
    if (!normalized) return;

    setMessages((prev) => {
      if (renderedIdsRef.current.has(normalized.id)) {
        return prev;
      }

      let next = prev;
      if (
        replaceTmpText
        && normalized.senderType === 'USER'
        && replaceTmpText
      ) {
        next = prev.filter(
          (item) => !(String(item.id).startsWith('tmp-') && item.text === replaceTmpText)
        );
      }

      renderedIdsRef.current.add(normalized.id);
      return sortMessages([...next, normalized]);
    });
  }, []);

  const replaceHistory = useCallback((history) => {
    renderedIdsRef.current = new Set();
    const normalized = (Array.isArray(history) ? history : [])
      .map((item) => normalizeMessage(item))
      .filter(Boolean);

    normalized.forEach((item) => renderedIdsRef.current.add(item.id));
    setMessages(sortMessages(normalized));
  }, []);

  const emitTypingStop = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (isTypingRef.current && socketRef.current?.connected && roomIdRef.current) {
      isTypingRef.current = false;
      socketRef.current.emit('typing_stop', { room_id: roomIdRef.current });
    }
  }, []);

  const emitTypingStart = useCallback(() => {
    if (!socketRef.current?.connected || !roomIdRef.current || roomStatus === 'RESOLVED') {
      return;
    }
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socketRef.current.emit('typing_start', {
        room_id: roomIdRef.current,
        name: displayName,
      });
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      emitTypingStop();
    }, 2000);
  }, [displayName, emitTypingStop, roomStatus]);

  const bindSocketEvents = useCallback((socket) => {
    socket.off('connect');
    socket.off('connect_error');
    socket.off('disconnect');
    socket.off('chat_history');
    socket.off('new_message');
    socket.off('handover_started');
    socket.off('waiting_for_agent');
    socket.off('agent_joined');
    socket.off('agent_typing');
    socket.off('agent_stopped_typing');
    socket.off('chat_resolved');
    socket.off('error');

    socket.on('connect', () => {
      setConnectionState('online');
      if (roomIdRef.current) {
        socket.emit('join_room', {
          room_id: roomIdRef.current,
          guest_session_id: guestSessionRef.current,
        });
      }
    });

    socket.on('connect_error', () => {
      setConnectionState('error');
    });

    socket.on('disconnect', () => {
      setConnectionState('error');
    });

    socket.on('chat_history', (payload) => {
      const history = Array.isArray(payload)
        ? payload
        : payload?.messages || payload?.history || [];
      replaceHistory(history);
      setUsedQuickReplyIds([]);
    });

    socket.on('new_message', (msg) => {
      if (msg?.sender_type === 'INTERNAL') return;
      if (msg?.agent?.name) setAgentName(msg.agent.name);
      if (msg?.agent?.avatar || msg?.sender_avatar) {
        setAgentAvatarUrl(msg.agent?.avatar || msg.sender_avatar || null);
      }
      const normalized = normalizeMessage(msg);
      appendMessage(msg, { replaceTmpText: normalized?.text });
      setIsAgentTyping(false);
    });

    socket.on('handover_started', (payload) => {
      setRoomStatus(payload?.status || 'WAITING_FOR_AGENT');
    });

    socket.on('waiting_for_agent', (payload) => {
      setRoomStatus(payload?.status || 'WAITING_FOR_AGENT');
    });

    socket.on('agent_joined', (payload) => {
      const name = payload?.agent_name || payload?.name || payload?.agentName || 'Agent';
      setAgentName(name);
      setAgentAvatarUrl(
        payload?.agent?.avatar ||
          payload?.agent?.avatarUrl ||
          payload?.agent_avatar ||
          payload?.agentAvatar ||
          null
      );
      setRoomStatus('ACTIVE');
      setIsAgentTyping(false);
    });

    socket.on('agent_typing', () => setIsAgentTyping(true));
    socket.on('agent_stopped_typing', () => setIsAgentTyping(false));

    socket.on('chat_resolved', () => {
      setRoomStatus('RESOLVED');
      setIsAgentTyping(false);
      emitTypingStop();
      getRatedRooms().then((rooms) => {
        if (roomIdRef.current) {
          setHasRated(rooms.includes(String(roomIdRef.current)));
        }
      });
    });

    socket.on('error', (payload) => {
      const code = payload?.message || '';
      if (code === 'TOO_MANY_MESSAGES') {
        setError('Too many messages — please wait a moment.');
      } else       if (code === 'UNAUTHORIZED' || code === 'SESSION_REQUIRED') {
        setError('Session expired. Restarting chat…');
        persistRoomId(null, roomStorageKey);
        roomIdRef.current = null;
      }
    });
  }, [appendMessage, emitTypingStop, replaceHistory, roomStorageKey]);

  const connectSocket = useCallback((guestSessionId, userId) => {
    if (socketRef.current) {
      try {
        socketRef.current.disconnect();
      } catch {
        /* ignore */
      }
      socketRef.current = null;
    }

    const socket = io(`${resolveChatSocketUrl()}/customer`, {
      path: CHAT_SOCKET_PATH,
      auth: {
        guest_session_id: guestSessionId,
        user_id: userId || undefined,
      },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    });

    bindSocketEvents(socket);
    socketRef.current = socket;
    return socket;
  }, [bindSocketEvents]);

  const bootstrap = useCallback(async () => {
    if (bootstrappingRef.current) return bootstrappingRef.current;

    bootstrappingRef.current = (async () => {
      setError(null);
      setConnectionState('connecting');
      setAgentName(null);
      setAgentAvatarUrl(null);
      setRoomStatus('BOT');
      renderedIdsRef.current = new Set();
      setMessages([]);
      setUsedQuickReplyIds([]);

      const guestSessionId = await getOrCreateGuestSessionId();
      guestSessionRef.current = guestSessionId;

      const userId = user?.id ? String(user.id) : null;
      connectSocket(guestSessionId, userId);

      const persistedRoom = await readPersistedRoomId(roomStorageKey);
      if (persistedRoom) {
        roomIdRef.current = persistedRoom;
      }

      const ctx = orderContextRef.current;
      const isOrderSupport = Boolean(ctx?.orderId);
      const token = authTokenRef.current;
      const productMeta = productContextRef.current;
      const startPayload = {
        type: isOrderSupport ? 'ORDER_SUPPORT' : 'GENERAL',
        order_id: isOrderSupport ? ctx.orderId : null,
        order_metadata: isOrderSupport ? buildOrderMetadata(ctx) : null,
        product_metadata: productMeta || null,
        guest_session_id: guestSessionId,
        guest_name: displayName,
        guest_email: user?.email || null,
        user_id: userId,
        auth_token: token || undefined,
        customer_avatar_url: user?.avatar || user?.avatarUrl || undefined,
        customer_avatar: user?.avatar || user?.avatarUrl || undefined,
      };

      const data = await startChatSession(startPayload);
      const roomId = extractRoomId(data) || persistedRoom;
      if (!roomId) {
        throw new Error('No room returned from chat service');
      }

      roomIdRef.current = roomId;
      setRoomId(roomId);
      await persistRoomId(roomId, roomStorageKey);

      const ratedRooms = await getRatedRooms();
      setHasRated(ratedRooms.includes(String(roomId)));

      if (data?.room?.status) {
        setRoomStatus(data.room.status);
      }

      const socket = socketRef.current;
      if (socket) {
        if (socket.connected) {
          socket.emit('join_room', {
            room_id: roomId,
            guest_session_id: guestSessionId,
          });
        } else {
          socket.once('connect', () => {
            socket.emit('join_room', {
              room_id: roomId,
              guest_session_id: guestSessionId,
            });
          });
        }
      }

      if (data?.welcome_message && !data?.is_existing) {
        appendMessage(data.welcome_message);
      }

      if (isOrderSupport && ctx && !data?.is_existing) {
        const intro = ctx.initialMessage
          || `I need help with Order #${ctx.orderNumber || ctx.orderId} (Status: ${ctx.orderStatus || 'Unknown'})`;
        setTimeout(() => {
          if (socketRef.current?.connected && roomIdRef.current) {
            socketRef.current.emit('send_message', {
              room_id: roomIdRef.current,
              message: intro,
              guest_session_id: guestSessionRef.current,
              sender_name: displayName,
              sender_type: 'USER',
            });
            appendMessage({
              _id: `tmp-intro-${Date.now()}`,
              sender_type: 'USER',
              message: intro,
              createdAt: new Date().toISOString(),
            });
          }
        }, 600);
      }

      setConnectionState(socket?.connected ? 'online' : 'connecting');
    })();

    try {
      await bootstrappingRef.current;
    } catch (err) {
      setConnectionState('error');
      setError(err?.message || 'Could not start live chat.');
    } finally {
      bootstrappingRef.current = null;
    }
  }, [appendMessage, connectSocket, displayName, roomStorageKey, user?.email, user?.id]);

  useEffect(() => {
    bootstrap();
    return () => {
      emitTypingStop();
      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch {
          /* ignore */
        }
        socketRef.current = null;
      }
    };
  }, [bootstrap, emitTypingStop]);

  const sendMessage = useCallback(async (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || roomStatus === 'RESOLVED') return false;
    if (!roomIdRef.current) {
      setError('Chat room is not ready yet.');
      return false;
    }
    if (!socketRef.current?.connected) {
      setError('Connection lost. Reconnecting…');
      try {
        socketRef.current?.connect();
      } catch {
        /* ignore */
      }
      return false;
    }
    if (trimmed.length > 5000) {
      setError('Message is too long (max 5000 characters).');
      return false;
    }

    setIsSending(true);
    emitTypingStop();

    const tmpId = `tmp-${Date.now()}`;
    appendMessage({
      _id: tmpId,
      sender_type: 'USER',
      message: trimmed,
      createdAt: new Date().toISOString(),
    });

    try {
      socketRef.current.emit('send_message', {
        room_id: roomIdRef.current,
        message: trimmed,
        guest_session_id: guestSessionRef.current,
        sender_name: displayName,
        sender_type: 'USER',
      });
      setError(null);
      return true;
    } catch (err) {
      setError(err?.message || 'Could not send message.');
      return false;
    } finally {
      setIsSending(false);
    }
  }, [appendMessage, displayName, emitTypingStop, roomStatus]);

  const sendQuickReply = useCallback(async (reply) => {
    const value = reply?.value || reply?.label || reply;
    const replyId = reply?.label || String(value);
    setUsedQuickReplyIds((prev) => (prev.includes(replyId) ? prev : [...prev, replyId]));
    return sendMessage(value);
  }, [sendMessage]);

  const activeQuickReplies = useMemo(() => {
    const botMessages = [...messages].reverse().filter((item) => item.senderType === 'BOT');
    const latestWithReplies = botMessages.find((item) => item.quickReplies?.length);
    const source = latestWithReplies?.quickReplies?.length
      ? latestWithReplies.quickReplies
      : messages.length <= 1
        ? ARIA_QUICK_REPLIES
        : [];

    return source
      .map((item, index) => {
        if (typeof item === 'string') {
          return { id: item, label: item, value: item };
        }
        const label = item.label || item.text || item.value || '';
        const value = item.value || item.label || item.text || '';
        return {
          id: label || `qr-${index}`,
          label,
          value,
        };
      })
      .filter((item) => item.label && !usedQuickReplyIds.includes(item.id));
  }, [messages, usedQuickReplyIds]);

  const canSend = roomStatus !== 'RESOLVED' && connectionState !== 'error';

  const endChat = useCallback(async () => {
    emitTypingStop();
    const roomId = roomIdRef.current;
    const socket = socketRef.current;

    if (socket?.connected && roomId) {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { socket.off('end_chat_ok', onOk); } catch { /* ignore */ }
          try { socket.off('end_chat_failed', onFail); } catch { /* ignore */ }
          resolve();
        };
        const onOk = () => finish();
        const onFail = () => finish();
        const timer = setTimeout(finish, 5000);
        socket.once('end_chat_ok', onOk);
        socket.once('end_chat_failed', onFail);
        try {
          socket.emit(
            'end_chat',
            { room_id: roomId, guest_session_id: guestSessionRef.current },
            () => finish()
          );
        } catch {
          finish();
        }
      });
    }

    await persistRoomId(null, roomStorageKey);
    roomIdRef.current = null;
    renderedIdsRef.current = new Set();
    setMessages([]);
    setAgentName(null);
    setRoomStatus('RESOLVED');
    setUsedQuickReplyIds([]);
    setIsAgentTyping(false);
    setError(null);
  }, [emitTypingStop, roomStorageKey]);

  const resetChat = useCallback(async () => {
    await endChat();
    if (socketRef.current) {
      try {
        socketRef.current.disconnect();
      } catch {
        /* ignore */
      }
      socketRef.current = null;
    }
    setRoomId(null);
    setHasRated(false);
    await bootstrap();
  }, [bootstrap, endChat]);

  const submitRating = useCallback(async (score) => {
    const rid = roomIdRef.current;
    if (!rid || !score) return false;
    try {
      const url = buildChatApiUrl(`/api/chat/${encodeURIComponent(rid)}/rate`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score,
          rating: score,
          guest_session_id: guestSessionRef.current,
          user_id: user?.id ? String(user.id) : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || 'Rating failed');
      }
      await markRoomRated(rid);
      setHasRated(true);
      return true;
    } catch (err) {
      setError(err?.message || 'Could not submit rating.');
      return false;
    }
  }, [user?.id]);

  const sendImage = useCallback(async (uri) => {
    const rid = roomIdRef.current;
    if (!rid || !uri || roomStatus === 'RESOLVED') return false;
    if (!socketRef.current?.connected) {
      setError('Connection lost. Reconnecting…');
      return false;
    }

    setIsSending(true);
    try {
      const formData = new FormData();
      formData.append('image', {
        uri,
        type: 'image/jpeg',
        name: 'chat_image.jpg',
      });
      formData.append('guest_session_id', guestSessionRef.current || '');

      const url = buildChatApiUrl(`/api/chat/${encodeURIComponent(rid)}/upload`);
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Upload failed');
      }
      setError(null);
      return true;
    } catch (err) {
      setError(err?.message || 'Failed to send image.');
      return false;
    } finally {
      setIsSending(false);
    }
  }, [roomStatus]);

  const showRatingPrompt = roomStatus === 'RESOLVED' && !hasRated;

  return {
    messages,
    connectionState,
    roomStatus,
    roomId,
    agentName,
    agentAvatarUrl,
    personaName: agentName || ARIA_PERSONA,
    statusLabel,
    waitingForAgent,
    isAgentTyping,
    isSending,
    error,
    activeQuickReplies,
    canSend,
    showRatingPrompt,
    hasRated,
    sendMessage,
    sendQuickReply,
    sendImage,
    submitRating,
    onInputChange: emitTypingStart,
    retryBootstrap: bootstrap,
    endChat,
    resetChat,
  };
}
