import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const WISHLIST_KEY = 'eonlinebazar_wishlist';

async function persist(items) {
  await AsyncStorage.setItem(WISHLIST_KEY, JSON.stringify(items));
}

const useWishlistStore = create((set, get) => ({
  items: [],

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(WISHLIST_KEY);
      const items = raw ? JSON.parse(raw) : [];
      set({ items: Array.isArray(items) ? items : [] });
    } catch {
      set({ items: [] });
    }
  },

  isSaved: (id) => get().items.some((item) => item.id === id),

  toggleItem: async (product) => {
    if (!product?.id) return false;
    const exists = get().items.some((item) => item.id === product.id);
    const items = exists
      ? get().items.filter((item) => item.id !== product.id)
      : [...get().items, product];
    set({ items });
    await persist(items);
    return !exists;
  },

  removeItem: async (id) => {
    const items = get().items.filter((item) => item.id !== id);
    set({ items });
    await persist(items);
  },
}));

export default useWishlistStore;
