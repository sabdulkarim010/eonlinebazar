import toast from 'react-hot-toast';
import useChatStore from '../store/chatStore';
import { fetchRoomDetail } from '../services/api';
import { getSocket } from '../services/socket';
import { tagChipClass } from './TagModal';
import {
  avatarColor,
  getInitials,
  relativeTimeBnShort,
  roomId,
  truncate,
  toBanglaDigits,
} from '../utils/helpers';

function statusRing(status) {
  switch (status) {
    case 'WAITING_FOR_AGENT':
      return 'ring-warning';
    case 'ACTIVE':
      return 'ring-success';
    case 'BOT':
      return 'ring-info';
    case 'RESOLVED':
      return 'ring-slate-400';
    default:
      return 'ring-slate-500';
  }
}

export default function RoomListItem({ room }) {
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const unreadCounts = useChatStore((s) => s.unreadCounts);
  const setActiveRoom = useChatStore((s) => s.setActiveRoom);
  const setMessages = useChatStore((s) => s.setMessages);
  const addOrUpdateRoom = useChatStore((s) => s.addOrUpdateRoom);
  const clearUnread = useChatStore((s) => s.clearUnread);

  const id = roomId(room);
  const isActive = activeRoomId === id;
  const unread = unreadCounts[id] || room.unread_count || 0;
  const isWaiting = room.status === 'WAITING_FOR_AGENT';
  const isOrder = room.type === 'ORDER_SUPPORT';
  const orderNumber =
    room.order_metadata?.order_number || room.order_id || null;
  const tags = room.tags || [];

  const handleClick = async () => {
    setActiveRoom(id, room);
    clearUnread(id);
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('join_room', { room_id: id });
    }
    try {
      const data = await fetchRoomDetail(id);
      if (data.room) {
        setActiveRoom(id, data.room);
        addOrUpdateRoom(data.room);
      }
      setMessages(id, data.messages || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load chat');
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full text-left rounded-card px-3 py-2.5 transition duration-200 relative ${
        isWaiting
          ? 'border border-warning/70 animate-pulseGlow'
          : 'border border-transparent'
      } ${
        isActive
          ? 'bg-slate-700/90'
          : 'bg-transparent hover:bg-slate-700/55'
      }`}
    >
      {unread > 0 && (
        <span className="absolute top-2 right-2 min-w-[20px] h-5 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center px-1.5 shadow-sm shadow-red-500/30 animate-pulseBadge">
          {toBanglaDigits(unread > 99 ? '99+' : unread)}
        </span>
      )}

      <div className="flex items-start gap-2.5">
        <div className="relative shrink-0">
          <div
            className={`w-10 h-10 rounded-full ring-2 ${statusRing(
              room.status
            )} ${avatarColor(
              room.guest_name || id
            )} flex items-center justify-center text-xs font-semibold text-white`}
          >
            {getInitials(room.guest_name || 'G')}
          </div>
          {isWaiting && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-danger animate-pulseDot ring-2 ring-sidebar" />
          )}
        </div>

        <div className="min-w-0 flex-1 pr-5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm text-white truncate">
              {room.guest_name || 'Guest'}
            </span>
            <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">
              {relativeTimeBnShort(room.last_message_at)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {isOrder && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                📦 {orderNumber ? `#${orderNumber}` : 'ORDER'}
              </span>
            )}
            {tags.slice(0, 2).map((t) => (
              <span
                key={t}
                className={`text-[9px] px-1.5 py-0.5 rounded border ${tagChipClass(t)}`}
              >
                {t}
              </span>
            ))}
          </div>

          <p className="text-xs text-slate-400 mt-1 truncate leading-bn">
            {truncate(room.last_message, 42) || 'No messages'}
          </p>
        </div>
      </div>
    </button>
  );
}
