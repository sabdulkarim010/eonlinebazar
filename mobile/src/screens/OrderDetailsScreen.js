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
import { useTheme } from '../theme/tokens';
import useToastStore from '../store/useToastStore';
import OrderStatusTimeline from '../components/OrderStatusTimeline';

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

function statusColors(status, theme) {
  const value = String(status || '').toLowerCase();
  if (value.includes('deliver')) return { bg: '#e6f4ea', fg: theme.success };
  if (value.includes('cancel')) return { bg: '#fdecea', fg: theme.price };
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

function orderItemProductId(item) {
  return item.product?._id || item.product?.id || item.productId || item.id;
}

function orderItemImageUri(item) {
  return item.image || item.product?.image || item.product?.images?.[0] || '';
}

function orderVariantLabel(item) {
  const color = item.variant?.color || item.selectedColor || item.variantValue;
  const size = item.variant?.size || item.selectedSize;
  const label = item.variantLabel
    || [item.variantAttribute, item.variantValue].filter(Boolean).join(': ');
  if (color || size) {
    return [color, size].filter(Boolean).join(' · ');
  }
  return label || '';
}

export default function OrderDetailsScreen({ navigation, route }) {
  const T = useTheme();
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
      <View style={[styles.centered, { backgroundColor: T.bg }]}>
        <ActivityIndicator size="large" color={T.accent} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.centered, { backgroundColor: T.bg }]}>
        <Text style={[styles.missingTitle, { color: T.text }]}>Order not found</Text>
        <Text style={[styles.missingBody, { color: T.muted }]}>
          {error || `We could not load order ${orderId || '—'}.`}
        </Text>
      </View>
    );
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const badge = statusColors(order.status, T);
  const total = order.grandTotal ?? order.totalAmount ?? 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: T.bg }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.orderId, { color: T.text }]}>{order.orderId || 'Order'}</Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.fg }]}>
            {order.status || 'Pending'}
          </Text>
        </View>
      </View>
      <Text style={[styles.meta, { color: T.muted }]}>{formatDate(order.createdAt)}</Text>

      <Text style={[styles.section, { color: T.text }]}>Order tracking</Text>
      <View style={[styles.timelineCard, { backgroundColor: T.card, borderColor: T.border }]}>
        <OrderStatusTimeline status={order.status} colors={T} />
      </View>

      <Text style={[styles.section, { color: T.text }]}>Items</Text>
      {items.map((item, index) => {
        const qty = Number(item.quantity) || 1;
        const price = Number(item.price) || 0;
        const productId = orderItemProductId(item);
        const imageUri = orderItemImageUri(item);
        const variantText = orderVariantLabel(item);
        return (
          <Pressable
            key={`${item.id || item.productId || index}`}
            style={[styles.line, { backgroundColor: T.card, borderColor: T.border }]}
            onPress={() => {
              if (productId) {
                navigation.navigate('ProductDetails', { productId });
              }
            }}
          >
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={[styles.lineImage, { backgroundColor: T.imageBg }]}
              />
            ) : (
              <View style={[styles.lineImage, { backgroundColor: T.imageBg }]} />
            )}
            <View style={styles.lineBody}>
              <Text style={[styles.lineName, { color: T.text }]}>{item.name || 'Product'}</Text>
              {variantText ? (
                <Text style={[styles.lineVariant, { color: T.muted, backgroundColor: T.qtyBg }]}>
                  {variantText}
                </Text>
              ) : null}
              <Text style={[styles.lineMeta, { color: T.muted }]}>
                Qty {qty} × {formatBdt(price)}
              </Text>
            </View>
            <Text style={[styles.lineTotal, { color: T.text }]}>{formatBdt(price * qty)}</Text>
          </Pressable>
        );
      })}

      <View style={[styles.totals, { backgroundColor: T.card, borderColor: T.border }]}>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: T.muted }]}>Subtotal</Text>
          <Text style={[styles.totalValue, { color: T.text }]}>
            {formatBdt(order.subTotal ?? order.subtotal)}
          </Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: T.muted }]}>Delivery</Text>
          <Text style={[styles.totalValue, { color: T.text }]}>
            {formatBdt(order.deliveryCharge ?? order.shippingFee)}
          </Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={[styles.grandLabel, { color: T.text }]}>Total</Text>
          <Text style={[styles.grandValue, { color: T.price }]}>{formatBdt(total)}</Text>
        </View>
      </View>

      <Text style={[styles.section, { color: T.text }]}>Shipping address</Text>
      <View style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}>
        <Text style={[styles.shipName, { color: T.text }]}>{order.customerName || '—'}</Text>
        <Text style={[styles.shipLine, { color: T.text }]}>{order.customerPhone || ''}</Text>
        <Text style={[styles.shipLine, { color: T.text }]}>{order.customerAddress || '—'}</Text>
        {order.shippingDistrict ? (
          <Text style={[styles.shipLine, { color: T.text }]}>{order.shippingDistrict}</Text>
        ) : null}
      </View>

      <Text style={[styles.section, { color: T.text }]}>Payment</Text>
      <View style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}>
        <Text style={[styles.shipLine, { color: T.text }]}>
          {order.paymentMethod || 'Cash on Delivery'}
        </Text>
      </View>

      {isPending ? (
        <Pressable
          style={({ pressed }) => [
            styles.cancelBtn,
            { borderColor: T.price },
            pressed && styles.cancelBtnPressed,
            cancelling && styles.btnDisabled,
          ]}
          onPress={handleCancel}
          disabled={cancelling}
        >
          {cancelling ? (
            <ActivityIndicator color={T.price} />
          ) : (
            <Text style={[styles.cancelBtnText, { color: T.price }]}>Cancel Order</Text>
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
  timelineCard: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
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
  lineVariant: {
    fontSize: 11,
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
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
