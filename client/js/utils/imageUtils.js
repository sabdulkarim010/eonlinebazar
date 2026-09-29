/**
 * Storefront image pipeline — lazy loading, LCP priority, dimensions, responsive CDN URLs.
 */
(function initEOBImageUtils(global) {
    'use strict';

    const PLACEHOLDER = '/images/placeholder-product.svg';

    const VARIANT_DIMS = {
        card: { width: 120, height: 120, sizes: '(max-width: 480px) 28vw, (max-width: 768px) 20vw, 12vw', srcsetWidths: [120, 240, 360] },
        compact: { width: 52, height: 52, sizes: '52px', srcsetWidths: [56, 112] },
        detail: { width: 480, height: 480, sizes: '(max-width: 768px) 100vw, 480px', srcsetWidths: [480, 720, 960] },
        hero: { width: 1920, height: 400, sizes: '100vw', srcsetWidths: [768, 1200, 1920] }
    };

    function escapeAttr(value) {
        return String(value == null ? '' : value).replace(/"/g, '&quot;');
    }

    function isCloudinaryUrl(url) {
        const lower = String(url || '').trim().toLowerCase();
        return lower.includes('res.cloudinary.com') || lower.includes('cloudinary.com/');
    }

    function sanitizeCatalogImageUrl(raw) {
        const PT = global.ProductThumbnail;
        if (PT && typeof PT.resolveProductImagePath === 'function') {
            const resolved = PT.resolveProductImagePath(raw);
            if (resolved) {
                return PT.toDisplayImageUrl ? PT.toDisplayImageUrl(resolved) : resolved;
            }
        }
        if (PT && typeof PT.isUnsafeAssetPath === 'function' && PT.isUnsafeAssetPath(raw)) {
            return '';
        }
        const v = String(raw || '').trim();
        if (!v) return '';
        if (/^https?:\/\//i.test(v) || v.startsWith('/')) return v;
        return `/products/${v.replace(/^\/+/, '')}`;
    }

    function injectCloudinaryTransform(url, transform) {
        if (!url || !transform || !isCloudinaryUrl(url)) return url;
        const marker = '/upload/';
        const idx = url.indexOf(marker);
        if (idx === -1) return url;
        const head = url.slice(0, idx + marker.length);
        const tail = url.slice(idx + marker.length);
        const first = tail.split('/')[0] || '';
        if (/^(w_|c_|q_|f_|g_)/.test(first)) {
            return url;
        }
        return `${head}${transform}/${tail}`;
    }

    function buildResponsiveUrl(url, width) {
        const safe = sanitizeCatalogImageUrl(url) || url;
        if (!safe) return '';
        if (isCloudinaryUrl(safe)) {
            return injectCloudinaryTransform(safe, `w_${width},q_auto,f_auto,c_limit`);
        }
        return safe;
    }

    function buildSrcSet(url, widths) {
        const list = Array.isArray(widths) ? widths : [];
        if (!url || !list.length) return '';
        const parts = list
            .map((w) => {
                const variant = buildResponsiveUrl(url, w);
                return variant ? `${variant} ${w}w` : '';
            })
            .filter(Boolean);
        return parts.join(', ');
    }

    function resolvePriority(options) {
        if (options.priority === 'lcp' || options.priority === 'high') return 'lcp';
        if (options.loading === 'eager' || options.fetchPriority === 'high') return 'lcp';
        return 'lazy';
    }

    function getVariantDimensions(variant) {
        return VARIANT_DIMS[variant] || VARIANT_DIMS.compact;
    }

    function getLoadingAttributes(priority) {
        if (priority === 'lcp') {
            return {
                loading: 'eager',
                decoding: 'async',
                fetchPriority: 'high'
            };
        }
        return {
            loading: 'lazy',
            decoding: 'async',
            fetchPriority: 'auto'
        };
    }

    function getOnErrorHandler() {
        const PT = global.ProductThumbnail;
        if (PT && PT.IMG_ONERROR) return PT.IMG_ONERROR;
        return `if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${PLACEHOLDER}';}else{this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';}`;
    }

    function buildProductImageAttributes(src, options) {
        const opts = options || {};
        const variant = opts.variant || 'compact';
        const dims = getVariantDimensions(variant);
        const priority = resolvePriority(opts);
        const load = getLoadingAttributes(priority);
        const displaySrc = sanitizeCatalogImageUrl(src) || String(src || '').trim();
        const srcset = buildSrcSet(displaySrc, opts.srcsetWidths || dims.srcsetWidths);
        const attrs = {
            src: buildResponsiveUrl(displaySrc, dims.srcsetWidths[1] || dims.width) || displaySrc || PLACEHOLDER,
            alt: opts.alt || '',
            width: opts.width || dims.width,
            height: opts.height || dims.height,
            loading: opts.loading || load.loading,
            decoding: opts.decoding || load.decoding,
            fetchPriority: opts.fetchPriority || load.fetchPriority,
            sizes: opts.sizes || dims.sizes,
            srcset: srcset || '',
            className: opts.className || '',
            onerror: opts.onerror || getOnErrorHandler()
        };
        if (priority !== 'lcp') {
            if (attrs.fetchPriority === 'high') attrs.fetchPriority = 'auto';
        }
        if (priority === 'lcp') {
            attrs.loading = 'eager';
            attrs.fetchPriority = 'high';
        }
        return attrs;
    }

    function attrsToHtml(attrs) {
        const a = attrs || {};
        const parts = [
            `src="${escapeAttr(a.src)}"`,
            `alt="${escapeAttr(a.alt)}"`,
            `width="${Number(a.width) || 120}"`,
            `height="${Number(a.height) || 120}"`,
            `loading="${escapeAttr(a.loading || 'lazy')}"`,
            `decoding="${escapeAttr(a.decoding || 'async')}"`
        ];
        if (a.fetchPriority && a.fetchPriority !== 'auto') {
            parts.push(`fetchpriority="${escapeAttr(a.fetchPriority)}"`);
        }
        if (a.srcset) {
            parts.push(`srcset="${escapeAttr(a.srcset)}"`);
            parts.push(`sizes="${escapeAttr(a.sizes || '100vw')}"`);
        }
        if (a.className) parts.push(`class="${escapeAttr(a.className)}"`);
        parts.push(`onerror="${escapeAttr(a.onerror)}"`);
        return parts.join(' ');
    }

    function buildImgHtml(attrs) {
        return `<img ${attrsToHtml(attrs)}>`;
    }

    function applyToImgElement(img, options) {
        if (!img) return img;
        const src = img.getAttribute('src') || img.src || options.src;
        const attrs = buildProductImageAttributes(src, options);
        img.src = attrs.src;
        img.alt = attrs.alt || img.alt || '';
        img.width = attrs.width;
        img.height = attrs.height;
        img.loading = attrs.loading;
        img.decoding = attrs.decoding;
        if (attrs.fetchPriority === 'high') {
            img.setAttribute('fetchpriority', 'high');
        } else {
            img.removeAttribute('fetchpriority');
        }
        if (attrs.srcset) {
            img.srcset = attrs.srcset;
            img.sizes = attrs.sizes;
        } else {
            img.removeAttribute('srcset');
            img.removeAttribute('sizes');
        }
        if (!img.getAttribute('onerror')) {
            img.setAttribute('onerror', attrs.onerror);
        }
        const PT = global.ProductThumbnail;
        if (PT && typeof PT.attachImageFallback === 'function') {
            PT.attachImageFallback(img);
        }
        return img;
    }

    function buildHeroBannerAttributes(src, options) {
        return buildProductImageAttributes(src, {
            ...options,
            variant: 'hero',
            priority: 'lcp',
            className: options?.className || 'banner-bg'
        });
    }

    const api = {
        PLACEHOLDER,
        VARIANT_DIMS,
        sanitizeCatalogImageUrl,
        buildResponsiveUrl,
        buildSrcSet,
        getVariantDimensions,
        getLoadingAttributes,
        resolvePriority,
        buildProductImageAttributes,
        buildHeroBannerAttributes,
        buildImgHtml,
        attrsToHtml,
        applyToImgElement,
        getOnErrorHandler,
        isCloudinaryUrl
    };

    global.EOBImageUtils = api;
})(typeof window !== 'undefined' ? window : global);
