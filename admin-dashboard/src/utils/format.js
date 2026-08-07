import { formatDistanceToNow, isToday, isYesterday, format } from 'date-fns';
import { bn } from 'date-fns/locale';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBnDigits(value) {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

export function relativeTimeBn(date) {
  if (!date) return '';
  try {
    const text = formatDistanceToNow(new Date(date), {
      addSuffix: true,
      locale: bn,
    });
    return toBnDigits(text);
  } catch {
    return '';
  }
}

export function formatMessageTime(date) {
  if (!date) return '';
  try {
    return toBnDigits(format(new Date(date), 'h:mm a'));
  } catch {
    return '';
  }
}

export function dateSeparatorLabel(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isToday(d)) return 'আজ';
  if (isYesterday(d)) return 'গতকাল';
  return toBnDigits(format(d, 'd MMMM yyyy', { locale: bn }));
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
      return 'অপেক্ষায়';
    case 'ACTIVE':
      return 'লাইভ';
    case 'RESOLVED':
      return 'সমাপ্ত';
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
