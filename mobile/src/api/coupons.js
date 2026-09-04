import api from '../services/api';
import { endpoints } from './endpoints';

export function extractCouponDiscount(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  const amount = Number(
    data?.discountAmount
    ?? data?.discount
    ?? payload?.discount
    ?? payload?.discountAmount
  );
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function extractHasActiveCoupon(payload) {
  if (payload?.hasActiveCoupon === true) return true;
  if (payload?.data?.hasActiveCoupon === true) return true;
  return false;
}

export const couponsAPI = {
  activeCheck: () => api.get(endpoints.couponsActiveCheck),
  apply: (code, subtotal) =>
    api.post('/coupons/apply', {
      code,
      couponCode: code,
      subtotal,
      orderAmount: subtotal,
    }),
};
