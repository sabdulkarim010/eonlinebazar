import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import { bn } from 'date-fns/locale';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBanglaDigits(value) {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

export function relativeTimeBn(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const text = formatDistanceToNow(d, { addSuffix: true, locale: bn });
  return toBanglaDigits(text);
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
  if (isToday(d)) return 'আজ';
  if (isYesterday(d)) return 'গতকাল';
  return toBanglaDigits(format(d, 'd MMM yyyy'));
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
      return { label: 'অপেক্ষায়', color: 'bg-orange-500 text-white', dot: 'bg-orange-500' };
    case 'ACTIVE':
      return { label: 'লাইভ', color: 'bg-green-500 text-white', dot: 'bg-green-500' };
    case 'RESOLVED':
      return { label: 'সমাপ্ত', color: 'bg-slate-400 text-white', dot: 'bg-slate-400' };
    case 'BOT':
      return { label: 'AI', color: 'bg-blue-500 text-white', dot: 'bg-blue-500' };
    default:
      return { label: status || 'Unknown', color: 'bg-slate-300 text-slate-700', dot: 'bg-slate-300' };
  }
}

export function roomId(room) {
  return String(room?._id || room?.id || '');
}
