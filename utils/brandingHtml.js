const DEFAULT_FAVICON = '/images/favicon.png';

function escapeHtmlAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function applyBrandingToHtml(html, settings = {}) {
    const faviconPath = settings.faviconPath || settings.faviconUrl || DEFAULT_FAVICON;
    const logoPath = settings.logoPath || settings.logoUrl || '';
    const storeName = settings.storeName || 'EonlineBazar';
    const cacheVersion = Date.now();

    let output = html.replace(/<link rel="(?:shortcut )?icon"[^>]*>\s*/gi, '');

    const inlineSettings = {
        storeName,
        logoPath,
        faviconPath,
        logoUrl: logoPath,
        faviconUrl: faviconPath,
        v: cacheVersion
    };

    const headInjection = [
        `    <link rel="icon" id="dynamic-favicon" href="${escapeHtmlAttr(`${faviconPath}?v=${cacheVersion}`)}" type="image/png">`,
        `    <script>window.__STORE_SETTINGS__=${JSON.stringify(inlineSettings)};</script>`,
        '    <script src="/js/store-branding.js"></script>'
    ].join('\n');

    if (output.includes('store-branding.js')) {
        if (!output.includes('window.__STORE_SETTINGS__')) {
            output = output.replace(
                /<script src="\/js\/store-branding\.js"><\/script>/,
                `${headInjection.split('\n').slice(1).join('\n')}`
            );
        }
        output = output.replace(
            /<link rel="icon" id="(?:dynamic-favicon|siteFavicon|adminFavicon)"[^>]*>/i,
            `<link rel="icon" id="dynamic-favicon" href="${escapeHtmlAttr(`${faviconPath}?v=${cacheVersion}`)}" type="image/png">`
        );
        return output;
    }

    return output.replace('</head>', `${headInjection}\n</head>`);
}

module.exports = {
    applyBrandingToHtml,
    DEFAULT_FAVICON
};
