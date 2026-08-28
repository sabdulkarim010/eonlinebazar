export const endpoints = {
  products: '/products',
  productById: (id) => `/products/${id}`,
  cart: '/cart',
  orders: '/orders',
  orderCancel: (id) => `/orders/${id}/cancel`,
  profile: '/profile',
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    me: '/auth/me',
  },
};
