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
import useAuthStore from '../store/authStore';
import useChatStore from '../store/chatStore';
import { getSocket } from '../services/socket';
import api, { sendAgentMessage } from '../services/api';
import {
  avatarColor,
  dateSeparatorLabel,
  getInitials,
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
          কোনো চ্যাট সিলেক্ট করা হয়নি
        </h3>
        <p className="text-sm text-text-secondary mt-2 leading-bn">
          বাম দিক থেকে একটি চ্যাট সিলেক্ট করুন
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
        {name ? `${name} টাইপ করছেন…` : 'টাইপ করছেন…'}
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
          রেটিং পেন্ডিং
        </p>
      </div>
    );
  }
  const stars = '⭐'.repeat(Math.min(5, Math.max(0, Number(rating) || 0)));
  return (
    <div className="mx-4 mb-3 rounded-card border border-primary/20 bg-primary/5 px-4 py-3 text-center animate-fadeIn">
      <p className="text-sm font-medium text-text-primary dark:text-white leading-bn">
        কাস্টমার রেটিং দিয়েছেন: {stars || '—'}
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
  const [showTransfer, setShowTransfer] = useState(false);
  const [showTag, setShowTag] = useState(false);
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
      toast.error('সকেট কানেক্টেড নয়');
      return;
    }
    socket.emit('take_chat', { room_id: activeRoomId });
    toast.success('চ্যাট নেওয়ার অনুরোধ পাঠানো হয়েছে');
  };

  const handleResolve = () => {
    if (!window.confirm('এই চ্যাটটি সমাধান করতে চান?')) return;
    const socket = getSocket();
    if (!socket?.connected) {
      toast.error('সকেট কানেক্টেড নয়');
      return;
    }
    socket.emit('resolve_chat', { room_id: activeRoomId });
    updateRoomStatus(activeRoomId, 'RESOLVED');
    addOrUpdateRoom({
      _id: activeRoomId,
      status: 'RESOLVED',
      resolved_at: new Date().toISOString(),
    });
    toast.success('চ্যাট সমাধান করা হয়েছে');
  };

  const sendInternalNote = () => {
    const body = noteText.trim();
    if (!body) return;
    const socket = getSocket();
    if (!socket?.connected) {
      toast.error('সকেট কানেক্টেড নয়');
      return;
    }
    socket.emit('internal_note', {
      room_id: activeRoomId,
      message: body,
    });
    toast.success('ইন্টারনাল নোট যোগ করা হয়েছে');
    setNoteText('');
    setShowNote(false);
  };

  const sendMessage = async (content, attachments = []) => {
    const body = (content || '').trim();
    if (!body && !attachments.length) return;
    if (!canReply) {
      toast.error('শুধুমাত্র অ্যাক্টিভ চ্যাটে রিপ্লাই করা যায়');
      return;
    }

    const socket = getSocket();
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
      });
      return;
    }

    try {
      const data = await sendAgentMessage(activeRoomId, body, attachments);
      if (data?.message) addMessage(activeRoomId, data.message);
    } catch (err) {
      toast.error(err.response?.data?.message || 'মেসেজ পাঠানো যায়নি');
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
      toast.error('শুধু ইমেজ আপলোড করা যাবে');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('ইমেজ ৫MB এর কম হতে হবে');
      return;
    }

    try {
      const form = new FormData();
      form.append('image', file);
      form.append('room_id', activeRoomId);
      const { data } = await api.post('/upload/image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
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
        err.response?.data?.message || err.message || 'ইমেজ আপলোড ব্যর্থ'
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

  return (
    <div
      className="h-full flex flex-col bg-page dark:bg-[#0b1220] border-x border-slate-200 dark:border-slate-800"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Header */}
      <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="lg:hidden p-1.5 rounded-btn hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"
                aria-label="Back"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
            )}
            <div
              className={`w-10 h-10 rounded-full ${avatarColor(
                room.guest_name
              )} flex items-center justify-center text-white text-sm font-semibold shrink-0`}
            >
              {getInitials(room.guest_name || 'G')}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-text-primary dark:text-white truncate text-sm">
                  {room.guest_name || 'Guest'}
                </h3>
                <span
                  className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${status.color}`}
                >
                  {status.label}
                </span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {room.type === 'ORDER_SUPPORT'
                    ? '📦 ORDER_SUPPORT'
                    : 'GENERAL'}
                </span>
              </div>
              {room.type === 'ORDER_SUPPORT' &&
              (room.order_metadata?.order_number || room.order_id) ? (
                <p className="text-xs text-text-secondary mt-0.5 leading-bn">
                  Order #{room.order_metadata?.order_number || room.order_id}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {room.status === 'WAITING_FOR_AGENT' && (
            <button
              type="button"
              onClick={handleTakeChat}
              className="inline-flex items-center gap-1.5 rounded-btn bg-success hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-2 transition duration-200 shadow-sm"
            >
              <CheckIcon className="w-4 h-4" />
              চ্যাট নিন
            </button>
          )}
          {room.status === 'ACTIVE' && (
            <>
              <button
                type="button"
                onClick={() => setShowTransfer(true)}
                className="inline-flex items-center gap-1.5 rounded-btn bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold px-3 py-2 transition duration-200"
              >
                <ArrowUpRightIcon className="w-4 h-4" />
                ট্রান্সফার করুন
              </button>
              <button
                type="button"
                onClick={handleResolve}
                className="inline-flex items-center gap-1.5 rounded-btn bg-primary hover:bg-primary-600 text-white text-xs font-semibold px-3 py-2 transition duration-200"
              >
                <CheckIcon className="w-4 h-4" />
                সমাধান করুন
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowNote((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-btn border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-2 transition duration-200"
          >
            <ClipboardDocumentListIcon className="w-4 h-4" />
            নোট যোগ করুন
          </button>
          <button
            type="button"
            onClick={() => setShowTag(true)}
            className="inline-flex items-center gap-1.5 rounded-btn border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-2 transition duration-200"
          >
            <TagIcon className="w-4 h-4" />
            ট্যাগ করুন
          </button>
        </div>
      </div>

      {room.status === 'BOT' && (
        <div className="shrink-0 bg-blue-50 dark:bg-blue-950/40 text-info text-sm px-4 py-2 border-b border-blue-100 dark:border-blue-900 leading-bn">
          AI পরিচালনা করছে
        </div>
      )}
      {room.status === 'WAITING_FOR_AGENT' && (
        <div className="shrink-0 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-200 text-sm px-4 py-2 border-b border-amber-100 dark:border-amber-900 leading-bn">
          কাস্টমার অপেক্ষায় আছেন — চ্যাট নিন
        </div>
      )}

      <CsatCard room={room} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scroll px-4 py-4">
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
            🔒 ইন্টারনাল নোট (কাস্টমার দেখবে না)
          </label>
          <textarea
            id="internal-note-input"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={2}
            className="mt-1.5 w-full rounded-btn border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300/50"
            placeholder="নোট লিখুন…"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNote(false)}
              className="rounded-btn px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300"
            >
              বাতিল
            </button>
            <button
              type="button"
              onClick={sendInternalNote}
              className="rounded-btn bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 transition"
            >
              সেভ নোট
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
                মেসেজ
              </label>
              <textarea
                id="agent-message-input"
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="মেসেজ লিখুন… (/ ক্যানড রেসপন্স)"
                className="w-full resize-none bg-transparent px-1 py-2 text-sm outline-none max-h-[96px] leading-bn dark:text-slate-100"
              />
            </div>

            <button
              type="button"
              onClick={() => sendMessage(text)}
              disabled={!text.trim()}
              className="p-2.5 rounded-btn btn-gradient text-white transition shadow-sm shadow-primary/20 disabled:opacity-40"
              title="পাঠান (Ctrl+Enter)"
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
    </div>
  );
}
