const { normalizeBrandingPublicUrl } = require('./brandingPaths');

const LOGO_MAX_HEIGHTS = Object.freeze({
    navbar: 36,
    compact: 36,
    'checkout-header': 28,
    nav: 36,
    footer: 36,
    track: 36,
    default: 36
});

const LOGO_MAX_WIDTHS = Object.freeze({
    navbar: 140,
    compact: 140,
    'checkout-header': 180,
    nav: 130,
    footer: 160,
    track: 180,
    default: 140
});

const LOGO_IMG_CLASSES = Object.freeze({
    'checkout-header': 'store-brand-logo checkout-step-header__logo-img',
    default: 'store-brand-logo h-8 w-auto object-contain'
});

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function getStoreLogoUrl(settings = {}) {
    return normalizeBrandingPublicUrl(settings.logoPath || settings.logoUrl || settings.storeLogo || '');
}

function renderTextFallback(storeName, variant) {
    if (variant === 'checkout-header') {
        return `<span class="store-brand-text-fallback checkout-step-header__text-fallback">${escapeHtml(storeName || 'EOnlineBazar')}</span>`;
    }
    return `<span class="store-brand-text-fallback">${escapeHtml(storeName || 'EOnlineBazar')}</span>`;
}

function renderStoreLogoMarkup(settings = {}, options = {}) {
    const variant = options.variant || 'default';
    const storeName = settings.storeName || 'EonlineBazar';
    const logoUrl = getStoreLogoUrl(settings);
    const maxHeight = LOGO_MAX_HEIGHTS[variant] || LOGO_MAX_HEIGHTS.default;
    const maxWidth = LOGO_MAX_WIDTHS[variant] || LOGO_MAX_WIDTHS.default;
    const cacheVersion = options.cacheVersion || Date.now();

    if (logoUrl) {
        const base = logoUrl.split('?')[0];
        const src = `${base}?v=${cacheVersion}`;
        const imgClass = LOGO_IMG_CLASSES[variant] || LOGO_IMG_CLASSES.default;
        const display = variant === 'checkout-header' ? 'block' : 'inline-block';
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(storeName)} Logo" class="${imgClass}" data-store-logo="" style="max-height:${maxHeight}px;max-width:${maxWidth}px;width:auto;object-fit:contain;display:${display};vertical-align:middle;">`;
    }

    return renderTextFallback(storeName, variant);
}

function injectStoreLogoSlots(html, settings = {}) {
    const cacheVersion = Date.now();

    return html.replace(
        /(<([a-zA-Z][\w-]*)\b[^>]*\bdata-store-logo-slot\b[^>]*>)([\s\S]*?)(<\/\2>)/g,
        (match, openTag, tagName, inner, closeTag) => {
            if (/\bdata-store-logo-static\b/.test(openTag)) {
                return match;
            }
            const variantMatch = openTag.match(/data-logo-variant="([^"]+)"/);
            const variant = variantMatch ? variantMatch[1] : 'default';
            const markup = renderStoreLogoMarkup(settings, { variant, cacheVersion });
            return `${openTag}${markup}${closeTag}`;
        }
    );
}

module.exports = {
    LOGO_MAX_HEIGHTS,
    LOGO_MAX_WIDTHS,
    LOGO_IMG_CLASSES,
    getStoreLogoUrl,
    renderStoreLogoMarkup,
    renderTextFallback,
    injectStoreLogoSlots
};
