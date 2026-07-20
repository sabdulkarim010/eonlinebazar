const DEFAULT_FAVICON = '/images/favicon.png';
const { getStoreLogoUrl, injectStoreLogoSlots } = require('./storeLogoMarkup');

const PoppinsFontLink = '    <link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;800&display=swap" rel="stylesheet">';

function escapeHtmlAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function buildInlineSettings(settings, cacheVersion) {
    const faviconPath = settings.faviconPath || settings.faviconUrl || DEFAULT_FAVICON;
    const logoPath = getStoreLogoUrl(settings);
    const storeName = settings.storeName || 'EonlineBazar';

    return {
        storeName,
        logoPath,
        faviconPath,
        logoUrl: logoPath,
        faviconUrl: faviconPath,
        storeLogo: logoPath,
        v: cacheVersion
    };
}

function injectBrandingScripts(html) {
    const script = '<script src="/js/store-branding.js"></script>';

    if (html.includes('store-branding.js')) {
        return html.replace(/\s*<script[^>]*src="\/js\/store-logo-svg\.js"[^>]*><\/script>\s*/gi, '');
    }

    return html.replace('</head>', `    ${script}\n</head>`);
}

function injectInlineSettingsScript(html, inlineSettings) {
    const settingsScript = `<script>window.__STORE_SETTINGS__=${JSON.stringify(inlineSettings)};</script>`;

    if (html.includes('window.__STORE_SETTINGS__')) {
        return html.replace(
            /<script>window\.__STORE_SETTINGS__=[\s\S]*?<\/script>\s*/i,
            `${settingsScript}\n    `
        );
    }

    if (html.includes('store-branding.js')) {
        return html.replace(
            /(<script[^>]*src="\/js\/store-branding\.js"[^>]*><\/script>)/i,
            `${settingsScript}\n    $1`
        );
    }

    return html.replace('</head>', `${settingsScript}\n    <script src="/js/store-branding.js"></script>\n</head>`);
}

function injectPoppinsFont(html) {
    if (html.includes('family=Poppins')) return html;
    return html.replace('</head>', `${PoppinsFontLink}\n</head>`);
}

function applyBrandingToHtml(html, settings = {}) {
    const faviconPath = settings.faviconPath || settings.faviconUrl || DEFAULT_FAVICON;
    const cacheVersion = Date.now();
    const inlineSettings = buildInlineSettings(settings, cacheVersion);

    let output = html.replace(/<link rel="(?:shortcut )?icon"[^>]*>\s*/gi, '');
    output = injectStoreLogoSlots(output, settings);
    output = injectPoppinsFont(output);
    output = injectBrandingScripts(output);
    output = injectInlineSettingsScript(output, inlineSettings);

    const faviconTag = `<link rel="icon" id="dynamic-favicon" href="${escapeHtmlAttr(`${faviconPath}?v=${cacheVersion}`)}" type="image/png">`;

    if (output.match(/<link rel="icon" id="(?:dynamic-favicon|siteFavicon|adminFavicon)"[^>]*>/i)) {
        output = output.replace(
            /<link rel="icon" id="(?:dynamic-favicon|siteFavicon|adminFavicon)"[^>]*>/i,
            faviconTag
        );
    } else {
        output = output.replace('</head>', `    ${faviconTag}\n</head>`);
    }

    return output;
}

module.exports = {
    applyBrandingToHtml,
    DEFAULT_FAVICON
};
