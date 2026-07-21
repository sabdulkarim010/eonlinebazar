/**
 * ProductMedia / ProductThumbnail — strict media display hierarchy:
 * 1. Valid image URL/path → render image (ignore emoji)
 * 2. No valid image + item-specific emoji → render emoji only
 * 3. Neither → styled "NO PHOTO" badge (never generic 📦)
 */
(function (global) {
    'use strict';

    const GENERIC_EMOJI_ICONS = new Set(['📦', '']);
    const IMG_ONERROR = "this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';";

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isValidProductImagePath(value) {
        if (!value) return false;
        const v = String(value).trim();
        if (!v) return false;
        const lower = v.toLowerCase();
        if (lower.startsWith('http://') || lower.startsWith('https://')) return true;
        if (lower.startsWith('/uploads/')) return true;
        if (/\.(jpg|jpeg|png|webp|gif|svg|heic)(\?.*)?$/i.test(lower)) return true;
        if ((lower.startsWith('/') || lower.startsWith('products/') || lower.startsWith('uploads/')) &&
            /\.(jpg|jpeg|png|webp|gif|svg|heic)/i.test(lower)) {
            return true;
        }
        return false;
    }

    function looksLikeEmojiOrIcon(value) {
        if (!value) return false;
        const v = String(value).trim();
        if (!v || isValidProductImagePath(v)) return false;
        return v.length <= 8 && !/[\\/.]/.test(v);
    }

    function resolveProductImagePath(imageFile) {
        if (!imageFile) return '';
        const raw = String(imageFile).trim();
        if (!raw || looksLikeEmojiOrIcon(raw)) return '';

        const lower = raw.toLowerCase();
        const hasExt = ['.jpg', '.png', '.jpeg', '.webp', '.gif', '.svg', '.heic'].some((ext) => lower.includes(ext));
        if (!hasExt && !raw.startsWith('http') && !raw.startsWith('/uploads/')) return '';

        if (raw.startsWith('http') || raw.startsWith('/')) return raw;
        if (raw.startsWith('products/') || raw.startsWith('uploads/')) return '/' + raw;
        return '/products/' + raw;
    }

    function normalizeMediaItem(raw) {
        if (!raw) return {};
        const product = raw.product || null;
        return {
            name: raw.name || (product && product.name) || '',
            image: raw.image || raw.imageUrl || raw.photo || raw.products || raw.productImage ||
                (product && (product.image || product.imageUrl || product.photo)) || '',
            imageUrl: raw.imageUrl || (product && product.imageUrl) || '',
            emoji: raw.emoji || raw.icon || (product && (product.emoji || product.icon)) || '',
            icon: raw.icon || (product && product.icon) || '',
            images: raw.images || (product && product.images) || null,
            product
        };
    }

    function mergeMediaSources(cartItem, catalogProduct) {
        const item = cartItem || {};
        const catalog = catalogProduct || {};
        return normalizeMediaItem({
            name: item.name || catalog.name,
            image: catalog.image || catalog.imageUrl || item.image || item.products || catalog.photo || '',
            imageUrl: catalog.imageUrl || item.imageUrl || '',
            emoji: item.emoji || item.icon || catalog.emoji || catalog.icon || '',
            icon: item.icon || catalog.icon || '',
            photo: catalog.photo || item.photo || '',
            products: item.products || catalog.products || '',
            images: catalog.images || item.images || null,
            product: catalog
        });
    }

    function pickImageFromItem(item) {
        const normalized = normalizeMediaItem(item);
        const candidates = [
            normalized.image,
            normalized.imageUrl,
            ...(Array.isArray(normalized.images) ? normalized.images : []),
            normalized.product && normalized.product.image,
            normalized.product && normalized.product.imageUrl,
            normalized.product && Array.isArray(normalized.product.images) ? normalized.product.images[0] : ''
        ];

        for (const candidate of candidates) {
            const raw = String(candidate || '').trim();
            if (!raw || looksLikeEmojiOrIcon(raw)) continue;
            const resolved = resolveProductImagePath(raw);
            if (resolved && isValidProductImagePath(resolved)) return resolved;
            if (isValidProductImagePath(raw)) return raw;
        }

        return '';
    }

    function pickAllValidImages(item) {
        const normalized = normalizeMediaItem(item);
        const seen = new Set();
        const results = [];

        const candidates = [
            ...(Array.isArray(normalized.images) ? normalized.images : []),
            normalized.image,
            normalized.imageUrl,
            normalized.product && normalized.product.image,
            normalized.product && normalized.product.imageUrl,
            ...(normalized.product && Array.isArray(normalized.product.images) ? normalized.product.images : [])
        ];

        for (const candidate of candidates) {
            const raw = String(candidate || '').trim();
            if (!raw || looksLikeEmojiOrIcon(raw)) continue;
            const resolved = resolveProductImagePath(raw);
            const finalUrl = (resolved && isValidProductImagePath(resolved))
                ? resolved
                : (isValidProductImagePath(raw) ? raw : '');
            if (finalUrl && !seen.has(finalUrl)) {
                seen.add(finalUrl);
                results.push(finalUrl);
            }
        }

        return results;
    }

    function isSpecificEmoji(value) {
        const v = String(value || '').trim();
        if (!v || GENERIC_EMOJI_ICONS.has(v)) return false;
        return looksLikeEmojiOrIcon(v);
    }

    function pickEmojiFromItem(item) {
        const normalized = normalizeMediaItem(item);

        const candidates = [
            normalized.emoji,
            normalized.icon,
            normalized.product && normalized.product.emoji,
            normalized.product && normalized.product.icon,
            looksLikeEmojiOrIcon(normalized.image) ? normalized.image : '',
            looksLikeEmojiOrIcon(normalized.imageUrl) ? normalized.imageUrl : ''
        ];

        for (const candidate of candidates) {
            if (isSpecificEmoji(candidate)) return String(candidate).trim();
        }

        return '';
    }

    /** Strict hierarchy: image > emoji > no-photo */
    function resolveMediaState(item) {
        const image = pickImageFromItem(item);
        const emoji = pickEmojiFromItem(item);

        if (image) {
            return { type: 'image', image, emoji };
        }
        if (emoji) {
            return { type: 'emoji', image: '', emoji };
        }
        return { type: 'no-photo', image: '', emoji: '' };
    }

    function getDisplayMeta(item) {
        const state = resolveMediaState(item);
        return {
            type: state.type,
            image: state.image,
            emoji: state.emoji
        };
    }

    function getVariantClasses(variant) {
        switch (variant) {
            case 'card':
                return {
                    img: 'prod-thumb-img prod-thumb-img--card',
                    emoji: 'prod-emoji-box prod-emoji-box--card',
                    noPhoto: 'no-photo-badge no-photo-badge--card'
                };
            case 'detail':
                return {
                    img: 'prod-thumb-img prod-thumb-img--detail',
                    emoji: 'prod-emoji-box prod-emoji-box--detail',
                    noPhoto: 'no-photo-badge no-photo-badge--detail'
                };
            default:
                return {
                    img: 'prod-thumb-img',
                    emoji: 'prod-emoji-box',
                    noPhoto: 'no-photo-badge'
                };
        }
    }

    function buildThumbnailHtml(item, options) {
        const opts = options || {};
        const variant = opts.variant || 'compact';
        const classes = getVariantClasses(variant);
        const esc = typeof opts.escapeHtml === 'function' ? opts.escapeHtml : escapeHtml;
        const alt = opts.alt != null ? opts.alt : (normalizeMediaItem(item).name || '');
        const loading = opts.loading ? ` loading="${esc(opts.loading)}"` : '';
        const state = resolveMediaState(item);
        const sizeAttrs = variant === 'compact' ? ' width="50" height="50"' : '';

        if (state.type === 'image') {
            const fallback = state.emoji
                ? `<div class="${classes.emoji}" style="display:none" aria-hidden="true">${esc(state.emoji)}</div>`
                : `<div class="${classes.noPhoto}" style="display:none" aria-hidden="true"><span>NO PHOTO</span></div>`;

            return `<img src="${esc(state.image)}" class="${classes.img}" alt="${esc(alt)}"${loading}${sizeAttrs} onerror="${IMG_ONERROR}">${fallback}`;
        }

        if (state.type === 'emoji') {
            return `<div class="${classes.emoji}" aria-hidden="true">${esc(state.emoji)}</div>`;
        }

        return `<div class="${classes.noPhoto}" aria-hidden="true"><span>NO PHOTO</span></div>`;
    }

    function mountInto(container, item, options) {
        if (!container) return;
        container.innerHTML = buildThumbnailHtml(item, options);
    }

    function buildForCartItem(cartItem, catalogProduct, options) {
        return buildThumbnailHtml(mergeMediaSources(cartItem, catalogProduct), options);
    }

    function mountCartItemInto(container, cartItem, catalogProduct, options) {
        if (!container) return;
        container.innerHTML = buildForCartItem(cartItem, catalogProduct, options);
    }

    const api = {
        IMG_ONERROR,
        escapeHtml,
        isValidProductImagePath,
        looksLikeEmojiOrIcon,
        resolveProductImagePath,
        normalizeMediaItem,
        mergeMediaSources,
        pickImageFromItem,
        pickAllValidImages,
        pickEmojiFromItem,
        resolveMediaState,
        getDisplayMeta,
        buildThumbnailHtml,
        buildForCartItem,
        mountInto,
        mountCartItemInto
    };

    global.ProductThumbnail = api;
    global.ProductMedia = api;
})(typeof window !== 'undefined' ? window : globalThis);
