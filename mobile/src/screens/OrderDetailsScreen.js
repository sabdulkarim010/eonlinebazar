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
import { WebView } from 'react-native-webview';
import { ordersAPI } from '../api/orders';
import useSupportWhatsApp from '../hooks/useSupportWhatsApp';
import AppStatusBar from '../components/AppStatusBar';
import OrderStatusTimeline from '../components/OrderStatusTimeline';
import useOrderStore from '../store/useOrderStore';
import { useTheme } from '../theme/tokens';
import useToastStore from '../store/useToastStore';
import { resolveOrderTracking } from '../utils/courierTracking';
import { haptic } from '../utils/haptics';
import { buildWhatsAppUrl } from '../utils/supportLinks';

const RETURN_REASONS = [
  { key: 'wrong_item', label: 'Wrong item received' },
  { key: 'damaged', label: 'Damaged / defective product' },
  { key: 'not_as_described', label: 'Not as described' },
  { key: 'changed_mind', label: 'Changed my mind' },
  { key: 'other', label: 'Other reason' },
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

function isOrderReturnFlowActive(status) {
  const normalized = normalizeStatus(status);
  return normalized === 'return requested' || normalized === 'returned';
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  throw new Error('Base64 encoding is not available.');
}

function refundMethodLabel(method) {
  switch (String(method || '').toLowerCase()) {
    case 'wallet':
      return 'Wallet Balance';
    case 'bkash':
      return 'bKash';
    case 'nagad':
      return 'Nagad';
    case 'cash':
      return 'Cash';
    default:
      return 'Original payment';
  }
}

function orderDiscountAmount(order) {
  return Number(
    order?.discountAmount
    ?? order?.discount
    ?? order?.couponDiscount
    ?? 0
  ) || 0;
}

function resolveStatusStyle(status, T) {
  const raw = String(status || 'Pending').trim();
  const STATUS_STYLES = {
    Pending: { bg: T.statusPending.bg, text: T.statusPending.text, icon: 'time-outline' },
    Processing: { bg: T.statusProcessing.bg, text: T.statusProcessing.text, icon: 'cog-outline' },
    Shipped: { bg: T.statusShipped.bg, text: T.statusShipped.text, icon: 'airplane-outline' },
    'Out for Delivery': { bg: T.infoBg, text: T.info, icon: 'bicycle-outline' },
    Delivered: { bg: T.statusDelivered.bg, text: T.statusDelivered.text, icon: 'checkmark-circle-outline' },
    Cancelled: { bg: T.statusCancelled.bg, text: T.statusCancelled.text, icon: 'close-circle-outline' },
  };

  if (STATUS_STYLES[raw]) return { ...STATUS_STYLES[raw], label: raw };

  const lower = raw.toLowerCase();
  if (lower === 'canceled') return { ...STATUS_STYLES.Cancelled, label: raw };
  if (lower === 'out for delivery' || lower === 'outfordelivery') {
    return { ...STATUS_STYLES['Out for Delivery'], label: 'Out for Delivery' };
  }
  if (lower === 'return requested') {
    return { bg: T.warningBg, text: T.warning, icon: 'return-down-back-outline', label: raw };
  }

  const titleCase = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return STATUS_STYLES[titleCase]
    ? { ...STATUS_STYLES[titleCase], label: raw }
    : { ...STATUS_STYLES.Pending, label: raw };
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
  const requestReturnItems = useOrderStore((state) => state.requestReturnItems);
  const showToast = useToastStore((state) => state.showToast);
  const { phone, guestHelpUrl } = useSupportWhatsApp();
  const [cancelling, setCancelling] = useState(false);
  const [returnModalItem, setReturnModalItem] = useState(null);
  const [returnReason, setReturnReason] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoicePdfBase64, setInvoicePdfBase64] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

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
  const returnFlowActive = order ? isOrderReturnFlowActive(order.status) : false;

  const loadOrder = useCallback(async () => {
    if (orderId) await fetchOrderById(orderId);
  }, [fetchOrderById, orderId]);

  const openReturnModal = useCallback((item, productId) => {
    setReturnModalItem({ ...item, productId });
    setReturnReason('');
    haptic.light();
  }, []);

  const openOrderChat = useCallback(() => {
    if (!order) return;
    haptic.light();
    navigation.navigate('LiveSupport', {
      orderContext: {
        orderId: order._id,
        orderNumber: order.orderId || order.orderNumber,
        orderStatus: order.status,
        orderTotal: order.grandTotal ?? order.totalAmount,
        orderItems: (order.items || []).map((item) => ({
          name: item.name || item.product?.name,
          qty: item.quantity,
          price: item.price,
        })),
      },
    });
  }, [navigation, order]);

  const handleDownloadInvoice = useCallback(async () => {
    if (!order?._id) return;
    haptic.light();
    setInvoiceLoading(true);
    try {
      const { data } = await ordersAPI.downloadInvoice(order._id);
      const base64 = arrayBufferToBase64(data);
      setInvoicePdfBase64(base64);
      setShowInvoiceModal(true);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Could not download invoice.', 'error');
    } finally {
      setInvoiceLoading(false);
    }
  }, [order, showToast]);

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

  const submitItemReturn = async () => {
    if (!returnReason || !order || !returnModalItem) {
      showToast('Please select a reason', 'warning');
      return;
    }

    const reasonLabel = RETURN_REASONS.find((r) => r.key === returnReason)?.label || returnReason;

    setReturnSubmitting(true);
    try {
      haptic.medium();
      const result = await requestReturnItems(order._id || order.orderId || orderId, {
        items: [{
          productId: returnModalItem.productId,
          productName: returnModalItem.name || returnModalItem.product?.name,
          quantity: returnModalItem.quantity,
          price: returnModalItem.price,
          reason: reasonLabel,
        }],
        reason: reasonLabel,
      });

      if (!result.success) {
        showToast(result.message || 'Failed to submit return', 'error');
        return;
      }

      haptic.success();
      setReturnModalItem(null);
      setReturnReason('');
      await loadOrder();
      Alert.alert(
        '✅ Return Requested',
        'Your return request has been submitted. We will review it within 24 hours.'
      );
    } catch {
      showToast('Network error', 'error');
    } finally {
      setReturnSubmitting(false);
    }
  };

  if (!order && isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: T.bg }]}>
        <AppStatusBar />
        <ActivityIndicator size="large" color={T.accent} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.centered, { backgroundColor: T.bg }]}>
        <AppStatusBar />
        <Text style={[styles.missingTitle, { color: T.text }]}>Order not found</Text>
        <Text style={[styles.missingBody, { color: T.muted }]}>
          {error || `We could not load order ${orderId || '—'}.`}
        </Text>
      </View>
    );
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const statusStyle = resolveStatusStyle(order.status, T);
  const orderWhatsAppUrl = buildWhatsAppUrl(phone, `Order ${order.orderId || orderId || ''}`);
  const subtotal = Number(order.subTotal ?? order.subtotal ?? 0);
  const deliveryCharge = Number(order.deliveryCharge ?? order.shippingFee ?? 0);
  const discount = orderDiscountAmount(order);
  const total = Number(order.grandTotal ?? order.totalAmount ?? 0);
  const couponCode = String(order.couponCode || '').trim();

  return (
    <>
      <AppStatusBar />
      <ScrollView
        style={[styles.container, { backgroundColor: T.bg }]}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.orderId, { color: T.text }]}>{order.orderId || 'Order'}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Ionicons name={statusStyle.icon} size={14} color={statusStyle.text} />
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {statusStyle.label}
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
        {items.map((item, idx) => {
          const qty = Number(item.quantity) || 1;
          const price = Number(item.price) || 0;
          const productId = orderItemProductId(item);
          const imageUri = orderItemImageUri(item);
          const variantText = orderVariantLabel(item);
          const returnItem = (order.returnItems || []).find(
            (entry) => String(entry.productId) === String(productId)
          );

          return (
            <View
              key={`${item.id || item.productId || idx}`}
              style={[styles.itemCard, { backgroundColor: T.card, borderColor: T.border }]}
            >
              <Pressable
                style={styles.itemRow}
                onPress={() => {
                  if (productId) {
                    navigation.navigate('ProductDetails', { productId });
                  }
                }}
              >
                {imageUri ? (
                  <Image
                    source={{ uri: imageUri }}
                    style={[styles.itemImg, { backgroundColor: T.imageBg }]}
                  />
                ) : (
                  <View style={[styles.itemImg, { backgroundColor: T.imageBg }]} />
                )}

                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, { color: T.text }]} numberOfLines={2}>
                    {item.name || item.product?.name || 'Product'}
                  </Text>
                  {variantText ? (
                    <Text style={[styles.itemVariant, { color: T.textSub, backgroundColor: T.cardSecondary }]}>
                      {variantText}
                    </Text>
                  ) : null}
                  <Text style={[styles.itemQty, { color: T.textMuted }]}>
                    Qty {qty} × {formatBdt(price)}
                  </Text>
                  <Text style={[styles.itemTotal, { color: T.accent }]}>
                    {formatBdt(price * qty)}
                  </Text>

                  {isDelivered ? (
                    <View style={styles.itemActions}>
                      <Pressable
                        style={[styles.itemActionBtn, styles.reviewBtn, { backgroundColor: T.accentLight }]}
                        onPress={() => {
                          haptic.light();
                          navigation.navigate('ProductDetails', {
                            productId,
                            autoOpenReview: true,
                          });
                        }}
                      >
                        <Ionicons name="star-outline" size={12} color={T.accent} />
                        <Text style={[styles.itemActionText, { color: T.accent }]}>Review</Text>
                      </Pressable>

                      {!returnItem && !returnFlowActive && productId ? (
                        <Pressable
                          style={[styles.itemActionBtn, styles.returnItemBtn, { backgroundColor: T.warningBg }]}
                          onPress={() => openReturnModal(item, productId)}
                        >
                          <Ionicons name="return-down-back-outline" size={12} color={T.warning} />
                          <Text style={[styles.itemActionText, { color: T.warning }]}>Return</Text>
                        </Pressable>
                      ) : null}

                      {returnItem ? (
                        <View style={[
                          styles.returnStatusChip,
                          {
                            backgroundColor: returnItem.status === 'approved'
                              ? T.successBg
                              : T.warningBg,
                          },
                        ]}
                        >
                          <Text style={{
                            fontSize: 10,
                            fontWeight: '700',
                            color: returnItem.status === 'approved' ? T.success : T.warning,
                          }}
                          >
                            Return {returnItem.status}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </Pressable>
            </View>
          );
        })}

        {returnFlowActive ? (
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

        {Number(order.refundAmount) > 0 ? (
          <View style={[styles.refundStatusCard, { backgroundColor: T.successBg, borderColor: T.successBorder }]}>
            <View style={styles.refundStatusRow}>
              <Ionicons name="checkmark-circle" size={20} color={T.success} />
              <View style={styles.refundStatusCopy}>
                <Text style={[styles.refundStatusTitle, { color: T.success }]}>
                  Refund Processed
                </Text>
                <Text style={[styles.refundStatusDetail, { color: T.textSub }]}>
                  {formatBdt(order.refundAmount)} via {refundMethodLabel(order.refundMethod)}
                </Text>
                {order.refundedAt ? (
                  <Text style={[styles.refundDate, { color: T.textMuted }]}>
                    {new Date(order.refundedAt).toLocaleDateString('en-US', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

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

        <View style={[styles.actionsSection, { backgroundColor: T.card, borderColor: T.border }]}>
          <Text style={[styles.actionsSectionTitle, { color: T.textSub }]}>
            Need Help?
          </Text>

          <Pressable
            style={[styles.invoiceBtn, { borderColor: T.border }]}
            onPress={handleDownloadInvoice}
            disabled={invoiceLoading}
          >
            {invoiceLoading ? (
              <ActivityIndicator size="small" color={T.textSub} />
            ) : (
              <Ionicons name="document-outline" size={16} color={T.textSub} />
            )}
            <Text style={[styles.invoiceBtnText, { color: T.textSub }]}>
              {invoiceLoading ? 'Loading invoice…' : 'Download Invoice'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.supportBtn, { borderColor: T.brandWhatsApp }]}
            onPress={() => Linking.openURL(orderWhatsAppUrl || guestHelpUrl)}
          >
            <Text style={styles.supportEmoji}>💬</Text>
            <Text style={[styles.supportBtnText, { color: T.brandWhatsApp }]}>
              WhatsApp Support
            </Text>
          </Pressable>

          <Pressable
            style={[styles.supportBtn, { borderColor: T.accent }]}
            onPress={openOrderChat}
          >
            <Ionicons name="chatbubble-outline" size={18} color={T.accent} />
            <Text style={[styles.supportBtnText, { color: T.accent }]}>
              Live Chat
            </Text>
          </Pressable>
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
        visible={!!returnModalItem}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setReturnModalItem(null)}
      >
        <SafeAreaView style={[styles.modalSafe, { backgroundColor: T.bg }]}>
          <View style={[styles.returnModal, { backgroundColor: T.card }]}>
            <View style={styles.returnModalHeader}>
              <Text style={[styles.returnModalTitle, { color: T.text }]}>
                ↩️ Return Item
              </Text>
              <Pressable onPress={() => setReturnModalItem(null)} hitSlop={8}>
                <Ionicons name="close" size={24} color={T.textSub} />
              </Pressable>
            </View>

            <View style={[styles.returnItemPreview, { backgroundColor: T.cardSecondary }]}>
              <Text style={[styles.returnItemName, { color: T.text }]}>
                {returnModalItem?.name || returnModalItem?.product?.name}
              </Text>
              <Text style={[styles.returnItemQty, { color: T.textSub }]}>
                Qty: {returnModalItem?.quantity} · {formatBdt(returnModalItem?.price)}
              </Text>
            </View>

            <Text style={[styles.returnReasonLabel, { color: T.textSub }]}>
              Select reason:
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {RETURN_REASONS.map((reason) => {
                const selected = returnReason === reason.key;
                return (
                  <Pressable
                    key={reason.key}
                    style={[
                      styles.reasonOption,
                      { borderColor: selected ? T.accent : T.border },
                      selected && { backgroundColor: T.accentLight },
                    ]}
                    onPress={() => setReturnReason(reason.key)}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={selected ? T.accent : T.textMuted}
                    />
                    <Text style={[styles.reasonText, { color: selected ? T.accent : T.text }]}>
                      {reason.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              style={({ pressed }) => [
                styles.submitReturnBtn,
                { backgroundColor: T.primaryBtn },
                (!returnReason || returnSubmitting) && styles.submitReturnBtnDisabled,
                pressed && returnReason && !returnSubmitting && { backgroundColor: T.primaryBtnPressed },
              ]}
              onPress={submitItemReturn}
              disabled={!returnReason || returnSubmitting}
            >
              {returnSubmitting ? (
                <ActivityIndicator color={T.primaryBtnText} />
              ) : (
                <Text style={[styles.submitReturnBtnText, { color: T.primaryBtnText }]}>
                  ↩️ Submit Return Request
                </Text>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={showInvoiceModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInvoiceModal(false)}
      >
        <SafeAreaView style={[styles.modalSafe, { backgroundColor: T.bg }]}>
          <View style={styles.invoiceModalHeader}>
            <Text style={[styles.returnModalTitle, { color: T.text }]}>Invoice</Text>
            <Pressable onPress={() => setShowInvoiceModal(false)} hitSlop={8}>
              <Ionicons name="close" size={24} color={T.textSub} />
            </Pressable>
          </View>
          {invoicePdfBase64 ? (
            <WebView
              style={styles.invoiceWebView}
              originWhitelist={['*']}
              source={{ uri: `data:application/pdf;base64,${invoicePdfBase64}` }}
            />
          ) : null}
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
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
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
  itemCard: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 12,
  },
  itemImg: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemVariant: {
    fontSize: 11,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  itemQty: {
    fontSize: 12,
    marginTop: 4,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  itemActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  itemActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  reviewBtn: {},
  returnItemBtn: {},
  itemActionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  returnStatusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
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
  refundStatusCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  refundStatusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  refundStatusCopy: {
    flex: 1,
  },
  refundStatusTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  refundStatusDetail: {
    fontSize: 13,
    marginTop: 4,
  },
  refundDate: {
    fontSize: 11,
    marginTop: 4,
  },
  invoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  invoiceBtnText: {
    fontSize: 15,
    fontWeight: '600',
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
  actionsSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginTop: 18,
    gap: 10,
  },
  actionsSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  supportEmoji: {
    fontSize: 18,
  },
  supportBtnText: {
    fontSize: 15,
    fontWeight: '600',
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
  returnModal: {
    flex: 1,
    padding: 20,
  },
  returnModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  returnModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  returnItemPreview: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  returnItemName: {
    fontSize: 15,
    fontWeight: '700',
  },
  returnItemQty: {
    fontSize: 13,
    marginTop: 4,
  },
  returnReasonLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  submitReturnBtn: {
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  submitReturnBtnDisabled: {
    opacity: 0.5,
  },
  submitReturnBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  invoiceModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  invoiceWebView: {
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
