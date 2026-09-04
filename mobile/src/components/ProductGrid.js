import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  extractSearchPagination,
  flattenNavbarCategories,
  loadFlashSaleCatalog,
  mapSearchProducts,
  searchAPI,
} from '../api/search';
import useCartStore from '../store/useCartStore';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';
import { useTheme } from '../theme/tokens';
import { haptic } from '../utils/haptics';
import EmptyState from './EmptyState';
import HeartButton from './HeartButton';
import { ProductSkeletonGrid } from './SkeletonBox';
import ScreenHeader from './ScreenHeader';
import SortBottomSheet from './SortBottomSheet';
import StarRating from './StarRating';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;
const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'price_asc', label: 'Price: Low to High' },
  { id: 'price_desc', label: 'Price: High to Low' },
  { id: 'rating_desc', label: 'Best Rating' },
  { id: 'popular', label: 'Most Popular' },
];

function productDiscountPercent(product) {
  if (product.flashSaleActive && product.originalPrice > product.price) {
    return Number(product.flashSaleDiscountPercent || product.discount) || 0;
  }
  if (Number(product.discount) > 0) return Number(product.discount);
  const original = Number(product.originalPrice) || 0;
  const price = Number(product.price) || 0;
  if (original > price && price >= 0) {
    return Math.round((1 - price / original) * 100);
  }
  return 0;
}

function productStockState(product) {
  const stock = Number(product.stock) || 0;
  if (product.inStock === false || stock <= 0) return 'out';
  if (stock <= 5) return 'low';
  return 'in';
}

const GRID_CARD_W = (Dimensions.get('window').width - 44) / 2;
const COMPACT_CARD_W = 148;
const PLACEHOLDER_IMAGE = require('../../assets/icon.png');

export const ProductCard = memo(function ProductCard({
  product,
  onAddToCart,
  onPress,
  colors,
  compact = false,
  dark,
}) {
  const themeFromHook = useTheme();
  const { isDark } = useAppTheme();
  const T = colors || themeFromHook;
  const isDarkMode = dark ?? isDark;
  const scale = useRef(new Animated.Value(1)).current;
  const [imgFailed, setImgFailed] = useState(false);

  const cardWidth = compact ? COMPACT_CARD_W : GRID_CARD_W;
  const discountPct = productDiscountPercent(product);
  const stockState = productStockState(product);
  const isOOS = stockState === 'out';
  const isLimited = stockState === 'low';
  const isFlashSale = Boolean(product.flashSaleActive);
  const imageUri = product.images?.[0] || product.image;
  const hasImage = Boolean(!imgFailed && imageUri);
  const imageSource = hasImage ? { uri: imageUri } : PLACEHOLDER_IMAGE;

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const openProduct = () => onPress?.(product);

  return (
    <Animated.View
      style={[
        pcStyles.card,
        {
          width: cardWidth,
          backgroundColor: T.card,
          transform: [{ scale }],
        },
        compact && pcStyles.cardCompact,
        isDarkMode
          ? {
            shadowColor: '#000',
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 4,
          }
          : {
            shadowColor: '#94a3b8',
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 3,
          },
      ]}
    >
      <Pressable
        onPress={openProduct}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <View style={[pcStyles.imgWrap, { height: cardWidth * 1.1, backgroundColor: T.cardSecondary || T.imageBg }]}>
          <Image
            source={imageSource}
            style={[pcStyles.img, !hasImage && pcStyles.imgPlaceholder]}
            resizeMode={hasImage ? 'cover' : 'contain'}
            onError={() => setImgFailed(true)}
          />

          <View style={pcStyles.badgesTop}>
            {discountPct > 0 ? (
              <View style={pcStyles.discBadge}>
                <Text style={pcStyles.discText}>-{discountPct}%</Text>
              </View>
            ) : null}
            {isFlashSale ? (
              <View style={pcStyles.flashBadge}>
                <Text style={pcStyles.flashText}>⚡ Flash</Text>
              </View>
            ) : null}
          </View>

          {isOOS ? (
            <View style={pcStyles.oosOverlay}>
              <Text style={pcStyles.oosText}>Out of Stock</Text>
            </View>
          ) : null}
          {isLimited && !isOOS ? (
            <View style={pcStyles.limitedBadge}>
              <Text style={pcStyles.limitedText}>
                Only {Number(product.stock) || 0} left
              </Text>
            </View>
          ) : null}

          <HeartButton product={product} style={pcStyles.heart} size={compact ? 18 : 20} />
        </View>

        <View style={pcStyles.info}>
          <Text
            style={[pcStyles.name, { color: T.text }]}
            numberOfLines={2}
          >
            {product.name}
          </Text>

          {product.ratings > 0 ? (
            <View style={pcStyles.ratingRow}>
              <StarRating
                value={product.ratings}
                size={11}
                mutedColor={T.textMuted || T.muted}
                showValue={false}
              />
              <Text style={[pcStyles.ratingCount, { color: T.textMuted || T.muted }]}>
                ({product.reviewCount || 0})
              </Text>
            </View>
          ) : null}

          <View style={pcStyles.priceRow}>
            <Text style={[pcStyles.price, { color: T.accent }]}>
              ৳{Number(product.price || 0).toLocaleString('en-US')}
            </Text>
            {Number(product.originalPrice) > Number(product.price) ? (
              <Text style={[pcStyles.originalPrice, { color: T.textMuted || T.muted }]}>
                ৳{Number(product.originalPrice).toLocaleString('en-US')}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>

      {compact ? null : (
        <Pressable
          style={[
            pcStyles.addBtn,
            { backgroundColor: isOOS ? T.border : T.accent },
          ]}
          onPress={() => !isOOS && onAddToCart?.(product)}
          disabled={isOOS}
        >
          {isOOS ? (
            <Text style={[pcStyles.addBtnText, { color: T.textMuted || T.muted }]}>
              Unavailable
            </Text>
          ) : (
            <>
              <Ionicons name="cart-outline" size={14} color="#fff" />
              <Text style={pcStyles.addBtnText}>Add to Cart</Text>
            </>
          )}
        </Pressable>
      )}
    </Animated.View>
  );
});

const pcStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
  },
  cardCompact: {
    flexGrow: 0,
    flexShrink: 0,
  },
  imgWrap: {
    backgroundColor: '#f8fafc',
    position: 'relative',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  imgPlaceholder: {
    opacity: 0.35,
    padding: 24,
  },
  badgesTop: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'column',
    gap: 4,
  },
  discBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  discText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  flashBadge: {
    backgroundColor: '#f97316',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  flashText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  oosOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  oosText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  limitedBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(239,68,68,0.9)',
    paddingVertical: 4,
    alignItems: 'center',
  },
  limitedText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  heart: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  info: {
    padding: 10,
    gap: 4,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    minHeight: 36,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingCount: {
    fontSize: 10,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  price: {
    fontSize: 16,
    fontWeight: '800',
  },
  originalPrice: {
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginHorizontal: 10,
    marginBottom: 10,
    paddingVertical: 9,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});

function ProductGrid({
  title,
  subtitle,
  navigation,
  searchPlaceholder,
  searchVariant = 'default',
  maxItems,
  listHeader,
  flashOnly = false,
  initialCategory = '',
  showSort = false,
  refreshControl,
  onRefreshExtra,
  showScreenHeader = true,
  searchInputRef,
  skeletonCount = 8,
  errorEmptyType = 'error',
  searchNavigateOnly = false,
  onSearchNavigate,
}) {
  const { colors, isDark } = useAppTheme();
  const addItem = useCartStore((state) => state.addItem);
  const showToast = useToastStore((state) => state.showToast);
  const internalSearchRef = useRef(null);
  const searchRef = searchInputRef || internalSearchRef;
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState([{ _id: '', name: 'All' }]);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory || '');
  const [sortBy, setSortBy] = useState('newest');
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searching, setSearching] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const requestSeq = useRef(0);
  const queryRef = useRef('');
  const debounceTimerRef = useRef(null);

  useEffect(() => {
    setSelectedCategory(initialCategory || '');
  }, [initialCategory]);

  useEffect(() => () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
  }, []);

  useEffect(() => {
    searchAPI.getCategories()
      .then((res) => {
        const tree = res.data?.data || res.data?.categories || [];
        setCategories(flattenNavbarCategories(tree));
      })
      .catch(() => {});
  }, []);

  const performSearch = useCallback(async (term, nextPage = 1, { silent = false } = {}) => {
    const q = String(term ?? queryRef.current).trim();
    const seq = ++requestSeq.current;
    const limit = maxItems || PAGE_SIZE;
    if (nextPage === 1) {
      if (!silent) setSearching(true);
      setError('');
    } else {
      setLoadingMore(true);
    }

    try {
      let products = [];
      let more = false;
      let resultTotal = 0;

      if (flashOnly) {
        const { products: flashProducts } = await loadFlashSaleCatalog(20);
        const needle = q.toLowerCase();
        products = needle
          ? flashProducts.filter((item) => item.name.toLowerCase().includes(needle))
          : flashProducts;
        more = false;
        resultTotal = products.length;
      } else {
        const params = {
          q,
          page: nextPage,
          limit,
          sort: sortBy,
        };
        if (selectedCategory) params.category = selectedCategory;
        const { data } = await searchAPI.search(params);
        if (data?.success === false) {
          throw new Error(data.message || 'Search failed.');
        }
        products = mapSearchProducts(data);
        const pagination = extractSearchPagination(data);
        more = maxItems ? false : pagination.hasMore && products.length > 0;
        resultTotal = pagination.totalProducts || products.length;
      }

      if (seq !== requestSeq.current) return;

      setResults((current) => (nextPage === 1 ? products : [...current, ...products]));
      setPage(nextPage);
      setHasMore(more);
      if (nextPage === 1) {
        setTotalProducts(resultTotal);
      }
    } catch (err) {
      if (seq !== requestSeq.current) return;
      const message = err.response?.data?.message || err.message || 'Search failed.';
      if (nextPage === 1) {
        setResults([]);
        setError(message);
      }
      setHasMore(false);
    } finally {
      if (seq === requestSeq.current) {
        setSearching(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [flashOnly, maxItems, selectedCategory, sortBy]);

  const scheduleSearch = useCallback((term) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      performSearch(term, 1);
    }, SEARCH_DEBOUNCE_MS);
  }, [performSearch]);

  const flushSearch = useCallback((term) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    performSearch(term ?? queryRef.current, 1);
  }, [performSearch]);

  const clearSearch = useCallback(() => {
    setQuery('');
    queryRef.current = '';
    setSelectedCategory('');
    setSortBy('newest');
    flushSearch('');
  }, [flushSearch]);

  const handleQueryChange = useCallback((text) => {
    setQuery(text);
    queryRef.current = text;
    scheduleSearch(text);
  }, [scheduleSearch]);

  const handleSubmitSearch = useCallback(() => {
    flushSearch(queryRef.current);
  }, [flushSearch]);

  useEffect(() => {
    performSearch(queryRef.current, 1);
  }, [performSearch]);

  const handleAddToCart = useCallback(
    (product) => {
      const hasVariants = (product.colors?.length > 0)
        || (product.sizes?.length > 0)
        || (product.variants?.length > 0);

      if (hasVariants) {
        navigation.navigate('ProductDetails', {
          productId: product.id || product._id,
          autoOpenCart: true,
        });
        return;
      }

      if (product.inStock === false || (Number(product.stock) || 0) <= 0) {
        showToast('Out of stock', 'error');
        return;
      }

      haptic.success();
      addItem(product, 1, null);
      showToast(`${product.name} added to cart!`, 'cart');
    },
    [addItem, navigation, showToast]
  );

  const openProduct = useCallback(
    (product) => {
      navigation.navigate('ProductDetails', { productId: product.id });
    },
    [navigation]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      performSearch(queryRef.current, 1, { silent: true }),
      Promise.resolve(onRefreshExtra?.()),
    ]);
  }, [onRefreshExtra, performSearch]);

  const loadMore = useCallback(() => {
    if (!hasMore || searching || loadingMore || flashOnly || maxItems) return;
    performSearch(queryRef.current, page + 1);
  }, [flashOnly, hasMore, loadingMore, maxItems, page, performSearch, searching]);

  const renderItem = useCallback(
    ({ item }) => (
      <ProductCard
        product={item}
        onAddToCart={handleAddToCart}
        onPress={openProduct}
        dark={isDark}
      />
    ),
    [handleAddToCart, isDark, openProduct]
  );

  const listRefreshControl = refreshControl || (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.accent}
      colors={[colors.accent]}
    />
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (query.trim()) count += 1;
    if (selectedCategory) count += 1;
    if (showSort && sortBy !== 'newest') count += 1;
    return count;
  }, [query, selectedCategory, showSort, sortBy]);

  const sortLabel = SORT_OPTIONS.find((item) => item.id === sortBy)?.label || 'Sort';

  const filtersHeader = useMemo(
    () => (
      <View style={styles.filters}>
        {listHeader}
        {!searching && !flashOnly && results.length > 0 ? (
          <Text style={[styles.resultsCount, { color: colors.muted }]}>
            Showing {totalProducts || results.length} product{(totalProducts || results.length) === 1 ? '' : 's'}
          </Text>
        ) : null}
        {categories.length > 1 && !flashOnly ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {categories.map((item) => {
              const selected = item._id === selectedCategory;
              return (
                <Pressable
                  key={item._id || 'all'}
                  onPress={() => setSelectedCategory(item._id)}
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
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
        {showSort && !flashOnly ? (
          <View style={styles.sortRow}>
            <Pressable
              style={[
                styles.sortBtn,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => setSortSheetOpen(true)}
            >
              <Ionicons name="funnel-outline" size={16} color={colors.accent} />
              <Text style={[styles.sortBtnText, { color: colors.text }]} numberOfLines={1}>
                {sortLabel}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.muted} />
            </Pressable>
            {activeFilterCount > 0 ? (
              <View style={[styles.filterBadge, { backgroundColor: colors.accent }]}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {flashOnly ? (
          <Pressable onPress={() => navigation.setParams({ filter: undefined })} hitSlop={8}>
            <Text style={[styles.inlineError, { color: colors.link }]}>Browse all products</Text>
          </Pressable>
        ) : null}
        {error && results.length > 0 ? (
          <Text style={[styles.inlineError, { color: colors.price }]}>{error}</Text>
        ) : null}
      </View>
    ),
    [
      activeFilterCount,
      categories,
      colors,
      error,
      flashOnly,
      listHeader,
      navigation,
      results.length,
      searching,
      selectedCategory,
      showSort,
      sortLabel,
      totalProducts,
    ]
  );

  const listEmpty = useCallback(() => {
    if (searching) {
      return <ProductSkeletonGrid count={skeletonCount} />;
    }

    if (error) {
      return (
        <EmptyState
          type={errorEmptyType}
          subtitle={error}
          onAction={() => performSearch(queryRef.current, 1)}
          style={styles.emptyState}
        />
      );
    }

    const hasFilters = Boolean(query.trim() || selectedCategory || sortBy !== 'newest');
    return (
      <EmptyState
        type="search"
        title={hasFilters ? undefined : 'No Products Yet'}
        actionText={hasFilters ? 'Clear filters' : undefined}
        onAction={hasFilters ? clearSearch : undefined}
        subtitle={
          hasFilters
            ? 'Try different keywords or browse by category.'
            : 'No products available right now.'
        }
        style={styles.emptyState}
      />
    );
  }, [
    clearSearch,
    error,
    errorEmptyType,
    performSearch,
    query,
    searching,
    selectedCategory,
    skeletonCount,
    sortBy,
  ]);

  const isPremiumSearch = searchVariant === 'premium';
  const premiumSearchBg = isDark ? '#1e293b' : '#f3f4f6';

  const searchControls = isPremiumSearch ? (
    searchNavigateOnly ? (
      <Pressable
        style={[
          styles.premiumShell,
          {
            backgroundColor: premiumSearchBg,
            borderColor: isDark ? '#334155' : '#e5e7eb',
          },
        ]}
        onPress={() => onSearchNavigate?.()}
        accessibilityRole="button"
        accessibilityLabel="Search products"
      >
        <Text style={[styles.premiumPlaceholder, { color: colors.muted }]} numberOfLines={1}>
          {searchPlaceholder || 'Search products, brands & categories...'}
        </Text>
        <Ionicons name="search-outline" size={20} color={colors.muted} />
      </Pressable>
    ) : (
    <View
      style={[
        styles.premiumShell,
        {
          backgroundColor: premiumSearchBg,
          borderColor: isDark ? '#334155' : '#e5e7eb',
        },
      ]}
    >
      <TextInput
        ref={searchRef}
        style={[styles.premiumInput, { color: colors.text }]}
        value={query}
        onChangeText={handleQueryChange}
        onSubmitEditing={handleSubmitSearch}
        returnKeyType="search"
        blurOnSubmit
        placeholder={searchPlaceholder || 'Search products, brands & categories...'}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
      />
      <Ionicons name="search-outline" size={20} color={colors.muted} />
    </View>
    )
  ) : (
    <>
      <TextInput
        ref={searchRef}
        style={[
          styles.search,
          {
            backgroundColor: colors.inputBg,
            borderColor: colors.border,
            color: colors.text,
          },
        ]}
        value={query}
        onChangeText={handleQueryChange}
        onSubmitEditing={handleSubmitSearch}
        returnKeyType="search"
        blurOnSubmit
        placeholder={searchPlaceholder || 'Search products'}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
      />
      <Pressable
        onPress={handleSubmitSearch}
        accessibilityRole="button"
        accessibilityLabel="Search"
        style={({ pressed }) => [
          styles.searchBtn,
          { backgroundColor: colors.primaryBtn },
          pressed && { backgroundColor: colors.primaryBtnPressed },
        ]}
      >
        <Ionicons name="search" size={20} color={colors.primaryBtnText} />
      </Pressable>
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.searchChrome}>
        {showScreenHeader ? (
          <ScreenHeader title={title} subtitle={subtitle} />
        ) : null}
        <View
          style={[
            isPremiumSearch ? styles.premiumRow : styles.searchRow,
            !showScreenHeader && !isPremiumSearch && styles.searchRowCompact,
            !showScreenHeader && isPremiumSearch && styles.premiumRowCompact,
          ]}
        >
          {searchControls}
        </View>
      </View>
      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        renderItem={renderItem}
        columnWrapperStyle={results.length > 0 ? styles.row : undefined}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={listRefreshControl}
        ListHeaderComponent={filtersHeader}
        ListEmptyComponent={listEmpty}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.footerSpinner} color={colors.accent} />
          ) : null
        }
      />
      <SortBottomSheet
        visible={sortSheetOpen}
        onClose={() => setSortSheetOpen(false)}
        options={SORT_OPTIONS}
        selectedId={sortBy}
        onSelect={setSortBy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchChrome: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 8,
  },
  searchRowCompact: {
    marginTop: 0,
  },
  premiumRow: {
    marginTop: 14,
  },
  premiumRowCompact: {
    marginTop: 0,
  },
  premiumShell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
    gap: 12,
  },
  premiumInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Platform.OS === 'ios' ? 2 : 0,
    paddingRight: 4,
    minHeight: 24,
  },
  search: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: {
    paddingBottom: 8,
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
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  resultsCount: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  sortBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sortBtnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  filterBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  filterBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  premiumPlaceholder: {
    flex: 1,
    fontSize: 16,
  },
  row: {
    gap: 12,
    marginBottom: 12,
    justifyContent: 'space-between',
  },
  emptyState: {
    paddingTop: 24,
    paddingBottom: 32,
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
  footerSpinner: {
    marginVertical: 16,
  },
});

export default memo(ProductGrid);
