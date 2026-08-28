import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import useCartStore from '../store/useCartStore';
import useProductStore from '../store/useProductStore';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';
import HeartButton from './HeartButton';
import ScreenHeader from './ScreenHeader';

function formatBdt(price) {
  return `৳${Number(price).toLocaleString('en-US')}`;
}

function ProductCard({ product, onAddToCart, onPress, colors }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View>
        <Pressable onPress={() => onPress(product)}>
          <Image
            source={product.image ? { uri: product.image } : undefined}
            style={[styles.image, { backgroundColor: colors.imageBg }]}
          />
        </Pressable>
        <HeartButton product={product} style={styles.heart} />
      </View>
      <Pressable onPress={() => onPress(product)}>
        <View style={styles.cardBody}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
            {product.name}
          </Text>
          <Text style={[styles.category, { color: colors.muted }]}>{product.category}</Text>
          <Text style={[styles.price, { color: colors.price }]}>{formatBdt(product.price)}</Text>
        </View>
      </Pressable>
      <View style={styles.cardActions}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primaryBtn },
            pressed && { backgroundColor: colors.primaryBtnPressed },
          ]}
          onPress={() => onAddToCart(product)}
        >
          <Text style={[styles.buttonText, { color: colors.primaryBtnText }]}>Add to Cart</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ProductGrid({
  title,
  subtitle,
  navigation,
  searchPlaceholder,
  maxItems,
  catalogLimit = 100,
  refreshControl,
}) {
  const { colors } = useAppTheme();
  const products = useProductStore((state) => state.products);
  const isLoading = useProductStore((state) => state.isLoading);
  const error = useProductStore((state) => state.error);
  const fetchProducts = useProductStore((state) => state.fetchProducts);
  const addItem = useCartStore((state) => state.addItem);
  const showToast = useToastStore((state) => state.showToast);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [refreshing, setRefreshing] = useState(false);

  const catalog = useMemo(
    () => (maxItems ? products.slice(0, maxItems) : products),
    [products, maxItems]
  );

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(catalog.map((item) => item.category).filter(Boolean)))],
    [catalog]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.filter((product) => {
      const matchesCategory = category === 'All' || product.category === category;
      const matchesQuery =
        !needle
        || product.name.toLowerCase().includes(needle)
        || String(product.category || '').toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [catalog, query, category]);

  useEffect(() => {
    if (!categories.includes(category)) setCategory('All');
  }, [categories, category]);

  const handleAddToCart = useCallback(
    (product) => {
      addItem({ ...product, quantity: 1 });
      showToast(`${product.name} added to cart`);
    },
    [addItem, showToast]
  );

  const openProduct = useCallback(
    (product) => {
      navigation.navigate('ProductDetails', { productId: product.id });
    },
    [navigation]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProducts({ limit: catalogLimit, silent: true });
    setRefreshing(false);
  }, [catalogLimit, fetchProducts]);

  const listRefreshControl = refreshControl || (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.accent}
      colors={[colors.accent]}
    />
  );

  const listEmpty = () => {
    if (isLoading && products.length === 0) {
      return (
        <View style={styles.stateWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.stateText, { color: colors.muted }]}>Loading products…</Text>
        </View>
      );
    }

    if (error && products.length === 0) {
      return (
        <View style={styles.stateWrap}>
          <Text style={[styles.stateTitle, { color: colors.text }]}>Could not load products</Text>
          <Text style={[styles.stateText, { color: colors.muted }]}>{error}</Text>
          <Pressable
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: colors.primaryBtn },
              pressed && { backgroundColor: colors.primaryBtnPressed },
            ]}
            onPress={() => fetchProducts({ limit: catalogLimit })}
          >
            <Text style={[styles.retryText, { color: colors.primaryBtnText }]}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <Text style={[styles.empty, { color: colors.muted }]}>
        {query.trim() || category !== 'All'
          ? 'No products match your search.'
          : 'No products available right now.'}
      </Text>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <ScreenHeader title={title} subtitle={subtitle} />
        <TextInput
          style={[
            styles.search,
            {
              backgroundColor: colors.inputBg,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          value={query}
          onChangeText={setQuery}
          placeholder={searchPlaceholder || 'Search products'}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {categories.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {categories.map((item) => {
              const selected = item === category;
              return (
                <Pressable
                  key={item}
                  onPress={() => setCategory(item)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.chipSelected : colors.card,
                      borderColor: selected ? colors.chipSelected : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? colors.chipSelectedText : colors.text },
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
        {error && products.length > 0 ? (
          <Text style={[styles.inlineError, { color: colors.price }]}>{error}</Text>
        ) : null}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            onAddToCart={handleAddToCart}
            onPress={openProduct}
            colors={colors}
          />
        )}
        columnWrapperStyle={filtered.length > 0 ? styles.row : undefined}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={listRefreshControl}
        ListEmptyComponent={listEmpty}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 8,
  },
  search: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  chips: {
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inlineError: {
    fontSize: 13,
    marginTop: 10,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    flexGrow: 1,
  },
  row: {
    gap: 12,
    marginBottom: 12,
  },
  empty: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 32,
  },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingHorizontal: 24,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  stateText: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
  },
  retryBtn: {
    marginTop: 16,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '700',
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
  cardBody: {
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  cardActions: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    minHeight: 36,
  },
  category: {
    fontSize: 12,
    marginTop: 4,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
  },
  button: {
    marginTop: 10,
    borderRadius: 20,
    paddingVertical: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
