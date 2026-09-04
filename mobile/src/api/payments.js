import api from '../services/api';
import { endpoints } from './endpoints';

export function extractPaymentMethods(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  const methods = Array.isArray(data?.methods)
    ? data.methods
    : (Array.isArray(data?.paymentMethods) ? data.paymentMethods : []);
  return methods
    .slice()
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
}

export function computeProcessingFee(method, amount) {
  if (!method) return 0;
  const fee = Number(method.processingFee) || 0;
  if (fee <= 0) return 0;
  const base = Math.max(0, Number(amount) || 0);
  const raw = method.feeType === 'flat' ? fee : (base * fee) / 100;
  return Math.round(raw * 100) / 100;
}

export function formatFeeHint(method) {
  const fee = Number(method?.processingFee) || 0;
  if (fee <= 0) return '';
  return method.feeType === 'flat' ? `+৳${fee} fee` : `+${fee}% fee`;
}

export function isCodMethod(method) {
  const code = String(method?.code || method?.name || '').toLowerCase();
  return code.includes('cod') || code.includes('cash on delivery');
}

export function needsTransactionId(method) {
  if (!method || method.type === 'automated' || isCodMethod(method)) return false;
  return method.type === 'manual';
}

export const paymentsAPI = {
  getMethods: () => api.get(endpoints.paymentMethods),
  initiate: (orderId, paymentMethodId) =>
    api.post(endpoints.paymentsInitiate, { orderId, paymentMethodId }),
  submitProof: (orderMongoId, trxId) =>
    api.patch(endpoints.orderPaymentProof(orderMongoId), { trxId }),
};
