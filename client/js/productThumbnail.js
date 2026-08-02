/**
 * ProductMedia / ProductThumbnail — strict media display hierarchy:
 * 1. Valid image URL/path → render image (ignore emoji)
 * 2. No valid image + item-specific emoji → render emoji only
 * 3. Neither → styled "NO PHOTO" badge (never generic 📦)
 */
(function (global) {
    'use strict';

    const GENERIC_EMOJI_ICONS = new Set(['📦', '']);
    const PLACEHOLDER_IMAGE = '/images/placeholder-product.svg';
    const IMG_ONERROR = "if(!this.dataset.fallback){this.dataset.fallback='1';this.src='" + PLACEHOLDER_IMAGE + "';}else{this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';}";

    function isPlaceholderImage(value) {
        if (!value) return false;
        const v = String(value).trim().toLowerCase();
        return v.includes('placeholder-product') || v.endsWith('/images/placeholder-product.svg');
    }

    function isUnsafeAssetPath(value) {
        if (global.EOBUrlUtils && typeof global.EOBUrlUtils.isUnsafeAssetPath === 'function') {
            return global.EOBUrlUtils.isUnsafeAssetPath(value);
        }
        if (value == null) return true;
        const v = String(value).trim();
        if (!v) return true;
        if (v.startsWith('&') || v.startsWith('?')) return true;
        return /^\/[&?]/.test(v);
    }

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
        if (lower.startsWith('http://') || lower.startsWith('https://')) {
            try {
                const u = new URL(v);
                if (!u.hostname || u.hostname.length < 2 || /^[&?#/]+$/.test(u.hostname)) return false;
            } catch (_) {
                return false;
            }
            return true;
        }
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
        if (!imageFile || isUnsafeAssetPath(imageFile)) return '';
        const raw = String(imageFile).trim();
        if (!raw || looksLikeEmojiOrIcon(raw)) return '';

        const lower = raw.toLowerCase();
        const hasExt = ['.jpg', '.png', '.jpeg', '.webp', '.gif', '.svg', '.heic'].some((ext) => lower.includes(ext));
        const isRemote = lower.startsWith('http://') || lower.startsWith('https://');
        const isRooted = raw.startsWith('/');
        const isUploads = lower.startsWith('/uploads/') || lower.startsWith('uploads/');
        const isCloudinary = lower.includes('cloudinary.com') || lower.includes('res.cloudinary.com');

        if (!hasExt && !isRemote && !isUploads && !isCloudinary) return '';

        if (isRemote || isCloudinary) return raw;
        if (isRooted) return raw;
        if (raw.startsWith('products/') || raw.startsWith('uploads/')) return '/' + raw;
        return '/products/' + raw;
    }

    /** Normalize for DOM src — resolves relative paths and keeps absolute URLs intact. */
    function toDisplayImageUrl(imageFile) {
        const resolved = resolveProductImagePath(imageFile);
        if (!resolved) return '';
        if (resolved.startsWith('http://') || resolved.startsWith('https://') || resolved.startsWith('data:')) {
            return resolved;
        }
        if (typeof global.location !== 'undefined' && global.location.origin) {
            try {
                return new URL(resolved, global.location.origin).href;
            } catch (_) {
                return resolved;
            }
        }
        return resolved;
    }

    function collectVariantImages(item) {
        const normalized = normalizeMediaItem(item);
        const variants = [
            ...(Array.isArray(normalized.selectedVariant) ? [] : []),
            ...(normalized.selectedVariant ? [normalized.selectedVariant] : []),
            ...(normalized.product && Array.isArray(normalized.product.variants) ? normalized.product.variants : []),
            ...(Array.isArray(item && item.variants) ? item.variants : [])
        ];
        const urls = [];
        variants.forEach((variant) => {
            const img = variant && variant.image;
            if (!img) return;
            const resolved = resolveProductImagePath(img);
            if (resolved && isValidProductImagePath(resolved)) urls.push(resolved);
        });
        return urls;
    }

    function normalizeMediaItem(raw) {
        if (!raw) return {};
        const product = raw.product || null;
        const selectedVariant = raw.selectedVariant && typeof raw.selectedVariant === 'object'
            ? raw.selectedVariant
            : null;
        return {
            name: raw.name || (product && product.name) || '',
            image: raw.image || raw.imageUrl || raw.photo || raw.products || raw.productImage ||
                (product && (product.image || product.imageUrl || product.photo)) || '',
            imageUrl: raw.imageUrl || (product && product.imageUrl) || '',
            selectedImage: raw.selectedImage || raw.variantImage || '',
            variantImage: raw.variantImage || raw.selectedImage || '',
            products: raw.products || '',
            emoji: raw.emojiIcon || raw.emoji || raw.icon || (product && (product.emojiIcon || product.emoji || product.icon)) || '',
            icon: raw.emojiIcon || raw.icon || (product && (product.emojiIcon || product.icon)) || '',
            images: raw.images || (product && product.images) || null,
            selectedVariant,
            product
        };
    }

    function pickCartLineImage(item) {
        const normalized = normalizeMediaItem(item);
        const candidates = [
            normalized.selectedImage,
            normalized.variantImage,
            normalized.image,
            normalized.products,
            normalized.imageUrl,
            normalized.photo,
            ...(Array.isArray(normalized.images) ? normalized.images : []),
            normalized.selectedVariant && normalized.selectedVariant.image
        ];

        for (const candidate of candidates) {
            const raw = String(candidate || '').trim();
            if (!raw || looksLikeEmojiOrIcon(raw) || isPlaceholderImage(raw)) continue;
            const resolved = resolveProductImagePath(raw);
            if (resolved && isValidProductImagePath(resolved) && !isPlaceholderImage(resolved)) return resolved;
            if (isValidProductImagePath(raw) && !isPlaceholderImage(raw)) return raw;
        }

        return '';
    }

    function mergeMediaSources(cartItem, catalogProduct) {
        const item = cartItem || {};
        const catalog = catalogProduct || {};
        const cartLineImage = pickCartLineImage(item);
        const catalogFallback = pickImageFromItem(catalog);

        return normalizeMediaItem({
            name: item.name || catalog.name,
            image: cartLineImage || catalogFallback,
            imageUrl: item.imageUrl || catalog.imageUrl || '',
            selectedImage: cartLineImage,
            variantImage: cartLineImage,
            products: cartLineImage || item.products || catalog.products || '',
            emoji: item.emojiIcon || item.emoji || item.icon || catalog.emojiIcon || catalog.emoji || catalog.icon || '',
            icon: item.emojiIcon || item.icon || catalog.emojiIcon || catalog.icon || '',
            photo: catalog.photo || item.photo || '',
            images: item.images || catalog.images || null,
            selectedVariant: item.selectedVariant || null,
            product: catalog
        });
    }

    function pickImageFromItem(item) {
        const normalized = normalizeMediaItem(item);
        const cartLineImage = pickCartLineImage(item);
        if (cartLineImage) return cartLineImage;

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
            if (!raw || looksLikeEmojiOrIcon(raw) || isPlaceholderImage(raw)) continue;
            const resolved = resolveProductImagePath(raw);
            if (resolved && isValidProductImagePath(resolved) && !isPlaceholderImage(resolved)) return resolved;
            if (isValidProductImagePath(raw) && !isPlaceholderImage(raw)) return raw;
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
            ...(normalized.product && Array.isArray(normalized.product.images) ? normalized.product.images : []),
            ...collectVariantImages(item)
        ];

        for (const candidate of candidates) {
            const raw = String(candidate || '').trim();
            if (!raw || looksLikeEmojiOrIcon(raw) || isPlaceholderImage(raw)) continue;
            const resolved = resolveProductImagePath(raw);
            const finalUrl = (resolved && isValidProductImagePath(resolved) && !isPlaceholderImage(resolved))
                ? resolved
                : (isValidProductImagePath(raw) && !isPlaceholderImage(raw) ? raw : '');
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
            normalized.product && normalized.product.emojiIcon,
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
            const displaySrc = toDisplayImageUrl(state.image) || state.image;
            const fallback = state.emoji
                ? `<div class="${classes.emoji}" style="display:none" aria-hidden="true">${esc(state.emoji)}</div>`
                : `<div class="${classes.noPhoto}" style="display:none" aria-hidden="true"><span>NO PHOTO</span></div>`;

            return `<img src="${esc(displaySrc)}" class="${classes.img}" alt="${esc(alt)}"${loading}${sizeAttrs} onerror="${IMG_ONERROR}">${fallback}`;
        }

        if (state.type === 'emoji') {
            return `<div class="${classes.emoji}" aria-hidden="true">${esc(state.emoji)}</div>`;
        }

        return `<div class="${classes.noPhoto}" aria-hidden="true"><span>NO PHOTO</span></div>`;
    }

    function ensureFallbackSibling(img, altText) {
        if (!img || !img.parentElement) return null;
        let sibling = img.nextElementSibling;
        if (sibling && (sibling.classList.contains('no-photo-badge') || sibling.classList.contains('prod-emoji-box'))) {
            return sibling;
        }
        sibling = document.createElement('div');
        sibling.className = 'no-photo-badge no-photo-badge--detail';
        sibling.setAttribute('aria-hidden', 'true');
        sibling.innerHTML = '<span>NO PHOTO</span>';
        sibling.style.display = 'none';
        img.parentElement.appendChild(sibling);
        return sibling;
    }

    function attachImageFallback(img, placeholder) {
        if (!img || img.dataset.eobFallbackBound) return;
        img.dataset.eobFallbackBound = '1';
        const fallbackSrc = placeholder || PLACEHOLDER_IMAGE;
        ensureFallbackSibling(img);
        img.addEventListener('error', function handleImageError() {
            if (this.dataset.fallbackApplied === '1') {
                this.style.display = 'none';
                const sibling = this.nextElementSibling;
                if (sibling) sibling.style.display = 'flex';
                return;
            }
            this.dataset.fallbackApplied = '1';
            this.src = fallbackSrc;
        });
    }

    function mountInto(container, item, options) {
        if (!container) return;
        container.innerHTML = buildThumbnailHtml(item, options);
        const img = container.querySelector('img');
        if (img) attachImageFallback(img);
    }

    function buildForCartItem(cartItem, catalogProduct, options) {
        return buildThumbnailHtml(mergeMediaSources(cartItem, catalogProduct), options);
    }

    function mountCartItemInto(container, cartItem, catalogProduct, options) {
        if (!container) return;
        container.innerHTML = buildForCartItem(cartItem, catalogProduct, options);
        const img = container.querySelector('img');
        if (img) attachImageFallback(img);
    }

    /** Global HTML helper — wraps buildThumbnailHtml (image → emoji → NO PHOTO). */
    function getProductImageHtml(item, size) {
        const sizeMap = { sm: 'compact', md: 'compact', lg: 'card' };
        const variant = sizeMap[size] || 'compact';
        return buildThumbnailHtml(item, { variant, alt: (item && item.name) || 'Product' });
    }

    function getProductEmojiOrPlaceholder(emoji, px) {
        const esc = escapeHtml;
        const pxVal = px || '50px';
        if (emoji && isSpecificEmoji(emoji)) {
            return `<div class="prod-emoji-box" style="width:${esc(pxVal)};height:${esc(pxVal)};font-size:calc(${esc(pxVal)} * 0.55)">${esc(emoji)}</div>`;
        }
        return `<div class="no-photo-badge" style="width:${esc(pxVal)};height:${esc(pxVal)}"><span>NO PHOTO</span></div>`;
    }

    const api = {
        IMG_ONERROR,
        PLACEHOLDER_IMAGE,
        isPlaceholderImage,
        escapeHtml,
        isUnsafeAssetPath,
        attachImageFallback,
        isValidProductImagePath,
        looksLikeEmojiOrIcon,
        resolveProductImagePath,
        toDisplayImageUrl,
        collectVariantImages,
        normalizeMediaItem,
        mergeMediaSources,
        pickImageFromItem,
        pickCartLineImage,
        pickAllValidImages,
        pickEmojiFromItem,
        resolveMediaState,
        getDisplayMeta,
        buildThumbnailHtml,
        buildForCartItem,
        mountInto,
        mountCartItemInto,
        getProductImageHtml,
        getProductEmojiOrPlaceholder
    };

    global.ProductThumbnail = api;
    global.ProductMedia = api;
    global.getProductImageHtml = getProductImageHtml;
    global.getProductEmojiOrPlaceholder = getProductEmojiOrPlaceholder;
})(typeof window !== 'undefined' ? window : globalThis);
