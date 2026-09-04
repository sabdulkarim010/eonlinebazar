import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../store/useThemeStore';

const lightT = {
  bg: '#f8fafc',
  card: '#ffffff',
  text: '#111827',
  sub: '#6b7280',
  border: '#e5e7eb',
  iconBg: '#f0fdf4',
};

const darkT = {
  bg: '#0f172a',
  card: '#1e293b',
  text: '#f1f5f9',
  sub: '#94a3b8',
  border: '#334155',
  iconBg: 'rgba(5, 150, 105, 0.15)',
};

function formatBdt(price) {
  return `৳${Number(price || 0).toLocaleString('en-US')}`;
}

export default function OrderSuccessScreen({ route, navigation }) {
  const { isDark } = useAppTheme();
  const T = isDark ? darkT : lightT;
  const { orderId, orderNumber, total } = route.params || {};
  const displayId = orderNumber
    || (orderId ? String(orderId).slice(-8).toUpperCase() : '—');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: T.bg }]}>
      <View style={styles.iconWrapper}>
        <View style={[styles.iconCircle, { backgroundColor: T.iconBg }]}>
          <Text style={styles.icon}>✅</Text>
        </View>
      </View>

      <Text style={[styles.title, { color: T.text }]}>Order Placed!</Text>
      <Text style={[styles.subtitle, { color: T.sub }]}>
        Your order has been placed successfully.
      </Text>

      <View style={[styles.orderCard, { backgroundColor: T.card, borderColor: T.border }]}>
        <Text style={[styles.orderLabel, { color: T.sub }]}>Order ID</Text>
        <Text style={styles.orderId}>#{displayId}</Text>
        <Text style={[styles.orderTotal, { color: T.text }]}>
          Total: {formatBdt(total)}
        </Text>
      </View>

      <Text style={[styles.hint, { color: T.sub }]}>
        💡 Create an account or sign in to track your order and get updates.
      </Text>

      <Pressable
        style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.9 }]}
        onPress={() => navigation.navigate('Login')}
      >
        <Text style={styles.loginBtnText}>Sign In to Track Order</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.shopBtn,
          { borderColor: T.border },
          pressed && { opacity: 0.85 },
        ]}
        onPress={() => navigation.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        })}
      >
        <Text style={[styles.shopBtnText, { color: T.text }]}>Continue Shopping</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    marginBottom: 20,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },
  orderCard: {
    width: '100%',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  orderLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  orderId: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#f97316',
  },
  orderTotal: {
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  loginBtn: {
    width: '100%',
    backgroundColor: '#f97316',
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  shopBtn: {
    width: '100%',
    borderWidth: 1.5,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shopBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
