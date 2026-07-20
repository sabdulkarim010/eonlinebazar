const { normalizeBrandingPublicUrl } = require('./brandingPaths');
const { renderDefaultLogoSvg } = require('./defaultStoreLogoSvg');

const LOGO_MAX_HEIGHTS = Object.freeze({
    navbar: 42,
    compact: 28,
    nav: 32,
    footer: 36,
    track: 40,
    default: 45
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

function renderTextFallback(storeName, variant = 'default') {
    return renderDefaultLogoSvg({ storeName, variant });
}

function renderStoreLogoMarkup(settings = {}, options = {}) {
    const variant = options.variant || 'default';
    const storeName = settings.storeName || 'EonlineBazar';
    const logoUrl = getStoreLogoUrl(settings);
    const maxHeight = LOGO_MAX_HEIGHTS[variant] || LOGO_MAX_HEIGHTS.default;
    const cacheVersion = options.cacheVersion || Date.now();

    if (logoUrl) {
        const base = logoUrl.split('?')[0];
        const src = `${base}?v=${cacheVersion}`;
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(storeName)} Logo" class="store-brand-logo" data-store-logo="" style="max-height:${maxHeight}px;width:auto;object-fit:contain;">`;
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
    getStoreLogoUrl,
    renderStoreLogoMarkup,
    renderTextFallback,
    injectStoreLogoSlots
};
