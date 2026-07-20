/**
 * Global store branding — favicon + dynamic header logo across every customer page.
 * Settings are injected server-side as window.__STORE_SETTINGS__ and also
 * available via GET /api/store/branding.
 */
(function () {
    const DEFAULT_FAVICON = '/images/favicon.png';
    const LEGACY_PREFIX = '/images/branding/';
    const PUBLIC_PREFIX = '/uploads/branding/';
    const BRANDING_SYNC_KEY = 'eonlinebazar.brandingUpdatedAt';

    const LOGO_MAX_HEIGHTS = {
        navbar: 32,
        compact: 28,
        'checkout-header': 55,
        nav: 32,
        footer: 36,
        track: 40,
        default: 32
    };

    const LOGO_MAX_WIDTHS = {
        navbar: 140,
        compact: 140,
        'checkout-header': 180,
        nav: 130,
        footer: 160,
        track: 180,
        default: 140
    };

    const LOGO_IMG_CLASSES = {
        'checkout-header': 'store-brand-logo checkout-step-header__logo-img',
        default: 'store-brand-logo h-8 w-auto object-contain'
    };

    const LOGO_SLOT_SELECTORS = [
        '[data-store-logo-slot]',
        '.logo-box',
        '.header-brand-logo',
        '.brand-logo-text',
        '.nav-logo',
        '.logo-area',
        '.header-right-brand',
        '.payment-header-right-brand',
        '.checkout-step-header__brand',
        '.footer-logo-text'
    ];

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

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

    function normalizeSettingsPayload(raw) {
        if (!raw) return null;

        const logoPath = normalizeBrandingUrl(
            raw.logoPath || raw.logoUrl || raw.storeLogo || ''
        );

        return {
            storeName: raw.storeName || 'EonlineBazar',
            logoPath,
            logoUrl: logoPath,
            storeLogo: logoPath,
            faviconPath: raw.faviconPath || raw.faviconUrl || DEFAULT_FAVICON,
            faviconUrl: raw.faviconPath || raw.faviconUrl || DEFAULT_FAVICON,
            v: raw.v || Date.now()
        };
    }

    function inferLogoVariant(slot) {
        const explicit = slot.getAttribute('data-logo-variant');
        if (explicit) return explicit;

        if (slot.classList.contains('logo-box')) return 'navbar';
        if (slot.classList.contains('header-brand-logo')
            || slot.classList.contains('header-right-brand')
            || slot.classList.contains('payment-header-right-brand')
            || slot.classList.contains('checkout-step-header__brand')
            || slot.classList.contains('brand-logo-text')) {
            return 'compact';
        }
        if (slot.classList.contains('nav-logo')) return 'nav';
        if (slot.classList.contains('logo-area')) return 'track';
        if (slot.classList.contains('footer-logo-text')) return 'footer';

        return 'default';
    }

    function renderTextFallback(storeName, variant) {
        if (variant === 'checkout-header') {
            return `<span class="store-brand-text-fallback checkout-step-header__text-fallback">${escapeHtml(storeName || 'EOnlineBazar')}</span>`;
        }
        return `<span class="store-brand-text-fallback">${escapeHtml(storeName || 'EOnlineBazar')}</span>`;
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

    function isStaticLogoSlot(slot) {
        return slot.hasAttribute('data-store-logo-static')
            || slot.querySelector('.store-logo-static') !== null;
    }

    function applyLogoToSlot(slot, settings) {
        if (!slot || isStaticLogoSlot(slot)) return;

        const variant = inferLogoVariant(slot);
        const storeName = settings.storeName || 'EonlineBazar';
        const logoUrl = normalizeBrandingUrl(
            settings.logoPath || settings.logoUrl || settings.storeLogo || ''
        );
        const maxHeight = LOGO_MAX_HEIGHTS[variant] || LOGO_MAX_HEIGHTS.default;
        const maxWidth = LOGO_MAX_WIDTHS[variant] || LOGO_MAX_WIDTHS.default;

        slot.innerHTML = '';
        slot.classList.remove('has-store-logo', 'has-store-brand-svg', 'has-store-brand-text');

        if (logoUrl) {
            const img = document.createElement('img');
            img.className = LOGO_IMG_CLASSES[variant] || LOGO_IMG_CLASSES.default;
            img.setAttribute('data-store-logo', '');
            img.alt = `${storeName} Logo`;
            img.src = cacheBust(logoUrl);
            img.style.maxHeight = `${maxHeight}px`;
            img.style.maxWidth = `${maxWidth}px`;
            img.style.width = 'auto';
            img.style.objectFit = 'contain';
            img.style.display = variant === 'checkout-header' ? 'block' : 'inline-block';
            img.style.verticalAlign = 'middle';
            slot.appendChild(img);
            slot.classList.add('has-store-logo');
            return;
        }

        slot.innerHTML = renderTextFallback(storeName, variant);
        slot.classList.add('has-store-brand-text');
    }

    function collectLogoSlots() {
        const slots = new Set();

        LOGO_SLOT_SELECTORS.forEach((selector) => {
            document.querySelectorAll(selector).forEach((slot) => {
                if (isStaticLogoSlot(slot)) return;
                if (!slot.hasAttribute('data-store-logo-slot')) {
                    slot.setAttribute('data-store-logo-slot', '');
                }
                slots.add(slot);
            });
        });

        return [...slots];
    }

    function applyBrandingSettings(settings) {
        const normalized = normalizeSettingsPayload(settings);
        if (!normalized) return;

        applySiteFavicon(normalized.faviconPath);
        collectLogoSlots().forEach((slot) => applyLogoToSlot(slot, normalized));
        window.__STORE_SETTINGS__ = normalized;
    }

    async function fetchBrandingFromApi() {
        const res = await fetch('/api/store/branding', { cache: 'no-store' });
        const json = await res.json();
        if (!json.success || !json.data) return null;
        return normalizeSettingsPayload(json.data);
    }

    async function loadStoreBranding(forceFetch = false) {
        if (!forceFetch) {
            const inline = readInlineSettings();
            if (inline) {
                applyBrandingSettings(inline);
            }
        }

        try {
            const fresh = await fetchBrandingFromApi();
            if (fresh) applyBrandingSettings(fresh);
        } catch (err) {
            console.warn('Store branding load failed:', err);
        }
    }

    function notifyBrandingUpdated() {
        const stamp = String(Date.now());
        try {
            localStorage.setItem(BRANDING_SYNC_KEY, stamp);
        } catch (err) {
            /* ignore private mode */
        }
        window.dispatchEvent(new CustomEvent('store-branding-updated', { detail: { stamp } }));
    }

    window.notifyStoreBrandingUpdated = notifyBrandingUpdated;
    window.refreshStoreBranding = () => loadStoreBranding(true);

    window.addEventListener('storage', (event) => {
        if (event.key === BRANDING_SYNC_KEY) loadStoreBranding(true);
    });

    window.addEventListener('store-branding-updated', () => loadStoreBranding(true));

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => loadStoreBranding(false));
    } else {
        loadStoreBranding(false);
    }
})();
