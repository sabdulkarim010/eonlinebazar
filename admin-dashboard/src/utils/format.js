import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import { enUS } from 'date-fns/locale';

/** Kept for compatibility; returns plain digits (no Bangla conversion). */
export function toBnDigits(value) {
  return String(value);
}

export function relativeTimeBn(date) {
  if (!date) return '';
  try {
    return formatDistanceToNow(new Date(date), {
      addSuffix: true,
      locale: enUS,
    });
  } catch {
    return '';
  }
}

export function formatMessageTime(date) {
  if (!date) return '';
  try {
    return format(new Date(date), 'h:mm a');
  } catch {
    return '';
  }
}

export function dateSeparatorLabel(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'd MMMM yyyy');
}

export function getInitials(name = 'G') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'G';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-violet-500',
  'bg-emerald-500',
  'bg-sky-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-fuchsia-500',
];

export function avatarColor(seed = '') {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function statusLabel(status) {
  switch (status) {
    case 'WAITING_FOR_AGENT':
      return 'Waiting';
    case 'ACTIVE':
      return 'Live';
    case 'RESOLVED':
      return 'Resolved';
    case 'BOT':
      return 'AI';
    default:
      return status;
  }
}

export function statusColorClass(status) {
  switch (status) {
    case 'WAITING_FOR_AGENT':
      return 'bg-orange-500 text-white';
    case 'ACTIVE':
      return 'bg-green-500 text-white';
    case 'RESOLVED':
      return 'bg-slate-400 text-white';
    case 'BOT':
      return 'bg-blue-500 text-white';
    default:
      return 'bg-slate-300 text-slate-700';
  }
}

export function truncate(text = '', max = 40) {
  const t = String(text);
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}
