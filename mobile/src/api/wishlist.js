import api from '../services/api';

export const wishlistAPI = {
  getWishlist: () => api.get('/customer/wishlist'),

  addItem: ({ productId, name, price, image, icon } = {}) =>
    api.post('/customer/wishlist', { productId, name, price, image, icon }),

  // Real toggle lives at /api/wishlist/toggle (not /api/customer/wishlist/toggle).
  toggleItem: (productId, extra = {}) =>
    api.post('/wishlist/toggle', { productId, ...extra }),

  removeItem: (productId) =>
    api.delete(`/customer/wishlist/${encodeURIComponent(productId)}`),
};

export default wishlistAPI;
