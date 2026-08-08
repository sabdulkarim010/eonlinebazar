import { useEffect, useRef, useState } from 'react';
import { toBanglaDigits } from '../utils/helpers';
import useChatStore from '../store/chatStore';

const cards = [
  {
    key: 'total_today',
    icon: '📊',
    label: 'Chats today',
    accent: 'text-primary',
    iconBg: 'bg-primary/10',
  },
  {
    key: 'resolved_today',
    icon: '✅',
    label: 'Resolved',
    accent: 'text-success',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
  },
  {
    key: 'waiting_for_agent',
    icon: '⏳',
    label: 'Waiting',
    accent: 'text-warning',
    iconBg: 'bg-amber-50 dark:bg-amber-950/40',
    highlight: true,
  },
  {
    key: 'avg_rating',
    icon: '⭐',
    label: 'Avg rating',
    accent: 'text-amber-500',
    iconBg: 'bg-amber-50 dark:bg-amber-950/40',
    isFloat: true,
  },
];

function useAnimatedNumber(target, { duration = 700, isFloat = false } = {}) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const end =
      target == null || Number.isNaN(Number(target)) ? 0 : Number(target);
    const start = prevRef.current;
    const startAt = performance.now();

    if (frameRef.current) cancelAnimationFrame(frameRef.current);

    const tick = (now) => {
      const t = Math.min(1, (now - startAt) / duration);
      const eased = 1 - (1 - t) ** 3;
      const value = start + (end - start) * eased;
      setDisplay(isFloat ? value : Math.round(value));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = end;
        setDisplay(end);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, isFloat]);

  return display;
}

function StatCard({ card, value }) {
  const numeric =
    value == null || Number.isNaN(Number(value)) ? null : Number(value);
  const animated = useAnimatedNumber(numeric ?? 0, {
    isFloat: card.isFloat,
  });
  const waitingHighlight = card.highlight && Number(value) > 0;

  const formatted = (() => {
    if (card.isFloat) {
      if (value == null) return '—';
      return toBanglaDigits(Number(animated).toFixed(1));
    }
    return toBanglaDigits(animated);
  })();

  return (
    <div
      className={`relative overflow-hidden rounded-card px-3 sm:px-4 py-3 flex items-center gap-3 transition-all duration-200 animate-fadeIn ${
        waitingHighlight
          ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 animate-pulseGlow'
          : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-soft'
      }`}
    >
      <div
        className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg ${card.iconBg}`}
      >
        <span aria-hidden>{card.icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`text-xl sm:text-2xl font-semibold leading-none tabular-nums ${
            waitingHighlight ? 'text-warning' : card.accent
          }`}
        >
          {formatted}
        </div>
        <div className="text-[11px] sm:text-xs text-text-secondary mt-1 leading-bn truncate">
          {card.label}
        </div>
      </div>
    </div>
  );
}

export default function StatsBar() {
  const stats = useChatStore((s) => s.stats);

  return (
    <div className="shrink-0 px-3 sm:px-4 py-3 bg-page dark:bg-[#0b1220]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
        {cards.map((card) => (
          <StatCard key={card.key} card={card} value={stats[card.key]} />
        ))}
      </div>
    </div>
  );
}
