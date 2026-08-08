import { useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import StatsBar from '../components/StatsBar';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import CustomerContext from '../components/CustomerContext';
import { fetchRooms, fetchRoomDetail, fetchStats } from '../services/api';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket';
import useChatStore from '../store/chatStore';

export default function DashboardPage() {
  const [searchParams] = useSearchParams();
  const setRooms = useChatStore((s) => s.setRooms);
  const setCounts = useChatStore((s) => s.setCounts);
  const setStats = useChatStore((s) => s.setStats);
  const setActiveRoom = useChatStore((s) => s.setActiveRoom);
  const setMessages = useChatStore((s) => s.setMessages);
  const addOrUpdateRoom = useChatStore((s) => s.addOrUpdateRoom);
  const clearUnread = useChatStore((s) => s.clearUnread);

  const loadRooms = useCallback(
    async (tabStatus) => {
      try {
        const data = await fetchRooms(tabStatus);
        setRooms(data.rooms || []);
        if (data.counts) setCounts(data.counts);
      } catch (err) {
        toast.error(err.response?.data?.message || 'রুম লোড করা যায়নি');
      }
    },
    [setRooms, setCounts]
  );

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchStats();
      if (data.stats) setStats(data.stats);
    } catch {
      // silent — stats refresh is best-effort
    }
  }, [setStats]);

  const openRoomFromUrl = useCallback(
    async (roomId) => {
      if (!roomId) return;
      const id = String(roomId);
      const cached = useChatStore
        .getState()
        .rooms.find((r) => String(r._id || r.id) === id);
      setActiveRoom(id, cached || null);
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
    },
    [setActiveRoom, clearUnread, addOrUpdateRoom, setMessages]
  );

  useEffect(() => {
    loadRooms('WAITING_FOR_AGENT');
    loadStats();
    connectSocket();

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const timer = setInterval(loadStats, 30000);
    return () => {
      clearInterval(timer);
      disconnectSocket();
    };
  }, [loadRooms, loadStats]);

  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam) {
      openRoomFromUrl(roomParam);
    }
  }, [searchParams, openRoomFromUrl]);

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-page">
      <StatsBar />
      <div className="flex-1 flex min-h-0">
        <div className="w-[280px] shrink-0 h-full">
          <Sidebar
            onRefresh={() => loadRooms()}
            onTabChange={(status) => loadRooms(status)}
          />
        </div>
        <div className="flex-1 min-w-0 h-full">
          <ChatWindow />
        </div>
        <div className="w-[300px] shrink-0 h-full hidden lg:block">
          <CustomerContext />
        </div>
      </div>
    </div>
  );
}
