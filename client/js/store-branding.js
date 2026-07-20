/**
 * Global store branding — favicon + header logo across every customer page.
 * Settings are injected server-side as window.__STORE_SETTINGS__ and also
 * available via GET /api/store/branding.
 */
(function () {
    const DEFAULT_FAVICON = '/images/favicon.png';
    const LEGACY_PREFIX = '/images/branding/';
    const PUBLIC_PREFIX = '/uploads/branding/';

    const LOGO_SLOT_SELECTORS = [
        '.logo-box',
        '.header-brand-logo',
        '.brand-logo-text',
        '.nav-logo',
        '.logo-area',
        '.header-right-brand',
        '[data-store-logo-slot]'
    ];

    function normalizeBrandingUrl(url) {
        if (!url || typeof url !== 'string') return '';
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        return url.replace(new RegExp(`^${LEGACY_PREFIX}`), PUBLIC_PREFIX);
    }

    function cacheBust(url) {
        if (!url) return url;
        const version = window.__STORE_SETTINGS__?.v || Date.now();
        const base = url.split('?')[0];
        return `${base}?v=${version}`;
    }

    function readInlineSettings() {
        if (window.__STORE_SETTINGS__ && typeof window.__STORE_SETTINGS__ === 'object') {
            return window.__STORE_SETTINGS__;
        }
        return null;
    }

    function applySiteFavicon(url) {
        const normalized = normalizeBrandingUrl(url);
        const href = cacheBust(normalized || DEFAULT_FAVICON);

        let link = document.getElementById('dynamic-favicon')
            || document.getElementById('siteFavicon')
            || document.getElementById('adminFavicon')
            || document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');

        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            link.id = 'siteFavicon';
            document.head.appendChild(link);
        }

        link.href = href;
        link.type = href.includes('.ico') ? 'image/x-icon' : 'image/png';
    }

    function mountLogoInSlot(slot, logoUrl, storeName) {
        if (!slot || !logoUrl) return;

        const busted = cacheBust(normalizeBrandingUrl(logoUrl));
        let img = slot.querySelector('img.store-brand-logo, img[data-store-logo]');

        if (!img) {
            img = document.createElement('img');
            img.className = 'store-brand-logo';
            img.setAttribute('data-store-logo', '');
            img.alt = storeName || 'Store logo';
            slot.innerHTML = '';
            slot.appendChild(img);
        }

        img.src = busted;
        img.style.display = 'block';
        slot.classList.add('has-store-logo');
    }

    function applyStoreLogo(logoUrl, storeName) {
        const normalized = normalizeBrandingUrl(logoUrl);
        if (!normalized) return;

        document.querySelectorAll('[data-store-logo]').forEach((el) => {
            el.src = cacheBust(normalized);
            el.style.display = '';
        });

        LOGO_SLOT_SELECTORS.forEach((selector) => {
            document.querySelectorAll(selector).forEach((slot) => {
                mountLogoInSlot(slot, normalized, storeName);
            });
        });
    }

    function applyBrandingSettings(settings) {
        if (!settings) return;
        applySiteFavicon(settings.faviconPath || settings.faviconUrl);
        applyStoreLogo(settings.logoPath || settings.logoUrl, settings.storeName);
    }

    async function loadStoreBranding() {
        const inline = readInlineSettings();
        if (inline) {
            applyBrandingSettings(inline);
            return;
        }

        try {
            const res = await fetch('/api/store/branding', { cache: 'no-store' });
            const json = await res.json();
            if (!json.success || !json.data) return;

            applyBrandingSettings({
                storeName: json.data.storeName,
                logoPath: json.data.logoPath || json.data.logoUrl,
                faviconPath: json.data.faviconPath || json.data.faviconUrl
            });
        } catch (err) {
            console.warn('Store branding load failed:', err);
        }
    }

    window.refreshStoreBranding = loadStoreBranding;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadStoreBranding);
    } else {
        loadStoreBranding();
    }
})();
