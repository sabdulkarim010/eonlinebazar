import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useRef } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductGrid from '../components/ProductGrid';
import { useTheme } from '../theme/tokens';

function ShopHeader({ title, subtitle, onSearchPress }) {
  const insets = useSafeAreaInsets();
  const T = useTheme();

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: T.headerBg,
          borderBottomColor: T.headerBorder,
          paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 12 : 8) + 8,
        },
      ]}
    >
      <View style={styles.titleBlock}>
        <Text style={[styles.title, { color: T.headerText }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: T.headerSub }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Pressable
        style={[styles.iconBtn, { backgroundColor: T.iconBtnBg }]}
        onPress={onSearchPress}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Focus search"
      >
        <Ionicons name="search" size={20} color={T.headerText} />
      </Pressable>
    </View>
  );
}

function ShopScreen({ navigation, route }) {
  const T = useTheme();
  const searchInputRef = useRef(null);
  const flashOnly = route.params?.filter === 'flash-sale';
  const initialCategory = String(route.params?.category || '');
  const title = flashOnly ? 'Flash Sale' : 'Shop';
  const subtitle = flashOnly
    ? 'Limited-time deals'
    : 'Browse the full catalog';

  useEffect(() => {
    if (route.params?.focusSearch) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
        navigation.setParams({ focusSearch: undefined });
      }, 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [navigation, route.params?.focusSearch]);

  return (
    <View style={[styles.container, { backgroundColor: T.bg }]}>
      <ShopHeader
        title={title}
        subtitle={subtitle}
        onSearchPress={() => searchInputRef.current?.focus()}
      />
      <ProductGrid
        showScreenHeader={false}
        title={title}
        subtitle={subtitle}
        searchPlaceholder={flashOnly ? 'Search flash deals' : 'Search the shop'}
        navigation={navigation}
        flashOnly={flashOnly}
        initialCategory={initialCategory}
        showSort={!flashOnly}
        searchInputRef={searchInputRef}
        skeletonCount={8}
        errorEmptyType="error"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default memo(ShopScreen);
