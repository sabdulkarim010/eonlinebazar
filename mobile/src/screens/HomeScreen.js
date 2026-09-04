import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadFlashSaleCatalog, searchAPI } from '../api/search';
import CategoryGrid from '../components/CategoryGrid';
import EmptyState from '../components/EmptyState';
import ProductGrid, { ProductCard } from '../components/ProductGrid';
import { BannerSkeleton } from '../components/SkeletonBox';
import useAuthStore from '../store/useAuthStore';
import useCartStore from '../store/useCartStore';
import useToastStore from '../store/useToastStore';
import { useTheme } from '../theme/tokens';
import { haptic } from '../utils/haptics';
import { resolveMediaUrl } from '../utils/normalizeProduct';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function formatCountdown(endsAt) {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return 'Ended';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

function openBannerLink(navigation, linkUrl) {
  const raw = String(linkUrl || '').trim();
  if (!raw || raw === '#') return;

  if (/^https?:\/\//i.test(raw)) {
    Linking.openURL(raw).catch(() => {});
    return;
  }

  const productMatch = raw.match(/\/products?\/([^/?#]+)/i)
    || raw.match(/productId=([^&]+)/i);
  if (productMatch?.[1]) {
    navigation.navigate('ProductDetails', { productId: decodeURIComponent(productMatch[1]) });
    return;
  }

  const categoryMatch = raw.match(/[?&]category=([^&]+)/i)
    || raw.match(/\/categor(?:y|ies)\/([^/?#]+)/i);
  if (categoryMatch?.[1]) {
    navigation.navigate('Shop', { category: decodeURIComponent(categoryMatch[1]) });
    return;
  }

  navigation.navigate('Shop');
}

const HomeHeader = memo(function HomeHeader({ navigation, user, token }) {
  const insets = useSafeAreaInsets();
  const T = useTheme();
  const cartCount = useCartStore((state) =>
    state.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
  );
  const isLoggedIn = Boolean(token && user);
  const avatarUri = resolveMediaUrl(
    user?.avatar || user?.avatarUrl || user?.profilePicture || user?.image || ''
  );

  const openAccount = () => {
    if (isLoggedIn) {
      navigation.navigate('Main', { screen: 'Profile' });
      return;
    }
    navigation.navigate('Login');
  };

  const openCart = () => {
    navigation.navigate('Main', { screen: 'Cart' });
  };

  return (
    <View
      style={[
        hStyles.header,
        {
          backgroundColor: T.headerBg,
          borderBottomColor: T.headerBorder,
          paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 12 : 8) + 8,
        },
      ]}
    >
      <View style={hStyles.brand}>
        <Image
          source={require('../../assets/icon.png')}
          style={hStyles.logo}
          resizeMode="contain"
        />
        <View>
          <Text style={[hStyles.brandName, { color: T.headerText }]}>EOnlineBazar</Text>
          <Text style={[hStyles.brandSub, { color: T.headerSub }]}>Trusted Shopping</Text>
        </View>
      </View>
      <View style={hStyles.headerActions}>
        <Pressable
          style={[hStyles.iconBtn, { backgroundColor: T.iconBtnBg }]}
          onPress={openCart}
          accessibilityRole="button"
          accessibilityLabel="Open cart"
        >
          <Ionicons name="cart-outline" size={20} color={T.headerText} />
          {cartCount > 0 ? (
            <View style={hStyles.cartBadge}>
              <Text style={hStyles.cartBadgeText} numberOfLines={1}>
                {cartCount > 99 ? '99+' : cartCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          style={[hStyles.accountBtn, { backgroundColor: T.iconBtnBg }]}
          onPress={openAccount}
          accessibilityRole="button"
          accessibilityLabel={isLoggedIn ? 'Open profile' : 'Sign in'}
        >
          {isLoggedIn && avatarUri ? (
            <Image source={{ uri: avatarUri }} style={hStyles.accountAvatar} />
          ) : (
            <Text style={[hStyles.accountIcon, { color: T.headerText }]}>
              {isLoggedIn ? String(user?.name || 'U').slice(0, 1).toUpperCase() : '👤'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
});

const BannerSlider = memo(function BannerSlider({ banners, navigation, loading }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const flatRef = useRef(null);
  const intervalRef = useRef(null);
  const width = SCREEN_WIDTH;

  const startAutoScroll = useCallback(() => {
    if (!banners?.length || banners.length <= 1) return;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveIdx((prev) => {
        const next = (prev + 1) % banners.length;
        flatRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 4000);
  }, [banners]);

  useEffect(() => {
    startAutoScroll();
    return () => clearInterval(intervalRef.current);
  }, [startAutoScroll]);

  if (loading) {
    return (
      <View style={[bStyles.placeholder, { width, height: 190 }]}>
        <BannerSkeleton />
      </View>
    );
  }

  if (!banners?.length) return null;

  return (
    <View style={bStyles.wrapper}>
      <FlatList
        ref={flatRef}
        data={banners}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={width}
        decelerationRate="fast"
        keyExtractor={(item, index) => String(item._id || item.id || index)}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onScrollToIndexFailed={(info) => {
          flatRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: true,
          });
        }}
        onMomentumScrollEnd={(event) => {
          const idx = Math.round(event.nativeEvent.contentOffset.x / width);
          setActiveIdx(idx);
          startAutoScroll();
        }}
        renderItem={({ item }) => {
          const image = resolveMediaUrl(item.mobileImageUrl || item.imageUrl || item.image);
          return (
            <Pressable
              style={[bStyles.slide, { width }]}
              onPress={() => openBannerLink(navigation, item.linkUrl)}
            >
              <Image
                source={image ? { uri: image } : undefined}
                style={bStyles.img}
                resizeMode="cover"
              />
              <View style={bStyles.overlay} />
              {(item.title || item.subtitle || item.buttonText) ? (
                <View style={bStyles.textBlock}>
                  {item.title ? (
                    <Text style={bStyles.title} numberOfLines={1}>
                      {item.title}
                    </Text>
                  ) : null}
                  {item.subtitle ? (
                    <Text style={bStyles.subtitle} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                  {item.buttonText ? (
                    <View style={bStyles.cta}>
                      <Text style={bStyles.ctaText}>{item.buttonText}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
      {banners.length > 1 ? (
        <View style={bStyles.dots}>
          {banners.map((item, index) => (
            <View
              key={String(item._id || item.id || index)}
              style={[bStyles.dot, index === activeIdx && bStyles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

const FlashCountdown = memo(function FlashCountdown({ endsAt, T }) {
  const [timeLeft, setTimeLeft] = useState(() => (endsAt ? formatCountdown(endsAt) : ''));

  useEffect(() => {
    if (!endsAt) {
      setTimeLeft('');
      return undefined;
    }
    const tick = () => setTimeLeft(formatCountdown(endsAt));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  if (!timeLeft) return null;

  return (
    <View style={[styles.countdown, { backgroundColor: T.price }]}>
      <Text style={styles.countdownText}>{timeLeft}</Text>
    </View>
  );
});

const FlashSaleRow = memo(function FlashSaleRow({
  flashSale,
  flashTitle,
  flashEndTime,
  navigation,
  T,
  onAddToCart,
  onOpenProduct,
}) {
  if (!flashSale.length) return null;

  return (
    <View style={styles.flashSection}>
      <View style={styles.flashHeader}>
        <Text style={[styles.flashTitle, { color: T.text }]}>{flashTitle}</Text>
        <FlashCountdown endsAt={flashEndTime} T={T} />
        <Pressable onPress={() => navigation.navigate('Shop', { filter: 'flash-sale' })}>
          <Text style={[styles.seeAll, { color: T.link }]}>See all</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.flashList}
      >
        {flashSale.map((item) => (
          <ProductCard
            key={String(item.id)}
            product={item}
            compact
            colors={T}
            onAddToCart={onAddToCart}
            onPress={onOpenProduct}
          />
        ))}
      </ScrollView>
    </View>
  );
});

const HomeHero = memo(function HomeHero({
  banners,
  bannersLoading,
  flashSale,
  flashTitle,
  flashEndTime,
  navigation,
  T,
  onAddToCart,
  onOpenProduct,
}) {
  return (
    <View style={styles.hero}>
      <BannerSlider banners={banners} navigation={navigation} loading={bannersLoading} />
      <CategoryGrid navigation={navigation} colors={T} />
      <FlashSaleRow
        flashSale={flashSale}
        flashTitle={flashTitle}
        flashEndTime={flashEndTime}
        navigation={navigation}
        T={T}
        onAddToCart={onAddToCart}
        onOpenProduct={onOpenProduct}
      />
    </View>
  );
});

function HomeScreen({ navigation }) {
  const T = useTheme();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const addItem = useCartStore((state) => state.addItem);
  const showToast = useToastStore((state) => state.showToast);
  const [banners, setBanners] = useState([]);
  const [bannersLoading, setBannersLoading] = useState(true);
  const [flashSale, setFlashSale] = useState([]);
  const [flashTitle, setFlashTitle] = useState('Flash Sale');
  const [flashEndTime, setFlashEndTime] = useState(null);
  const [heroError, setHeroError] = useState('');

  const loadHero = useCallback(async () => {
    setBannersLoading(true);
    setHeroError('');
    try {
      const bannerRes = await searchAPI.getBanners();
      const list = Array.isArray(bannerRes.data?.banners) ? bannerRes.data.banners : [];
      setBanners(list);
    } catch {
      setBanners([]);
      setHeroError('Could not load homepage content. Check your connection.');
    } finally {
      setBannersLoading(false);
    }

    try {
      const { settings, products } = await loadFlashSaleCatalog(10);
      setFlashSale(products);
      setFlashTitle(settings.flashSaleTitle || 'Flash Sale');
      setFlashEndTime(settings.isActive ? settings.endsAt : null);
    } catch {
      setFlashSale([]);
      setFlashEndTime(null);
    }
  }, []);

  useEffect(() => {
    loadHero();
  }, [loadHero]);

  const onAddToCart = useCallback((product) => {
    haptic.success();
    addItem({ ...product, quantity: 1 });
    showToast(`${product.name} added to cart`, 'cart');
  }, [addItem, showToast]);

  const onOpenProduct = useCallback((product) => {
    navigation.navigate('ProductDetails', { productId: product.id });
  }, [navigation]);

  const listHeader = useMemo(
    () => (
      <HomeHero
        banners={banners}
        bannersLoading={bannersLoading}
        flashSale={flashSale}
        flashTitle={flashTitle}
        flashEndTime={flashEndTime}
        navigation={navigation}
        T={T}
        onAddToCart={onAddToCart}
        onOpenProduct={onOpenProduct}
      />
    ),
    [
      banners,
      bannersLoading,
      T,
      flashEndTime,
      flashSale,
      flashTitle,
      navigation,
      onAddToCart,
      onOpenProduct,
    ]
  );

  return (
    <View style={[styles.container, { backgroundColor: T.bg }]}>
      <HomeHeader navigation={navigation} user={user} token={token} />
      {heroError ? (
        <EmptyState
          type="network"
          subtitle={heroError}
          onAction={loadHero}
          style={styles.heroError}
        />
      ) : (
        <ProductGrid
          showScreenHeader={false}
          searchVariant="premium"
          searchNavigateOnly
          onSearchNavigate={() => navigation.navigate('Shop', { focusSearch: true })}
          searchPlaceholder="Search products, brands & categories..."
          navigation={navigation}
          maxItems={24}
          skeletonCount={6}
          errorEmptyType="network"
          listHeader={listHeader}
          onRefreshExtra={loadHero}
        />
      )}
    </View>
  );
}

const hStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  cartBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  accountBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  accountAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  accountIcon: {
    fontSize: 18,
    fontWeight: '700',
  },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 8,
  },
  brandName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  brandSub: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
});

const bStyles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  placeholder: {
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  slide: {
    height: 190,
    overflow: 'hidden',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  textBlock: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginTop: 2,
  },
  cta: {
    marginTop: 8,
    backgroundColor: '#f97316',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  dots: {
    position: 'absolute',
    bottom: 8,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: '#ffffff',
    width: 20,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroError: {
    flex: 1,
  },
  hero: {
    marginHorizontal: -16,
    marginBottom: 8,
  },
  flashSection: {
    marginBottom: 8,
  },
  flashHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  flashTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  countdown: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countdownText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  seeAll: {
    fontSize: 13,
    fontWeight: '700',
  },
  flashList: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
});

export default memo(HomeScreen);
