/**
 * Shared URL helpers — safe query-string building and asset path validation.
 */
(function (global) {
    'use strict';

    function buildUrl(path, params) {
        const base = String(path || '/').split('?')[0].split('#')[0] || '/';

        if (params instanceof URLSearchParams) {
            const qs = params.toString();
            return qs ? `${base}?${qs}` : base;
        }

        const searchParams = new URLSearchParams();
        if (params && typeof params === 'object') {
            Object.entries(params).forEach(([key, value]) => {
                if (value == null || value === '') return;
                searchParams.set(key, String(value));
            });
        }

        const qs = searchParams.toString();
        return qs ? `${base}?${qs}` : base;
    }

    function isUnsafeAssetPath(value) {
        if (value == null) return true;
        const v = String(value).trim();
        if (!v) return true;
        if (v.startsWith('&') || v.startsWith('?')) return true;
        if (/^\/[&?]/.test(v)) return true;
        return false;
    }

    function appendCacheBust(url, token) {
        if (!url || url.startsWith('blob:') || url.startsWith('data:')) return url || '';
        const bust = token != null ? String(token) : String(Date.now());
        return url.includes('?') ? `${url}&t=${bust}` : `${url}?t=${bust}`;
    }

    function sanitizeAssetUrl(raw, prefix) {
        if (isUnsafeAssetPath(raw)) return '';
        const str = String(raw).trim();
        if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:')) {
            return str;
        }
        if (str.startsWith('/')) return str;
        const base = prefix || '/products/';
        return `${base}${str.replace(/^\/+/, '')}`;
    }

    global.EOBUrlUtils = {
        buildUrl,
        isUnsafeAssetPath,
        appendCacheBust,
        sanitizeAssetUrl
    };
})(typeof window !== 'undefined' ? window : globalThis);
