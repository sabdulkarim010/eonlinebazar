import { useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import StatsBar from '../components/StatsBar';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import CustomerContext from '../components/CustomerContext';
import { fetchRooms, fetchStats } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import useChatStore from '../store/chatStore';

export default function DashboardPage() {
  const setRooms = useChatStore((s) => s.setRooms);
  const setCounts = useChatStore((s) => s.setCounts);
  const setStats = useChatStore((s) => s.setStats);

  const loadRooms = useCallback(async () => {
    try {
      const data = await fetchRooms();
      setRooms(data.rooms || []);
      if (data.counts) setCounts(data.counts);
    } catch (err) {
      toast.error(err.response?.data?.message || 'রুম লোড করা যায়নি');
    }
  }, [setRooms, setCounts]);

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchStats();
      if (data.stats) setStats(data.stats);
    } catch {
      // silent — stats refresh is best-effort
    }
  }, [setStats]);

  useEffect(() => {
    loadRooms();
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

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-slate-100">
      <StatsBar />
      <div className="flex-1 flex min-h-0">
        <div className="w-[280px] shrink-0 h-full">
          <Sidebar onRefresh={loadRooms} />
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
