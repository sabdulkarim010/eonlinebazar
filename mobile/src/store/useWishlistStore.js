import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { wishlistAPI } from '../api/wishlist';
import api from '../services/api';
import { resolveMediaUrl } from '../utils/normalizeProduct';

const LEGACY_WISHLIST_KEY = 'eonlinebazar_wishlist';

function hasAuthHeader() {
  return Boolean(api.defaults.headers.common.Authorization);
}

function productIdOf(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return String(value.id || value._id || value.productId || '');
}

function toWishlistProduct(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string' || typeof raw === 'number') {
    const id = String(raw);
    return { id, _id: id, productId: id, name: 'Product', price: 0, image: '', category: 'General' };
  }
  const id = productIdOf(raw);
  if (!id) return null;
  return {
    id,
    _id: raw._id ? String(raw._id) : id,
    productId: raw.productId || id,
    name: raw.name || 'Product',
    price: Number(raw.price) || 0,
    image: resolveMediaUrl(raw.image || (Array.isArray(raw.images) && raw.images[0]) || ''),
    category: raw.category || 'General',
    icon: raw.icon || raw.emojiIcon || '',
  };
}

function sameProduct(item, productId) {
  const id = String(productId || '');
  return item.id === id || item.productId === id || String(item._id || '') === id;
}

function extractWishlist(payload) {
  if (Array.isArray(payload?.wishlist)) return payload.wishlist;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

const useWishlistStore = create(
  persist(
    (set, get) => ({
      items: [],
      isLoading: false,

      hydrate: async () => {
        await waitForWishlistPersist();
      },

      loadFromServer: async () => {
        if (!hasAuthHeader()) return { success: true, skipped: true };
        set({ isLoading: true });
        try {
          const { data } = await wishlistAPI.getWishlist();
          if (data?.success) {
            const items = extractWishlist(data).map(toWishlistProduct).filter(Boolean);
            set({ items, isLoading: false });
            return { success: true, items };
          }
          set({ isLoading: false });
          return { success: false, message: data?.message };
        } catch (err) {
          console.warn('Wishlist load failed:', err.message);
          set({ isLoading: false });
          return { success: false, message: err.message };
        }
      },

      syncToServer: async () => {
        if (!hasAuthHeader()) return { success: true, skipped: true };
        const items = get().items;
        try {
          await Promise.all(
            items.map((item) =>
              wishlistAPI.addItem({
                productId: item.id || item.productId,
                name: item.name,
                price: item.price,
                image: item.image,
                icon: item.icon,
              })
            )
          );
          return { success: true };
        } catch (err) {
          console.warn('Wishlist sync failed:', err.message);
          return { success: false, message: err.message };
        }
      },

      isSaved: (productId) => get().items.some((item) => sameProduct(item, productIdOf(productId))),

      isInWishlist: (productId) => get().isSaved(productId),

      toggleItem: async (productOrId, isLoggedIn) => {
        const product = toWishlistProduct(productOrId);
        if (!product?.id) return false;

        const previous = get().items;
        const exists = previous.some((item) => sameProduct(item, product.id));
        const next = exists
          ? previous.filter((item) => !sameProduct(item, product.id))
          : [product, ...previous.filter((item) => !sameProduct(item, product.id))];

        set({ items: next });

        const shouldSync = isLoggedIn !== false && (isLoggedIn === true || hasAuthHeader());
        if (shouldSync) {
          try {
            await wishlistAPI.toggleItem(product.id, {
              name: product.name,
              price: product.price,
              image: product.image,
              icon: product.icon,
            });
          } catch (err) {
            set({ items: previous });
            console.warn('Wishlist sync failed:', err.message);
            return exists;
          }
        }

        return !exists;
      },

      removeItem: async (productId, isLoggedIn) => {
        const id = productIdOf(productId);
        const previous = get().items;
        set({ items: previous.filter((item) => !sameProduct(item, id)) });

        const shouldSync = isLoggedIn !== false && (isLoggedIn === true || hasAuthHeader());
        if (shouldSync && id) {
          try {
            await wishlistAPI.removeItem(id);
          } catch (err) {
            set({ items: previous });
            console.warn('Wishlist remove failed:', err.message);
          }
        }
      },
    }),
    {
      name: 'eonlinebazar-wishlist',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ items: state.items }),
      merge: (persistedState, currentState) => {
        const rawItems = Array.isArray(persistedState?.items) ? persistedState.items : [];
        return {
          ...currentState,
          items: rawItems.map(toWishlistProduct).filter(Boolean),
        };
      },
      onRehydrateStorage: () => async (state) => {
        if (state?.items?.length) return;
        try {
          const raw = await AsyncStorage.getItem(LEGACY_WISHLIST_KEY);
          const legacy = raw ? JSON.parse(raw) : [];
          if (Array.isArray(legacy) && legacy.length) {
            useWishlistStore.setState({
              items: legacy.map(toWishlistProduct).filter(Boolean),
            });
          }
        } catch {
          // keep empty
        }
      },
    }
  )
);

export function waitForWishlistPersist() {
  if (useWishlistStore.persist?.hasHydrated?.()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useWishlistStore.persist?.onFinishHydration?.(() => {
      if (typeof unsub === 'function') unsub();
      resolve();
    });
    setTimeout(resolve, 2000);
  });
}

export default useWishlistStore;
