import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/tokens';

export function SkeletonBox({ width, height, borderRadius = 8, style }) {
  const T = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.9],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: T.skeleton,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function ProductCardSkeleton() {
  const T = useTheme();
  return (
    <View style={[skStyles.card, { backgroundColor: T.card }]}>
      <SkeletonBox width="100%" height={180} borderRadius={12} />
      <View style={skStyles.cardBody}>
        <SkeletonBox width="80%" height={14} />
        <SkeletonBox width="50%" height={18} />
        <SkeletonBox width="100%" height={36} borderRadius={8} />
      </View>
    </View>
  );
}

export function OrderCardSkeleton() {
  const T = useTheme();
  return (
    <View style={[skStyles.orderCard, { backgroundColor: T.card, borderColor: T.border }]}>
      <View style={skStyles.orderRow}>
        <SkeletonBox width={60} height={60} borderRadius={10} />
        <View style={skStyles.orderCopy}>
          <SkeletonBox width="60%" height={14} />
          <SkeletonBox width="40%" height={12} />
          <SkeletonBox width="30%" height={20} />
        </View>
        <SkeletonBox width={70} height={26} borderRadius={13} />
      </View>
    </View>
  );
}

export function BannerSkeleton() {
  return <SkeletonBox width="100%" height={190} borderRadius={0} />;
}

export function ProductSkeletonGrid({ count = 8 }) {
  const rows = [];
  for (let i = 0; i < count; i += 2) {
    rows.push([i, i + 1].filter((idx) => idx < count));
  }

  return (
    <View style={skStyles.grid}>
      {rows.map((row) => (
        <View key={row.join('-')} style={skStyles.gridRow}>
          {row.map((idx) => (
            <View key={idx} style={skStyles.gridCell}>
              <ProductCardSkeleton />
            </View>
          ))}
          {row.length === 1 ? <View style={skStyles.gridCell} /> : null}
        </View>
      ))}
    </View>
  );
}

const skStyles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: 'hidden',
    flex: 1,
  },
  cardBody: {
    padding: 10,
    gap: 8,
  },
  orderCard: {
    borderRadius: 14,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  orderRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    alignItems: 'center',
  },
  orderCopy: {
    flex: 1,
    gap: 8,
  },
  grid: {
    paddingTop: 8,
    gap: 12,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  gridCell: {
    flex: 1,
  },
});
