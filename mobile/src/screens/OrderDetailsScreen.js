import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import useOrderStore from '../store/useOrderStore';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';

function formatBdt(price) {
  return `৳${Number(price || 0).toLocaleString('en-US')}`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusColors(status, colors) {
  const value = String(status || '').toLowerCase();
  if (value.includes('deliver')) return { bg: '#e6f4ea', fg: colors.success };
  if (value.includes('cancel')) return { bg: '#fdecea', fg: colors.price };
  if (value.includes('ship')) return { bg: '#eef2ff', fg: '#3730a3' };
  return { bg: '#fff4e5', fg: '#b45309' };
}

function findLocalOrder(orders, currentOrder, orderId) {
  const id = String(orderId || '');
  const match = (order) =>
    String(order?._id || '') === id || String(order?.orderId || '') === id;
  if (match(currentOrder)) return currentOrder;
  return orders.find(match) || null;
}

export default function OrderDetailsScreen({ route }) {
  const { colors } = useAppTheme();
  const orderId = route.params?.orderId;
  const orders = useOrderStore((state) => state.orders);
  const currentOrder = useOrderStore((state) => state.currentOrder);
  const isLoading = useOrderStore((state) => state.isLoading);
  const error = useOrderStore((state) => state.error);
  const fetchOrderById = useOrderStore((state) => state.fetchOrderById);
  const cancelOrder = useOrderStore((state) => state.cancelOrder);
  const showToast = useToastStore((state) => state.showToast);
  const [cancelling, setCancelling] = useState(false);

  const order = useMemo(
    () => findLocalOrder(orders, currentOrder, orderId),
    [orders, currentOrder, orderId]
  );

  useEffect(() => {
    if (orderId) fetchOrderById(orderId);
  }, [orderId, fetchOrderById]);

  const isPending = String(order?.status || '').toLowerCase() === 'pending';

  const handleCancel = () => {
    Alert.alert(
      'Cancel order?',
      'This cannot be undone. The seller will be notified.',
      [
        { text: 'Keep order', style: 'cancel' },
        {
          text: 'Cancel Order',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            const result = await cancelOrder(order._id || order.orderId || orderId);
            setCancelling(false);
            if (result.success) {
              showToast(result.message || 'Order cancelled.');
            } else {
              showToast(result.message || 'Could not cancel order.', 'error');
            }
          },
        },
      ]
    );
  };

  if (!order && isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <Text style={[styles.missingTitle, { color: colors.text }]}>Order not found</Text>
        <Text style={[styles.missingBody, { color: colors.muted }]}>
          {error || `We could not load order ${orderId || '—'}.`}
        </Text>
      </View>
    );
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const badge = statusColors(order.status, colors);
  const total = order.grandTotal ?? order.totalAmount ?? 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.orderId, { color: colors.text }]}>{order.orderId || 'Order'}</Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.fg }]}>
            {order.status || 'Pending'}
          </Text>
        </View>
      </View>
      <Text style={[styles.meta, { color: colors.muted }]}>{formatDate(order.createdAt)}</Text>

      <Text style={[styles.section, { color: colors.text }]}>Items</Text>
      {items.map((item, index) => {
        const qty = Number(item.quantity) || 1;
        const price = Number(item.price) || 0;
        return (
          <View
            key={`${item.id || item.productId || index}`}
            style={[styles.line, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            {item.image ? (
              <Image source={{ uri: item.image }} style={[styles.lineImage, { backgroundColor: colors.imageBg }]} />
            ) : (
              <View style={[styles.lineImage, { backgroundColor: colors.imageBg }]} />
            )}
            <View style={styles.lineBody}>
              <Text style={[styles.lineName, { color: colors.text }]}>{item.name || 'Product'}</Text>
              <Text style={[styles.lineMeta, { color: colors.muted }]}>
                Qty {qty} × {formatBdt(price)}
              </Text>
            </View>
            <Text style={[styles.lineTotal, { color: colors.text }]}>{formatBdt(price * qty)}</Text>
          </View>
        );
      })}

      <View style={[styles.totals, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: colors.muted }]}>Subtotal</Text>
          <Text style={[styles.totalValue, { color: colors.text }]}>
            {formatBdt(order.subTotal ?? order.subtotal)}
          </Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: colors.muted }]}>Delivery</Text>
          <Text style={[styles.totalValue, { color: colors.text }]}>
            {formatBdt(order.deliveryCharge ?? order.shippingFee)}
          </Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={[styles.grandLabel, { color: colors.text }]}>Total</Text>
          <Text style={[styles.grandValue, { color: colors.price }]}>{formatBdt(total)}</Text>
        </View>
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Shipping address</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.shipName, { color: colors.text }]}>{order.customerName || '—'}</Text>
        <Text style={[styles.shipLine, { color: colors.text }]}>{order.customerPhone || ''}</Text>
        <Text style={[styles.shipLine, { color: colors.text }]}>{order.customerAddress || '—'}</Text>
        {order.shippingDistrict ? (
          <Text style={[styles.shipLine, { color: colors.text }]}>{order.shippingDistrict}</Text>
        ) : null}
      </View>

      <Text style={[styles.section, { color: colors.text }]}>Payment</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.shipLine, { color: colors.text }]}>
          {order.paymentMethod || 'Cash on Delivery'}
        </Text>
      </View>

      {isPending ? (
        <Pressable
          style={({ pressed }) => [
            styles.cancelBtn,
            { borderColor: colors.price },
            pressed && styles.cancelBtnPressed,
            cancelling && styles.btnDisabled,
          ]}
          onPress={handleCancel}
          disabled={cancelling}
        >
          {cancelling ? (
            <ActivityIndicator color={colors.price} />
          ) : (
            <Text style={[styles.cancelBtnText, { color: colors.price }]}>Cancel Order</Text>
          )}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  missingTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  missingBody: {
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  orderId: {
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
  },
  badge: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  meta: {
    fontSize: 13,
    marginTop: 6,
    marginBottom: 8,
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 10,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  lineImage: {
    width: 56,
    height: 56,
    borderRadius: 6,
  },
  lineBody: {
    flex: 1,
  },
  lineName: {
    fontSize: 14,
    fontWeight: '600',
  },
  lineMeta: {
    fontSize: 13,
    marginTop: 4,
  },
  lineTotal: {
    fontSize: 14,
    fontWeight: '700',
  },
  totals: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
    marginTop: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 14,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  grandLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  grandValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  shipName: {
    fontSize: 15,
    fontWeight: '700',
  },
  shipLine: {
    fontSize: 14,
    marginTop: 4,
  },
  cancelBtn: {
    marginTop: 24,
    borderRadius: 24,
    borderWidth: 1.5,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  cancelBtnPressed: {
    opacity: 0.7,
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.7,
  },
});
