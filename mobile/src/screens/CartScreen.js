import { useCallback } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ScreenHeader from '../components/ScreenHeader';
import useCartStore from '../store/useCartStore';
import { useAppTheme } from '../store/useThemeStore';
import useToastStore from '../store/useToastStore';

function formatBdt(price) {
  return `৳${Number(price).toLocaleString('en-US')}`;
}

function CartLine({ item, onIncrease, onDecrease, onRemove, colors }) {
  const lineTotal = Number(item.price) * Number(item.quantity);

  return (
    <View style={[styles.line, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Image
        source={{ uri: item.image }}
        style={[styles.lineImage, { backgroundColor: colors.imageBg }]}
      />
      <View style={styles.lineBody}>
        <Text style={[styles.lineName, { color: colors.text }]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.lineCategory, { color: colors.muted }]}>{item.category}</Text>
        <Text style={[styles.linePrice, { color: colors.price }]}>{formatBdt(lineTotal)}</Text>
        <View style={styles.lineActions}>
          <View style={styles.qtyRow}>
            <Pressable
              style={({ pressed }) => [
                styles.qtyBtn,
                { backgroundColor: colors.qtyBg, borderColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => onDecrease(item)}
            >
              <Text style={[styles.qtyBtnText, { color: colors.text }]}>−</Text>
            </Pressable>
            <Text style={[styles.qtyValue, { color: colors.text }]}>{item.quantity}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.qtyBtn,
                { backgroundColor: colors.qtyBg, borderColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => onIncrease(item)}
            >
              <Text style={[styles.qtyBtnText, { color: colors.text }]}>+</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => onRemove(item.key || item.id)} hitSlop={8}>
            <Text style={[styles.removeText, { color: colors.link }]}>Remove</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function CartScreen({ navigation }) {
  const { colors } = useAppTheme();
  const items = useCartStore((state) => state.items);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const totalPrice = useCartStore((state) => state.getTotalPrice());
  const showToast = useToastStore((state) => state.showToast);

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

  if (items.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.bg }]}>
        <ScreenHeader
          title="Cart"
          subtitle="Your cart is empty. Add products from Home."
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.key || item.id)}
        renderItem={({ item }) => (
          <CartLine
            item={item}
            colors={colors}
            onIncrease={increaseQty}
            onDecrease={decreaseQty}
            onRemove={removeItem}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <View style={styles.footerTop}>
          <View>
            <Text style={[styles.footerLabel, { color: colors.muted }]}>Total</Text>
            <Text style={[styles.footerTotal, { color: colors.price }]}>{formatBdt(totalPrice)}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.clearBtn,
              { backgroundColor: colors.qtyBg, borderColor: colors.border },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => {
              clearCart();
              showToast('Cart cleared');
            }}
          >
            <Text style={[styles.clearBtnText, { color: colors.text }]}>Clear cart</Text>
          </Pressable>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.checkoutBtn,
            { backgroundColor: colors.primaryBtn },
            pressed && { backgroundColor: colors.primaryBtnPressed },
          ]}
          onPress={() => navigation.navigate('Checkout')}
        >
          <Text style={[styles.checkoutBtnText, { color: colors.primaryBtnText }]}>
            Proceed to Checkout
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
    padding: 12,
    paddingBottom: 16,
  },
  line: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
    gap: 12,
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
  removeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
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
  checkoutBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
