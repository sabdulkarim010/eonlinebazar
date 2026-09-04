import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function ActionCard({
  colors,
  icon,
  iconColor = '#f97316',
  iconBg = 'rgba(249, 115, 22, 0.12)',
  title,
  subtitle,
  onPress,
  compact = false,
  tile = false,
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        tile ? styles.tile : styles.card,
        compact && !tile && styles.cardCompact,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconWrap, tile && styles.iconWrapTile, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={tile ? 22 : compact ? 18 : 22} color={iconColor} />
      </View>
      <View style={tile ? styles.tileCopy : styles.copy}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={tile ? 3 : 2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {tile ? null : <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 12,
    marginBottom: 10,
  },
  cardCompact: {
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 10,
    minHeight: 132,
  },
  iconWrapTile: {
    marginBottom: 10,
  },
  tileCopy: {
    minHeight: 52,
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
    fontWeight: '500',
  },
});
