import api from '../services/api';
import { extractProductList, normalizeProduct } from '../utils/normalizeProduct';

export function extractSearchPagination(payload) {
  const pagination = payload?.pagination || payload?.data?.pagination || {};
  return {
    currentPage: Number(pagination.currentPage || pagination.page || 1) || 1,
    totalPages: Number(pagination.totalPages || 0) || 0,
    hasMore: pagination.hasMore === true
      || (Number(pagination.currentPage || pagination.page || 1)
        < Number(pagination.totalPages || 0)),
    limit: Number(pagination.limit || 0) || 0,
    totalProducts: Number(pagination.totalProducts || pagination.total || 0) || 0,
  };
}

export function flattenNavbarCategories(tree) {
  const out = [{ _id: '', name: 'All' }];
  const walk = (nodes, depth = 0) => {
    if (!Array.isArray(nodes)) return;
    nodes.forEach((cat) => {
      if (!cat) return;
      const id = String(cat._id || cat.id || cat.slug || cat.name || '');
      const name = String(cat.name || '').trim();
      if (id && name) {
        out.push({
          _id: id,
          name: depth ? `${name}` : name,
          slug: cat.slug || '',
        });
      }
      walk(cat.subCategories || cat.children || [], depth + 1);
    });
  };
  walk(tree);
  return out;
}

export async function loadFlashSaleCatalog(limit = 10) {
  const { data } = await api.get('/store/flash-sale');
  const settings = data?.data || data || {};
  const ids = Array.isArray(settings.flashSaleProductIds)
    ? settings.flashSaleProductIds.map((id) => String(id).trim()).filter(Boolean)
    : [];

  if (!settings.isActive || !ids.length) {
    return { settings, products: [] };
  }

  const rows = await Promise.all(
    ids.slice(0, limit).map(async (id) => {
      try {
        const res = await api.get(`/products/${id}`);
        return normalizeProduct(res.data);
      } catch {
        return null;
      }
    })
  );

  return {
    settings,
    products: rows.filter(Boolean),
  };
}

export const searchAPI = {
  search: (params = {}) => api.get('/products/search', { params }),

  getCategories: () => api.get('/categories/navbar'),

  getHomepageCategories: () => api.get('/categories/homepage'),

  getBanners: () => api.get('/store/banners'),

  getFlashSale: () => api.get('/store/flash-sale'),
};

export function mapSearchProducts(payload) {
  return extractProductList(payload).map(normalizeProduct).filter(Boolean);
}
