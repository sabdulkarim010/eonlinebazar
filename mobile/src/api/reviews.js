import api from '../services/api';

export function extractReviews(payload) {
  if (Array.isArray(payload?.reviews)) return payload.reviews;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

export const reviewsAPI = {
  getByProduct: (productId) => api.get(`/reviews/${encodeURIComponent(productId)}`),

  submit: ({ orderId, productId, rating, comment }) =>
    api.post('/reviews', { orderId, productId, rating, comment }),
};
