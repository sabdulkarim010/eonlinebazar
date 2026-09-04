import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAppTheme } from '../../store/useThemeStore';

export const lightTokens = {
  bg: '#f8fafc',
  card: '#ffffff',
  text: '#111827',
  sub: '#6b7280',
  border: '#e5e7eb',
  inputBg: '#f9fafb',
  errorBg: '#fef2f2',
  errorBorder: '#fecaca',
  errorText: '#dc2626',
  successBg: '#ecfdf5',
  successBorder: '#a7f3d0',
  successText: '#047857',
};

export const darkTokens = {
  bg: '#0f172a',
  card: '#1e293b',
  text: '#f1f5f9',
  sub: '#94a3b8',
  border: '#334155',
  inputBg: '#0f172a',
  errorBg: '#2d0a0a',
  errorBorder: '#7f1d1d',
  errorText: '#f87171',
  successBg: '#052e16',
  successBorder: '#065f46',
  successText: '#6ee7b7',
};

export const LOGIN_TRUST_BADGES = [
  { icon: '🔒', text: 'Secure Login & Checkout' },
  { icon: '🚚', text: 'Fast Delivery Across BD' },
  { icon: '💵', text: 'Cash on Delivery Available' },
  { icon: '↩️', text: 'Easy Returns & Refunds' },
];

export const REGISTER_TRUST_BADGES = [
  { icon: '🎁', text: 'Exclusive Member Deals & Offers' },
  { icon: '🔒', text: 'Secure Login & Checkout' },
  { icon: '🚚', text: 'Fast Delivery Across Bangladesh' },
  { icon: '💵', text: 'Cash on Delivery Available' },
];

export function AuthFeedbackBadge({ colors, type = 'error', message, actionLabel, onAction }) {
  const { isDark } = useAppTheme();
  const T = isDark ? darkTokens : lightTokens;

  if (!message) return null;
  const isError = type === 'error';
  return (
    <View
      style={[
        styles.badge,
        isError
          ? { backgroundColor: T.errorBg, borderColor: T.errorBorder }
          : { backgroundColor: T.successBg, borderColor: T.successBorder },
      ]}
    >
      <Ionicons
        name={isError ? 'warning-outline' : 'checkmark-circle-outline'}
        size={18}
        color={isError ? T.errorText : T.successText}
      />
      <Text
        style={[
          styles.badgeText,
          { color: isError ? T.errorText : T.successText },
        ]}
      >
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={6}>
          <Text style={[styles.badgeAction, { color: colors.link }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function AuthPrimaryButton({
  colors,
  label,
  loading = false,
  disabled = false,
  onPress,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.submit,
        pressed && styles.submitPressed,
        (disabled || loading) && styles.submitDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text style={styles.submitText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function AuthTrustBadges({ badges = LOGIN_TRUST_BADGES, colors }) {
  return (
    <View style={styles.badgeGrid}>
      {badges.map((item) => (
        <View
          key={item.text}
          style={[styles.trustChip, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={styles.trustIcon}>{item.icon}</Text>
          <Text style={[styles.trustText, { color: colors.muted }]}>{item.text}</Text>
        </View>
      ))}
    </View>
  );
}

export default function AuthLayout({
  colors,
  icon = 'bag-handle',
  title,
  subtitle,
  badges,
  children,
  footer,
}) {
  return (
    <View style={styles.inner}>
      <View style={[styles.iconCircle, { borderColor: 'rgba(249, 115, 22, 0.25)' }]}>
        <Ionicons name={icon} size={26} color="#f97316" />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
      ) : null}
      {badges?.length ? <AuthTrustBadges badges={badges} colors={colors} /> : null}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  inner: {
    padding: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 153, 0, 0.1)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  trustChip: {
    flexGrow: 1,
    flexBasis: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  trustIcon: {
    fontSize: 16,
  },
  trustText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  badgeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  badgeAction: {
    fontSize: 12,
    fontWeight: '800',
  },
  submit: {
    width: '100%',
    backgroundColor: '#f97316',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    shadowColor: '#f97316',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  submitPressed: {
    backgroundColor: '#ea580c',
  },
  submitDisabled: {
    opacity: 0.65,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
