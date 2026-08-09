import { useEffect, useMemo, useState } from 'react';
import {
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import RoomListItem from './RoomListItem';
import useAuthStore from '../store/authStore';
import useChatStore from '../store/chatStore';
import { emitPresence } from '../services/socket';
import { fetchRooms } from '../services/api';
import { toBanglaDigits } from '../utils/helpers';

const TABS = [
  { id: 'WAITING_FOR_AGENT', label: 'Waiting', icon: '⏳', empty: 'No chats in this tab' },
  { id: 'ACTIVE', label: 'Live', icon: '🟢', empty: 'No chats in this tab' },
  { id: 'BOT', label: 'AI chats', icon: '🤖', empty: 'No chats in this tab' },
  { id: 'RESOLVED', label: 'Resolved', icon: '✅', empty: 'No chats in this tab' },
];

const STATUS_OPTS = [
  { id: 'online', label: 'Online', dot: 'bg-success' },
  { id: 'away', label: 'Away', dot: 'bg-warning' },
  { id: 'offline', label: 'Offline', dot: 'bg-slate-400' },
];

export default function Sidebar({
  onRefresh,
  onTabChange,
  compact = false,
  activeTab: controlledTab,
  loadingRooms: controlledLoading,
}) {
  const presence = useAuthStore((s) => s.presence);
  const rooms = useChatStore((s) => s.rooms);
  const counts = useChatStore((s) => s.counts);
  const setRooms = useChatStore((s) => s.setRooms);
  const setCounts = useChatStore((s) => s.setCounts);
  const globalSearch = useChatStore((s) => s.globalSearch);
  const [internalTab, setInternalTab] = useState('WAITING_FOR_AGENT');
  const [internalLoading, setInternalLoading] = useState(false);
  const [query, setQuery] = useState('');

  const activeTab = controlledTab ?? internalTab;
  const loadingRooms = controlledLoading ?? internalLoading;

  const badgeCounts = {
    WAITING_FOR_AGENT: counts?.WAITING_FOR_AGENT || 0,
    ACTIVE: counts?.ACTIVE || 0,
    BOT: counts?.BOT || 0,
    RESOLVED: counts?.RESOLVED || 0,
  };

  const roomList = Array.isArray(rooms) ? rooms : [];

  const filtered = useMemo(() => {
    const q = (query || globalSearch || '').trim().toLowerCase();
    // Trust API status filter — show every room returned for this tab
    return roomList.filter((r) => {
      if (!r) return false;
      if (!q) return true;
      return (
        String(r?.guest_name || '')
          .toLowerCase()
          .includes(q) ||
        String(r?.last_message || '')
          .toLowerCase()
          .includes(q) ||
        String(r?.order_id || '')
          .toLowerCase()
          .includes(q) ||
        String(r?.order_metadata?.order_number || '')
          .toLowerCase()
          .includes(q) ||
        (r?.tags || []).some((t) => String(t).toLowerCase().includes(q))
      );
    });
  }, [roomList, query, globalSearch]);

  const activeTabMeta = TABS.find((t) => t.id === activeTab);
  const currentStatus =
    STATUS_OPTS.find((s) => s.id === presence) || STATUS_OPTS[0];

  const handleTabClick = async (tabId) => {
    setInternalTab(tabId);
    if (onTabChange) {
      onTabChange(tabId);
      return;
    }

    setInternalLoading(true);
    try {
      const data = await fetchRooms(tabId);
      setRooms(Array.isArray(data?.rooms) ? data.rooms : []);
      if (data?.counts) setCounts(data.counts);
    } catch (err) {
      console.error('Failed to load rooms:', err);
      setRooms([]);
    } finally {
      setInternalLoading(false);
    }
  };

  useEffect(() => {
    if (controlledTab != null) setInternalTab(controlledTab);
  }, [controlledTab]);

  if (compact) {
    return (
      <div className="flex items-stretch gap-1 px-2 py-2 bg-sidebar border-t border-slate-700">
        {TABS.map((t) => {
          const count = badgeCounts[t.id] || 0;
          const active = activeTab === t.id;
          const waitingPulse = t.id === 'WAITING_FOR_AGENT' && count > 0;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabClick(t.id)}
              className={`flex-1 rounded-btn px-1 py-2 text-[10px] font-medium transition duration-200 ${
                active
                  ? 'bg-primary text-white'
                  : 'bg-slate-800 text-slate-300'
              } ${waitingPulse ? 'animate-pulseGlow' : ''}`}
            >
              <div>{t.icon}</div>
              <div className="mt-0.5">{toBanglaDigits(count)}</div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <aside className="h-full w-full bg-sidebar text-slate-100 flex flex-col border-r border-slate-700/80">
      <div className="px-4 py-4 border-b border-slate-700/80 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-base tracking-tight">Inbox</h2>
          <button
            type="button"
            onClick={onRefresh}
            className="text-[10px] uppercase tracking-wide text-slate-400 hover:text-white transition duration-200"
            title="Refresh"
          >
            Refresh
          </button>
        </div>

        <div className="flex rounded-btn bg-slate-800/80 p-1 gap-0.5">
          {STATUS_OPTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => emitPresence(s.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition duration-200 ${
                presence === s.id
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${s.dot} ${
                  presence === s.id && s.id === 'online' ? 'animate-pulseDot' : ''
                }`}
              />
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-slate-800 text-slate-300"
            >
              {t.icon} {toBanglaDigits(badgeCounts[t.id] || 0)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-slate-800 text-slate-300">
            <span className={`w-1.5 h-1.5 rounded-full ${currentStatus.dot}`} />
            {currentStatus.label}
          </span>
        </div>
      </div>

      <div className="px-2 pt-3 flex gap-1">
        {TABS.map((t) => {
          const count = badgeCounts[t.id] || 0;
          const active = activeTab === t.id;
          const waitingPulse = t.id === 'WAITING_FOR_AGENT' && count > 0;

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabClick(t.id)}
              className={`flex-1 rounded-btn px-1 py-2 text-[10px] sm:text-[11px] font-medium transition duration-200 ${
                active
                  ? 'bg-primary text-white shadow-lg shadow-primary/25'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              } ${
                waitingPulse ? 'ring-1 ring-danger/70 animate-pulseGlow' : ''
              }`}
            >
              <div className="leading-tight">
                {t.icon} {t.label}
              </div>
              <div
                className={`mt-1 inline-flex min-w-[18px] justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                  waitingPulse
                    ? 'bg-danger text-white animate-pulseBadge'
                    : active
                      ? 'bg-white/20'
                      : 'bg-slate-700'
                }`}
              >
                {toBanglaDigits(count)}
              </div>
            </button>
          );
        })}
      </div>

      <div className="px-3 py-3">
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            id="sidebar-room-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or message..."
            className="w-full rounded-btn bg-slate-800/80 border border-slate-700 pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-primary transition duration-200"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll-dark px-2 pb-3 space-y-1">
        {loadingRooms ? (
          <div className="space-y-2 pt-1">
            <div className="skeleton h-14 bg-slate-700 rounded-card" />
            <div className="skeleton h-14 bg-slate-700 rounded-card" />
            <div className="skeleton h-14 bg-slate-700 rounded-card" />
            <div className="skeleton h-14 bg-slate-700 rounded-card" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-fadeIn">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-3">
              <ChatBubbleLeftRightIcon className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-xs font-medium text-slate-400 leading-bn">
              {query.trim() || globalSearch.trim()
                ? 'No matches found'
                : activeTabMeta?.empty || 'No chats in this tab'}
            </p>
          </div>
        ) : (
          filtered.map((room) => (
            <RoomListItem key={room?._id || room?.id} room={room} />
          ))
        )}
      </div>
    </aside>
  );
}
