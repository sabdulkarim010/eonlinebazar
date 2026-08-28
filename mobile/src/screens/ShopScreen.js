import { useCallback, useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import ProductGrid from '../components/ProductGrid';
import useProductStore from '../store/useProductStore';
import { useAppTheme } from '../store/useThemeStore';

const CATALOG_LIMIT = 100;

export default function ShopScreen({ navigation }) {
  const { colors } = useAppTheme();
  const fetchProducts = useProductStore((state) => state.fetchProducts);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchProducts({ limit: CATALOG_LIMIT });
  }, [fetchProducts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProducts({ limit: CATALOG_LIMIT, silent: true });
    setRefreshing(false);
  }, [fetchProducts]);

  return (
    <ProductGrid
      title="Shop"
      subtitle="Browse by name or category"
      searchPlaceholder="Search the shop"
      navigation={navigation}
      catalogLimit={CATALOG_LIMIT}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    />
  );
}
