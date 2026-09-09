import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../store/useLanguageStore';
import { useTheme } from '../theme/tokens';

const CONFIG_KEYS = {
  orders: {
    icon: 'cube-outline',
    title: 'order.empty_title',
    subtitle: 'order.empty_subtitle',
    action: 'order.start_shopping',
    color: '#3b82f6',
  },
  cart: {
    icon: 'cart-outline',
    title: 'cart.empty_title',
    subtitle: 'cart.empty_subtitle',
    action: 'cart.browse',
    color: '#f97316',
  },
  wishlist: {
    icon: 'heart-outline',
    title: 'wishlist.empty_title',
    subtitle: 'wishlist.empty_subtitle',
    action: 'wishlist.explore',
    color: '#ef4444',
  },
  search: {
    icon: 'search-outline',
    title: 'empty.search_title',
    subtitle: 'empty.search_subtitle',
    action: 'empty.clear_search',
    color: '#8b5cf6',
  },
  addresses: {
    icon: 'location-outline',
    title: 'empty.addresses_title',
    subtitle: 'empty.addresses_subtitle',
    action: 'empty.add_address',
    color: '#10b981',
  },
  error: {
    icon: 'cloud-offline-outline',
    title: 'empty.error_title',
    subtitle: 'empty.error_subtitle',
    action: 'empty.try_again',
    color: '#ef4444',
  },
  network: {
    icon: 'wifi-outline',
    title: 'empty.network_title',
    subtitle: 'empty.network_subtitle',
    action: 'empty.retry',
    color: '#64748b',
  },
};

export default function EmptyState({
  type = 'error',
  title,
  subtitle,
  actionText,
  onAction,
  style,
}) {
  const T = useTheme();
  const { t } = useTranslation();
  const cfg = CONFIG_KEYS[type] || CONFIG_KEYS.error;

  return (
    <View style={[es.container, style]}>
      <View style={[es.iconWrap, { backgroundColor: `${cfg.color}15` }]}>
        <Ionicons name={cfg.icon} size={48} color={cfg.color} />
      </View>
      <Text style={[es.title, { color: T.text }]}>
        {title || t(cfg.title)}
      </Text>
      <Text style={[es.subtitle, { color: T.textSub }]}>
        {subtitle || t(cfg.subtitle)}
      </Text>
      {onAction ? (
        <Pressable
          style={[es.btn, { backgroundColor: cfg.color }]}
          onPress={onAction}
        >
          <Text style={es.btnText}>{actionText || t(cfg.action)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const es = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  iconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  btn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
