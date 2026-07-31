/**
 * Shared footer renderer — used by storefront footer.js and admin live preview.
 * Single source of truth so preview matches the public footer exactly.
 */
(function (global) {
    const FOOTER_SOCIAL_ICON_MAP = {
        facebook: 'fa-brands fa-facebook',
        instagram: 'fa-brands fa-instagram',
        tiktok: 'fa-brands fa-tiktok',
        'x-twitter': 'fa-brands fa-x-twitter',
        twitter: 'fa-brands fa-x-twitter',
        youtube: 'fa-brands fa-youtube',
        linkedin: 'fa-brands fa-linkedin-in',
        whatsapp: 'fa-brands fa-whatsapp',
        telegram: 'fa-brands fa-telegram',
        pinterest: 'fa-brands fa-pinterest',
        snapchat: 'fa-brands fa-snapchat'
    };

    const FOOTER_PAYMENT_LABELS = {
        bkash: 'bKash',
        nagad: 'Nagad',
        rocket: 'Rocket',
        visa: 'VISA',
        mastercard: 'MC',
        cod: 'COD'
    };

    const DEFAULT_PAYMENT_BADGES = [
        { name: 'bKash', iconName: 'bkash' },
        { name: 'Nagad', iconName: 'nagad' },
        { name: 'VISA', iconName: 'visa' },
        { name: 'MC', iconName: 'mastercard' },
        { name: 'COD', iconName: 'cod' }
    ];

    const DEFAULT_COPYRIGHT = '© 2026 EonlineBazar. All rights reserved. Designed by Abdul Karim Sheikh';
    const FOOTER_TAGLINE = "Bangladesh's trusted online shopping destination";

    function escapeFooterHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function resolveSocialIconClass(iconName) {
        const key = String(iconName || '').trim().toLowerCase();
        return FOOTER_SOCIAL_ICON_MAP[key] || 'fa-solid fa-link';
    }

    function getStoreBranding() {
        if (typeof global === 'undefined' || !global.__STORE_SETTINGS__) {
            return { storeName: 'EonlineBazar', logoUrl: '' };
        }
        const settings = global.__STORE_SETTINGS__;
        return {
            storeName: settings.storeName || 'EonlineBazar',
            logoUrl: settings.logoUrl || settings.logoPath || settings.storeLogo || ''
        };
    }

    function renderSocialIcon(link) {
        const title = escapeFooterHtml(link.platform || 'Social');
        const href = escapeFooterHtml(link.linkUrl || '#');
        const target = link.linkUrl && !String(link.linkUrl).startsWith('/') ? '_blank' : '_self';
        const rel = target === '_blank' ? ' rel="noopener noreferrer"' : '';

        if (link.iconUrl) {
            return `<a href="${href}" target="${target}"${rel} title="${title}" class="social-btn">
                <img src="${escapeFooterHtml(link.iconUrl)}" alt="${title}" loading="lazy">
            </a>`;
        }

        const iconClass = resolveSocialIconClass(link.iconName);
        return `<a href="${href}" target="${target}"${rel} title="${title}" class="social-btn">
            <i class="${iconClass}"></i>
        </a>`;
    }

    function renderFooterLink(link) {
        const label = escapeFooterHtml(link.label);
        const url = escapeFooterHtml(link.url || '#');

        if (link.isExternal) {
            return `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a></li>`;
        }

        return `<li><a href="${url}">${label}</a></li>`;
    }

    function resolvePaymentLabel(gateway) {
        const slug = String(gateway.iconName || gateway.name || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');

        return FOOTER_PAYMENT_LABELS[slug] || gateway.name || 'Payment';
    }

    function renderPaymentBadge(gateway) {
        const slug = String(gateway.iconName || gateway.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const name = resolvePaymentLabel(gateway);

        if (gateway.iconUrl) {
            return `<img class="payment-badge payment-badge--${slug}" src="${escapeFooterHtml(gateway.iconUrl)}" alt="${escapeFooterHtml(name)}" loading="lazy">`;
        }

        return `<span class="payment-badge-text">${escapeFooterHtml(name)}</span>`;
    }

    function formatCopyrightHtml(copyrightText) {
        const text = String(copyrightText || DEFAULT_COPYRIGHT).trim();
        const designedByMatch = text.match(/^(.+?)\s+(Designed by\s+)(.+)$/i);

        if (designedByMatch) {
            const before = designedByMatch[1].replace(/\.\s*$/, '').trim();
            const prefix = designedByMatch[2].trim();
            const designer = designedByMatch[3].trim();
            return `${escapeFooterHtml(before)}. | ${escapeFooterHtml(prefix)}<a href="#">${escapeFooterHtml(designer)}</a>`;
        }

        return escapeFooterHtml(text);
    }

    /** Normalize admin draft or API payload into storefront shape (active items only). */
    function normalizePublicSettings(settings = {}) {
        const sortByOrder = (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);

        const columns = (Array.isArray(settings.columns) ? settings.columns : [])
            .filter((col) => col.isActive !== false)
            .sort(sortByOrder)
            .map((col) => ({
                columnTitle: col.columnTitle,
                links: (col.links || [])
                    .filter((link) => link.isActive !== false && link.label)
                    .map((link) => ({
                        label: link.label,
                        url: link.url || '#',
                        isExternal: link.isExternal === true
                    }))
            }))
            .filter((col) => col.columnTitle && col.links.length);

        const socialLinks = (Array.isArray(settings.socialLinks) ? settings.socialLinks : [])
            .filter((item) => item.isActive !== false && item.linkUrl)
            .sort(sortByOrder)
            .map((item) => ({
                platform: item.platform,
                iconName: item.iconName || '',
                iconUrl: item.iconUrl || '',
                linkUrl: item.linkUrl
            }));

        const paymentGateways = (Array.isArray(settings.paymentGateways) ? settings.paymentGateways : [])
            .filter((item) => item.isActive !== false && item.name)
            .sort(sortByOrder)
            .map((item) => ({
                name: item.name,
                iconUrl: item.iconUrl || '',
                iconName: item.iconName || ''
            }));

        return {
            copyrightText: settings.copyrightText || DEFAULT_COPYRIGHT,
            columns,
            socialLinks,
            paymentGateways
        };
    }

    function buildBrandColumnHtml(socialLinks) {
        const { storeName, logoUrl } = getStoreBranding();
        const logoSrc = logoUrl || '/images/favicon.png';
        const socialHtml = socialLinks.length
            ? `<div class="social-row">${socialLinks.map(renderSocialIcon).join('')}</div>`
            : '';

        return `
            <div class="footer-brand">
                <a href="/" class="footer-logo">
                    <img src="${escapeFooterHtml(logoSrc)}" alt="${escapeFooterHtml(storeName)} logo" loading="lazy">
                    <span>${escapeFooterHtml(storeName)}</span>
                </a>
                <p class="footer-tagline">${escapeFooterHtml(FOOTER_TAGLINE)}</p>
                ${socialHtml}
            </div>
        `;
    }

    function buildLinkColumnHtml(column) {
        if (!column) {
            return '<div class="footer-col"></div>';
        }

        return `
            <div class="footer-col">
                <h4>${escapeFooterHtml(column.columnTitle)}</h4>
                <ul>${(column.links || []).map(renderFooterLink).join('')}</ul>
            </div>
        `;
    }

    function buildNewsletterSectionHtml() {
        return `
            <div class="footer-col footer-newsletter">
                <h4 data-i18n="footer.newsletter_title">Stay Updated</h4>
                <p data-i18n="footer.newsletter_desc">Get latest offers and new arrivals</p>
                <div class="newsletter-form">
                    <input type="email" id="newsletter-email" class="newsletter-input"
                           placeholder="Enter your email"
                           data-i18n-placeholder="footer.newsletter_placeholder"
                           aria-label="Newsletter email">
                    <button type="button" class="newsletter-btn" onclick="subscribeNewsletter()"
                            data-i18n="footer.newsletter_btn">Subscribe</button>
                </div>
                <p id="newsletter-msg" class="newsletter-msg" style="display:none" role="status"></p>
            </div>
        `;
    }

    function buildFooterContentHtml(normalized) {
        const { columns, socialLinks, paymentGateways, copyrightText } = normalized;
        const companyCol = columns[0] || null;
        const supportCol = columns[1] || null;
        const badges = paymentGateways.length ? paymentGateways : DEFAULT_PAYMENT_BADGES;

        return `
            <div class="footer-main">
                ${buildBrandColumnHtml(socialLinks)}
                ${buildLinkColumnHtml(companyCol)}
                ${buildLinkColumnHtml(supportCol)}
                ${buildNewsletterSectionHtml()}
            </div>
            <hr class="footer-divider">
            <div class="footer-bottom">
                <p class="footer-copyright">${formatCopyrightHtml(copyrightText)}</p>
                <div class="payment-badges" aria-label="Accepted payment methods">
                    ${badges.map(renderPaymentBadge).join('')}
                </div>
            </div>
        `;
    }

    function buildFooterHtml(settings = {}) {
        const normalized = normalizePublicSettings(settings);
        return buildFooterContentHtml(normalized);
    }

    function buildFooterShell(innerHtml) {
        return `
            <footer class="site-footer" aria-label="Site footer">
                <div class="footer-container">${innerHtml}</div>
            </footer>
        `;
    }

    global.FooterRenderer = {
        DEFAULT_COPYRIGHT,
        FOOTER_SOCIAL_ICON_MAP,
        FOOTER_PAYMENT_LABELS,
        normalizePublicSettings,
        buildFooterHtml,
        buildFooterShell,
        escapeFooterHtml
    };
})(typeof window !== 'undefined' ? window : global);
