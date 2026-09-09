import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CheckIcon,
  FaceSmileIcon,
  PaperAirplaneIcon,
  PaperClipIcon,
  TagIcon,
  ClipboardDocumentListIcon,
  CommandLineIcon,
} from '@heroicons/react/24/solid';
import MessageBubble from './MessageBubble';
import CannedResponses from './CannedResponses';
import TransferModal from './TransferModal';
import TagModal from './TagModal';
import ResolveModal from './ResolveModal';
import useAuthStore from '../store/authStore';
import useChatStore from '../store/chatStore';
import { getSocket } from '../services/socket';
import api, { sendAgentMessage } from '../services/api';
import {
  dateSeparatorLabel,
  pickCustomerAvatar,
  resolveAssetUrl,
  roomId as getRoomId,
  statusMeta,
  toBanglaDigits,
} from '../utils/helpers';

const EMOJIS = ['😊', '👍', '🙏', '❤️', '😄', '🎉', '✅', '👋'];
const MAX_CHARS = 2000;

function EmptyChatState() {
  return (
    <div className="h-full flex items-center justify-center bg-page dark:bg-[#0b1220] px-6">
      <div className="text-center max-w-sm animate-fadeIn">
        <div className="mx-auto mb-5 w-24 h-24 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft flex items-center justify-center">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden>
            <rect x="6" y="10" width="36" height="28" rx="10" fill="#E0DEFF" />
            <rect x="14" y="18" width="44" height="28" rx="10" fill="#6C63FF" />
            <circle cx="26" cy="32" r="2.5" fill="white" />
            <circle cx="36" cy="32" r="2.5" fill="white" />
            <circle cx="46" cy="32" r="2.5" fill="white" />
            <path d="M22 46l-4 6 10-4" fill="#6C63FF" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-text-primary dark:text-white leading-bn">
          No chat selected
        </h3>
        <p className="text-sm text-text-secondary mt-2 leading-bn">
          Select a chat from the left panel
        </p>
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="h-full flex flex-col bg-page dark:bg-[#0b1220] p-4 gap-3 animate-fadeIn">
      <div className="skeleton h-14" />
      <div className="flex-1 space-y-3 pt-4">
        <div className="skeleton h-12 w-2/3 ml-auto" />
        <div className="skeleton h-16 w-1/2" />
        <div className="skeleton h-10 w-3/5 ml-auto" />
        <div className="skeleton h-14 w-2/5" />
      </div>
      <div className="skeleton h-20" />
    </div>
  );
}

function TypingIndicator({ name }) {
  return (
    <div className="flex items-center gap-2 mb-2 animate-fadeIn">
      <div className="flex items-center gap-1 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-bubble rounded-bl-md shadow-soft w-fit">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
      </div>
      <span className="text-xs text-slate-400">
        {name ? `${name} is typing…` : 'is typing…'}
      </span>
    </div>
  );
}

function CsatCard({ room }) {
  if (room.status !== 'RESOLVED') return null;
  const rating = room.rating;
  if (rating == null && !room.is_rated) {
    return (
      <div className="mx-4 mb-3 rounded-card border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-center animate-fadeIn">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200 leading-bn">
          Rating pending
        </p>
      </div>
    );
  }
  const stars = '⭐'.repeat(Math.min(5, Math.max(0, Number(rating) || 0)));
  return (
    <div className="mx-4 mb-3 rounded-card border border-primary/20 bg-primary/5 px-4 py-3 text-center animate-fadeIn">
      <p className="text-sm font-medium text-text-primary dark:text-white leading-bn">
        Customer rated: {stars || '—'}
      </p>
    </div>
  );
}

export default function ChatWindow({ onBack }) {
  const agent = useAuthStore((s) => s.agent);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const activeRoom = useChatStore((s) => s.activeRoom);
  const rooms = useChatStore((s) => s.rooms);
  const messagesMap = useChatStore((s) => s.messages);
  const typingRooms = useChatStore((s) => s.typingRooms);
  const addMessage = useChatStore((s) => s.addMessage);
  const addOrUpdateRoom = useChatStore((s) => s.addOrUpdateRoom);
  const updateRoomStatus = useChatStore((s) => s.updateRoomStatus);
  const setActiveRoom = useChatStore((s) => s.setActiveRoom);
  const setMobileView = useChatStore((s) => s.setMobileView);
  const setTyping = useChatStore((s) => s.setTyping);

  const room = useMemo(
    () =>
      activeRoom ||
      rooms.find((r) => getRoomId(r) === activeRoomId) ||
      null,
    [activeRoom, rooms, activeRoomId]
  );

  const messages = messagesMap[activeRoomId] || [];
  const typingInfo = typingRooms[activeRoomId];
  const isTyping = Boolean(typingInfo);

  const [text, setText] = useState('');
  const [showCanned, setShowCanned] = useState(false);
  const [cannedFilter, setCannedFilter] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showTag, setShowTag] = useState(false);
  const [showResolve, setShowResolve] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimer = useRef(null);
  const touchStartX = useRef(null);

  const grouped = useMemo(() => {
    const items = [];
    let lastLabel = null;
    messages.forEach((msg) => {
      const label = dateSeparatorLabel(msg.createdAt || msg.timestamp);
      if (label && label !== lastLabel) {
        items.push({ type: 'sep', label, key: `sep-${label}-${msg._id}` });
        lastLabel = label;
      }
      items.push({
        type: 'msg',
        message: msg,
        key: msg._id || msg.id || Math.random(),
      });
    });
    return items;
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, activeRoomId]);

  useEffect(() => {
    setText('');
    setShowCanned(false);
    setCannedFilter('');
    setShowNote(false);
    setNoteText('');
    setShowEmoji(false);
    setAvatarFailed(false);
  }, [activeRoomId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowCanned(false);
        setShowEmoji(false);
        setShowTransfer(false);
        setShowTag(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const status = room ? statusMeta(room.status) : null;
  const canReply = room?.status === 'ACTIVE';

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 20;
    const max = lineHeight * 4 + 16;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  };

  const emitTyping = (start) => {
    const socket = getSocket();
    if (!socket || !canReply) return;
    if (start) {
      socket.emit('agent_typing', {
        room_id: activeRoomId,
        agent_name: agent?.name,
      });
    } else {
      socket.emit('agent_stopped_typing', { room_id: activeRoomId });
    }
  };

  const handleTakeChat = () => {
    const socket = getSocket();
    if (!socket?.connected) {
      toast.error('Socket not connected');
      return;
    }
    socket.emit('take_chat', { room_id: activeRoomId });
    toast.success('Take chat request sent');
  };

  const handleResolve = async () => {
    const socket = getSocket();
    if (!socket?.connected) {
      toast.error('Socket not connected');
      return;
    }

    const roomId = activeRoomId;
    if (!roomId) return;

    try {
      const ack = await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          socket.off('resolve_chat_ok', onOk);
          socket.off('resolve_chat_failed', onFail);
          fn(value);
        };
        const onOk = (payload) => {
          if (
            payload?.room_id &&
            String(payload.room_id) !== String(roomId)
          ) {
            return;
          }
          finish(resolve, payload || { ok: true });
        };
        const onFail = (payload) => {
          finish(resolve, payload || { ok: false, message: 'Failed to resolve chat' });
        };
        const timer = setTimeout(() => {
          finish(reject, new Error('timeout'));
        }, 8000);
        socket.once('resolve_chat_ok', onOk);
        socket.once('resolve_chat_failed', onFail);
        socket.emit('resolve_chat', { room_id: roomId }, (res) => {
          finish(resolve, res || { ok: true });
        });
      });

      if (!ack || ack.ok === false) {
        toast.error(ack?.message || 'Failed to resolve chat');
        return;
      }

      socket.emit('leave_room', { room_id: roomId });
      updateRoomStatus(roomId, 'RESOLVED');
      addOrUpdateRoom({
        _id: roomId,
        status: 'RESOLVED',
        resolved_at: new Date().toISOString(),
      });
      setActiveRoom(null);
      setMobileView('list');
      toast.success('Chat resolved');
    } catch (err) {
      toast.error(
        err?.message === 'timeout'
          ? 'Resolve timed out. Please try again.'
          : 'Failed to resolve chat'
      );
    }
  };

  const sendInternalNote = () => {
    const body = noteText.trim();
    if (!body) return;
    const socket = getSocket();
    if (!socket?.connected) {
      toast.error('Socket not connected');
      return;
    }
    socket.emit('internal_note', {
      room_id: activeRoomId,
      message: body,
    });
    toast.success('Internal note added');
    setNoteText('');
    setShowNote(false);
  };

  const sendMessage = async (content, attachments = []) => {
    const body = (content || '').trim();
    if (!body && !attachments.length) return;
    if (!canReply) {
      toast.error('You can only reply in active chats');
      return;
    }

    const socket = getSocket();
    const tmpId = `tmp-${Date.now()}`;
    addMessage(activeRoomId, {
      _id: tmpId,
      sender_type: 'AGENT',
      sender_id: agent?._id || agent?.id,
      sender_name: agent?.name || 'Agent',
      sender_avatar: agent?.avatar || null,
      message: body,
      attachments,
      createdAt: new Date().toISOString(),
    });

    setText('');
    setShowCanned(false);
    setShowEmoji(false);
    emitTyping(false);
    requestAnimationFrame(resizeTextarea);

    if (socket?.connected) {
      socket.emit('agent_message', {
        room_id: activeRoomId,
        message: body,
        attachments,
        temp_id: tmpId,
      });
      return;
    }

    try {
      const data = await sendAgentMessage(activeRoomId, body, attachments);
      if (data?.message) addMessage(activeRoomId, data.message);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send message');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!showCanned) sendMessage(text);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showCanned) return;
      sendMessage(text);
    }
  };

  const handleChange = (e) => {
    const value = e.target.value.slice(0, MAX_CHARS);
    setText(value);
    resizeTextarea();

    const slashIdx = value.lastIndexOf('/');
    if (
      slashIdx >= 0 &&
      (slashIdx === 0 ||
        value[slashIdx - 1] === ' ' ||
        value[slashIdx - 1] === '\n')
    ) {
      setShowCanned(true);
      setCannedFilter(value.slice(slashIdx + 1));
    } else {
      setShowCanned(false);
      setCannedFilter('');
    }

    emitTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(false), 1200);
  };

  const insertCanned = (responseText) => {
    const slashIdx = text.lastIndexOf('/');
    const next =
      slashIdx >= 0 ? `${text.slice(0, slashIdx)}${responseText}` : responseText;
    setText(next.slice(0, MAX_CHARS));
    setShowCanned(false);
    setCannedFilter('');
    textareaRef.current?.focus();
    requestAnimationFrame(resizeTextarea);
  };

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Only images can be uploaded');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    try {
      const form = new FormData();
      form.append('image', file);
      form.append('room_id', activeRoomId);
      const { data } = await api.post('/upload/image', form);
      if (!data?.url || String(data.url).startsWith('data:')) {
        throw new Error('Invalid upload response');
      }
      await sendMessage('', [
        {
          type: 'IMAGE',
          url: data.url,
          thumbnail_url: data.thumbnail_url || data.url,
          filename: file.name,
        },
      ]);
    } catch (err) {
      toast.error(
        err.response?.data?.message || err.message || 'Image upload failed'
      );
    }
  };

  const onTouchStart = (e) => {
    touchStartX.current = e.touches?.[0]?.clientX ?? null;
  };
  const onTouchEnd = (e) => {
    const start = touchStartX.current;
    const end = e.changedTouches?.[0]?.clientX;
    if (start != null && end != null && end - start > 80) {
      onBack?.();
    }
    touchStartX.current = null;
  };

  if (!activeRoomId) return <EmptyChatState />;
  if (!room) return <ChatSkeleton />;

  const getCustomerAvatar = (r) =>
    r?.customer_profile?.avatar ||
    r?.customer_profile?.avatarUrl ||
    r?.customer_profile?.profileImage ||
    r?.customer_avatar_url ||
    r?.guest_avatar ||
    pickCustomerAvatar(r?.customer || {}, r) ||
    null;

  const getCustomerName = (r) =>
    r?.customer_profile?.name ||
    r?.customer_profile?.displayName ||
    r?.guest_name ||
    (typeof r?.user_id === 'object' ? r?.user_id?.name : null) ||
    'Customer';

  const headerAvatarRaw = getCustomerAvatar(room);
  const headerAvatar =
    !avatarFailed && headerAvatarRaw ? resolveAssetUrl(headerAvatarRaw) : null;
  const customerName = getCustomerName(room);
  const customerInitials = customerName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const channelLabel =
    room.type === 'ORDER_SUPPORT' ? 'Order Support' : room?.channel || 'General';
  const isLive = room.status === 'ACTIVE';

  return (
    <div
      className="h-full flex flex-col bg-page dark:bg-[#0b1220]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="lg:hidden p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              aria-label="Back"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
          )}

          <div className="relative w-9 h-9 flex-shrink-0">
            {headerAvatar && (
              <img
                src={headerAvatar}
                alt={customerName}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-green-400 absolute inset-0"
                onError={() => setAvatarFailed(true)}
              />
            )}
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold"
              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
            >
              {customerInitials}
            </div>
            {isLive && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full ring-2 ring-white dark:ring-slate-900" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-800 dark:text-white text-sm leading-tight truncate">
                {customerName}
              </h3>
              {isLive && (
                <span className="px-1.5 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  Live
                </span>
              )}
              {!isLive && status && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${status.color}`}>
                  {status.label}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {channelLabel}
              {room.type === 'ORDER_SUPPORT' &&
              (room.order_metadata?.order_number || room.order_id)
                ? ` · #${room.order_metadata?.order_number || room.order_id}`
                : ''}
              {isLive ? ' · Active now' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {room.status === 'WAITING_FOR_AGENT' && (
            <button
              type="button"
              onClick={handleTakeChat}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1.5 transition-colors"
            >
              <CheckIcon className="w-3.5 h-3.5" />
              Take
            </button>
          )}
          {room.status === 'ACTIVE' && (
            <>
              <button
                type="button"
                onClick={() => setShowTransfer(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1.5 transition-colors"
              >
                <ArrowUpRightIcon className="w-3.5 h-3.5" />
                Transfer
              </button>
              <button
                type="button"
                onClick={() => setShowResolve(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1.5 transition-colors"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                Resolve
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowNote((v) => !v)}
            className="hidden sm:inline-flex px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title="Add note"
          >
            <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowTag(true)}
            className="hidden sm:inline-flex px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title="Tag"
          >
            <TagIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {room.status === 'BOT' && (
        <div className="shrink-0 bg-blue-50 dark:bg-blue-950/40 text-info text-sm px-4 py-2 border-b border-blue-100 dark:border-blue-900 leading-bn">
          AI is handling this chat
        </div>
      )}
      {room.status === 'WAITING_FOR_AGENT' && (
        <div className="shrink-0 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-200 text-sm px-4 py-2 border-b border-amber-100 dark:border-amber-900 leading-bn">
          Customer is waiting — take chat
        </div>
      )}

      <CsatCard room={room} />

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto custom-scroll px-4 py-4 space-y-1 bg-slate-50/50 dark:bg-slate-950/50"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.08) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      >
        {grouped.map((item) =>
          item.type === 'sep' ? (
            <div key={item.key} className="flex justify-center my-4">
              <span className="text-[11px] px-3 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 shadow-sm">
                {item.label}
              </span>
            </div>
          ) : (
            <MessageBubble key={item.key} message={item.message} />
          )
        )}
        {isTyping && (
          <TypingIndicator name={typingInfo?.name || 'Customer'} />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Internal note composer */}
      {showNote && (
        <div className="shrink-0 mx-3 mb-2 rounded-card border border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3 animate-fadeIn">
          <label
            htmlFor="internal-note-input"
            className="text-xs font-semibold text-amber-800 dark:text-amber-200"
          >
            🔒 Internal note (not visible to customer)
          </label>
          <textarea
            id="internal-note-input"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={2}
            className="mt-1.5 w-full rounded-btn border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300/50"
            placeholder="Write a note…"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNote(false)}
              className="rounded-btn px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={sendInternalNote}
              className="rounded-btn bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 transition"
            >
              Save note
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      {canReply && (
        <div className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-3 relative">
          {showCanned && (
            <CannedResponses
              filter={cannedFilter}
              onSelect={insertCanned}
              onClose={() => setShowCanned(false)}
            />
          )}
          {showEmoji && (
            <div className="absolute left-3 right-3 bottom-full mb-2 bg-white dark:bg-slate-900 rounded-card shadow-layered border border-slate-200 dark:border-slate-700 p-2 flex flex-wrap gap-1 z-20">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    setText((t) => (t + em).slice(0, MAX_CHARS));
                    setShowEmoji(false);
                    textareaRef.current?.focus();
                  }}
                  className="w-9 h-9 rounded-btn hover:bg-slate-100 dark:hover:bg-slate-800 text-lg transition"
                >
                  {em}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 rounded-card border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 px-2 py-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 transition duration-200">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="p-2 rounded-btn text-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:text-primary transition"
              title="Attach"
            >
              <PaperClipIcon className="w-5 h-5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImage}
            />

            <button
              type="button"
              onClick={() => {
                setShowEmoji((v) => !v);
                setShowCanned(false);
              }}
              className="p-2 rounded-btn text-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:text-primary transition"
              title="Emoji"
            >
              <FaceSmileIcon className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowCanned((v) => !v);
                setCannedFilter('');
                setShowEmoji(false);
              }}
              className="p-2 rounded-btn text-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:text-primary transition"
              title="Canned responses (/)"
            >
              <CommandLineIcon className="w-5 h-5" />
            </button>

            <div className="flex-1 relative">
              <label htmlFor="agent-message-input" className="sr-only">
                Message
              </label>
              <textarea
                id="agent-message-input"
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Write a message… (/ for canned responses)"
                className="w-full resize-none bg-transparent px-1 py-2 text-sm outline-none max-h-[96px] leading-bn dark:text-slate-100"
              />
            </div>

            <button
              type="button"
              onClick={() => sendMessage(text)}
              disabled={!text.trim()}
              className="p-2.5 rounded-btn btn-gradient text-white transition shadow-sm shadow-primary/20 disabled:opacity-40"
              title="Send (Ctrl+Enter)"
            >
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 px-1">
            <span>Shift+Enter for new line · Ctrl+Enter send</span>
            <span>
              {toBanglaDigits(text.length)}/{toBanglaDigits(MAX_CHARS)}
            </span>
          </div>
        </div>
      )}

      <TransferModal
        roomId={activeRoomId}
        open={showTransfer}
        onClose={() => setShowTransfer(false)}
      />
      <TagModal
        roomId={activeRoomId}
        open={showTag}
        onClose={() => setShowTag(false)}
        existing={room.tags || []}
      />
      <ResolveModal
        isOpen={showResolve}
        onClose={() => setShowResolve(false)}
        onConfirm={() => {
          setShowResolve(false);
          handleResolve();
        }}
      />
    </div>
  );
}
