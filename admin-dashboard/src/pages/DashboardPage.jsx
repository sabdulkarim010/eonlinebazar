import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import HeaderBar from '../components/HeaderBar';
import StatsBar from '../components/StatsBar';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import CustomerContext from '../components/CustomerContext';
import { fetchRooms, fetchRoomDetail, fetchStats } from '../services/api';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket';
import useChatStore from '../store/chatStore';
import useThemeStore from '../store/themeStore';

export default function DashboardPage() {
  const [searchParams] = useSearchParams();
  const setRooms = useChatStore((s) => s.setRooms);
  const setCounts = useChatStore((s) => s.setCounts);
  const setStats = useChatStore((s) => s.setStats);
  const setActiveRoom = useChatStore((s) => s.setActiveRoom);
  const setMessages = useChatStore((s) => s.setMessages);
  const addOrUpdateRoom = useChatStore((s) => s.addOrUpdateRoom);
  const clearUnread = useChatStore((s) => s.clearUnread);
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  const mobileView = useChatStore((s) => s.mobileView);
  const setMobileView = useChatStore((s) => s.setMobileView);
  const hydrateTheme = useThemeStore((s) => s.hydrateTheme);

  const [roomsLoading, setRoomsLoading] = useState(true);

  const loadRooms = useCallback(
    async (tabStatus) => {
      try {
        setRoomsLoading(true);
        const data = await fetchRooms(tabStatus);
        setRooms(data.rooms || []);
        if (data.counts) setCounts(data.counts);
      } catch (err) {
        toast.error(err.response?.data?.message || 'রুম লোড করা যায়নি');
      } finally {
        setRoomsLoading(false);
      }
    },
    [setRooms, setCounts]
  );

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchStats();
      if (data.stats) setStats(data.stats);
    } catch {
      // silent
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
    hydrateTheme();
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
  }, [loadRooms, loadStats, hydrateTheme]);

  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam) {
      openRoomFromUrl(roomParam);
    }
  }, [searchParams, openRoomFromUrl]);

  const showList = mobileView === 'list' || !activeRoomId;
  const showChat = Boolean(activeRoomId) && mobileView !== 'list';

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-page dark:bg-[#0b1220]">
      <HeaderBar />
      <StatsBar />

      <div className="flex-1 flex min-h-0">
        {/* Desktop sidebar */}
        <div className="hidden md:block w-[280px] shrink-0 h-full">
          {roomsLoading ? (
            <div className="h-full bg-sidebar p-3 space-y-2">
              <div className="skeleton h-10 bg-slate-700" />
              <div className="skeleton h-16 bg-slate-700" />
              <div className="skeleton h-14 bg-slate-700" />
              <div className="skeleton h-14 bg-slate-700" />
              <div className="skeleton h-14 bg-slate-700" />
            </div>
          ) : (
            <Sidebar
              onRefresh={() => loadRooms()}
              onTabChange={(status) => loadRooms(status)}
            />
          )}
        </div>

        {/* Mobile: room list */}
        <div
          className={`md:hidden w-full h-full ${
            showList && !showChat ? 'block' : 'hidden'
          }`}
        >
          <Sidebar
            onRefresh={() => loadRooms()}
            onTabChange={(status) => loadRooms(status)}
          />
        </div>

        {/* Chat window */}
        <div
          className={`flex-1 min-w-0 h-full ${
            showChat || (!showList && activeRoomId)
              ? 'block'
              : 'hidden md:block'
          } ${!activeRoomId ? 'hidden md:block' : ''}`}
        >
          <ChatWindow onBack={() => setMobileView('list')} />
        </div>

        {/* Customer context — desktop */}
        <div className="w-[280px] shrink-0 h-full hidden xl:block">
          <CustomerContext />
        </div>
      </div>
    </div>
  );
}
