import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ScreenHeader from '../components/ScreenHeader';
import useAuthStore from '../store/useAuthStore';
import useOrderStore from '../store/useOrderStore';
import { useAppTheme } from '../store/useThemeStore';

function formatBdt(price) {
  return `৳${Number(price || 0).toLocaleString('en-US')}`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function orderKey(order, index) {
  return String(order._id || order.orderId || index);
}

function OrderCard({ order, onPress, colors }) {
  const items = Array.isArray(order.items) ? order.items : [];
  const firstName = items[0]?.name;
  const extra = items.length > 1 ? ` +${items.length - 1} more` : '';
  const total = order.grandTotal ?? order.totalAmount ?? 0;

  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => onPress(order)}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.orderId, { color: colors.text }]}>{order.orderId || 'Order'}</Text>
        <Text style={[styles.status, { color: colors.accent }]}>{order.status || 'Pending'}</Text>
      </View>
      {firstName ? (
        <Text style={[styles.items, { color: colors.muted }]} numberOfLines={1}>
          {firstName}
          {extra}
        </Text>
      ) : null}
      <View style={styles.cardBottom}>
        <Text style={[styles.date, { color: colors.muted }]}>{formatDate(order.createdAt)}</Text>
        <Text style={[styles.total, { color: colors.price }]}>{formatBdt(total)}</Text>
      </View>
    </Pressable>
  );
}

export default function OrdersScreen({ navigation }) {
  const { colors } = useAppTheme();
  const token = useAuthStore((state) => state.token);
  const orders = useOrderStore((state) => state.orders);
  const isLoading = useOrderStore((state) => state.isLoading);
  const error = useOrderStore((state) => state.error);
  const fetchOrderHistory = useOrderStore((state) => state.fetchOrderHistory);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (token) {
        fetchOrderHistory();
      }
    }, [token, fetchOrderHistory])
  );

  const onRefresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    await fetchOrderHistory({ silent: true });
    setRefreshing(false);
  }, [token, fetchOrderHistory]);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.accent}
      colors={[colors.accent]}
    />
  );

  if (!token && orders.length === 0) {
    return (
      <View style={[styles.guest, { backgroundColor: colors.bg }]}>
        <ScreenHeader
          title="Orders"
          subtitle="Sign in to see orders placed with your account."
        />
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.primaryBtn },
            pressed && { backgroundColor: colors.primaryBtnPressed },
          ]}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={[styles.primaryBtnText, { color: colors.primaryBtnText }]}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  if (isLoading && orders.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (orders.length === 0) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.guest}
        refreshControl={refreshControl}
      >
        <ScreenHeader
          title="Orders"
          subtitle={error || 'You have not placed any orders yet.'}
        />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <FlatList
        data={orders}
        keyExtractor={orderKey}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            colors={colors}
            onPress={(order) =>
              navigation.navigate('OrderDetails', {
                orderId: order._id || order.orderId,
              })
            }
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        ListHeaderComponent={
          error ? <Text style={[styles.error, { color: colors.price }]}>{error}</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guest: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  list: {
    padding: 12,
    paddingBottom: 24,
  },
  error: {
    fontSize: 14,
    marginBottom: 12,
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  status: {
    fontSize: 13,
    fontWeight: '700',
  },
  items: {
    fontSize: 14,
    marginTop: 8,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  date: {
    fontSize: 13,
  },
  total: {
    fontSize: 16,
    fontWeight: '700',
  },
  primaryBtn: {
    marginTop: 24,
    width: '100%',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
