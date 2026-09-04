import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useToastStore from '../store/useToastStore';

const TOAST_ICONS = {
  success: { icon: 'checkmark-circle', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  error: { icon: 'close-circle', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  warning: { icon: 'warning', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  info: { icon: 'information-circle', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  cart: { icon: 'cart-outline', color: '#f97316', bg: '#fff7ed', border: '#fed7aa' },
};

const TOAST_TITLES = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Notice',
  cart: 'Added to Cart',
};

export default function ToastBanner() {
  const insets = useSafeAreaInsets();
  const visible = useToastStore((state) => state.visible);
  const message = useToastStore((state) => state.message);
  const title = useToastStore((state) => state.title);
  const type = useToastStore((state) => state.type);
  const hideToast = useToastStore((state) => state.hideToast);

  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && message) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          speed: 20,
          bounciness: 5,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, message, opacity, translateY]);

  if (!message) return null;

  const config = TOAST_ICONS[type] || TOAST_ICONS.info;
  const displayTitle = title || TOAST_TITLES[type] || TOAST_TITLES.info;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.wrap,
        {
          top: Math.max(insets.top, 12) + 4,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Pressable
        onPress={hideToast}
        style={({ pressed }) => [
          styles.toast,
          {
            backgroundColor: config.bg,
            borderColor: config.border,
          },
          pressed && styles.toastPressed,
        ]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <View style={[styles.iconWrap, { backgroundColor: config.border }]}>
          <Ionicons name={config.icon} size={22} color={config.color} />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: config.color }]} numberOfLines={1}>
            {displayTitle}
          </Text>
          <Text style={styles.message} numberOfLines={3}>
            {message}
          </Text>
        </View>
        <Ionicons name="close" size={16} color="#94a3b8" style={styles.dismissIcon} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 12,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  toastPressed: {
    opacity: 0.92,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    color: '#334155',
    fontWeight: '500',
  },
  dismissIcon: {
    marginLeft: 2,
  },
});
