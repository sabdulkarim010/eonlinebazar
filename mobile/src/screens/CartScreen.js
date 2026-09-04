import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppImage from '../components/AppImage';
import EmptyState from '../components/EmptyState';
import useCartStore from '../store/useCartStore';
import { useTheme } from '../theme/tokens';
import useToastStore from '../store/useToastStore';
import { haptic } from '../utils/haptics';

function formatBdt(price) {
  return `৳${Number(price).toLocaleString('en-US')}`;
}

function cartItemProductId(item) {
  return item.product?._id || item.product?.id || item.productId || item.id || item._id;
}

function cartItemImageUri(item) {
  return item.image || item.product?.image || item.product?.images?.[0] || '';
}

function cartVariantLabel(item) {
  const color = item.variant?.color || item.selectedColor;
  const size = item.variant?.size || item.selectedSize;
  return [color, size].filter(Boolean).join(' · ');
}

function CartLine({
  item,
  selected,
  onToggleSelected,
  onIncrease,
  onDecrease,
  onRemove,
  onOpenProduct,
  T,
}) {
  const lineTotal = Number(item.price) * Number(item.quantity);
  const variantText = cartVariantLabel(item);
  const imageUri = cartItemImageUri(item);
  const swipeRef = useRef(null);

  const renderRightActions = () => (
    <Pressable
      style={styles.deleteAction}
      onPress={() => {
        swipeRef.current?.close();
        onRemove(item.key || item.id);
      }}
    >
      <Ionicons name="trash-outline" size={22} color="#ffffff" />
      <Text style={styles.deleteText}>Delete</Text>
    </Pressable>
  );

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
    >
      <View style={[styles.line, { backgroundColor: T.card, borderColor: T.border }]}>
        <Pressable
          style={styles.checkboxBtn}
          onPress={() => onToggleSelected(item)}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
        >
          <Ionicons
            name={selected ? 'checkbox' : 'square-outline'}
            size={24}
            color={selected ? T.accent : T.muted}
          />
        </Pressable>
        <Pressable onPress={() => onOpenProduct(item)}>
          <AppImage
            source={imageUri ? { uri: imageUri } : undefined}
            style={[styles.lineImage, { backgroundColor: T.skeleton }]}
          />
        </Pressable>
        <View style={styles.lineBody}>
          <Text style={[styles.lineName, { color: T.text }]} numberOfLines={2}>
            {item.name}
          </Text>
          {variantText ? (
            <Text style={[styles.variantText, { color: T.muted, backgroundColor: T.qtyBg }]} numberOfLines={1}>
              {variantText}
            </Text>
          ) : null}
          <Text style={[styles.lineCategory, { color: T.muted }]} numberOfLines={1}>{item.category}</Text>
          <Text style={[styles.linePrice, { color: T.price }]}>{formatBdt(lineTotal)}</Text>
          <View style={styles.lineActions}>
            <View style={styles.qtyRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.qtyBtn,
                  { backgroundColor: T.qtyBg, borderColor: T.border },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => onDecrease(item)}
              >
                <Text style={[styles.qtyBtnText, { color: T.text }]}>−</Text>
              </Pressable>
              <Text style={[styles.qtyValue, { color: T.text }]}>{item.quantity}</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.qtyBtn,
                  { backgroundColor: T.qtyBg, borderColor: T.border },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => onIncrease(item)}
              >
                <Text style={[styles.qtyBtnText, { color: T.text }]}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Swipeable>
  );
}

export default function CartScreen({ navigation }) {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const items = useCartStore((state) => state.items);
  const appliedCoupon = useCartStore((state) => state.appliedCoupon);
  const clearAppliedCoupon = useCartStore((state) => state.clearAppliedCoupon);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const toggleItemSelection = useCartStore((state) => state.toggleItemSelection);
  const toggleSelectAll = useCartStore((state) => state.toggleSelectAll);
  const showToast = useToastStore((state) => state.showToast);

  const selectedItems = useMemo(
    () => items.filter((item) => item.selected !== false),
    [items]
  );
  const selectedCount = selectedItems.length;
  const selectedTotal = useMemo(
    () => selectedItems.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.quantity || 1),
      0
    ),
    [selectedItems]
  );
  const couponDiscount = Number(appliedCoupon?.discount) || 0;
  const checkoutTotal = Math.max(0, selectedTotal - couponDiscount);
  const allSelected = items.length > 0 && selectedCount === items.length;
  const canCheckout = selectedCount > 0;

  const openProduct = useCallback(
    (item) => {
      const productId = cartItemProductId(item);
      if (!productId) return;
      navigation.navigate('ProductDetails', { productId });
    },
    [navigation]
  );

  const increaseQty = useCallback(
    (item) => {
      updateQuantity(item.key || item.id, item.quantity + 1);
    },
    [updateQuantity]
  );

  const decreaseQty = useCallback(
    (item) => {
      updateQuantity(item.key || item.id, item.quantity - 1);
    },
    [updateQuantity]
  );

  const handleToggleItem = useCallback(
    (item) => {
      toggleItemSelection(item.key || item.id, item.selected === false);
    },
    [toggleItemSelection]
  );

  const handleToggleSelectAll = useCallback(() => {
    toggleSelectAll(!allSelected);
  }, [allSelected, toggleSelectAll]);

  const handleRemoveItem = useCallback((key) => {
    haptic.medium();
    removeItem(key);
  }, [removeItem]);

  const listHeader = useMemo(() => (
    <>
      <Pressable
        style={[styles.selectAllRow, { borderColor: T.border, backgroundColor: T.card }]}
        onPress={handleToggleSelectAll}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: allSelected }}
      >
        <Ionicons
          name={allSelected ? 'checkbox' : 'square-outline'}
          size={22}
          color={allSelected ? T.accent : T.muted}
        />
        <Text style={[styles.selectAllText, { color: T.text }]}>Select all</Text>
        <Text style={[styles.selectAllCount, { color: T.muted }]} numberOfLines={1}>
          {selectedCount} of {items.length} selected
        </Text>
      </Pressable>
      {appliedCoupon?.code ? (
        <View style={[styles.couponChip, { backgroundColor: T.accentMuted, borderColor: T.accent }]}>
          <Ionicons name="pricetag" size={14} color={T.accent} />
          <Text style={[styles.couponChipText, { color: T.accent }]} numberOfLines={1}>
            {appliedCoupon.code}
            {couponDiscount > 0 ? ` (−${formatBdt(couponDiscount)})` : ''}
          </Text>
          <Pressable onPress={() => clearAppliedCoupon()} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={T.muted} />
          </Pressable>
        </View>
      ) : null}
    </>
  ), [
    T,
    allSelected,
    appliedCoupon,
    clearAppliedCoupon,
    couponDiscount,
    handleToggleSelectAll,
    items.length,
    selectedCount,
  ]);

  if (items.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: T.bg }]}>
        <EmptyState
          type="cart"
          onAction={() => navigation.navigate('Main', { screen: 'Shop' })}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: T.bg }]}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.key || item.id)}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <CartLine
            item={item}
            selected={item.selected !== false}
            T={T}
            onToggleSelected={handleToggleItem}
            onIncrease={increaseQty}
            onDecrease={decreaseQty}
            onRemove={handleRemoveItem}
            onOpenProduct={openProduct}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
      <View
        style={[
          styles.footer,
          {
            backgroundColor: T.card,
            borderTopColor: T.border,
            paddingBottom: Math.max(14, insets.bottom),
          },
        ]}
      >
        <View style={styles.footerTop}>
          <View>
            <Text style={[styles.footerLabel, { color: T.muted }]}>
              {selectedCount} item{selectedCount === 1 ? '' : 's'} selected
            </Text>
            <Text style={[styles.footerTotal, { color: T.price }]}>{formatBdt(checkoutTotal)}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.clearBtn,
              { backgroundColor: T.qtyBg, borderColor: T.border },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => {
              clearCart();
              clearAppliedCoupon();
              showToast('Cart cleared');
            }}
          >
            <Text style={[styles.clearBtnText, { color: T.text }]}>Clear cart</Text>
          </Pressable>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.checkoutBtn,
            { backgroundColor: T.primaryBtn },
            pressed && canCheckout && { backgroundColor: T.primaryBtnPressed },
            !canCheckout && styles.checkoutBtnDisabled,
          ]}
          onPress={() => navigation.navigate('Checkout')}
          disabled={!canCheckout}
        >
          <Text style={[styles.checkoutBtnText, { color: T.primaryBtnText }]}>
            Checkout — {formatBdt(checkoutTotal)}
          </Text>
        </Pressable>
      </View>
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
  },
  list: {
    padding: 16,
    paddingBottom: 16,
  },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  selectAllText: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  selectAllCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  couponChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  couponChipText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  line: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
    gap: 10,
    alignItems: 'flex-start',
  },
  deleteAction: {
    width: 88,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 12,
    gap: 4,
  },
  deleteText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  checkboxBtn: {
    paddingTop: 30,
  },
  lineImage: {
    width: 88,
    height: 88,
    borderRadius: 6,
  },
  lineBody: {
    flex: 1,
  },
  lineName: {
    fontSize: 15,
    fontWeight: '600',
  },
  variantText: {
    fontSize: 11,
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  lineCategory: {
    fontSize: 12,
    marginTop: 2,
  },
  linePrice: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
  },
  lineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 20,
  },
  qtyValue: {
    fontSize: 16,
    fontWeight: '700',
    minWidth: 22,
    textAlign: 'center',
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  footerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  footerLabel: {
    fontSize: 13,
  },
  footerTotal: {
    fontSize: 22,
    fontWeight: '700',
  },
  clearBtn: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  clearBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  checkoutBtn: {
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  checkoutBtnDisabled: {
    opacity: 0.45,
  },
  checkoutBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
