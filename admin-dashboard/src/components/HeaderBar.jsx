import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  BellIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  SunIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import useAuthStore from '../store/authStore';
import useChatStore from '../store/chatStore';
import useThemeStore from '../store/themeStore';
import { disconnectSocket, emitPresence, getSocket } from '../services/socket';
import { avatarColor, getInitials, relativeTimeBnShort } from '../utils/helpers';

function roleBadge(role) {
  if (role === 'SUPER_ADMIN') return '👑 SUPER';
  if (role === 'ADMIN') return '🛡️ ADMIN';
  return '💬 AGENT';
}

export default function HeaderBar() {
  const navigate = useNavigate();
  const agent = useAuthStore((s) => s.agent);
  const logout = useAuthStore((s) => s.logout);
  const darkMode = useThemeStore((s) => s.darkMode);
  const toggleDarkMode = useThemeStore((s) => s.toggleDarkMode);
  const globalSearch = useChatStore((s) => s.globalSearch);
  const setGlobalSearch = useChatStore((s) => s.setGlobalSearch);
  const notifications = useChatStore((s) => s.notifications);
  const unreadNotifications = useChatStore((s) => s.unreadNotifications);
  const markNotificationsRead = useChatStore((s) => s.markNotificationsRead);
  const clearNotifications = useChatStore((s) => s.clearNotifications);

  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const menuRef = useRef(null);
  const bellRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setBellOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setBellOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleLogout = () => {
    if (!window.confirm('লগআউট করতে চান?')) return;
    try {
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('agent_offline');
      }
      emitPresence('offline');
    } catch {
      // ignore
    }
    disconnectSocket();
    logout();
    toast.success('লগআউট সম্পন্ন');
    navigate('/login', { replace: true });
  };

  const agentId = agent?.id || agent?._id || 'A';

  return (
    <header className="shrink-0 h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-4 flex items-center gap-3 z-30">
      <div className="flex items-center gap-2.5 shrink-0 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center shadow-sm shadow-primary/30">
          <ChatBubbleLeftRightIcon className="w-5 h-5 text-white" />
        </div>
        <div className="hidden sm:block min-w-0">
          <p className="text-sm font-bold text-text-primary dark:text-white truncate">
            EonlineBazar Chat
          </p>
          <p className="text-[10px] text-text-secondary">Admin Inbox</p>
        </div>
      </div>

      <div className="flex-1 max-w-xl mx-auto hidden md:block">
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="global-chat-search"
            type="search"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="সব চ্যাটে খুঁজুন…"
            className="w-full rounded-btn border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition duration-200 dark:text-slate-100"
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
        <div className="relative" ref={bellRef}>
          <button
            type="button"
            onClick={() => {
              setBellOpen((v) => !v);
              if (!bellOpen) markNotificationsRead();
            }}
            className="relative p-2 rounded-btn text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition duration-200"
            aria-label="Notifications"
          >
            <BellIcon className="w-5 h-5" />
            {unreadNotifications > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center animate-pulseBadge">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-layered z-50 animate-fadeIn">
              <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary dark:text-white">
                  নোটিফিকেশন
                </span>
                <button
                  type="button"
                  onClick={clearNotifications}
                  className="text-xs text-primary hover:underline"
                >
                  সব পড়া হয়েছে
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto custom-scroll">
                {notifications.length === 0 ? (
                  <p className="text-xs text-text-secondary px-3 py-6 text-center">
                    কোনো নোটিফিকেশন নেই
                  </p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`px-3 py-2.5 border-b border-slate-50 dark:border-slate-800 last:border-0 ${
                        n.read ? '' : 'bg-primary/5'
                      }`}
                    >
                      <p className="text-sm font-medium text-text-primary dark:text-slate-100">
                        {n.title}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5 leading-bn">
                        {n.body}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {relativeTimeBnShort(n.at)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleDarkMode}
          className="p-2 rounded-btn text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition duration-200"
          aria-label="Toggle dark mode"
          title="Dark mode"
        >
          {darkMode ? (
            <SunIcon className="w-5 h-5" />
          ) : (
            <MoonIcon className="w-5 h-5" />
          )}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-btn pl-1 pr-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 transition duration-200"
          >
            <div
              className={`w-8 h-8 rounded-full ${avatarColor(
                agent?.name || agentId
              )} flex items-center justify-center text-white text-xs font-semibold overflow-hidden`}
            >
              {agent?.avatar ? (
                <img
                  src={agent.avatar}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                getInitials(agent?.name || 'A')
              )}
            </div>
            <div className="hidden sm:block text-left min-w-0">
              <p className="text-xs font-semibold text-text-primary dark:text-white truncate max-w-[120px]">
                {agent?.name || 'Agent'}
              </p>
              <p className="text-[10px] text-text-secondary truncate">
                {roleBadge(agent?.role)}
              </p>
            </div>
            <ChevronDownIcon className="w-4 h-4 text-slate-400 hidden sm:block" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-card border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-layered z-50 py-1 animate-fadeIn">
              <Link
                to="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                <UserCircleIcon className="w-4 h-4" />
                Profile
              </Link>
              <Link
                to="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                <Cog6ToothIcon className="w-4 h-4" />
                Settings
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-danger hover:bg-red-50 dark:hover:bg-red-950/30 transition"
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
                লগআউট
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
