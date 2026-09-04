import { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { searchAPI } from '../api/search';
import { resolveMediaUrl } from '../utils/normalizeProduct';

function categoryId(cat) {
  return String(cat._id || cat.id || cat.slug || '');
}

function CategoryTile({ cat, onPress, colors }) {
  const accent = String(cat.color || '#f97316').trim() || '#f97316';
  const imageUri = resolveMediaUrl(cat.iconUrl || cat.imageUrl || cat.image);
  const count = Number(cat.productCount) || 0;
  const letter = String(cat.name || 'C').trim().charAt(0).toUpperCase() || 'C';

  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      onPress={() => onPress(cat)}
      accessibilityRole="button"
      accessibilityLabel={cat.name}
    >
      <View style={styles.iconRingOuter}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.iconImage} resizeMode="cover" />
        ) : (
          <View style={[styles.letterCircle, { backgroundColor: accent }]}>
            <View style={[styles.letterInner, { backgroundColor: `${accent}cc` }]}>
              <Text style={styles.letterText}>{letter}</Text>
            </View>
          </View>
        )}
        {count > 0 ? (
          <View style={[styles.countBadge, { backgroundColor: accent }]}>
            <Text style={styles.countText} numberOfLines={1}>{count > 99 ? '99+' : count}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.label, { color: colors.text }]} numberOfLines={2}>
        {cat.name}
      </Text>
    </Pressable>
  );
}

function CategoryGrid({ navigation, colors, onLoaded }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await searchAPI.getHomepageCategories();
      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.categories) ? data.categories : []);
      setCategories(list);
      onLoaded?.(list.length);
    } catch {
      setCategories([]);
      onLoaded?.(0);
    } finally {
      setLoading(false);
    }
  }, [onLoaded]);

  useEffect(() => {
    load();
  }, [load]);

  const openCategory = useCallback((cat) => {
    const id = categoryId(cat);
    navigation.navigate('Shop', { category: id || cat.slug || '' });
  }, [navigation]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!categories.length) return null;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>Shop by Category</Text>
        <Pressable onPress={() => navigation.navigate('Shop')} hitSlop={8}>
          <Text style={[styles.seeAll, { color: colors.link }]}>See all</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {categories.map((cat) => (
          <CategoryTile
            key={categoryId(cat) || cat.name}
            cat={cat}
            colors={colors}
            onPress={openCategory}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  seeAll: {
    fontSize: 13,
    fontWeight: '700',
  },
  scroll: {
    gap: 14,
    paddingRight: 12,
  },
  loadingWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  tile: {
    width: 76,
    alignItems: 'center',
  },
  tilePressed: {
    opacity: 0.85,
  },
  iconRingOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 6,
  },
  iconImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  letterCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  countBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  countText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
  },
});

export default memo(CategoryGrid);
