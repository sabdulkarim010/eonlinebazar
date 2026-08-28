import { create } from 'zustand';
import { endpoints } from '../api/endpoints';
import api from '../services/api';
import useAuthStore from './useAuthStore';
import useCartStore from './useCartStore';

function apiErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function toOrderItem(item) {
  const id = item.id || item.productId || item._id;
  return {
    id,
    productId: item.productId || id,
    name: item.name,
    price: Number(item.price) || 0,
    quantity: Math.max(1, Number(item.quantity) || 1),
    image: item.image || '',
    variantId: item.variantId || '',
    variantLabel: item.variantLabel || '',
    variantAttribute: item.variantAttribute || '',
    variantValue: item.variantValue || '',
  };
}

function buildCreatePayload(shipping = {}, items = []) {
  const customerName = String(
    shipping.customerName
      || shipping.name
      || [shipping.firstName, shipping.lastName].filter(Boolean).join(' ')
      || ''
  ).trim();
  const customerPhone = String(
    shipping.customerPhone || shipping.phone || shipping.mobile || ''
  ).trim();
  const customerAddress = String(
    shipping.customerAddress || shipping.shippingAddress || shipping.address || ''
  ).trim();
  const shippingDistrict = String(
    shipping.shippingDistrict || shipping.customerDistrict || shipping.district || ''
  ).trim();

  return {
    customerName,
    customerPhone,
    customerEmail: String(shipping.customerEmail || shipping.email || '').trim(),
    customerAddress,
    shippingDistrict,
    shippingUpazila: String(shipping.shippingUpazila || shipping.upazila || shipping.thana || '').trim(),
    shippingStreetAddress: String(shipping.shippingStreetAddress || shipping.street || '').trim(),
    note: shipping.note || shipping.notes || '',
    couponCode: shipping.couponCode || shipping.coupon || '',
    paymentMethodId: shipping.paymentMethodId,
    paymentMethod: shipping.paymentMethod || shipping.method,
    applyWallet: shipping.applyWallet === true,
    items: items.map(toOrderItem),
  };
}

const useOrderStore = create((set, get) => ({
  orders: [],
  currentOrder: null,
  pagination: null,
  isLoading: false,
  error: null,

  createOrder: async (shipping = {}, cartItems) => {
    const items = Array.isArray(cartItems) && cartItems.length
      ? cartItems
      : useCartStore.getState().items;

    const payload = buildCreatePayload(shipping, items);

    if (!payload.customerName || !payload.customerPhone || !payload.customerAddress) {
      const message = 'Name, phone number, and a full delivery address are required.';
      set({ error: message, isLoading: false });
      return { success: false, message };
    }
    if (!payload.shippingDistrict) {
      const message = 'Please select a valid shipping district.';
      set({ error: message, isLoading: false });
      return { success: false, message };
    }
    if (!payload.items.length) {
      const message = 'Your cart is empty. Add products before placing an order.';
      set({ error: message, isLoading: false });
      return { success: false, message };
    }

    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post(endpoints.orders, payload);
      if (!data?.success) {
        const message = data?.message || 'Failed to place order.';
        set({ isLoading: false, error: message });
        return { success: false, message };
      }

      const order = data.data || null;
      set((state) => ({
        currentOrder: order,
        orders: order ? [order, ...state.orders] : state.orders,
        isLoading: false,
        error: null,
      }));
      useCartStore.getState().clearCart();
      return {
        success: true,
        message: data.message || 'Order placed successfully.',
        order,
        lockedPricing: data.lockedPricing,
      };
    } catch (error) {
      const message = apiErrorMessage(error, 'Failed to place order.');
      set({ isLoading: false, error: message });
      return { success: false, message };
    }
  },

  fetchOrderHistory: async ({ page = 1, limit = 20, silent = false } = {}) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      const message = 'Please sign in to view your orders.';
      set({ orders: [], pagination: null, isLoading: false, error: message });
      return { success: false, message };
    }

    if (!silent) set({ isLoading: true, error: null });
    else set({ error: null });
    try {
      const { data } = await api.get(`${endpoints.orders}/my-orders`, {
        params: { page, limit },
      });
      if (!data?.success) {
        const message = data?.message || 'Failed to load order history.';
        set({ isLoading: false, error: message, orders: [] });
        return { success: false, message };
      }

      const orders = Array.isArray(data.data) ? data.data : [];
      set({
        orders,
        pagination: data.pagination || null,
        isLoading: false,
        error: null,
      });
      return { success: true, orders, pagination: data.pagination };
    } catch (error) {
      const message = apiErrorMessage(error, 'Failed to load order history.');
      set({ isLoading: false, error: message });
      return { success: false, message };
    }
  },

  clearCurrentOrder: () => set({ currentOrder: null }),

  fetchOrderById: async (orderId) => {
    const id = String(orderId || '');
    const local = get().orders.find(
      (order) => String(order._id) === id || String(order.orderId) === id
    );
    if (local) set({ currentOrder: local, error: null });

    const token = useAuthStore.getState().token;
    const isMongoId = /^[a-fA-F0-9]{24}$/.test(id);
    if (!token || !isMongoId) {
      if (local) return { success: true, order: local };
      const message = 'Order not found.';
      set({ error: message });
      return { success: false, message };
    }

    set({ isLoading: !local, error: null });
    try {
      const { data } = await api.get(`${endpoints.orders}/${id}`);
      if (data?.success && data.data) {
        set({ currentOrder: data.data, isLoading: false, error: null });
        return { success: true, order: data.data };
      }
      if (local) {
        set({ isLoading: false });
        return { success: true, order: local };
      }
      const message = data?.message || 'Order not found.';
      set({ isLoading: false, error: message });
      return { success: false, message };
    } catch (error) {
      if (local) {
        set({ isLoading: false });
        return { success: true, order: local };
      }
      const message = apiErrorMessage(error, 'Failed to load order.');
      set({ isLoading: false, error: message });
      return { success: false, message };
    }
  },

  cancelOrder: async (orderId, reason = 'Cancelled from the mobile app') => {
    const id = String(orderId || '');
    const match = (order) =>
      String(order?._id || '') === id || String(order?.orderId || '') === id;
    const previous =
      get().orders.find(match) || (match(get().currentOrder) ? get().currentOrder : null);

    const applyLocal = (patch) => {
      set((state) => ({
        orders: state.orders.map((order) => (match(order) ? { ...order, ...patch } : order)),
        currentOrder:
          state.currentOrder && match(state.currentOrder)
            ? { ...state.currentOrder, ...patch }
            : state.currentOrder,
        error: null,
      }));
    };

    applyLocal({ status: 'Cancelled', cancelReason: reason });

    const token = useAuthStore.getState().token;
    const mongoId = previous && /^[a-fA-F0-9]{24}$/.test(String(previous._id))
      ? String(previous._id)
      : (/^[a-fA-F0-9]{24}$/.test(id) ? id : null);

    if (!token || !mongoId) {
      return { success: true, message: 'Order cancelled.' };
    }

    try {
      const { data } = await api.put(endpoints.orderCancel(mongoId), { reason });
      if (!data?.success) {
        if (previous) applyLocal({ status: previous.status, cancelReason: previous.cancelReason });
        const message = data?.message || 'Could not cancel order.';
        set({ error: message });
        return { success: false, message };
      }

      const order = data.data;
      if (order) {
        set((state) => ({
          currentOrder: order,
          orders: state.orders.map((item) => (match(item) ? order : item)),
          error: null,
        }));
      }
      return {
        success: true,
        message: data.message || 'Order cancelled.',
        order,
      };
    } catch (error) {
      if (previous) applyLocal({ status: previous.status, cancelReason: previous.cancelReason });
      const message = apiErrorMessage(error, 'Could not cancel order.');
      set({ error: message });
      return { success: false, message };
    }
  },
}));

export default useOrderStore;
