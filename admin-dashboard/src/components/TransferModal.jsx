import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { fetchOnlineAgents } from '../services/api';
import { getSocket } from '../services/socket';
import useAuthStore from '../store/authStore';
import useChatStore from '../store/chatStore';
import {
  avatarColor,
  getInitials,
  toBanglaDigits,
} from '../utils/helpers';

export default function TransferModal({ roomId, open, onClose }) {
  const agent = useAuthStore((s) => s.agent);
  const onlineAgents = useChatStore((s) => s.onlineAgents);
  const [agents, setAgents] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setSelected(null);
    setConfirming(false);

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchOnlineAgents();
        if (!cancelled) setAgents(data.agents || []);
      } catch {
        if (!cancelled) {
          const selfId = String(agent?.id || agent?._id);
          setAgents(
            onlineAgents.filter(
              (a) => String(a.agent_id || a.id || a._id) !== selfId
            )
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, agent, onlineAgents, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (agents || []).filter((a) => {
      if (!q) return true;
      return (
        String(a.name || '')
          .toLowerCase()
          .includes(q) ||
        String(a.role || '')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [agents, query]);

  if (!open) return null;

  const confirmTransfer = () => {
    if (!selected || !roomId) return;
    const socket = getSocket();
    if (!socket?.connected) {
      toast.error('সকেট কানেক্টেড নয়');
      return;
    }
    setConfirming(true);
    socket.emit('transfer_chat', {
      room_id: roomId,
      target_agent_id: selected.id || selected._id || selected.agent_id,
    });
    toast.success(
      `চ্যাটটি ${selected.name}-এ ট্রান্সফার করা হয়েছে`
    );
    setConfirming(false);
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-card bg-white dark:bg-slate-900 shadow-layered border border-slate-200 dark:border-slate-700 animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-title"
      >
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3
            id="transfer-title"
            className="text-base font-semibold text-text-primary dark:text-white"
          >
            ট্রান্সফার করুন
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-btn hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="transfer-agent-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="অনলাইন এজেন্ট খুঁজুন…"
              className="w-full rounded-btn border border-slate-200 dark:border-slate-700 pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:bg-slate-800 dark:text-white transition"
            />
          </div>

          <div className="max-h-64 overflow-y-auto custom-scroll space-y-1">
            {loading && (
              <div className="space-y-2 py-2">
                <div className="skeleton h-14" />
                <div className="skeleton h-14" />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <p className="text-sm text-text-secondary text-center py-8">
                কোনো অনলাইন এজেন্ট নেই
              </p>
            )}
            {!loading &&
              filtered.map((a) => {
                const id = String(a.id || a._id || a.agent_id);
                const active = String(selected?.id || selected?._id || selected?.agent_id) === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelected(a)}
                    className={`w-full flex items-center gap-3 rounded-card px-3 py-2.5 text-left transition duration-200 border ${
                      active
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="relative">
                      <div
                        className={`w-10 h-10 rounded-full ${avatarColor(
                          a.name || id
                        )} flex items-center justify-center text-white text-sm font-semibold`}
                      >
                        {getInitials(a.name || 'A')}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success ring-2 ring-white dark:ring-slate-900 animate-pulseDot" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text-primary dark:text-white truncate">
                        {a.name}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {a.role || 'AGENT'} ·{' '}
                        {toBanglaDigits(a.active_chats ?? 0)}টি চ্যাট
                      </p>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-btn px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
          >
            বাতিল
          </button>
          <button
            type="button"
            disabled={!selected || confirming}
            onClick={confirmTransfer}
            className="rounded-btn btn-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            নিশ্চিত করুন
          </button>
        </div>
      </div>
    </div>
  );
}
