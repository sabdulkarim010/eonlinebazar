const DEFAULT_FAVICON = '/images/favicon.png';
const { getStoreLogoUrl, injectStoreLogoSlots } = require('./storeLogoMarkup');
const { getAnalyticsScript } = require('./analyticsHelper');

const PoppinsFontLink = '    <link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
    '    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;800&display=swap" rel="stylesheet">';

const PWA_THEME_COLOR = '#131921';

const STOREFRONT_PAGES = new Set([
    'index.html',
    'search.html',
    'cart.html',
    'product-details.html',
    'profile.html',
    'login.html',
    'register.html',
    'checkout.html',
    'payment.html',
    'order-track.html',
    'order-details.html',
    'about.html',
    'contact.html',
    'forgot-password.html',
    'verify-otp.html',
    'cms-page.html',
    'access-denied.html',
    '404.html'
]);

const PWA_HEAD_TAGS = `    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="${PWA_THEME_COLOR}">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="EOnlineBazar">
    <link rel="apple-touch-icon" href="/images/icons/icon-192x192.png">`;

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
        publicSupportWhatsApp: settings.publicSupportWhatsApp || '',
        paymentGateways: settings.paymentGateways || null,
        enabledPaymentMethods: settings.enabledPaymentMethods || null,
        activePaymentGateways: settings.activePaymentGateways || null,
        activePaymentMethods: settings.activePaymentMethods || null,
        systemSettings: {
            paymentGateways: settings.paymentGateways || null,
            enabledPaymentMethods: settings.enabledPaymentMethods || null,
            activePaymentGateways: settings.activePaymentGateways || null,
            activePaymentMethods: settings.activePaymentMethods || null
        },
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

function injectPwaTags(html, filename) {
    if (!filename || !STOREFRONT_PAGES.has(filename)) return html;
    if (html.includes('rel="manifest"')) return html;

    let output = html.replace('</head>', `${PWA_HEAD_TAGS}\n</head>`);

    if (!output.includes('/js/pwa.js')) {
        output = output.replace('</body>', '    <script src="/js/pwa.js"></script>\n</body>');
    }

    return output;
}

function injectAnalytics(html, filename) {
    if (!filename || !STOREFRONT_PAGES.has(filename)) return html;
    if (html.includes('/js/analytics.js')) return html;

    const analyticsScript = getAnalyticsScript();
    const analyticsJsTag = '    <script src="/js/analytics.js"></script>';
    const injection = [analyticsScript.trim(), analyticsJsTag].filter(Boolean).join('\n');

    return html.replace('</head>', `${injection}\n</head>`);
}

function applyBrandingToHtml(html, settings = {}, options = {}) {
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

    output = injectPwaTags(output, options.filename);
    output = injectAnalytics(output, options.filename);

    return output;
}

module.exports = {
    applyBrandingToHtml,
    DEFAULT_FAVICON
};
