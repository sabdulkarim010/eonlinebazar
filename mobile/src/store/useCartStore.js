import { create } from 'zustand';

function lineQty(item) {
  const qty = Number(item?.quantity);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function linePrice(item) {
  return Number(item?.price) || 0;
}

const useCartStore = create((set, get) => ({
  items: [],

  addItem: (product) =>
    set((state) => {
      const quantity = lineQty(product);
      const existing = state.items.find((item) => item.id === product.id);

      if (existing) {
        return {
          items: state.items.map((item) =>
            item.id === product.id
              ? { ...item, quantity: item.quantity + quantity }
              : item
          ),
        };
      }

      return {
        items: [...state.items, { ...product, quantity }],
      };
    }),

  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),

  updateQuantity: (id, quantity) =>
    set((state) => {
      const nextQty = Math.floor(Number(quantity));

      if (!Number.isFinite(nextQty) || nextQty <= 0) {
        return {
          items: state.items.filter((item) => item.id !== id),
        };
      }

      return {
        items: state.items.map((item) =>
          item.id === id ? { ...item, quantity: Math.min(99, nextQty) } : item
        ),
      };
    }),

  getTotalPrice: () =>
    get().items.reduce(
      (sum, item) => sum + linePrice(item) * lineQty(item),
      0
    ),

  clearCart: () => set({ items: [] }),
}));

export default useCartStore;
