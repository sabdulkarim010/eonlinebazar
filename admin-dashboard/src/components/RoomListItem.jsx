import toast from 'react-hot-toast';
import useChatStore from '../store/chatStore';
import { fetchRoomDetail } from '../services/api';
import { getSocket } from '../services/socket';
import {
  avatarColor,
  getInitials,
  relativeTimeShort,
  roomId,
  statusBorderClass,
  truncate,
  toBanglaDigits,
} from '../utils/helpers';

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

  const handleClick = async () => {
    // Pass full room object so ChatWindow never flashes blank
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
      toast.error(err.response?.data?.message || 'চ্যাট লোড ব্যর্থ');
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full text-left rounded-xl pl-0 pr-3 py-2.5 transition relative border-l-4 ${statusBorderClass(
        room.status
      )} ${
        isActive
          ? 'bg-slate-800/90'
          : 'bg-transparent hover:bg-slate-800/55'
      }`}
    >
      {unread > 0 && (
        <span className="absolute top-2 right-2 min-w-[20px] h-5 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center px-1.5 shadow-sm shadow-red-500/30">
          {toBanglaDigits(unread > 99 ? '99+' : unread)}
        </span>
      )}

      <div className="flex items-start gap-2.5 pl-3">
        <div className="relative shrink-0">
          <div
            className={`w-9 h-9 rounded-full ${avatarColor(
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
              {relativeTimeShort(room.last_message_at)}
            </span>
          </div>

          {isOrder && orderNumber ? (
            <p className="text-[11px] text-emerald-400/95 mt-0.5 truncate leading-bn">
              📦 #{orderNumber}
            </p>
          ) : null}

          <p className="text-xs text-slate-400 mt-1 truncate leading-bn">
            {truncate(room.last_message, 42) || 'কোনো মেসেজ নেই'}
          </p>
        </div>
      </div>
    </button>
  );
}
