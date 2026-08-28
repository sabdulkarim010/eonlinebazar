import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import useToastStore from '../store/useToastStore';
import useWishlistStore from '../store/useWishlistStore';
import { useAppTheme } from '../store/useThemeStore';

export default function HeartButton({ product, size = 22, style }) {
  const { colors } = useAppTheme();
  const saved = useWishlistStore((state) =>
    state.items.some((item) => item.id === product?.id)
  );
  const toggleItem = useWishlistStore((state) => state.toggleItem);
  const showToast = useToastStore((state) => state.showToast);

  if (!product) return null;

  return (
    <Pressable
      hitSlop={8}
      style={[styles.btn, { backgroundColor: colors.card }, style]}
      onPress={async () => {
        const added = await toggleItem(product);
        showToast(added ? 'Added to wishlist' : 'Removed from wishlist');
      }}
    >
      <Ionicons
        name={saved ? 'heart' : 'heart-outline'}
        size={size}
        color={saved ? colors.heart : colors.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
