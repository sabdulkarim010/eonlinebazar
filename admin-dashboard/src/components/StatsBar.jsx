import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { toBanglaDigits } from '../utils/helpers';
import useChatStore from '../store/chatStore';

const cards = [
  {
    key: 'total_today',
    icon: '📊',
    label: 'আজকের মোট চ্যাট',
    accent: 'text-primary',
    iconBg: 'bg-primary/10',
  },
  {
    key: 'resolved_today',
    icon: '✅',
    label: 'সমাধান হয়েছে',
    accent: 'text-success',
    iconBg: 'bg-emerald-50',
  },
  {
    key: 'waiting_for_agent',
    icon: '⏳',
    label: 'অপেক্ষায় আছে',
    accent: 'text-warning',
    iconBg: 'bg-amber-50',
    highlight: true,
  },
  {
    key: 'avg_rating',
    icon: '⭐',
    label: 'গড় রেটিং',
    accent: 'text-amber-500',
    iconBg: 'bg-amber-50',
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

function Trend({ delta, isFloat }) {
  if (delta === 0 || delta == null) {
    return (
      <span className="text-[10px] font-medium text-slate-400 tabular-nums">
        — 0
      </span>
    );
  }
  const up = delta > 0;
  const abs = isFloat ? Math.abs(delta).toFixed(1) : Math.abs(delta);
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${
        up ? 'text-success' : 'text-danger'
      }`}
    >
      {up ? '↑' : '↓'} {toBanglaDigits(abs)}
    </span>
  );
}

function StatCard({ card, value, prevValue }) {
  const numeric =
    value == null || Number.isNaN(Number(value)) ? null : Number(value);
  const animated = useAnimatedNumber(numeric ?? 0, {
    isFloat: card.isFloat,
  });
  const waitingHighlight =
    card.highlight && Number(value) > 0;

  const formatted = (() => {
    if (card.isFloat) {
      if (value == null) return '—';
      return toBanglaDigits(Number(animated).toFixed(1));
    }
    return toBanglaDigits(animated);
  })();

  const delta =
    prevValue == null || value == null
      ? null
      : Number(value) - Number(prevValue);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl px-4 py-3.5 flex items-center gap-3 transition-all duration-300 animate-fadeIn ${
        waitingHighlight
          ? 'bg-amber-50 border border-amber-200 shadow-[0_0_0_1px_rgba(245,158,11,0.15)] animate-pulseGlow'
          : 'bg-white border border-slate-100 shadow-sm'
      }`}
    >
      <div
        className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl ${card.iconBg}`}
      >
        <span aria-hidden>{card.icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div
            className={`text-2xl font-semibold leading-none tabular-nums ${
              waitingHighlight ? 'text-warning' : card.accent
            }`}
          >
            {formatted}
          </div>
          <Trend delta={delta} isFloat={card.isFloat} />
        </div>
        <div className="text-xs text-slate-500 mt-1.5 leading-bn truncate">
          {card.label}
        </div>
      </div>
    </div>
  );
}

export default function StatsBar() {
  const stats = useChatStore((s) => s.stats);
  const prevRef = useRef(null);
  const [prevStats, setPrevStats] = useState(null);

  useEffect(() => {
    if (!prevRef.current) {
      prevRef.current = { ...stats };
      return;
    }
    const timer = setTimeout(() => {
      setPrevStats({ ...prevRef.current });
      prevRef.current = { ...stats };
    }, 50);
    return () => clearTimeout(timer);
  }, [stats]);

  return (
    <div className="shrink-0 bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-3">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-sm font-semibold text-slate-900">
            Chat Admin
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Live inbox · EonlineBazar
          </p>
        </div>
        <Link
          to="/settings"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-primary hover:text-primary transition shadow-sm"
        >
          <Cog6ToothIcon className="w-4 h-4" />
          Settings
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card) => (
          <StatCard
            key={card.key}
            card={card}
            value={stats[card.key]}
            prevValue={prevStats?.[card.key]}
          />
        ))}
      </div>
    </div>
  );
}
