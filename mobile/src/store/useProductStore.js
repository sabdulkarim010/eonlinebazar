import { create } from 'zustand';
import { endpoints } from '../api/endpoints';
import api from '../services/api';
import { extractProductList, normalizeProduct } from '../utils/normalizeProduct';

function apiErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function matchProduct(product, id) {
  const value = String(id || '');
  return (
    String(product.id) === value
    || String(product._id) === value
    || String(product.productId) === value
  );
}

let inflightList = null;

const useProductStore = create((set, get) => ({
  products: [],
  currentProduct: null,
  pagination: null,
  isLoading: false,
  isProductLoading: false,
  error: null,
  productError: null,

  fetchProducts: async ({ page = 1, limit = 100, silent = false } = {}) => {
    if (inflightList && !silent) return inflightList;

    const run = async () => {
      if (!silent) set({ isLoading: true, error: null });
      else set({ error: null });

      try {
        const { data } = await api.get(endpoints.products, {
          params: { page, limit },
        });

        if (data?.success === false) {
          const message = data.message || 'Failed to load products.';
          set({ isLoading: false, error: message });
          return { success: false, message };
        }

        const products = extractProductList(data)
          .map(normalizeProduct)
          .filter(Boolean);

        set({
          products,
          pagination: data?.pagination || null,
          isLoading: false,
          error: null,
        });
        return { success: true, products, pagination: data?.pagination };
      } catch (error) {
        const message = apiErrorMessage(error, 'Failed to load products.');
        set({ isLoading: false, error: message });
        return { success: false, message };
      }
    };

    inflightList = run().finally(() => {
      inflightList = null;
    });
    return inflightList;
  },

  fetchProductById: async (productId) => {
    const id = String(productId || '');
    if (!id) {
      const message = 'Product not found.';
      set({ currentProduct: null, productError: message, isProductLoading: false });
      return { success: false, message };
    }

    const local = get().products.find((product) => matchProduct(product, id));
    if (local) set({ currentProduct: local, productError: null });

    set({ isProductLoading: !local, productError: null });
    try {
      const { data } = await api.get(endpoints.productById(id));
      if (data?.success === false) {
        if (local) {
          set({ isProductLoading: false });
          return { success: true, product: local };
        }
        const message = data.message || 'Product not found.';
        set({ isProductLoading: false, productError: message, currentProduct: null });
        return { success: false, message };
      }

      const product = normalizeProduct(data);
      if (!product) {
        if (local) {
          set({ isProductLoading: false });
          return { success: true, product: local };
        }
        const message = 'Product not found.';
        set({ isProductLoading: false, productError: message, currentProduct: null });
        return { success: false, message };
      }

      set((state) => {
        const exists = state.products.some((item) => matchProduct(item, product.id));
        return {
          currentProduct: product,
          isProductLoading: false,
          productError: null,
          products: exists
            ? state.products.map((item) => (matchProduct(item, product.id) ? product : item))
            : state.products,
        };
      });
      return { success: true, product };
    } catch (error) {
      if (local) {
        set({ isProductLoading: false });
        return { success: true, product: local };
      }
      const message = apiErrorMessage(error, 'Failed to load product.');
      set({ isProductLoading: false, productError: message, currentProduct: null });
      return { success: false, message };
    }
  },

  getCachedProduct: (productId) => {
    const id = String(productId || '');
    const current = get().currentProduct;
    if (current && matchProduct(current, id)) return current;
    return get().products.find((product) => matchProduct(product, id)) || null;
  },
}));

export default useProductStore;
