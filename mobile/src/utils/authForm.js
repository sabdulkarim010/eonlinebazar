const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BD_MOBILE_RE = /^01[3-9]\d{8}$/;

export function authIdentifierKeyboard(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return 'default';
  if (trimmed.startsWith('0') || trimmed.startsWith('+880') || trimmed.startsWith('880')) {
    return 'phone-pad';
  }
  if (trimmed.includes('@') || /[A-Za-z]/.test(trimmed)) return 'email-address';
  if (/^[+]?\d[\d\s-]*$/.test(trimmed)) return 'phone-pad';
  return 'default';
}

export function loginFieldErrors(loginInput, password) {
  const errors = {};
  const identifier = String(loginInput || '').trim();
  if (!identifier) errors.loginInput = 'Email or phone is required.';
  if (!password) errors.password = 'Password is required.';
  return errors;
}

export function registerFieldErrors(fields) {
  const errors = {};
  const firstName = String(fields.firstName || '').trim();
  const lastName = String(fields.lastName || '').trim();
  const email = String(fields.email || '').trim().toLowerCase();
  const mobile = String(fields.mobile || '').replace(/\D/g, '');
  const password = String(fields.password || '');
  const confirmPassword = String(fields.confirmPassword || '');

  if (!firstName) errors.firstName = 'First name is required.';
  if (!lastName) errors.lastName = 'Last name is required.';
  if (!email) errors.email = 'Email is required.';
  else if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
  if (!mobile) errors.mobile = 'Mobile number is required.';
  else if (!BD_MOBILE_RE.test(mobile)) errors.mobile = 'Use a valid BD number (01XXXXXXXXX).';
  if (!password) errors.password = 'Password is required.';
  else if (password.length < 6) errors.password = 'At least 6 characters.';
  if (!confirmPassword) errors.confirmPassword = 'Confirm your password.';
  else if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';
  if (!fields.district) errors.district = 'Select your district.';
  if (!fields.upazila) errors.upazila = 'Select your upazila.';

  return errors;
}

export function passwordStrength(password) {
  const value = String(password || '');
  if (!value) return { score: 0, label: '', color: '#94a3b8', width: '0%' };
  let score = 0;
  if (value.length >= 6) score += 1;
  if (value.length >= 10) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;

  if (score <= 2) {
    return { score, label: 'Weak', color: '#ef4444', width: '33%' };
  }
  if (score <= 3) {
    return { score, label: 'Fair', color: '#f59e0b', width: '66%' };
  }
  return { score, label: 'Strong', color: '#16a34a', width: '100%' };
}
