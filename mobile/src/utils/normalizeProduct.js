import { API_ORIGIN } from '../services/api';

export function resolveMediaUrl(path) {
  const raw = String(path || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  if (raw.startsWith('//')) return `http:${raw}`;
  const normalized = raw.startsWith('/') ? raw : `/${raw.replace(/^\/+/, '')}`;
  return `${API_ORIGIN}${normalized}`;
}

function unwrapProductPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.success === false) return null;
  if (raw.data && typeof raw.data === 'object' && (raw.data._id || raw.data.id || raw.data.productId)) {
    return raw.data;
  }
  if (raw.product && typeof raw.product === 'object') return raw.product;
  return raw;
}

function asAttributes(raw) {
  if (!raw) return {};
  if (typeof Map !== 'undefined' && raw instanceof Map) {
    return Object.fromEntries(raw);
  }
  if (Array.isArray(raw)) {
    const out = {};
    raw.forEach((entry) => {
      if (Array.isArray(entry) && entry.length >= 2) {
        const key = String(entry[0] || '').trim();
        const val = String(entry[1] || '').trim();
        if (key && val) out[key] = val;
      }
    });
    return out;
  }
  if (typeof raw === 'object') {
    const out = {};
    Object.entries(raw).forEach(([key, val]) => {
      const name = String(key || '').trim();
      const value = String(val == null ? '' : val).trim();
      if (name && value) out[name] = value;
    });
    return out;
  }
  return {};
}

function isColorAttribute(name) {
  const n = String(name || '').trim().toLowerCase();
  return n === 'color' || n === 'colour';
}

function isSizeAttribute(name) {
  return String(name || '').trim().toLowerCase() === 'size';
}

function uniquePreserve(values) {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const text = String(value || '').trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

function attrByType(attributes, predicate, fallbackAttr, fallbackValue) {
  const match = Object.entries(attributes || {}).find(([key]) => predicate(key));
  if (match) return match[1];
  if (predicate(fallbackAttr)) return String(fallbackValue || '').trim();
  return '';
}

export function normalizeVariantRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const attributes = asAttributes(raw.attributes);
  if (!Object.keys(attributes).length && raw.attribute && raw.value) {
    attributes[String(raw.attribute).trim()] = String(raw.value).trim();
  }
  const sku = String(raw.sku || '').trim();
  if (!Object.keys(attributes).length && !sku) return null;

  const color = attrByType(attributes, isColorAttribute, raw.attribute, raw.value);
  const size = attrByType(attributes, isSizeAttribute, raw.attribute, raw.value);
  const price = Number(raw.price);
  const originalPrice = Number(raw.originalPrice);
  const stock = Number(raw.stock);

  return {
    name: String(raw.name || '').trim(),
    attributes,
    sku,
    price: Number.isFinite(price) ? price : 0,
    originalPrice: Number.isFinite(originalPrice) ? originalPrice : 0,
    stock: Number.isFinite(stock) ? stock : 0,
    image: resolveMediaUrl(raw.image || ''),
    attribute: String(raw.attribute || '').trim(),
    value: String(raw.value || '').trim(),
    color,
    size,
  };
}

function collectImages(raw, variants) {
  const urls = [];
  const push = (value) => {
    const url = resolveMediaUrl(value);
    if (url && !urls.includes(url)) urls.push(url);
  };
  if (Array.isArray(raw.images)) raw.images.forEach(push);
  push(raw.image);
  push(raw.imageUrl);
  push(raw.photo);
  variants.forEach((variant) => push(variant.image));
  return urls;
}

function buildVariantMatrix(variants) {
  const matrix = {};
  variants.forEach((variant) => {
    if (variant.color && variant.size) {
      matrix[`${variant.color}-${variant.size}`] = variant;
    }
    if (variant.sku) matrix[variant.sku] = variant;
  });
  return matrix;
}

export function matchProductVariant(product, color, size) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return null;

  const matrix = product?.variantMatrix || {};
  if (color && size && matrix[`${color}-${size}`]) return matrix[`${color}-${size}`];

  return variants.find((variant) => {
    if (color && variant.color && variant.color !== color) return false;
    if (size && variant.size && variant.size !== size) return false;
    if (color && !variant.color && product.colors?.length) return false;
    if (size && !variant.size && product.sizes?.length) return false;
    return true;
  }) || null;
}

export function getVariantPrice(product, color, size) {
  const variant = matchProductVariant(product, color, size);
  if (variant && Number(variant.price) > 0) return Number(variant.price);
  return Number(product?.price) || 0;
}

export function getVariantStock(product, color, size) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (variants.length) {
    const variant = matchProductVariant(product, color, size);
    if (variant) return Math.max(0, Number(variant.stock) || 0);
    if (color || size) return 0;
  }
  return Math.max(0, Number(product?.stock) || 0);
}

export function normalizeProduct(rawInput) {
  const raw = unwrapProductPayload(rawInput);
  if (!raw || typeof raw !== 'object') return null;

  const id = String(raw._id || raw.id || raw.productId || '');
  if (!id) return null;

  const variants = (Array.isArray(raw.variants) ? raw.variants : [])
    .map(normalizeVariantRow)
    .filter(Boolean);

  const colors = uniquePreserve(
    Array.isArray(raw.colors) && raw.colors.length
      ? raw.colors
      : variants.map((variant) => variant.color)
  );
  const sizes = uniquePreserve(
    Array.isArray(raw.sizes) && raw.sizes.length
      ? raw.sizes
      : variants.map((variant) => variant.size)
  );

  const images = collectImages(raw, variants);
  const image = images[0] || '';

  const selling = Number(raw.salePrice || raw.price);
  const listed = Number(raw.originalPrice);
  const price = Number.isFinite(selling) ? selling : 0;
  const originalPrice = Number.isFinite(listed) && listed > 0 ? listed : price;
  const discount = originalPrice > price && price >= 0
    ? Math.round((1 - price / originalPrice) * 100)
    : 0;

  const stockRaw = Number(raw.stock ?? raw.stockQuantity);
  const stock = Number.isFinite(stockRaw) ? Math.max(0, stockRaw) : 0;
  const brand = typeof raw.brand === 'object' && raw.brand
    ? (raw.brand.name || raw.brandName || '')
    : (raw.brandName || raw.brand || '');

  return {
    id,
    _id: raw._id ? String(raw._id) : id,
    productId: raw.productId || id,
    name: raw.name || 'Product',
    price,
    originalPrice,
    discount,
    image,
    images,
    variants,
    variantMatrix: buildVariantMatrix(variants),
    colors,
    sizes,
    hasVariants: Boolean(raw.hasVariants) || variants.length > 0,
    stock,
    inStock: raw.inStock !== false && stock > 0,
    category: raw.category || 'General',
    brand: String(brand || ''),
    description: String(raw.description || raw.detailedDescription || '').trim(),
    shortDescription: String(raw.shortDescription || '').trim(),
    ratings: Number(raw.ratings || raw.avgRating || raw.rating || 0) || 0,
    reviewCount: Number(raw.reviewCount || raw.numReviews || raw.numOfReviews || 0) || 0,
    flashSaleActive: raw.flashSaleActive === true,
    flashSaleDiscountPercent: Number(raw.flashSaleDiscountPercent) || discount,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    slug: raw.slug || id,
    sku: String(raw.sku || raw.productId || ''),
    weight: raw.weight == null ? null : raw.weight,
  };
}

export function extractProductList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload?.data?.products)) return payload.data.products;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}
