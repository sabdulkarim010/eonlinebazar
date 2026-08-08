import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  PaperAirplaneIcon,
  PhotoIcon,
  CommandLineIcon,
} from '@heroicons/react/24/solid';
import MessageBubble from './MessageBubble';
import CannedResponses from './CannedResponses';
import useAuthStore from '../store/authStore';
import useChatStore from '../store/chatStore';
import { getSocket } from '../services/socket';
import api, { sendAgentMessage } from '../services/api';
import {
  dateSeparatorLabel,
  roomId as getRoomId,
  statusMeta,
} from '../utils/helpers';

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-slate-200 rounded-2xl w-fit mb-2">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" />
    </div>
  );
}

export default function ChatWindow() {
  const agent = useAuthStore((s) => s.agent);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const rooms = useChatStore((s) => s.rooms);
  const messagesMap = useChatStore((s) => s.messages);
  const typingRooms = useChatStore((s) => s.typingRooms);
  const addMessage = useChatStore((s) => s.addMessage);
  const addOrUpdateRoom = useChatStore((s) => s.addOrUpdateRoom);
  const updateRoomStatus = useChatStore((s) => s.updateRoomStatus);

  const room = useMemo(
    () => rooms.find((r) => getRoomId(r) === activeRoomId) || null,
    [rooms, activeRoomId]
  );

  const messages = messagesMap[activeRoomId] || [];
  const isTyping = Boolean(typingRooms[activeRoomId]);

  const [text, setText] = useState('');
  const [showCanned, setShowCanned] = useState(false);
  const [cannedFilter, setCannedFilter] = useState('');
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimer = useRef(null);
  const typingTimers = useRef({});
  const setTyping = useChatStore((s) => s.setTyping);

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
  }, [activeRoomId]);

  // Typing indicator cleanup — clear stale indicators after 4s / on room change
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const onUserTyping = ({ room_id, name }) => {
      if (!room_id) return;
      const id = String(room_id);
      setTyping(id, true, name || 'Guest');
      clearTimeout(typingTimers.current[id]);
      typingTimers.current[id] = setTimeout(() => {
        setTyping(id, false);
        delete typingTimers.current[id];
      }, 4000);
    };

    const onUserStoppedTyping = ({ room_id }) => {
      if (!room_id) return;
      const id = String(room_id);
      clearTimeout(typingTimers.current[id]);
      delete typingTimers.current[id];
      setTyping(id, false);
    };

    socket.on('user_typing', onUserTyping);
    socket.on('customer_typing', onUserTyping);
    socket.on('user_stopped_typing', onUserStoppedTyping);
    socket.on('customer_stopped_typing', onUserStoppedTyping);

    return () => {
      socket.off('user_typing', onUserTyping);
      socket.off('customer_typing', onUserTyping);
      socket.off('user_stopped_typing', onUserStoppedTyping);
      socket.off('customer_stopped_typing', onUserStoppedTyping);
    };
  }, [setTyping]);

  useEffect(() => {
    Object.values(typingTimers.current).forEach((t) => clearTimeout(t));
    typingTimers.current = {};
  }, [activeRoomId]);

  const status = room ? statusMeta(room.status) : null;
  const agentId = agent?.id || agent?._id;
  const canReply = room?.status === 'ACTIVE';

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
    // agent_id comes from JWT on the server — never trust client-supplied id
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
    emitTyping(false);

    // Do not optimistically append — socket `new_message` is the single source of truth
    if (socket?.connected) {
      // agent identity bound from JWT on server
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showCanned) return;
      sendMessage(text);
    }
  };

  const handleChange = (e) => {
    const value = e.target.value;
    setText(value);

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
    setText(next);
    setShowCanned(false);
    setCannedFilter('');
    textareaRef.current?.focus();
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
      const { data } = await api.post('/api/upload/image', form, {
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

  return (
    !room ? (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <p className="text-slate-400 text-sm">
          বাম দিক থেকে একটি চ্যাট সিলেক্ট করুন
        </p>
      </div>
    ) : (
    <div className="h-full flex flex-col bg-slate-50 border-x border-slate-200">
      <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-900 truncate">
              {room.guest_name || 'Guest'}
            </h3>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {room.type === 'ORDER_SUPPORT' ? '📦 অর্ডার সাপোর্ট' : 'সাধারণ'}
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${status.color}`}
            >
              {status.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {room.status === 'WAITING_FOR_AGENT' && (
            <button
              type="button"
              onClick={handleTakeChat}
              className="rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-semibold px-3 py-2 transition shadow-sm"
            >
              চ্যাট নিন 🙋
            </button>
          )}
          {room.status === 'ACTIVE' && (
            <button
              type="button"
              onClick={handleResolve}
              className="rounded-xl bg-primary hover:bg-primary-600 text-white text-sm font-semibold px-3 py-2 transition shadow-sm"
            >
              সমাধান করুন ✓
            </button>
          )}
        </div>
      </div>

      {room.status === 'BOT' && (
        <div className="shrink-0 bg-blue-50 text-blue-700 text-sm px-4 py-2 border-b border-blue-100">
          AI পরিচালনা করছে
        </div>
      )}
      {room.status === 'WAITING_FOR_AGENT' && (
        <div className="shrink-0 bg-orange-50 text-orange-700 text-sm px-4 py-2 border-b border-orange-100">
          কাস্টমার অপেক্ষায় আছেন — চ্যাট নিন
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scroll px-4 py-4">
        {grouped.map((item) =>
          item.type === 'sep' ? (
            <div key={item.key} className="flex justify-center my-4">
              <span className="text-[11px] px-3 py-1 rounded-full bg-slate-200 text-slate-500">
                {item.label}
              </span>
            </div>
          ) : (
            <MessageBubble
              key={item.key}
              message={item.message}
              currentAgentId={agentId}
            />
          )
        )}
        {isTyping && <TypingDots />}
        <div ref={bottomRef} />
      </div>

      {canReply && (
        <div className="shrink-0 bg-white border-t border-slate-200 p-3 relative">
          {showCanned && (
            <CannedResponses
              filter={cannedFilter}
              onSelect={insertCanned}
              onClose={() => setShowCanned(false)}
            />
          )}

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition"
              title="ইমেজ অ্যাটাচ"
            >
              <PhotoIcon className="w-5 h-5" />
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
                setShowCanned((v) => !v);
                setCannedFilter('');
              }}
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition"
              title="ক্যানড রেসপন্স (/)"
            >
              <CommandLineIcon className="w-5 h-5" />
            </button>

            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="মেসেজ লিখুন… (/ ক্যানড রেসপন্স)"
                className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition max-h-32"
              />
              <span className="absolute bottom-1.5 right-2 text-[10px] text-slate-400">
                {text.length}
              </span>
            </div>

            <button
              type="button"
              onClick={() => sendMessage(text)}
              disabled={!text.trim()}
              className="p-2.5 rounded-xl bg-primary hover:bg-primary-600 disabled:opacity-40 text-white transition shadow-sm"
              title="পাঠান"
            >
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
    )
  );
}