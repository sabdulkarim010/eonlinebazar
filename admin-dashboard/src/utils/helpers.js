import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import { enUS } from 'date-fns/locale';

/** Kept for compatibility; returns plain digits (no Bangla conversion). */
export function toBanglaDigits(value) {
  return String(value);
}

export function relativeTimeBn(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return formatDistanceToNow(d, { addSuffix: true, locale: enUS });
}

/** Short English relative time: "2m ago", "1h ago" */
export function relativeTimeShort(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return format(d, 'MMM d');
}

/** Short relative for staff last-seen / notifications */
export function relativeTimeBnShort(date) {
  if (!date) return '—';
  return relativeTimeShort(date) || '—';
}

export function statusBorderClass(status) {
  switch (status) {
    case 'WAITING_FOR_AGENT':
      return 'border-l-warning';
    case 'ACTIVE':
      return 'border-l-success';
    case 'BOT':
      return 'border-l-info';
    case 'RESOLVED':
      return 'border-l-slate-400';
    default:
      return 'border-l-slate-300';
  }
}

/** Highlight case-insensitive search matches in plain text */
export function highlightMatch(text, query) {
  const raw = String(text || '');
  const q = String(query || '').trim();
  if (!q) return raw;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = raw.split(new RegExp(`(${escaped})`, 'gi'));
  return parts;
}

export function formatTime(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'h:mm a');
}

export function dateSeparatorLabel(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'd MMM yyyy');
}

export function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function avatarColor(seed = '') {
  const colors = [
    'bg-violet-500',
    'bg-fuchsia-500',
    'bg-sky-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-indigo-500',
    'bg-teal-500',
  ];
  let hash = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i += 1) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function truncate(text, max = 40) {
  const t = String(text || '');
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function statusMeta(status) {
  switch (status) {
    case 'WAITING_FOR_AGENT':
      return { label: 'Waiting', color: 'bg-orange-500 text-white', dot: 'bg-orange-500' };
    case 'ACTIVE':
      return { label: 'Live', color: 'bg-green-500 text-white', dot: 'bg-green-500' };
    case 'RESOLVED':
      return { label: 'Resolved', color: 'bg-slate-400 text-white', dot: 'bg-slate-400' };
    case 'BOT':
      return { label: 'AI', color: 'bg-blue-500 text-white', dot: 'bg-blue-500' };
    default:
      return { label: status || 'Unknown', color: 'bg-slate-300 text-slate-700', dot: 'bg-slate-300' };
  }
}

export function roomId(room) {
  return String(room?._id || room?.id || '');
}
