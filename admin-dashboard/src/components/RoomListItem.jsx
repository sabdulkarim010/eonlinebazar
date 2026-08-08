import toast from 'react-hot-toast';
import useChatStore from '../store/chatStore';
import { fetchRoomDetail } from '../services/api';
import { getSocket } from '../services/socket';
import {
  avatarColor,
  getInitials,
  relativeTimeBn,
  roomId,
  truncate,
} from '../utils/helpers';
import { toBanglaDigits } from '../utils/helpers';

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

  const handleClick = async () => {
    setActiveRoom(id);
    clearUnread(id);
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('join_room', { room_id: id });
    }
    try {
      const data = await fetchRoomDetail(id);
      if (data.room) addOrUpdateRoom(data.room);
      setMessages(id, data.messages || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'চ্যাট লোড ব্যর্থ');
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full text-left rounded-xl px-3 py-2.5 transition relative ${
        isActive
          ? 'bg-slate-800 border-l-4 border-primary'
          : 'hover:bg-slate-800/70 border-l-4 border-transparent'
      }`}
    >
      {unread > 0 && (
        <span className="absolute top-2 right-2 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
          {toBanglaDigits(unread > 99 ? '99+' : unread)}
        </span>
      )}

      <div className="flex items-start gap-2.5">
        <div className="relative shrink-0">
          <div
            className={`w-9 h-9 rounded-full ${avatarColor(
              room.guest_name || id
            )} flex items-center justify-center text-xs font-semibold text-white`}
          >
            {getInitials(room.guest_name || 'G')}
          </div>
          {isWaiting && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulseDot ring-2 ring-slate-900" />
          )}
        </div>

        <div className="min-w-0 flex-1 pr-4">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm text-white truncate">
              {room.guest_name || 'Guest'}
            </span>
            {isOrder && <span title="Order support">📦</span>}
          </div>
          {isOrder && (room.order_metadata?.order_number || room.order_id) && (
            <p className="text-[11px] text-emerald-400/90 mt-0.5 truncate">
              Order #{room.order_metadata?.order_number || room.order_id}
            </p>
          )}
          <p className="text-[11px] text-slate-400 mt-0.5">
            {relativeTimeBn(room.last_message_at)}
          </p>
          <p className="text-xs text-slate-400 mt-1 truncate">
            {truncate(room.last_message, 40)}
          </p>
        </div>
      </div>
    </button>
  );
}
