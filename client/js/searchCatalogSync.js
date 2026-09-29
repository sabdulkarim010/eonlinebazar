/**
 * Catalog search URL ↔ state serialization (shareable with tests).
 */
(function initEOBSearchCatalogSync(global) {
    'use strict';

    function getCategoryFromPath(pathname) {
        const match = String(pathname || '').match(/^\/category\/([^/]+)\/?$/i);
        if (!match) return '';
        try {
            return decodeURIComponent(match[1]).trim();
        } catch (_) {
            return String(match[1] || '').trim();
        }
    }

    function isBrowseAllPath(pathname) {
        return /^\/products\/?$/i.test(String(pathname || ''));
    }

    /**
     * @param {string} searchString
     * @param {string} [pathname]
     */
    function parseUrlSearchParams(searchString, pathname) {
        const params = new URLSearchParams(searchString || '');
        const categoryFromPath = getCategoryFromPath(pathname);
        const categoryParam = (params.get('category') || '').trim();
        const subCategory = (params.get('subCategory') || '').trim();

        return {
            query: (params.get('q') || '').trim(),
            category: categoryParam || categoryFromPath,
            subCategory,
            sort: params.get('sort') || 'newest',
            page: Math.max(1, parseInt(params.get('page'), 10) || 1),
            limit: parseInt(params.get('limit'), 10) || 20,
            minPrice: params.get('minPrice') || '',
            maxPrice: params.get('maxPrice') || '',
            rating: params.get('rating') || '',
            inStock: params.get('inStock') === 'true',
            brands: (params.get('brand') || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            browseAll: isBrowseAllPath(pathname)
                || (!params.get('q') && !categoryParam && !categoryFromPath && params.get('all') === '1')
        };
    }

    function resolveApiCategoryToken(state) {
        if (!state) return '';
        return String(state.subCategory || state.category || '').trim();
    }

    /**
     * Build query string for GET /api/products/search
     * @param {object} state
     * @param {{ maxLimit?: number }} [options]
     */
    function buildApiQueryString(state, options) {
        const maxLimit = Number(options?.maxLimit) > 0 ? Number(options.maxLimit) : 20;
        const params = new URLSearchParams();
        const q = String(state.query || '').trim();
        if (q) params.set('q', q);

        const categoryToken = resolveApiCategoryToken(state);
        if (categoryToken) params.set('category', categoryToken);

        if (state.minPrice !== '' && state.minPrice != null) params.set('minPrice', state.minPrice);
        if (state.maxPrice !== '' && state.maxPrice != null) params.set('maxPrice', state.maxPrice);
        if (Array.isArray(state.brands) && state.brands.length) {
            params.set('brand', state.brands.join(','));
        }
        if (state.rating) params.set('rating', state.rating);
        if (state.inStock) params.set('inStock', 'true');
        if (state.sort && state.sort !== 'newest') params.set('sort', state.sort);
        if (state.page > 1) params.set('page', String(state.page));

        let limit = parseInt(state.limit, 10);
        if (!Number.isFinite(limit) || limit <= 0) limit = 20;
        params.set('limit', String(Math.min(maxLimit, limit)));
        return params.toString();
    }

    /**
     * Serialize active filters to URLSearchParams (browser bar).
     */
    function serializeBrowserParams(state, options) {
        const params = new URLSearchParams();
        const q = String(state.query || '').trim();
        if (q) params.set('q', q);
        if (state.subCategory) params.set('subCategory', state.subCategory);
        else if (state.category) params.set('category', state.category);
        if (state.minPrice !== '' && state.minPrice != null) params.set('minPrice', state.minPrice);
        if (state.maxPrice !== '' && state.maxPrice != null) params.set('maxPrice', state.maxPrice);
        if (Array.isArray(state.brands) && state.brands.length) {
            params.set('brand', state.brands.join(','));
        }
        if (state.rating) params.set('rating', state.rating);
        if (state.inStock) params.set('inStock', 'true');
        if (state.sort && state.sort !== 'newest') params.set('sort', state.sort);
        if (state.page > 1) params.set('page', String(state.page));
        const defaultLimit = Number(options?.defaultLimit) || 20;
        if (state.limit && state.limit !== defaultLimit) {
            params.set('limit', String(state.limit));
        }
        return params;
    }

    global.EOBSearchCatalogSync = {
        parseUrlSearchParams,
        buildApiQueryString,
        serializeBrowserParams,
        resolveApiCategoryToken,
        getCategoryFromPath,
        isBrowseAllPath
    };
})(typeof window !== 'undefined' ? window : globalThis);
