import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { cartAPI, extractCartItems } from '../api/cart';
import api from '../services/api';
import { resolveMediaUrl } from '../utils/normalizeProduct';

function lineQty(item) {
  const qty = Number(item?.quantity);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function linePrice(item) {
  return Number(item?.price ?? item?.product?.price) || 0;
}

function productIdOf(value) {
  return String(
    value?.id
    || value?._id
    || value?.productId
    || value?.product?._id
    || value?.product?.id
    || ''
  );
}

function variantParts(variant, item = {}) {
  const nested = variant && typeof variant === 'object' ? variant : {};
  const color = String(
    nested.color || nested.selectedColor || item.selectedColor || item.color || ''
  );
  const size = String(
    nested.size || nested.selectedSize || item.selectedSize || item.size || ''
  );
  const variantId = String(nested.variantId || item.variantId || '');
  return { color, size, variantId, nested };
}

export function cartLineKey(item, variant = null) {
  if (item?.key) return String(item.key);
  const id = productIdOf(item);
  const { color, size, variantId } = variantParts(variant || item?.variant, item);
  return `${id}_${variantId || color}_${size}`;
}

function toCartLine(raw, quantity, variant = null) {
  const source = raw?.product && typeof raw.product === 'object'
    ? { ...raw.product, ...raw, product: raw.product }
    : (raw || {});
  const id = productIdOf(source);
  const { color, size, variantId, nested } = variantParts(variant || source.variant, source);
  const qty = Math.min(99, Math.max(1, Math.floor(Number(quantity ?? source.quantity) || 1)));
  const image = resolveMediaUrl(source.image || source.selectedImage || source.product?.image || '');
  const name = source.name || source.product?.name || 'Product';
  const price = Number(source.price ?? source.product?.price) || 0;
  const category = source.category || source.product?.category || 'General';
  const product = {
    ...(source.product && typeof source.product === 'object' ? source.product : source),
    id,
    _id: source._id || source.product?._id || id,
    productId: source.productId || id,
    name,
    price,
    image,
    category,
  };

  const nextVariant = nested && (nested.color || nested.size || nested.variantId || color || size)
    ? { ...nested, color, size, variantId }
    : (color || size || variantId ? { color, size, variantId } : null);

  return {
    key: `${id}_${variantId || color}_${size}`,
    product,
    quantity: qty,
    variant: nextVariant,
    selected: source.selected !== false,
    id,
    _id: product._id,
    productId: id,
    name,
    price,
    image,
    category,
    variantId,
    variantLabel: source.variantLabel || nested.variantLabel || '',
    selectedColor: color,
    selectedSize: size,
  };
}

function matchLine(item, keyOrId) {
  const value = String(keyOrId || '');
  return item.key === value
    || item.id === value
    || item.productId === value
    || String(item.product?._id || '') === value;
}

function toMergePayload(item) {
  return {
    id: item.id || item.productId,
    productId: item.productId || item.id,
    name: item.name,
    price: linePrice(item),
    quantity: lineQty(item),
    image: item.image,
    selected: item.selected !== false,
    variant: item.variant,
    variantId: item.variantId || item.variant?.variantId || '',
    variantLabel: item.variantLabel || item.variant?.variantLabel || '',
    selectedColor: item.variant?.color || item.selectedColor || '',
    selectedSize: item.variant?.size || item.selectedSize || '',
  };
}

function hasAuthHeader() {
  return Boolean(api.defaults.headers.common.Authorization);
}

const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product, quantity, variant = null) => {
        if (!product) return;
        const explicitQty = Number(quantity);
        const embeddedQty = Number(product.quantity);
        const qty = Number.isFinite(explicitQty) && explicitQty > 0
          ? Math.floor(explicitQty)
          : (Number.isFinite(embeddedQty) && embeddedQty > 0 ? Math.floor(embeddedQty) : 1);

        const line = toCartLine(product, qty, variant);
        const items = get().items;
        const existing = items.find((item) => item.key === line.key);

        if (existing) {
          set({
            items: items.map((item) =>
              item.key === line.key
                ? { ...item, quantity: Math.min(99, item.quantity + line.quantity) }
                : item
            ),
          });
          return;
        }

        set({ items: [...items, line] });
      },

      removeItem: (key) =>
        set({ items: get().items.filter((item) => !matchLine(item, key)) }),

      updateQuantity: (key, quantity) => {
        const nextQty = Math.floor(Number(quantity));
        if (!Number.isFinite(nextQty) || nextQty <= 0) {
          set({ items: get().items.filter((item) => !matchLine(item, key)) });
          return;
        }
        set({
          items: get().items.map((item) =>
            matchLine(item, key) ? { ...item, quantity: Math.min(99, nextQty) } : item
          ),
        });
      },

      clearCart: () => set({ items: [] }),

      getTotalItems: () =>
        get().items.reduce((sum, item) => sum + lineQty(item), 0),

      getTotalPrice: () =>
        get().items.reduce((sum, item) => sum + linePrice(item) * lineQty(item), 0),

      syncToServer: async () => {
        try {
          const { items } = get();
          if (!hasAuthHeader() || items.length === 0) return { success: true, skipped: true };

          const { data } = await cartAPI.mergeCart(items.map(toMergePayload));
          return { success: data?.success !== false, data };
        } catch (err) {
          console.warn('Cart sync failed:', err.message);
          return { success: false, message: err.message };
        }
      },

      loadFromServer: async () => {
        try {
          if (!hasAuthHeader()) return { success: true, skipped: true };

          const { data } = await cartAPI.getCart();
          const serverItems = extractCartItems(data);
          if (data?.success === false) {
            return { success: false, message: data?.message };
          }
          if (serverItems.length > 0) {
            set({
              items: serverItems.map((item) => toCartLine(item, item.quantity, item.variant)),
            });
          }
          return { success: true, items: get().items };
        } catch (err) {
          console.warn('Load server cart failed:', err.message);
          return { success: false, message: err.message };
        }
      },
    }),
    {
      name: 'eonlinebazar-cart',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ items: state.items }),
      merge: (persistedState, currentState) => {
        const rawItems = Array.isArray(persistedState?.items) ? persistedState.items : [];
        return {
          ...currentState,
          items: rawItems.map((item) => toCartLine(item, item.quantity, item.variant)),
        };
      },
    }
  )
);

export function waitForCartPersist() {
  if (useCartStore.persist?.hasHydrated?.()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useCartStore.persist?.onFinishHydration?.(() => {
      if (typeof unsub === 'function') unsub();
      resolve();
    });
    setTimeout(resolve, 2000);
  });
}

export default useCartStore;
