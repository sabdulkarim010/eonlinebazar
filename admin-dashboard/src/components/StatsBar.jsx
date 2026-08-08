import { Link } from 'react-router-dom';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { toBanglaDigits } from '../utils/helpers';
import useChatStore from '../store/chatStore';

const cards = [
  {
    key: 'total_today',
    icon: '📊',
    label: 'আজকের মোট চ্যাট',
    format: (v) => toBanglaDigits(v ?? 0),
  },
  {
    key: 'resolved_today',
    icon: '✅',
    label: 'সমাধান হয়েছে',
    format: (v) => toBanglaDigits(v ?? 0),
  },
  {
    key: 'waiting_for_agent',
    icon: '⏳',
    label: 'অপেক্ষায় আছে',
    format: (v) => toBanglaDigits(v ?? 0),
    highlight: true,
  },
  {
    key: 'avg_rating',
    icon: '⭐',
    label: 'গড় রেটিং',
    format: (v) => (v == null ? '—' : toBanglaDigits(Number(v).toFixed(1))),
  },
];

export default function StatsBar() {
  const stats = useChatStore((s) => s.stats);

  return (
    <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-3">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h1 className="text-sm font-semibold text-slate-800">Chat Admin</h1>
        <Link
          to="/settings"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-primary hover:text-primary transition"
        >
          <Cog6ToothIcon className="w-4 h-4" />
          ⚙️ Settings
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card) => {
          const value = stats[card.key];
          const waitingHighlight =
            card.highlight && Number(stats.waiting_for_agent) > 0;

          return (
            <div
              key={card.key}
              className={`rounded-xl shadow-sm px-4 py-3 flex items-center gap-3 transition ${
                waitingHighlight
                  ? 'bg-orange-50 border border-orange-200 animate-pulseGlow'
                  : 'bg-white border border-slate-100'
              }`}
            >
              <span className="text-2xl" aria-hidden>
                {card.icon}
              </span>
              <div>
                <div
                  className={`text-2xl font-bold leading-none ${
                    waitingHighlight ? 'text-orange-600' : 'text-slate-900'
                  }`}
                >
                  {card.format(value)}
                </div>
                <div className="text-xs text-slate-500 mt-1">{card.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
