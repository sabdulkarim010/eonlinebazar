import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/tokens';

const CONFIGS = {
  orders: {
    icon: 'cube-outline',
    title: 'No Orders Yet',
    subtitle: 'Your orders will appear here once you make a purchase.',
    action: 'Start Shopping',
    color: '#3b82f6',
  },
  cart: {
    icon: 'cart-outline',
    title: 'Your Cart is Empty',
    subtitle: 'Add items to your cart and they will appear here.',
    action: 'Browse Products',
    color: '#f97316',
  },
  wishlist: {
    icon: 'heart-outline',
    title: 'No Saved Items',
    subtitle: 'Tap the heart icon on any product to save it here.',
    action: 'Explore Products',
    color: '#ef4444',
  },
  search: {
    icon: 'search-outline',
    title: 'No Results Found',
    subtitle: 'Try different keywords or browse by category.',
    action: 'Clear Search',
    color: '#8b5cf6',
  },
  addresses: {
    icon: 'location-outline',
    title: 'No Saved Addresses',
    subtitle: 'Add an address for faster checkout.',
    action: 'Add Address',
    color: '#10b981',
  },
  error: {
    icon: 'cloud-offline-outline',
    title: 'Something Went Wrong',
    subtitle: 'Please check your connection and try again.',
    action: 'Try Again',
    color: '#ef4444',
  },
  network: {
    icon: 'wifi-outline',
    title: 'No Internet Connection',
    subtitle: 'Please check your network and try again.',
    action: 'Retry',
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
  const cfg = CONFIGS[type] || CONFIGS.error;

  return (
    <View style={[es.container, style]}>
      <View style={[es.iconWrap, { backgroundColor: `${cfg.color}15` }]}>
        <Ionicons name={cfg.icon} size={48} color={cfg.color} />
      </View>
      <Text style={[es.title, { color: T.text }]}>
        {title || cfg.title}
      </Text>
      <Text style={[es.subtitle, { color: T.textSub }]}>
        {subtitle || cfg.subtitle}
      </Text>
      {onAction ? (
        <Pressable
          style={[es.btn, { backgroundColor: cfg.color }]}
          onPress={onAction}
        >
          <Text style={es.btnText}>{actionText || cfg.action}</Text>
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
