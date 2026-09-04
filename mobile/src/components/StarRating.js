import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

function StarRating({ value = 0, count = 0, size = 12, color = '#f59e0b', mutedColor = '#94a3b8', showValue = true }) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0));
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.25 && rating - fullStars < 0.85;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  if (rating <= 0 && !count) return null;

  return (
    <View style={styles.row}>
      {Array.from({ length: fullStars }).map((_, index) => (
        <Ionicons key={`full-${index}`} name="star" size={size} color={color} />
      ))}
      {hasHalf ? <Ionicons name="star-half" size={size} color={color} /> : null}
      {Array.from({ length: emptyStars }).map((_, index) => (
        <Ionicons key={`empty-${index}`} name="star-outline" size={size} color={mutedColor} />
      ))}
      {showValue && rating > 0 ? (
        <Text style={[styles.value, { color: mutedColor, fontSize: size }]}>
          {rating.toFixed(1)}
          {count > 0 ? ` (${count})` : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    flexWrap: 'wrap',
  },
  value: {
    marginLeft: 4,
    fontWeight: '600',
  },
});

export default memo(StarRating);
