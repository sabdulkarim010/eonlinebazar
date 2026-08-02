/**
 * Normalize product/media image URLs for HTTPS production and absolute paths.
 */

function getPublicBaseUrl() {
    const base = String(
        process.env.FRONTEND_URL
        || process.env.PUBLIC_BASE_URL
        || process.env.APP_BASE_URL
        || process.env.BASE_URL
        || ''
    ).trim().replace(/\/+$/, '');

    if (base.startsWith('http://')) {
        return base.replace(/^http:\/\//i, 'https://');
    }
    return base;
}

function normalizeImageUrl(url, options = {}) {
    if (!url) return '';
    let normalized = String(url).trim();
    if (!normalized) return '';

    if (normalized.startsWith('http://')) {
        normalized = normalized.replace(/^http:\/\//i, 'https://');
    }

    if (/^https:\/\//i.test(normalized) || normalized.startsWith('data:')) {
        return normalized;
    }

    const lower = normalized.toLowerCase();
    const isRelativeAsset = normalized.startsWith('/')
        || lower.startsWith('uploads/')
        || lower.startsWith('products/');

    if (isRelativeAsset) {
        const path = normalized.startsWith('/')
            ? normalized
            : `/${normalized.replace(/^\/+/, '')}`;
        const base = options.baseUrl || getPublicBaseUrl();
        if (base) {
            return `${base}${path}`;
        }
        return path;
    }

    return normalized;
}

function normalizeImageUrlList(urls, options = {}) {
    if (!Array.isArray(urls)) return [];
    return urls
        .map((url) => normalizeImageUrl(url, options))
        .filter(Boolean);
}

module.exports = {
    getPublicBaseUrl,
    normalizeImageUrl,
    normalizeImageUrlList
};
