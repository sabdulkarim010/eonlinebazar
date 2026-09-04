import { useCallback, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import HeartButton from '../components/HeartButton';
import EmptyState from '../components/EmptyState';
import useCartStore from '../store/useCartStore';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';
import useWishlistStore from '../store/useWishlistStore';
import { haptic } from '../utils/haptics';

function formatBdt(price) {
  return `৳${Number(price).toLocaleString('en-US')}`;
}

export default function WishlistScreen({ navigation }) {
  const { colors } = useAppTheme();
  const items = useWishlistStore((state) => state.items);
  const loadFromServer = useWishlistStore((state) => state.loadFromServer);
  const addItem = useCartStore((state) => state.addItem);
  const showToast = useToastStore((state) => state.showToast);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadFromServer();
    } finally {
      setRefreshing(false);
    }
  }, [loadFromServer]);

  const addToCart = useCallback(
    (product) => {
      haptic.success();
      addItem({ ...product, quantity: 1 });
      showToast(`${product.name} added to cart`, 'cart');
    },
    [addItem, showToast]
  );

  if (items.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.bg }]}>
        <EmptyState
          type="wishlist"
          onAction={() => navigation.navigate('Main', { screen: 'Shop' })}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={[styles.count, { color: colors.muted }]}>
            {items.length} saved {items.length === 1 ? 'item' : 'items'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View>
              <Pressable onPress={() => navigation.navigate('ProductDetails', { productId: item.id })}>
                <Image source={{ uri: item.image }} style={[styles.image, { backgroundColor: colors.imageBg }]} />
              </Pressable>
              <HeartButton product={item} style={styles.heart} />
            </View>
            <Pressable
              style={styles.body}
              onPress={() => navigation.navigate('ProductDetails', { productId: item.id })}
            >
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={[styles.price, { color: colors.price }]}>{formatBdt(item.price)}</Text>
            </Pressable>
            <Pressable
              style={[styles.cartBtn, { backgroundColor: colors.primaryBtn }]}
              onPress={() => addToCart(item)}
            >
              <Text style={[styles.cartBtnText, { color: colors.primaryBtnText }]}>Add to Cart</Text>
            </Pressable>
          </View>
        )}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#f97316"
            colors={['#f97316']}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  list: {
    padding: 12,
    paddingBottom: 24,
  },
  count: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  row: {
    gap: 12,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
  },
  heart: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  body: {
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    minHeight: 36,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  cartBtn: {
    margin: 10,
    borderRadius: 20,
    paddingVertical: 8,
    alignItems: 'center',
  },
  cartBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
