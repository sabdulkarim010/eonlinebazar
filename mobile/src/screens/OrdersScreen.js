import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import EmptyState from '../components/EmptyState';
import { OrderCardSkeleton } from '../components/SkeletonBox';
import ScreenHeader from '../components/ScreenHeader';
import useAuthStore from '../store/useAuthStore';
import useOrderStore from '../store/useOrderStore';
import { useTheme } from '../theme/tokens';

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'processing', label: 'Processing' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
];

const TRACK_STEPS = ['Placed', 'Processing', 'Shipped', 'Delivered'];

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

function normalizeStatus(status) {
  return String(status || 'pending').trim().toLowerCase();
}

function orderMatchesTab(order, tabId) {
  if (tabId === 'all') return true;
  const status = normalizeStatus(order.status);
  if (tabId === 'cancelled') return status === 'cancelled' || status === 'canceled';
  if (tabId === 'delivered') return status === 'delivered' || order.isDelivered === true;
  return status === tabId;
}

function trackingStepIndex(order) {
  const status = normalizeStatus(order.status);
  if (status === 'cancelled' || status === 'canceled') return -1;
  if (order.isDelivered || status === 'delivered') return 3;
  if (status === 'shipped') return 2;
  if (status === 'processing') return 1;
  return 0;
}

const OrderTrackingBar = memo(function OrderTrackingBar({ order, T }) {
  const activeStep = trackingStepIndex(order);
  if (activeStep < 0) return null;

  return (
    <View style={styles.trackingWrap}>
      {TRACK_STEPS.map((step, index) => {
        const done = index <= activeStep;
        const current = index === activeStep;
        return (
          <View key={step} style={styles.trackingStep}>
            <View style={styles.trackingNodeRow}>
              <View
                style={[
                  styles.trackingDot,
                  {
                    backgroundColor: done ? T.accent : T.border,
                    borderColor: current ? T.accent : T.border,
                  },
                ]}
              />
              {index < TRACK_STEPS.length - 1 ? (
                <View
                  style={[
                    styles.trackingLine,
                    { backgroundColor: index < activeStep ? T.accent : T.border },
                  ]}
                />
              ) : null}
            </View>
            <Text
              style={[
                styles.trackingLabel,
                { color: done ? T.text : T.muted },
              ]}
              numberOfLines={1}
            >
              {step}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

const OrderCard = memo(function OrderCard({ order, onPress, T }) {
  const items = Array.isArray(order.items) ? order.items : [];
  const firstName = items[0]?.name;
  const extra = items.length > 1 ? ` +${items.length - 1} more` : '';
  const total = order.grandTotal ?? order.totalAmount ?? 0;
  const status = order.status || 'Pending';

  return (
    <Pressable
      style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}
      onPress={() => onPress(order)}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.orderId, { color: T.text }]} numberOfLines={1}>
          {order.orderId || 'Order'}
        </Text>
        <Text style={[styles.status, { color: T.accent }]} numberOfLines={1}>{status}</Text>
      </View>
      {firstName ? (
        <Text style={[styles.items, { color: T.muted }]} numberOfLines={1}>
          {firstName}
          {extra}
        </Text>
      ) : null}
      <OrderTrackingBar order={order} T={T} />
      <View style={styles.cardBottom}>
        <Text style={[styles.date, { color: T.muted }]}>{formatDate(order.createdAt)}</Text>
        <Text style={[styles.total, { color: T.price }]}>{formatBdt(total)}</Text>
      </View>
    </Pressable>
  );
});

function OrdersScreen({ navigation }) {
  const T = useTheme();
  const token = useAuthStore((state) => state.token);
  const orders = useOrderStore((state) => state.orders);
  const isLoading = useOrderStore((state) => state.isLoading);
  const error = useOrderStore((state) => state.error);
  const fetchOrderHistory = useOrderStore((state) => state.fetchOrderHistory);
  const hasFetchedRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  useFocusEffect(
    useCallback(() => {
      if (!token) return undefined;
      const alreadyLoaded = hasFetchedRef.current || useOrderStore.getState().orders.length > 0;
      hasFetchedRef.current = true;
      fetchOrderHistory({ silent: alreadyLoaded });
      return undefined;
    }, [token, fetchOrderHistory])
  );

  const onRefresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      await fetchOrderHistory({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [token, fetchOrderHistory]);

  const tabCounts = useMemo(() => {
    const counts = { all: orders.length };
    STATUS_TABS.forEach((tab) => {
      if (tab.id === 'all') return;
      counts[tab.id] = orders.filter((order) => orderMatchesTab(order, tab.id)).length;
    });
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(
    () => orders.filter((order) => orderMatchesTab(order, activeTab)),
    [orders, activeTab]
  );

  const openOrder = useCallback((order) => {
    navigation.navigate('OrderDetails', {
      orderId: order._id || order.orderId,
    });
  }, [navigation]);

  const loadOrders = useCallback(() => {
    if (!token) return;
    fetchOrderHistory({ silent: false });
  }, [fetchOrderHistory, token]);

  const renderItem = useCallback(
    ({ item }) => (
      <OrderCard order={item} T={T} onPress={openOrder} />
    ),
    [T, openOrder]
  );

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={T.accent}
      colors={[T.accent]}
    />
  );

  const listHeader = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabs}
    >
      {STATUS_TABS.map((tab) => {
        const selected = tab.id === activeTab;
        const count = tabCounts[tab.id] || 0;
        return (
          <Pressable
            key={tab.id}
            onPress={() => setActiveTab(tab.id)}
            style={[
              styles.tab,
              {
                backgroundColor: selected ? T.accent : T.card,
                borderColor: selected ? T.accent : T.border,
              },
            ]}
          >
            <Text
              style={[styles.tabText, { color: selected ? '#ffffff' : T.text }]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
            {count > 0 ? (
              <View style={[styles.tabBadge, { backgroundColor: selected ? '#ffffff22' : T.accentMuted }]}>
                <Text style={[styles.tabBadgeText, { color: selected ? '#ffffff' : T.accent }]}>
                  {count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );

  if (!token && orders.length === 0) {
    return (
      <View style={[styles.guest, { backgroundColor: T.bg }]}>
        <ScreenHeader
          title="Orders"
          subtitle="Sign in to see orders placed with your account."
        />
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: T.primaryBtn },
            pressed && { backgroundColor: T.primaryBtnPressed },
          ]}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={[styles.primaryBtnText, { color: T.primaryBtnText }]}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  const listEmpty = () => {
    if (isLoading && orders.length === 0) {
      return (
        <View style={styles.skeletonList}>
          <OrderCardSkeleton />
          <OrderCardSkeleton />
          <OrderCardSkeleton />
        </View>
      );
    }

    if (error && orders.length === 0) {
      return (
        <EmptyState
          type="error"
          subtitle={error}
          onAction={loadOrders}
          style={styles.emptyState}
        />
      );
    }

    return (
      <EmptyState
        type="orders"
        subtitle={activeTab === 'all' ? undefined : `No ${activeTab} orders right now.`}
        onAction={() => navigation.navigate('Main', { screen: 'Home' })}
        style={styles.emptyState}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: T.bg }]}>
      <FlatList
        data={filteredOrders}
        keyExtractor={orderKey}
        renderItem={renderItem}
        contentContainerStyle={filteredOrders.length ? styles.list : styles.emptyList}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        ListEmptyComponent={listEmpty}
        ListHeaderComponent={(
          <>
            {listHeader}
            {error && orders.length > 0 ? (
              <Text style={[styles.error, { color: T.price }]}>{error}</Text>
            ) : null}
          </>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  guest: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  tabs: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  list: {
    padding: 16,
    paddingBottom: 24,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    minHeight: 360,
  },
  skeletonList: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  error: {
    fontSize: 14,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 12,
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
  trackingWrap: {
    flexDirection: 'row',
    marginTop: 12,
    marginBottom: 4,
  },
  trackingStep: {
    flex: 1,
    alignItems: 'center',
  },
  trackingNodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  trackingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  trackingLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 2,
  },
  trackingLabel: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
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

export default memo(OrdersScreen);
