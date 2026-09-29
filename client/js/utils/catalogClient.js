/**
 * Bounded catalog fetches for storefront (no bulk bootstrap prefetch).
 */
(function initEOBCatalogClient(global) {
    'use strict';

    const MAX_SECTION_LIMIT = 20;
    const MAX_LOOKUP_IDS = 30;

    const HOME_SECTIONS = Object.freeze({
        featured: { limit: 10, featured: 'true' },
        trending: { limit: 10, sort: 'sales' },
        flashDeals: { limit: 8, endpoint: 'flash-deals' }
    });

    function clampLimit(n, max) {
        const cap = max != null ? max : MAX_SECTION_LIMIT;
        const v = Number(n);
        if (!Number.isFinite(v) || v <= 0) return cap;
        return Math.min(cap, Math.floor(v));
    }

    function getApiCache() {
        return global.EOBApiCache || null;
    }

    function mergeIntoGlobalCatalog(products) {
        const list = Array.isArray(products) ? products : [];
        if (!list.length) return list;
        if (global.EOBCommerce && typeof global.EOBCommerce.mergeCatalog === 'function') {
            return global.EOBCommerce.mergeCatalog(list);
        }
        const existing = global.globalProductCatalog || [];
        const byId = new Map();
        existing.forEach((p) => {
            const id = String(p._id || p.id || p.productId || '');
            if (id) byId.set(id, p);
        });
        list.forEach((p) => {
            const id = String(p._id || p.id || p.productId || '');
            if (id) byId.set(id, p);
        });
        global.globalProductCatalog = Array.from(byId.values());
        return global.globalProductCatalog;
    }

    function parseProductsPayload(payload) {
        if (!payload) return [];
        if (Array.isArray(payload)) return payload;
        return payload.products || payload.data || [];
    }

    async function fetchProductsList(queryParams, cacheKey) {
        const params = new URLSearchParams();
        Object.entries(queryParams || {}).forEach(([k, v]) => {
            if (v != null && v !== '') params.set(k, String(v));
        });
        if (!params.has('limit')) params.set('limit', String(MAX_SECTION_LIMIT));
        params.set('limit', String(clampLimit(params.get('limit'))));

        const url = `/api/products?${params.toString()}`;
        const cache = getApiCache();
        const payload = cache
            ? await cache.fetchJson(url, { cacheKey: cacheKey || url })
            : await (await global.fetch(url)).json();

        return {
            products: parseProductsPayload(payload),
            pagination: payload.pagination || null,
            raw: payload
        };
    }

    async function fetchFlashDeals(limit) {
        const lim = clampLimit(limit || HOME_SECTIONS.flashDeals.limit, 20);
        const url = `/api/products/flash-deals?limit=${lim}`;
        const cache = getApiCache();
        const payload = cache
            ? await cache.fetchJson(url, { cacheKey: `flash-deals:${lim}` })
            : await (await global.fetch(url)).json();
        const products = parseProductsPayload(payload);
        mergeIntoGlobalCatalog(products);
        return products;
    }

    async function fetchHomeFeatured(page, limit) {
        const lim = clampLimit(limit || HOME_SECTIONS.featured.limit, 10);
        return fetchProductsList(
            { page: page || 1, limit: lim, featured: 'true' },
            `home:featured:${page || 1}:${lim}`
        );
    }

    async function fetchHomeTrending() {
        const lim = HOME_SECTIONS.trending.limit;
        const result = await fetchProductsList(
            { page: 1, limit: lim, sort: 'sales' },
            `home:trending:${lim}`
        );
        mergeIntoGlobalCatalog(result.products);
        return result.products;
    }

    function collectCartProductIds(cartItems) {
        const ids = new Set();
        (cartItems || []).forEach((item) => {
            const pid = item?.productId || item?.id;
            if (pid && typeof pid === 'object' && pid._id) {
                ids.add(String(pid._id));
            } else if (pid) {
                ids.add(String(pid));
            }
        });
        return Array.from(ids);
    }

    function idsMissingFromCatalog(ids) {
        const catalog = global.globalProductCatalog || [];
        const known = new Set(catalog.map((p) => String(p._id || p.id || p.productId || '')));
        return ids.filter((id) => id && !known.has(String(id)));
    }

    async function hydrateCatalogForCart(cartItems) {
        const ids = collectCartProductIds(cartItems);
        const missing = idsMissingFromCatalog(ids).slice(0, MAX_LOOKUP_IDS);
        if (!missing.length) return [];

        const url = `/api/products/lookup?ids=${encodeURIComponent(missing.join(','))}`;
        const cache = getApiCache();
        const payload = cache
            ? await cache.fetchJson(url, { cacheKey: `lookup:${missing.sort().join(',')}` })
            : await (await global.fetch(url)).json();

        const products = parseProductsPayload(payload);
        mergeIntoGlobalCatalog(products);
        global.document?.dispatchEvent(new CustomEvent('productCatalogReady'));
        return products;
    }

    /** Test helper: planned home bootstrap URLs (no network). */
    function getHomeBootstrapFetchPlan() {
        return [
            { url: '/api/products?page=1&limit=10&featured=true', maxLimit: 10 },
            { url: '/api/products?page=1&limit=10&sort=sales', maxLimit: 10 },
            { url: '/api/products/flash-deals?limit=8', maxLimit: 8 }
        ];
    }

    function assertNoBulkCatalogPrefetch(url) {
        const str = String(url || '');
        if (!str.includes('/api/products')) return true;
        const m = str.match(/[?&]limit=(\d+)/);
        if (!m) return !str.match(/\/api\/products\?$/);
        return Number(m[1]) <= MAX_SECTION_LIMIT;
    }

    global.EOBCatalogClient = {
        MAX_SECTION_LIMIT,
        MAX_LOOKUP_IDS,
        HOME_SECTIONS,
        clampLimit,
        fetchProductsList,
        fetchFlashDeals,
        fetchHomeFeatured,
        fetchHomeTrending,
        hydrateCatalogForCart,
        mergeIntoGlobalCatalog,
        getHomeBootstrapFetchPlan,
        assertNoBulkCatalogPrefetch
    };
})(typeof window !== 'undefined' ? window : global);
