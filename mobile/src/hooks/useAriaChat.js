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
  resolveChatSocketUrl,
} from '../config/chatConfig';

const STORAGE_ROOM_GENERAL = `${CHAT_ROOM_KEY_PREFIX}GENERAL`;

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
  return {
    id: String(id),
    senderType: normalizeSenderType(raw.sender_type || raw.senderType || raw.type),
    senderName: raw.sender_name || raw.senderName || '',
    text: String(raw.message || raw.content || raw.text || '').trim(),
    createdAt: raw.created_at || raw.createdAt || raw.timestamp || new Date().toISOString(),
    quickReplies: Array.isArray(raw.quick_replies || raw.quickReplies)
      ? raw.quick_replies || raw.quickReplies
      : [],
  };
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

async function readPersistedRoomId() {
  try {
    return await AsyncStorage.getItem(STORAGE_ROOM_GENERAL);
  } catch {
    return null;
  }
}

async function persistRoomId(roomId) {
  try {
    if (roomId) {
      await AsyncStorage.setItem(STORAGE_ROOM_GENERAL, String(roomId));
    } else {
      await AsyncStorage.removeItem(STORAGE_ROOM_GENERAL);
    }
  } catch {
    /* ignore storage errors */
  }
}

export function useAriaChat({ user, guestName = 'Guest' }) {
  const [messages, setMessages] = useState([]);
  const [connectionState, setConnectionState] = useState('connecting');
  const [roomStatus, setRoomStatus] = useState('BOT');
  const [agentName, setAgentName] = useState(null);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [usedQuickReplyIds, setUsedQuickReplyIds] = useState([]);

  const socketRef = useRef(null);
  const roomIdRef = useRef(null);
  const guestSessionRef = useRef(null);
  const renderedIdsRef = useRef(new Set());
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);
  const bootstrappingRef = useRef(null);

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
      setRoomStatus('ACTIVE');
      setIsAgentTyping(false);
    });

    socket.on('agent_typing', () => setIsAgentTyping(true));
    socket.on('agent_stopped_typing', () => setIsAgentTyping(false));

    socket.on('chat_resolved', () => {
      setRoomStatus('RESOLVED');
      setIsAgentTyping(false);
      emitTypingStop();
    });

    socket.on('error', (payload) => {
      const code = payload?.message || '';
      if (code === 'TOO_MANY_MESSAGES') {
        setError('Too many messages — please wait a moment.');
      } else if (code === 'UNAUTHORIZED' || code === 'SESSION_REQUIRED') {
        setError('Session expired. Restarting chat…');
        persistRoomId(null);
        roomIdRef.current = null;
      }
    });
  }, [appendMessage, emitTypingStop, replaceHistory]);

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
      setRoomStatus('BOT');
      renderedIdsRef.current = new Set();
      setMessages([]);
      setUsedQuickReplyIds([]);

      const guestSessionId = await getOrCreateGuestSessionId();
      guestSessionRef.current = guestSessionId;

      const userId = user?.id ? String(user.id) : null;
      connectSocket(guestSessionId, userId);

      const persistedRoom = await readPersistedRoomId();
      if (persistedRoom) {
        roomIdRef.current = persistedRoom;
      }

      const startPayload = {
        type: 'GENERAL',
        order_id: null,
        guest_session_id: guestSessionId,
        guest_name: displayName,
        guest_email: user?.email || null,
        user_id: userId,
      };

      const data = await startChatSession(startPayload);
      const roomId = extractRoomId(data) || persistedRoom;
      if (!roomId) {
        throw new Error('No room returned from chat service');
      }

      roomIdRef.current = roomId;
      await persistRoomId(roomId);

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
  }, [appendMessage, connectSocket, displayName, user?.email, user?.id]);

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

    await persistRoomId(null);
    roomIdRef.current = null;
    renderedIdsRef.current = new Set();
    setMessages([]);
    setAgentName(null);
    setRoomStatus('RESOLVED');
    setUsedQuickReplyIds([]);
    setIsAgentTyping(false);
    setError(null);
  }, [emitTypingStop]);

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
    await bootstrap();
  }, [bootstrap, endChat]);

  return {
    messages,
    connectionState,
    roomStatus,
    agentName,
    personaName: agentName || ARIA_PERSONA,
    statusLabel,
    waitingForAgent,
    isAgentTyping,
    isSending,
    error,
    activeQuickReplies,
    canSend,
    sendMessage,
    sendQuickReply,
    onInputChange: emitTypingStart,
    retryBootstrap: bootstrap,
    endChat,
    resetChat,
  };
}
