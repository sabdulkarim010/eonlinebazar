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

  addToCart: (productId, quantity, extra = {}) => {
    const variant = extra.variant && typeof extra.variant === 'object' ? extra.variant : extra;
    return api.post('/cart/add', {
      productId,
      quantity,
      name: extra.name,
      price: extra.price,
      image: extra.image,
      variant,
      variantId: extra.variantId || variant?.variantId || '',
      selectedColor: extra.selectedColor || variant?.color || variant?.selectedColor || '',
      selectedSize: extra.selectedSize || variant?.size || variant?.selectedSize || '',
    });
  },

  updateQuantity: (productId, quantity, variantId) =>
    api.put('/cart/update-quantity', { productId, quantity, variantId: variantId || '' }),

  removeItem: (productId, variantId) =>
    api.delete(`/cart/remove/${encodeURIComponent(productId)}`, {
      params: { variantId: variantId || '' },
    }),

  clearCart: () => api.delete('/cart/clear'),

  toggleSelection: (productId, selected, variantId = '') =>
    api.put('/cart/toggle-selection', { productId, selected, variantId: variantId || '' }),
};

export { extractCartItems };

export default cartAPI;
