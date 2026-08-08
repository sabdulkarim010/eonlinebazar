import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import RoomListItem from './RoomListItem';
import useChatStore from '../store/chatStore';
import { toBanglaDigits } from '../utils/helpers';

const TABS = [
  { id: 'BOT', label: 'AI', emoji: '🤖', empty: 'কোনো AI চ্যাট নেই' },
  {
    id: 'WAITING_FOR_AGENT',
    label: 'অপেক্ষায়',
    emoji: '🔴',
    empty: 'কোনো অপেক্ষমাণ চ্যাট নেই',
  },
  { id: 'ACTIVE', label: 'লাইভ', emoji: '🟢', empty: 'কোনো লাইভ চ্যাট নেই' },
  {
    id: 'RESOLVED',
    label: 'সমাপ্ত',
    emoji: '⚫',
    empty: 'কোনো সমাপ্ত চ্যাট নেই',
  },
];

export default function Sidebar({ onRefresh, onTabChange }) {
  const rooms = useChatStore((s) => s.rooms);
  const counts = useChatStore((s) => s.counts);
  const onlineAgents = useChatStore((s) => s.onlineAgents);
  const [tab, setTab] = useState('WAITING_FOR_AGENT');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms
      .filter((r) => r.status === tab)
      .filter((r) => {
        if (!q) return true;
        return (
          String(r.guest_name || '')
            .toLowerCase()
            .includes(q) ||
          String(r.last_message || '')
            .toLowerCase()
            .includes(q) ||
          String(r.order_id || '')
            .toLowerCase()
            .includes(q) ||
          String(r.order_metadata?.order_number || '')
            .toLowerCase()
            .includes(q)
        );
      });
  }, [rooms, tab, query]);

  const isOnline = onlineAgents.length > 0;
  const activeTabMeta = TABS.find((t) => t.id === tab);

  const handleTabClick = (status) => {
    setTab(status);
    if (onTabChange) onTabChange(status);
  };

  return (
    <aside className="h-full bg-sidebar text-slate-100 flex flex-col border-r border-slate-800">
      <div className="px-4 py-4 border-b border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-base tracking-tight">
            চ্যাট ড্যাশবোর্ড
          </h2>
          <button
            type="button"
            onClick={onRefresh}
            className="text-[10px] uppercase tracking-wide text-slate-400 hover:text-white transition"
            title="রিফ্রেশ"
          >
            Refresh
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isOnline ? 'bg-success animate-pulseDot' : 'bg-slate-500'
            }`}
          />
          {isOnline
            ? `${toBanglaDigits(onlineAgents.length)} এজেন্ট অনলাইন`
            : 'অনলাইন ইনডিকেটর'}
        </div>
      </div>

      <div className="px-2 pt-3 flex gap-1">
        {TABS.map((t) => {
          const count = counts?.[t.id] || 0;
          const active = tab === t.id;
          const waitingPulse = t.id === 'WAITING_FOR_AGENT' && count > 0;

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabClick(t.id)}
              className={`flex-1 rounded-lg px-1.5 py-2 text-[11px] font-medium transition ${
                active
                  ? 'bg-primary text-white shadow-lg shadow-primary/25'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              } ${
                waitingPulse
                  ? 'ring-1 ring-warning/70 animate-pulseGlow'
                  : ''
              }`}
            >
              <div className="leading-tight">
                {t.label} {t.emoji}
              </div>
              <div
                className={`mt-1 inline-flex min-w-[18px] justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                  waitingPulse
                    ? 'bg-warning text-white animate-pulseBadge'
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
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="নাম বা মেসেজ খুঁজুন…"
            className="w-full rounded-xl bg-slate-800/80 border border-slate-700 pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-primary transition"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll-dark px-2 pb-3 space-y-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-fadeIn">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mb-3">
              <ChatBubbleLeftRightIcon className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-xs font-medium text-slate-400 leading-bn">
              {query.trim()
                ? 'কোনো মিল পাওয়া যায়নি'
                : activeTabMeta?.empty || 'কোনো চ্যাট নেই'}
            </p>
            {query.trim() ? (
              <p className="text-[11px] text-slate-500 mt-1">
                অন্য কীওয়ার্ড চেষ্টা করুন
              </p>
            ) : null}
          </div>
        ) : (
          filtered.map((room) => (
            <RoomListItem key={room._id || room.id} room={room} />
          ))
        )}
      </div>

      <div className="px-3 py-3 border-t border-slate-800">
        <Link
          to="/settings"
          className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
        >
          ⚙️ Settings
        </Link>
      </div>
    </aside>
  );
}
