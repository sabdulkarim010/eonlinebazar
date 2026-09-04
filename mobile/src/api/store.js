import { DISTRICT_NAMES } from '../data/bdLocations';
import api from '../services/api';

export const FALLBACK_DISTRICTS = DISTRICT_NAMES;

function asDistrictNames(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === 'string' ? item : item?.name || item?.label || ''))
    .map((name) => String(name).trim())
    .filter(Boolean);
}

export function extractDistricts(payload) {
  return asDistrictNames(
    payload?.data
    || payload?.districts
    || payload
  );
}

export function extractDeliveryCharge(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  const charge = Number(
    data?.deliveryCharge
    ?? data?.charge
    ?? payload?.charge
    ?? payload?.deliveryCharge
  );
  return Number.isFinite(charge) ? charge : 0;
}

export const storeAPI = {
  getDistricts: () => api.get('/store/districts'),

  getShippingQuote: (district, subtotal = 0) =>
    api.get('/store/shipping-quote', {
      params: { district, subtotal },
    }),
};

export default storeAPI;
