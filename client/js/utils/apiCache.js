/**
 * Lightweight in-memory SWR cache for public catalog GET requests.
 */
(function initEOBApiCache(global) {
    'use strict';

    const DEFAULT_TTL_MS = 3 * 60 * 1000;
    const STALE_REVALIDATE_MS = 60 * 1000;

    /** @type {Map<string, { data: any, fetchedAt: number, ttlMs: number }>} */
    const cache = new Map();
    /** @type {Map<string, Promise<any>>} */
    const inflight = new Map();

    let networkFetchCount = 0;

    function now() {
        return Date.now();
    }

    function buildKey(url, options) {
        if (options && options.cacheKey) return String(options.cacheKey);
        return String(url);
    }

    function clearAll() {
        cache.clear();
        inflight.clear();
    }

    function invalidatePrefix(prefix) {
        const p = String(prefix || '');
        cache.forEach((_v, key) => {
            if (key.startsWith(p)) cache.delete(key);
        });
    }

    async function networkFetch(url, fetchOptions) {
        networkFetchCount += 1;
        const response = await global.fetch(url, fetchOptions);
        let body = null;
        try {
            body = await response.json();
        } catch (_) {
            body = null;
        }
        if (!response.ok) {
            const err = new Error(body?.message || `Request failed (${response.status})`);
            err.status = response.status;
            err.body = body;
            throw err;
        }
        return body;
    }

    /**
     * @param {string} url
     * @param {{ cacheKey?: string, ttlMs?: number, forceRefresh?: boolean, fetchOptions?: RequestInit }} [options]
     */
    async function fetchJson(url, options) {
        const opts = options || {};
        const key = buildKey(url, opts);
        const ttlMs = Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : DEFAULT_TTL_MS;
        const force = opts.forceRefresh === true;

        if (!force) {
            const hit = cache.get(key);
            if (hit && now() - hit.fetchedAt < hit.ttlMs) {
                const age = now() - hit.fetchedAt;
                if (age > STALE_REVALIDATE_MS && !inflight.has(key)) {
                    const revalidate = networkFetch(url, opts.fetchOptions)
                        .then((data) => {
                            cache.set(key, { data, fetchedAt: now(), ttlMs });
                            return data;
                        })
                        .catch(() => hit.data)
                        .finally(() => inflight.delete(key));
                    inflight.set(key, revalidate);
                }
                return hit.data;
            }
        }

        if (inflight.has(key)) {
            return inflight.get(key);
        }

        const promise = networkFetch(url, opts.fetchOptions)
            .then((data) => {
                cache.set(key, { data, fetchedAt: now(), ttlMs });
                return data;
            })
            .finally(() => inflight.delete(key));

        inflight.set(key, promise);
        return promise;
    }

    function getNetworkFetchCount() {
        return networkFetchCount;
    }

    function resetNetworkFetchCount() {
        networkFetchCount = 0;
    }

    function bindAuthInvalidation() {
        if (global.EOBCommerce && typeof global.EOBCommerce.subscribe === 'function') {
            global.EOBCommerce.subscribe('auth:changed', () => {
                clearAll();
            });
        }
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bindAuthInvalidation);
        } else {
            bindAuthInvalidation();
        }
    }

    global.EOBApiCache = {
        fetchJson,
        clearAll,
        invalidatePrefix,
        getNetworkFetchCount,
        resetNetworkFetchCount,
        DEFAULT_TTL_MS
    };
})(typeof window !== 'undefined' ? window : global);
