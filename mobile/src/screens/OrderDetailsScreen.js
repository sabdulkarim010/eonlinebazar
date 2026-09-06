import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useSupportWhatsApp from '../hooks/useSupportWhatsApp';
import OrderStatusTimeline from '../components/OrderStatusTimeline';
import useOrderStore from '../store/useOrderStore';
import { useTheme } from '../theme/tokens';
import useToastStore from '../store/useToastStore';
import { resolveOrderTracking } from '../utils/courierTracking';

const RETURN_REASONS = [
  'Wrong item received',
  'Damaged / defective product',
  'Item not as described',
  'Changed my mind',
  'Other',
];

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

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isDeliveredStatus(status) {
  return normalizeStatus(status) === 'delivered';
}

function isShippedStatus(status) {
  return normalizeStatus(status) === 'shipped';
}

function isReturnRequested(order) {
  return normalizeStatus(order?.status) === 'return requested'
    || Boolean(order?.returnRequested);
}

function orderDiscountAmount(order) {
  return Number(
    order?.discountAmount
    ?? order?.discount
    ?? order?.couponDiscount
    ?? 0
  ) || 0;
}

function statusColors(status, theme) {
  const value = normalizeStatus(status);
  if (value.includes('deliver')) return { bg: theme.successBg, fg: theme.success };
  if (value.includes('cancel')) return { bg: theme.errorBg, fg: theme.error };
  if (value.includes('ship')) return { bg: theme.infoBg, fg: theme.info };
  if (value.includes('return')) return { bg: theme.warningBg, fg: theme.warning };
  return { bg: theme.warningBg, fg: theme.warning };
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

function TotalRow({ label, value, bold, valueStyle, T }) {
  return (
    <View style={styles.totalRow}>
      <Text
        style={[
          styles.totalLabel,
          bold && styles.totalLabelBold,
          { color: T.textSub },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.totalValue,
          bold && styles.totalValueBold,
          { color: T.text },
          valueStyle,
        ]}
      >
        {value}
      </Text>
    </View>
  );
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
  const requestReturn = useOrderStore((state) => state.requestReturn);
  const showToast = useToastStore((state) => state.showToast);
  const { guestHelpUrl } = useSupportWhatsApp();
  const [cancelling, setCancelling] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  const order = useMemo(
    () => findLocalOrder(orders, currentOrder, orderId),
    [orders, currentOrder, orderId]
  );

  useEffect(() => {
    if (orderId) fetchOrderById(orderId);
  }, [orderId, fetchOrderById]);

  const isPending = normalizeStatus(order?.status) === 'pending';
  const isDelivered = isDeliveredStatus(order?.status);
  const isShipped = isShippedStatus(order?.status);
  const returnRequested = order ? isReturnRequested(order) : false;

  const tracking = useMemo(
    () => resolveOrderTracking(order || {}),
    [order]
  );

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

  const handleTrackOrder = useCallback(async () => {
    if (!order) return;

    if (tracking.trackingUrl) {
      try {
        const supported = await Linking.canOpenURL(tracking.trackingUrl);
        if (!supported) {
          showToast('Could not open tracking link.', 'error');
          return;
        }
        await Linking.openURL(tracking.trackingUrl);
      } catch {
        showToast('Could not open tracking link.', 'error');
      }
      return;
    }

    if (tracking.trackingNumber) {
      Alert.alert(
        'Tracking unavailable',
        `${tracking.courierName || 'Courier'}: ${tracking.trackingNumber}\n\nContact support for live updates.`,
        [
          { text: 'WhatsApp', onPress: () => Linking.openURL(guestHelpUrl) },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }

    Alert.alert(
      'Order Shipped',
      'Your order is on its way!\n\nFor tracking updates, contact us via WhatsApp or Live Chat.',
      [
        { text: 'WhatsApp', onPress: () => Linking.openURL(guestHelpUrl) },
        { text: 'OK', style: 'cancel' },
      ]
    );
  }, [guestHelpUrl, order, showToast, tracking.courierName, tracking.trackingNumber, tracking.trackingUrl]);

  const submitReturn = async () => {
    if (!returnReason || !order) return;
    setReturnSubmitting(true);
    try {
      const result = await requestReturn(order._id || order.orderId || orderId, returnReason);
      if (!result.success) {
        Alert.alert('Error', result.message || 'Failed to submit return request. Please try again.');
        return;
      }
      setShowReturnModal(false);
      setReturnReason('');
      await fetchOrderById(orderId);
      Alert.alert(
        'Submitted',
        result.message || 'Your return request has been submitted. We will review it within 24 hours.'
      );
    } catch {
      Alert.alert('Error', 'Failed to submit return request. Please try again.');
    } finally {
      setReturnSubmitting(false);
    }
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
  const subtotal = Number(order.subTotal ?? order.subtotal ?? 0);
  const deliveryCharge = Number(order.deliveryCharge ?? order.shippingFee ?? 0);
  const discount = orderDiscountAmount(order);
  const total = Number(order.grandTotal ?? order.totalAmount ?? 0);
  const couponCode = String(order.couponCode || '').trim();

  return (
    <>
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

        {isShipped ? (
          <Pressable
            style={({ pressed }) => [
              styles.trackBtn,
              {
                backgroundColor: T.infoBg,
                borderColor: T.infoBorder,
              },
              pressed && styles.btnPressed,
            ]}
            onPress={handleTrackOrder}
          >
            <Ionicons name="location-outline" size={18} color={T.info} />
            <View style={styles.trackCopy}>
              <Text style={[styles.trackTitle, { color: T.info }]}>
                Track Your Package
              </Text>
              {tracking.trackingNumber ? (
                <Text style={[styles.trackNumber, { color: T.textMuted }]}>
                  {tracking.courierName ? `${tracking.courierName}: ` : ''}
                  {tracking.trackingNumber}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={T.info} />
          </Pressable>
        ) : null}

        <Text style={[styles.section, { color: T.text }]}>Items</Text>
        {items.map((item, index) => {
          const qty = Number(item.quantity) || 1;
          const price = Number(item.price) || 0;
          const productId = orderItemProductId(item);
          const imageUri = orderItemImageUri(item);
          const variantText = orderVariantLabel(item);
          return (
            <View
              key={`${item.id || item.productId || index}`}
              style={[styles.lineWrap, { borderColor: T.border, backgroundColor: T.card }]}
            >
              <Pressable
                style={styles.line}
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

              {isDelivered && productId ? (
                <Pressable
                  style={[styles.reviewCta, { backgroundColor: T.accentLight }]}
                  onPress={() => navigation.navigate('ProductDetails', {
                    productId,
                    autoOpenReview: true,
                  })}
                >
                  <Ionicons name="star-outline" size={14} color={T.accent} />
                  <Text style={[styles.reviewCtaText, { color: T.accent }]}>
                    Write a Review
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}

        {isDelivered && !returnRequested ? (
          <Pressable
            style={({ pressed }) => [
              styles.returnBtn,
              { borderColor: T.border },
              pressed && styles.btnPressed,
            ]}
            onPress={() => setShowReturnModal(true)}
          >
            <Ionicons name="return-down-back-outline" size={16} color={T.textSub} />
            <Text style={[styles.returnBtnText, { color: T.textSub }]}>
              Request Return / Refund
            </Text>
          </Pressable>
        ) : null}

        {returnRequested ? (
          <View style={[styles.returnStatus, { backgroundColor: T.warningBg, borderColor: T.warningBorder }]}>
            <Ionicons name="time-outline" size={16} color={T.warning} />
            <Text style={[styles.returnStatusText, { color: T.warning }]}>
              Return requested — under review
            </Text>
          </View>
        ) : null}

        <View style={[styles.totals, { backgroundColor: T.card, borderColor: T.border }]}>
          <TotalRow label="Subtotal" value={formatBdt(subtotal)} T={T} />

          {deliveryCharge > 0 ? (
            <TotalRow label="Delivery" value={formatBdt(deliveryCharge)} T={T} />
          ) : (
            <TotalRow
              label="Delivery"
              value="FREE"
              valueStyle={{ color: T.success }}
              T={T}
            />
          )}

          {discount > 0 ? (
            <TotalRow
              label={`Coupon${couponCode ? ` (${couponCode})` : ''}`}
              value={`−${formatBdt(discount)}`}
              valueStyle={{ color: T.success }}
              T={T}
            />
          ) : null}

          <View style={[styles.totalDivider, { backgroundColor: T.border }]} />

          <TotalRow label="Total" value={formatBdt(total)} bold T={T} />
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
              pressed && styles.btnPressed,
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

      <Modal
        visible={showReturnModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowReturnModal(false)}
      >
        <SafeAreaView style={[styles.modalSafe, { backgroundColor: T.bg }]}>
          <View style={[styles.modal, { backgroundColor: T.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: T.text }]}>
                Request Return / Refund
              </Text>
              <Pressable onPress={() => setShowReturnModal(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={T.textSub} />
              </Pressable>
            </View>

            <Text style={[styles.modalSubtitle, { color: T.textSub }]}>
              Select a reason:
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {RETURN_REASONS.map((reason) => {
                const selected = returnReason === reason;
                return (
                  <Pressable
                    key={reason}
                    style={[
                      styles.reasonRow,
                      { borderColor: T.border },
                      selected && {
                        borderColor: T.accent,
                        backgroundColor: T.accentLight,
                      },
                    ]}
                    onPress={() => setReturnReason(reason)}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={selected ? T.accent : T.textMuted}
                    />
                    <Text style={[styles.reasonText, { color: T.text }]}>{reason}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                { backgroundColor: T.primaryBtn },
                (!returnReason || returnSubmitting) && styles.submitBtnDisabled,
                pressed && returnReason && !returnSubmitting && { backgroundColor: T.primaryBtnPressed },
              ]}
              onPress={submitReturn}
              disabled={!returnReason || returnSubmitting}
            >
              {returnSubmitting ? (
                <ActivityIndicator color={T.primaryBtnText} />
              ) : (
                <Text style={[styles.submitBtnText, { color: T.primaryBtnText }]}>
                  Submit Request
                </Text>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </>
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
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  trackCopy: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  trackNumber: {
    fontSize: 12,
    marginTop: 2,
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 10,
  },
  lineWrap: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
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
  reviewCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 0,
    marginLeft: 10,
    marginBottom: 10,
  },
  reviewCtaText: {
    fontSize: 12,
    fontWeight: '700',
  },
  returnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  returnBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  returnStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  returnStatusText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
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
    gap: 12,
  },
  totalLabel: {
    fontSize: 14,
    flex: 1,
  },
  totalLabelBold: {
    fontSize: 16,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  totalValueBold: {
    fontSize: 16,
    fontWeight: '700',
  },
  totalDivider: {
    height: 1,
    marginVertical: 4,
    marginBottom: 12,
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
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  modalSafe: {
    flex: 1,
  },
  modal: {
    flex: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 12,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  reasonText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  submitBtn: {
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
