import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import HeartButton from '../components/HeartButton';
import useCartStore from '../store/useCartStore';
import useProductStore from '../store/useProductStore';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';

function formatBdt(price) {
  return `৳${Number(price).toLocaleString('en-US')}`;
}

export default function ProductDetailsScreen({ navigation, route }) {
  const { colors } = useAppTheme();
  const productId = route.params?.productId;
  const fetchProductById = useProductStore((state) => state.fetchProductById);
  const isProductLoading = useProductStore((state) => state.isProductLoading);
  const productError = useProductStore((state) => state.productError);
  const product = useProductStore((state) => {
    const id = String(productId || '');
    const current = state.currentProduct;
    if (current && (current.id === id || current._id === id || current.productId === id)) {
      return current;
    }
    return state.products.find(
      (item) => item.id === id || item._id === id || item.productId === id
    ) || null;
  });
  const addItem = useCartStore((state) => state.addItem);
  const showToast = useToastStore((state) => state.showToast);
  const cartQuantity = useCartStore(
    (state) =>
      state.items
        .filter((item) => item.id === productId || item.productId === productId)
        .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
  );
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (productId) fetchProductById(productId);
  }, [productId, fetchProductById]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: product?.name || 'Product Details',
    });
  }, [navigation, product]);

  const decreaseQty = useCallback(() => {
    setQuantity((current) => Math.max(1, current - 1));
  }, []);

  const increaseQty = useCallback(() => {
    setQuantity((current) => Math.min(99, current + 1));
  }, []);

  const handleAddToCart = useCallback(() => {
    if (!product) return;
    addItem({ ...product, quantity });
    showToast(`${product.name} added to cart`);
  }, [addItem, product, quantity, showToast]);

  if (!product && isProductLoading) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.missingBody, { color: colors.muted }]}>Loading product…</Text>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.missing, { backgroundColor: colors.bg }]}>
        <Text style={[styles.missingTitle, { color: colors.text }]}>Product not found</Text>
        <Text style={[styles.missingBody, { color: colors.muted }]}>
          {productError || `We could not find a product for id ${productId || '—'}.`}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Image
          source={product.image ? { uri: product.image } : undefined}
          style={[styles.image, { backgroundColor: colors.imageBg }]}
        />
        <HeartButton product={product} size={24} style={styles.heart} />
      </View>

      <View style={[styles.body, { backgroundColor: colors.card }]}>
        <Text style={[styles.category, { color: colors.muted }]}>{product.category}</Text>
        <Text style={[styles.title, { color: colors.text }]}>{product.name}</Text>
        <Text style={[styles.price, { color: colors.price }]}>{formatBdt(product.price)}</Text>
        <Text style={[styles.description, { color: colors.text }]}>{product.description}</Text>

        <Text style={[styles.qtyLabel, { color: colors.text }]}>Quantity</Text>
        <View style={styles.qtyRow}>
          <Pressable
            style={({ pressed }) => [
              styles.qtyBtn,
              { backgroundColor: colors.qtyBg, borderColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
            onPress={decreaseQty}
          >
            <Text style={[styles.qtyBtnText, { color: colors.text }]}>−</Text>
          </Pressable>
          <Text style={[styles.qtyValue, { color: colors.text }]}>{quantity}</Text>
          <Pressable
            style={({ pressed }) => [
              styles.qtyBtn,
              { backgroundColor: colors.qtyBg, borderColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
            onPress={increaseQty}
          >
            <Text style={[styles.qtyBtnText, { color: colors.text }]}>+</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.cartBtn,
            { backgroundColor: colors.primaryBtn },
            pressed && { backgroundColor: colors.primaryBtnPressed },
          ]}
          onPress={handleAddToCart}
        >
          <Text style={[styles.cartBtnText, { color: colors.primaryBtnText }]}>Add to Cart</Text>
        </Pressable>
        {cartQuantity > 0 ? (
          <Text style={[styles.inCartHint, { color: colors.success }]}>
            {cartQuantity} in cart
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
  },
  heart: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  body: {
    marginTop: -8,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  category: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 6,
  },
  price: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 10,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
  },
  qtyLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 22,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 16,
  },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
  },
  qtyValue: {
    fontSize: 18,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
  },
  cartBtn: {
    marginTop: 24,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cartBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  inCartHint: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
  },
  missing: {
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
});
