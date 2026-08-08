import { useEffect, useMemo, useState } from 'react';
import { fetchConfig } from '../services/api';

const FALLBACK = [
  { shortcut: '/thanks', text: 'Thank you for shopping with us! 😊' },
  { shortcut: '/wait', text: "Please hold on, I'll resolve this right away." },
  { shortcut: '/sorry', text: 'We sincerely apologize for this inconvenience.' },
  { shortcut: '/bye', text: 'Thank you! Contact us anytime. 🙏' },
];

export default function CannedResponses({ filter = '', onSelect, onClose }) {
  const [items, setItems] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchConfig();
        const canned = data?.config?.canned_responses;
        if (!cancelled && Array.isArray(canned) && canned.length) {
          setItems(canned);
        }
      } catch {
        // keep fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = String(filter || '').toLowerCase().replace(/^\//, '');
    if (!q) return items;
    return items.filter(
      (item) =>
        String(item.shortcut || '')
          .toLowerCase()
          .includes(q) ||
        String(item.text || '')
          .toLowerCase()
          .includes(q)
    );
  }, [items, filter]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Enter' && filtered[0]) {
        e.preventDefault();
        onSelect?.(filtered[0].text);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, onClose, onSelect]);

  return (
    <div className="absolute left-3 right-3 bottom-full mb-2 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-20">
      <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">ক্যানড রেসপন্স</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-600 transition"
        >
          Esc
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto custom-scroll">
        {loading && (
          <p className="text-xs text-slate-400 px-3 py-3">লোড হচ্ছে…</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-xs text-slate-400 px-3 py-3">কোনো ম্যাচ নেই</p>
        )}
        {filtered.map((item) => (
          <button
            key={item.shortcut || item.text}
            type="button"
            onClick={() => onSelect?.(item.text)}
            className="w-full text-left px-3 py-2.5 hover:bg-primary/5 transition border-b border-slate-50 last:border-0"
          >
            <div className="text-xs font-mono font-semibold text-primary">
              {item.shortcut}
            </div>
            <div className="text-xs text-slate-600 mt-0.5 line-clamp-2">
              {item.text}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
