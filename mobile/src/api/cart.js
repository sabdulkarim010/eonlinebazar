import api from '../services/api';

function extractCartItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.cart?.items)) return payload.cart.items;
  if (Array.isArray(payload?.cart)) return payload.cart;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

export const cartAPI = {
  getCart: () => api.get('/cart'),

  mergeCart: (items) => api.post('/cart/merge', { cartItems: items, items }),

  addToCart: (productId, quantity, variant) =>
    api.post('/cart/add', {
      productId,
      quantity,
      variant,
      variantId: variant?.variantId,
      selectedColor: variant?.color,
      selectedSize: variant?.size,
    }),

  updateQuantity: (productId, quantity, variantId) =>
    api.put('/cart/update-quantity', { productId, quantity, variantId }),

  removeItem: (productId, variantId) =>
    api.delete(`/cart/remove/${encodeURIComponent(productId)}`, {
      params: variantId ? { variantId } : undefined,
    }),

  clearCart: () => api.delete('/cart/clear'),
};

export { extractCartItems };

export default cartAPI;
