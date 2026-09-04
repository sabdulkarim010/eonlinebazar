import useThemeStore from '../store/useThemeStore';

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
};

export const radius = {
  sm: 6, md: 10, lg: 14, xl: 18, xxl: 24, full: 999,
};

export const fontSize = {
  xs: 10, sm: 12, base: 14, md: 15,
  lg: 16, xl: 18, xxl: 20, xxxl: 24, display: 28,
};

export const fontWeight = {
  regular: '400', medium: '500',
  semibold: '600', bold: '700', black: '800',
};

export const shadow = {
  sm: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  md: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  lg: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 16, elevation: 6,
  },
  accent: {
    shadowColor: '#f97316', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 4,
  },
};

const lightThemeBase = {
  bg: '#f1f5f9',
  bgSecondary: '#e2e8f0',
  card: '#ffffff',
  cardSecondary: '#f8fafc',
  header: '#ffffff',
  input: '#f8fafc',

  text: '#0f172a',
  textSub: '#475569',
  textMuted: '#94a3b8',
  textOnAccent: '#ffffff',

  border: '#e2e8f0',
  borderFocus: '#f97316',

  accent: '#f97316',
  accentDark: '#ea580c',
  accentLight: '#fff7ed',
  accentMuted: 'rgba(249,115,22,0.1)',

  success: '#16a34a',
  successBg: '#f0fdf4',
  successBorder: '#bbf7d0',

  warning: '#d97706',
  warningBg: '#fffbeb',
  warningBorder: '#fde68a',

  error: '#dc2626',
  errorBg: '#fef2f2',
  errorBorder: '#fecaca',

  info: '#2563eb',
  infoBg: '#eff6ff',
  infoBorder: '#bfdbfe',

  overlay: 'rgba(0,0,0,0.5)',
  skeleton: '#e2e8f0',
  skeletonShimmer: '#f1f5f9',
  sectionLabel: '#94a3b8',

  statusPending: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  statusProcessing: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  statusShipped: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  statusDelivered: { bg: '#f0fdf4', text: '#14532d', border: '#86efac' },
  statusCancelled: { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
};

const darkThemeBase = {
  bg: '#080c14',
  bgSecondary: '#0d1117',
  card: '#111827',
  cardSecondary: '#1a2235',
  header: '#0a0f1e',
  input: '#0d1117',

  text: '#f1f5f9',
  textSub: '#94a3b8',
  textMuted: '#475569',
  textOnAccent: '#ffffff',

  border: '#1e2d45',
  borderFocus: '#f97316',

  accent: '#f97316',
  accentDark: '#ea580c',
  accentLight: '#1a0d00',
  accentMuted: 'rgba(249,115,22,0.12)',

  success: '#22c55e',
  successBg: '#052e16',
  successBorder: '#14532d',

  warning: '#f59e0b',
  warningBg: '#1a1000',
  warningBorder: '#78350f',

  error: '#f87171',
  errorBg: '#1e0a0a',
  errorBorder: '#7f1d1d',

  info: '#60a5fa',
  infoBg: '#0c1a33',
  infoBorder: '#1e3a5f',

  overlay: 'rgba(0,0,0,0.7)',
  skeleton: '#1e2d45',
  skeletonShimmer: '#263352',
  sectionLabel: '#475569',

  statusPending: { bg: '#1a0d00', text: '#fb923c', border: '#7c2d12' },
  statusProcessing: { bg: '#0c1a33', text: '#60a5fa', border: '#1e3a5f' },
  statusShipped: { bg: '#052e16', text: '#4ade80', border: '#14532d' },
  statusDelivered: { bg: '#052e16', text: '#86efac', border: '#166534' },
  statusCancelled: { bg: '#1e0a0a', text: '#f87171', border: '#7f1d1d' },
};

function withScreenAliases(base, navChrome) {
  return {
    ...base,
    muted: base.textMuted,
    sub: base.textSub,
    price: base.error,
    inputBg: base.input,
    qtyBg: base.cardSecondary,
    imageBg: base.bgSecondary,
    link: base.info,
    primaryBtn: base.accent,
    primaryBtnPressed: base.accentDark,
    primaryBtnText: base.textOnAccent,
    accentBg: base.accentLight,
    danger: base.error,
    dangerBg: base.errorBg,
    statCard: base.card,
    heroBg: base.card,
    iconBg: base.cardSecondary,
    chipVerifiedBg: base.successBg,
    chipVerifiedText: base.success,
    chipUnverifiedBg: base.warningBg,
    chipUnverifiedText: base.warning,
    guestIconBg: base.bgSecondary,
    toggleThumb: base.textOnAccent,
    shadow: base === darkThemeBase ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.06)',
    ...navChrome,
  };
}

export const lightTheme = withScreenAliases(lightThemeBase, {
  headerBg: '#131921',
  headerText: '#ffffff',
  headerSub: 'rgba(255,255,255,0.65)',
  headerBorder: 'rgba(255,255,255,0.08)',
  iconBtnBg: 'rgba(255,255,255,0.1)',
});

export const darkTheme = withScreenAliases(darkThemeBase, {
  headerBg: '#0b0d10',
  headerText: '#f1f5f9',
  headerSub: 'rgba(241,245,249,0.6)',
  headerBorder: 'rgba(255,255,255,0.06)',
  iconBtnBg: 'rgba(255,255,255,0.08)',
});

export function useTheme() {
  const mode = useThemeStore((state) => state.mode);
  return mode === 'dark' ? darkTheme : lightTheme;
}
