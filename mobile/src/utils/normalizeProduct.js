import { API_ORIGIN } from '../services/api';

export function resolveMediaUrl(path) {
  const raw = String(path || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  if (raw.startsWith('//')) return `http:${raw}`;
  const normalized = raw.startsWith('/') ? raw : `/${raw.replace(/^\/+/, '')}`;
  return `${API_ORIGIN}${normalized}`;
}

export function normalizeProduct(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const id = String(raw._id || raw.id || raw.productId || '');
  if (!id) return null;

  const images = Array.isArray(raw.images) ? raw.images : [];
  const image = resolveMediaUrl(raw.image || images[0] || raw.photo || '');
  const price = Number(raw.price);
  const originalPrice = Number(raw.originalPrice);

  return {
    id,
    _id: raw._id ? String(raw._id) : id,
    productId: raw.productId || id,
    name: raw.name || 'Product',
    category: raw.category || 'General',
    price: Number.isFinite(price) ? price : 0,
    originalPrice: Number.isFinite(originalPrice) ? originalPrice : (Number.isFinite(price) ? price : 0),
    image,
    description: String(raw.description || raw.detailedDescription || '').trim(),
    stock: Number(raw.stock ?? raw.stockQuantity) || 0,
  };
}

export function extractProductList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}
