export function maskEmail(email = '') {
  const [local, domain] = String(email).split('@');
  if (!local || !domain) return '';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function maskPhone(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `***${digits.slice(-4)}`;
}

export function formatDisplayPhone(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('880')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return digits;
  if (digits.length === 10 && digits.startsWith('1')) return `0${digits}`;
  return digits;
}

export function heroContactLine(user) {
  const formatted = formatDisplayPhone(user?.mobile || user?.phone || '');
  if (formatted) return formatted;
  if (user?.email) return String(user.email).trim();
  const name = user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  return String(name || 'Member').trim();
}

export function heroContactIsPhone(user) {
  return Boolean(formatDisplayPhone(user?.mobile || user?.phone || ''));
}
