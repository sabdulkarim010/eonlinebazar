const LOGO_SVG_MAX_HEIGHTS = Object.freeze({
    navbar: 45,
    compact: 28,
    nav: 30,
    footer: 36,
    track: 38,
    default: 45
});

function escapeHtmlAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Inline SVG fallback — shopping cart + green checkmark + E-COMMERCE / ONLINE BAZAR typography.
 */
function renderDefaultLogoSvg(options = {}) {
    const variant = options.variant || 'default';
    const storeName = options.storeName || 'EonlineBazar';
    const maxHeight = LOGO_SVG_MAX_HEIGHTS[variant] || LOGO_SVG_MAX_HEIGHTS.default;
    const uid = options.uid || variant;

    return `<span class="store-brand-svg store-brand-svg--${escapeHtmlAttr(variant)}" role="img" aria-label="${escapeHtmlAttr(storeName)}">` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 550 120" class="store-brand-svg__graphic" style="max-height:${maxHeight}px;width:auto;display:inline-block;vertical-align:middle;" aria-hidden="true">` +
        '<g transform="translate(15, 10)">' +
        '<path d="M15,25 L30,25 L45,65 L85,65 L100,35 L38,35" fill="none" stroke="#1a202c" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="48" cy="82" r="9" fill="#1a202c"/>' +
        '<circle cx="82" cy="82" r="9" fill="#1a202c"/>' +
        '<circle cx="70" cy="28" r="18" fill="#2f855a"/>' +
        '<path d="M62,28 L67,33 L78,22" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</g>' +
        '<text class="logo-svg-type-top" x="135" y="55" font-family="\'Poppins\', \'Segoe UI\', sans-serif" font-size="34" font-weight="800" fill="#1a202c" letter-spacing="1">E-COMMERCE</text>' +
        '<text class="logo-svg-type-bottom" x="135" y="88" font-family="\'Poppins\', \'Segoe UI\', sans-serif" font-size="30" font-weight="700" fill="#4a5568" letter-spacing="0.5">ONLINE <tspan fill="#2f855a">BAZAR</tspan></text>' +
        '<text class="logo-svg-subtext" x="136" y="106" font-family="\'Segoe UI\', sans-serif" font-size="10" font-weight="600" fill="#a0aec0" letter-spacing="3">EASY SOLUTION</text>' +
        '</svg></span>';
}

module.exports = {
    LOGO_SVG_MAX_HEIGHTS,
    renderDefaultLogoSvg
};
