import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppStatusBar from '../components/AppStatusBar';
import { radius, useTheme } from '../theme/tokens';

function formatBdt(price) {
  return `৳${Number(price || 0).toLocaleString('en-US')}`;
}

export default function OrderSuccessScreen({ route, navigation }) {
  const T = useTheme();
  const { orderId, orderNumber, total } = route.params || {};
  const displayId = orderNumber
    || (orderId ? String(orderId).slice(-8).toUpperCase() : '—');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: T.bg }]}>
      <AppStatusBar />
      <View style={styles.iconWrapper}>
        <View style={[styles.iconCircle, { backgroundColor: T.successBg }]}>
          <Text style={styles.icon}>✅</Text>
        </View>
      </View>

      <Text style={[styles.title, { color: T.text }]}>Order Placed!</Text>
      <Text style={[styles.subtitle, { color: T.textSub }]}>
        Your order has been placed successfully.
      </Text>

      <View style={[styles.orderCard, { backgroundColor: T.card, borderColor: T.border }]}>
        <Text style={[styles.orderLabel, { color: T.textMuted }]}>Order ID</Text>
        <Text style={[styles.orderId, { color: T.accent }]}>#{displayId}</Text>
        <Text style={[styles.orderTotal, { color: T.text }]}>
          Total: {formatBdt(total)}
        </Text>
      </View>

      <Text style={[styles.hint, { color: T.textSub }]}>
        💡 Create an account or sign in to track your order and get updates.
      </Text>

      <Pressable
        style={({ pressed }) => [
          styles.loginBtn,
          { backgroundColor: T.primaryBtn },
          pressed && { backgroundColor: T.primaryBtnPressed },
        ]}
        onPress={() => navigation.navigate('Login')}
      >
        <Text style={[styles.loginBtnText, { color: T.primaryBtnText }]}>
          Sign In to Track Order
        </Text>
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
    borderRadius: radius.full,
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
    borderRadius: radius.lg,
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
    borderRadius: radius.lg,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  loginBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  shopBtn: {
    width: '100%',
    borderWidth: 1.5,
    borderRadius: radius.lg,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shopBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
