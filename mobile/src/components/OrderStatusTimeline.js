import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const TIMELINE_STEPS = [
  { label: 'Placed', icon: 'clipboard-outline' },
  { label: 'Processing', icon: 'cube-outline' },
  { label: 'Shipped', icon: 'airplane-outline' },
  { label: 'Out for Delivery', icon: 'bicycle-outline' },
  { label: 'Delivered', icon: 'checkmark-circle-outline' },
];

const STATUS_STEP_INDEX = {
  pending: 0,
  placed: 0,
  processing: 1,
  shipped: 2,
  'out for delivery': 3,
  'out-for-delivery': 3,
  out_for_delivery: 3,
  delivered: 4,
};

function normalizeStatus(status) {
  return String(status || 'pending').trim().toLowerCase();
}

function isCancelledStatus(status) {
  const key = normalizeStatus(status);
  return key === 'cancelled' || key === 'canceled';
}

function getTimelineStepIndex(status) {
  const key = normalizeStatus(status);
  if (isCancelledStatus(key)) return -1;
  if (STATUS_STEP_INDEX[key] !== undefined) return STATUS_STEP_INDEX[key];
  if (key.includes('deliver') && key.includes('out')) return 3;
  if (key === 'delivered') return 4;
  if (key.includes('ship')) return 2;
  if (key.includes('process')) return 1;
  return 0;
}

function OrderStatusTimeline({ status, colors }) {
  const cancelled = isCancelledStatus(status);
  const currentIndex = getTimelineStepIndex(status);
  const isDelivered = normalizeStatus(status) === 'delivered';

  const steps = useMemo(
    () => TIMELINE_STEPS.map((step, index) => {
      let state = 'upcoming';
      if (cancelled) state = 'cancelled';
      else if (isDelivered || index < currentIndex) state = 'completed';
      else if (index === currentIndex) state = 'active';
      return { ...step, state };
    }),
    [cancelled, currentIndex, isDelivered]
  );

  if (cancelled) {
    return (
      <View style={[styles.cancelBanner, { backgroundColor: colors.price + '18', borderColor: colors.price }]}>
        <Ionicons name="close-circle" size={22} color={colors.price} />
        <View style={styles.cancelCopy}>
          <Text style={[styles.cancelTitle, { color: colors.price }]}>Order Cancelled</Text>
          <Text style={[styles.cancelBody, { color: colors.muted }]}>
            This order was cancelled and will not be delivered.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.track}
    >
      {steps.map((step, index) => {
        const completed = step.state === 'completed';
        const active = step.state === 'active';
        const accent = completed || active ? colors.accent : colors.border;
        const iconColor = completed || active ? '#ffffff' : colors.muted;
        const labelColor = completed || active ? colors.text : colors.muted;

        return (
          <View key={step.label} style={styles.step}>
            <View style={styles.stepTop}>
              {index > 0 ? (
                <View
                  style={[
                    styles.connector,
                    { backgroundColor: completed || active ? colors.accent : colors.border },
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: completed || active ? colors.accent : colors.card,
                    borderColor: accent,
                  },
                  active && styles.iconWrapActive,
                ]}
              >
                <Ionicons name={step.icon} size={18} color={iconColor} />
              </View>
            </View>
            <Text
              style={[
                styles.label,
                { color: labelColor },
                active && styles.labelActive,
              ]}
              numberOfLines={2}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  track: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  step: {
    width: 88,
    alignItems: 'center',
  },
  stepTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 6,
  },
  connector: {
    position: 'absolute',
    left: -44,
    width: 44,
    height: 3,
    borderRadius: 2,
    top: 17,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    transform: [{ scale: 1.08 }],
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 13,
  },
  labelActive: {
    fontWeight: '800',
  },
  cancelBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  cancelCopy: {
    flex: 1,
    gap: 2,
  },
  cancelTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  cancelBody: {
    fontSize: 13,
    lineHeight: 18,
  },
});

export default memo(OrderStatusTimeline);
