import api from '../services/api';

export function extractAddresses(payload) {
  if (Array.isArray(payload?.addresses)) return payload.addresses;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

export function formatAddressLine(addr) {
  if (!addr) return '';
  const parts = [
    addr.fullAddress,
    addr.upazilaOrThana || addr.upazila || addr.thana,
    addr.district,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : String(addr.fullAddress || '').trim();
}

export function addressIdOf(addr) {
  return String(addr?._id || addr?.id || '');
}

export const addressesAPI = {
  list: () => api.get('/customer/addresses'),

  add: (payload) => api.post('/customer/addresses', payload),

  update: (id, payload) => api.put(`/customer/addresses/${id}`, payload),

  remove: (id) => api.delete(`/customer/addresses/${id}`),
};
