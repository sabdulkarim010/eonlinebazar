import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppImage from '../components/AppImage';
import HeartButton from '../components/HeartButton';
import { ProductCard } from '../components/ProductGrid';
import ReviewsSection from '../components/ReviewsSection';
import { searchAPI, mapSearchProducts } from '../api/search';
import { API_ORIGIN } from '../services/api';
import useCartStore from '../store/useCartStore';
import useProductStore from '../store/useProductStore';
import { useTheme } from '../theme/tokens';
import useToastStore from '../store/useToastStore';
import { haptic } from '../utils/haptics';
import {
  getVariantPrice,
  getVariantStock,
  matchProductVariant,
} from '../utils/normalizeProduct';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STICKY_BAR_HEIGHT = 72;

function formatBdt(price) {
  return `৳${Number(price || 0).toLocaleString('en-US')}`;
}

export default function ProductDetailsScreen({ navigation, route }) {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const productId = route.params?.productId;
  const autoOpenCart = route.params?.autoOpenCart;
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
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [adding, setAdding] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const scrollRef = useRef(null);
  const variantSectionRef = useRef(null);
  const autoOpenCartHandled = useRef(false);

  useEffect(() => {
    if (productId) fetchProductById(productId);
  }, [productId, fetchProductById]);

  useEffect(() => {
    if (!product) return;
    if (product.colors?.length) {
      setSelectedColor((current) =>
        product.colors.includes(current) ? current : product.colors[0]
      );
    } else {
      setSelectedColor(null);
    }
    if (product.sizes?.length) {
      setSelectedSize((current) =>
        product.sizes.includes(current) ? current : product.sizes[0]
      );
    } else {
      setSelectedSize(null);
    }
    setActiveImage(0);
  }, [product]);

  useEffect(() => {
    if (!product?.category && !product?.categoryId) return;
    const category = product.categoryId || product.category;
    searchAPI.search({ category, limit: 7, sort: 'popular' })
      .then(({ data }) => {
        const list = mapSearchProducts(data).filter(
          (item) => String(item.id) !== String(product.id)
        );
        setRelatedProducts(list.slice(0, 6));
      })
      .catch(() => setRelatedProducts([]));
  }, [product]);

  const handleShare = useCallback(async () => {
    if (!product) return;
    const id = product.id || product._id || productId;
    const url = `${API_ORIGIN}/products/${id}`;
    try {
      await Share.share({
        message: `Check out ${product.name} on EOnlineBazar — ${url}`,
        url,
        title: product.name,
      });
    } catch {
      // User dismissed share sheet.
    }
  }, [product, productId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: product?.name || 'Product Details',
      headerRight: () => (
        <Pressable onPress={handleShare} hitSlop={8} style={styles.shareBtn}>
          <Ionicons name="share-outline" size={22} color={T.headerText} />
        </Pressable>
      ),
    });
  }, [navigation, product, handleShare, T.headerText]);

  const images = product?.images?.length
    ? product.images
    : (product?.image ? [product.image] : []);
  const currentPrice = useMemo(
    () => getVariantPrice(product, selectedColor, selectedSize),
    [product, selectedColor, selectedSize]
  );
  const currentStock = useMemo(
    () => getVariantStock(product, selectedColor, selectedSize),
    [product, selectedColor, selectedSize]
  );
  const matchedVariant = useMemo(
    () => matchProductVariant(product, selectedColor, selectedSize),
    [product, selectedColor, selectedSize]
  );

  useEffect(() => {
    setQuantity((qty) => {
      const max = Math.max(1, currentStock || 1);
      return Math.min(Math.max(1, qty), max);
    });
  }, [currentStock]);

  useEffect(() => {
    if (!autoOpenCart || !product || autoOpenCartHandled.current) return;
    if (!product.colors?.length && !product.sizes?.length) return;

    autoOpenCartHandled.current = true;
    showToast('Please select color and size before adding to cart.');

    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: SCREEN_WIDTH * 0.9, animated: true });
    }, 350);

    return () => clearTimeout(timer);
  }, [autoOpenCart, product, showToast]);

  const decreaseQty = useCallback(() => {
    setQuantity((current) => Math.max(1, current - 1));
  }, []);

  const increaseQty = useCallback(() => {
    setQuantity((current) => Math.min(Math.max(1, currentStock), current + 1));
  }, [currentStock]);

  const handleAddToCart = useCallback(async (buyNow = false) => {
    if (!product) return;

    if (product.colors?.length && !selectedColor) {
      Alert.alert('Select color', 'Please select a color before adding to cart.');
      return;
    }
    if (product.sizes?.length && !selectedSize) {
      Alert.alert('Select size', 'Please select a size before adding to cart.');
      return;
    }
    if (currentStock <= 0) {
      Alert.alert('Out of stock', 'Sorry, this item is currently out of stock.');
      return;
    }
    if (quantity > currentStock) {
      Alert.alert('Insufficient stock', `Only ${currentStock} units available.`);
      return;
    }

    const variant = (selectedColor || selectedSize)
      ? {
        color: selectedColor,
        size: selectedSize,
        variantId: matchedVariant?.sku || `${selectedColor || ''}-${selectedSize || ''}`,
        variantLabel: matchedVariant?.name
          || [selectedColor, selectedSize].filter(Boolean).join(' / '),
        sku: matchedVariant?.sku || '',
      }
      : null;

    const lineImage = matchedVariant?.image || product.image;
    setAdding(true);
    try {
      haptic.success();
      addItem({ ...product, price: currentPrice, image: lineImage }, quantity, variant);
      if (buyNow) {
        navigation.navigate('Checkout');
        return;
      }
      showToast(`${product.name} added to cart`, 'cart');
    } finally {
      setAdding(false);
    }
  }, [
    addItem,
    currentPrice,
    currentStock,
    matchedVariant,
    navigation,
    product,
    quantity,
    selectedColor,
    selectedSize,
    showToast,
  ]);

  const openRelatedProduct = useCallback((item) => {
    navigation.push('ProductDetails', { productId: item.id });
  }, [navigation]);

  if (!product && isProductLoading) {
    return (
      <View style={[styles.missing, { backgroundColor: T.bg }]}>
        <ActivityIndicator size="large" color={T.accent} />
        <Text style={[styles.missingBody, { color: T.muted }]}>Loading product…</Text>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.missing, { backgroundColor: T.bg }]}>
        <Text style={[styles.missingTitle, { color: T.text }]}>Product not found</Text>
        <Text style={[styles.missingBody, { color: T.muted }]}>
          {productError || `We could not find a product for id ${productId || '—'}.`}
        </Text>
      </View>
    );
  }

  const outOfStock = currentStock <= 0;
  const bottomPad = STICKY_BAR_HEIGHT + Math.max(insets.bottom, 12);

  return (
    <View style={[styles.screen, { backgroundColor: T.bg }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.gallery, { backgroundColor: T.imageBg }]}>
          <FlatList
            data={images.length ? images : ['']}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setActiveImage(index);
            }}
            keyExtractor={(item, index) => `${item}-${index}`}
            renderItem={({ item }) => (
              <AppImage
                source={item ? { uri: item } : undefined}
                style={[styles.galleryImage, { backgroundColor: T.skeleton }]}
              />
            )}
          />
          {images.length > 1 ? (
            <>
              <View style={styles.imageCounter}>
                <Text style={styles.imageCounterText}>
                  {activeImage + 1}/{images.length}
                </Text>
              </View>
              <View style={styles.dots}>
                {images.map((_, index) => (
                  <View
                    key={`dot-${index}`}
                    style={[
                      styles.dot,
                      { backgroundColor: T.border },
                      index === activeImage && { backgroundColor: T.accent, width: 18 },
                    ]}
                  />
                ))}
              </View>
            </>
          ) : null}
          <HeartButton product={product} size={24} style={styles.heart} />
          {product.discount > 0 ? (
            <View style={[styles.discountBadge, { backgroundColor: T.price }]}>
              <Text style={styles.discountText} numberOfLines={1}>-{product.discount}%</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.body, { backgroundColor: T.card }]}>
          {product.brand ? (
            <Text style={[styles.brand, { color: T.muted }]} numberOfLines={1}>{product.brand}</Text>
          ) : (
            <Text style={[styles.category, { color: T.muted }]} numberOfLines={1}>{product.category}</Text>
          )}
          <Text style={[styles.title, { color: T.text }]} numberOfLines={2}>{product.name}</Text>

          {product.ratings > 0 ? (
            <Text style={[styles.rating, { color: T.muted }]}>
              {product.ratings.toFixed(1)} · {product.reviewCount} reviews
            </Text>
          ) : null}

          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: T.price }]}>{formatBdt(currentPrice)}</Text>
            {product.originalPrice > currentPrice ? (
              <Text style={[styles.originalPrice, { color: T.muted }]}>
                {formatBdt(product.originalPrice)}
              </Text>
            ) : null}
          </View>

          <Text
            style={[
              styles.stock,
              { color: outOfStock ? T.price : (currentStock <= 10 ? T.accent : T.success) },
            ]}
            numberOfLines={1}
          >
            {outOfStock
              ? 'Out of stock'
              : (currentStock <= 10 ? `Only ${currentStock} left` : 'In stock')}
          </Text>

          {product.colors?.length ? (
            <View ref={variantSectionRef} collapsable={false} style={styles.variantBlock}>
              <Text style={[styles.variantLabel, { color: T.text }]} numberOfLines={1}>
                Color: {selectedColor || 'Select'}
              </Text>
              <View style={styles.chips}>
                {product.colors.map((color) => {
                  const selected = color === selectedColor;
                  return (
                    <Pressable
                      key={color}
                      onPress={() => setSelectedColor(color)}
                      style={[
                        styles.chip,
                        { borderColor: T.border, backgroundColor: T.card },
                        selected && { borderColor: T.accent, backgroundColor: T.qtyBg },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: selected ? T.accent : T.text }]} numberOfLines={1}>
                        {color}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {product.sizes?.length ? (
            <View
              ref={product.colors?.length ? undefined : variantSectionRef}
              collapsable={false}
              style={styles.variantBlock}
            >
              <Text style={[styles.variantLabel, { color: T.text }]} numberOfLines={1}>
                Size: {selectedSize || 'Select'}
              </Text>
              <View style={styles.chips}>
                {product.sizes.map((size) => {
                  const selected = size === selectedSize;
                  return (
                    <Pressable
                      key={size}
                      onPress={() => setSelectedSize(size)}
                      style={[
                        styles.sizeChip,
                        { borderColor: T.border, backgroundColor: T.card },
                        selected && { borderColor: T.accent, backgroundColor: T.qtyBg },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: selected ? T.accent : T.text }]} numberOfLines={1}>
                        {size}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <Text style={[styles.qtyLabel, { color: T.text }]}>Quantity</Text>
          <View style={styles.qtyRow}>
            <Pressable
              style={({ pressed }) => [
                styles.qtyBtn,
                { backgroundColor: T.qtyBg, borderColor: T.border },
                pressed && { opacity: 0.7 },
              ]}
              onPress={decreaseQty}
            >
              <Text style={[styles.qtyBtnText, { color: T.text }]}>−</Text>
            </Pressable>
            <Text style={[styles.qtyValue, { color: T.text }]}>{quantity}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.qtyBtn,
                { backgroundColor: T.qtyBg, borderColor: T.border },
                pressed && { opacity: 0.7 },
              ]}
              onPress={increaseQty}
            >
              <Text style={[styles.qtyBtnText, { color: T.text }]}>+</Text>
            </Pressable>
          </View>

          {product.description ? (
            <Text style={[styles.description, { color: T.text }]}>{product.description}</Text>
          ) : null}
        </View>

        <ReviewsSection
          productId={product.id}
          product={product}
          navigation={navigation}
        />

        {relatedProducts.length > 0 ? (
          <View style={styles.relatedSection}>
            <Text style={[styles.relatedTitle, { color: T.text }]}>You might also like</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedList}>
              {relatedProducts.map((item) => (
                <ProductCard
                  key={String(item.id)}
                  product={item}
                  compact
                  colors={T}
                  onPress={openRelatedProduct}
                  onAddToCart={() => openRelatedProduct(item)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.sticky,
          {
            backgroundColor: T.card,
            borderTopColor: T.border,
            paddingBottom: Math.max(12, insets.bottom),
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.cartBtn,
            { borderColor: T.accent },
            pressed && { opacity: 0.85 },
            (outOfStock || adding) && styles.btnDisabled,
          ]}
          onPress={() => handleAddToCart(false)}
          disabled={outOfStock || adding}
        >
          {adding ? (
            <ActivityIndicator color={T.accent} />
          ) : (
            <Text style={[styles.cartBtnText, { color: T.accent }]}>Add to Cart</Text>
          )}
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.buyBtn,
            { backgroundColor: T.primaryBtn },
            pressed && { backgroundColor: T.primaryBtnPressed },
            (outOfStock || adding) && styles.btnDisabled,
          ]}
          onPress={() => handleAddToCart(true)}
          disabled={outOfStock || adding}
        >
          <Text style={[styles.buyBtnText, { color: T.primaryBtnText }]}>Buy Now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 16,
  },
  shareBtn: {
    marginRight: 4,
    padding: 4,
  },
  gallery: {
    position: 'relative',
  },
  galleryImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
  imageCounter: {
    position: 'absolute',
    bottom: 44,
    right: 16,
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  imageCounterText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heart: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  discountBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  discountText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  body: {
    marginTop: -8,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  brand: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
  rating: {
    fontSize: 13,
    marginTop: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  price: {
    fontSize: 22,
    fontWeight: '700',
  },
  originalPrice: {
    fontSize: 16,
    textDecorationLine: 'line-through',
  },
  stock: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  variantBlock: {
    marginTop: 18,
  },
  variantLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sizeChip: {
    minWidth: 44,
    height: 44,
    borderWidth: 1.5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
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
  description: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 18,
  },
  relatedSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  relatedTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  relatedList: {
    gap: 12,
    paddingRight: 16,
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  cartBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  buyBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
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
