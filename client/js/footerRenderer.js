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
        { name: 'COD', iconName: 'cod' }
    ];

    const ESSENTIAL_QUICK_LINKS = [
        { label: 'About Us', url: '/about', mobileLabel: 'About Us' },
        { label: 'Contact Us', url: '/contact', mobileLabel: 'Contact Us' },
        { label: 'Privacy Policy', url: '/privacy-policy', mobileLabel: 'Privacy' },
        { label: 'Track Order', url: '/order-track', mobileLabel: 'Track Order' }
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
                <img src="${escapeFooterHtml(link.iconUrl)}" alt="${title}" loading="lazy" onerror="this.style.display='none'">
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

    function formatCopyrightMobileHtml(copyrightText) {
        const text = String(copyrightText || DEFAULT_COPYRIGHT).trim();
        const designedByMatch = text.match(/^(.+?)\s+(Designed by\s+)(.+)$/i);

        if (designedByMatch) {
            const yearMatch = designedByMatch[1].match(/©\s*\d{4}\s+([^.\s]+(?:\s+[^.\s]+)*)/i);
            const brand = yearMatch ? yearMatch[1] : 'EonlineBazar';
            const yearMatchFull = designedByMatch[1].match(/©\s*(\d{4})/);
            const year = yearMatchFull ? yearMatchFull[1] : '2026';
            const designer = designedByMatch[3].trim();
            return `© ${escapeFooterHtml(year)} ${escapeFooterHtml(brand)} | Designed by <a href="#">${escapeFooterHtml(designer)}</a>`;
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

    function collectQuickLinks(columns) {
        const allLinks = columns.flatMap((col) => col.links || []);

        return ESSENTIAL_QUICK_LINKS.map(({ label, url, mobileLabel }) => {
            const found = allLinks.find(
                (link) => String(link.label || '').trim().toLowerCase() === label.toLowerCase()
            );

            if (found) {
                return {
                    label: found.label,
                    mobileLabel: mobileLabel || found.label,
                    url: found.url || url,
                    isExternal: found.isExternal === true
                };
            }

            return { label, mobileLabel: mobileLabel || label, url, isExternal: false };
        });
    }

    function buildQuickLinksHtml(links, { mobile = false } = {}) {
        return links.map((link, index) => {
            const sep = index > 0 ? '<span class="footer-link-sep" aria-hidden="true">·</span>' : '';
            const attrs = link.isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
            const text = mobile ? (link.mobileLabel || link.label) : link.label;
            return `${sep}<a href="${escapeFooterHtml(link.url)}"${attrs}>${escapeFooterHtml(text)}</a>`;
        }).join('');
    }

    function buildBrandLogoHtml(extraClass = '') {
        const { storeName } = getStoreBranding();
        const classes = ['footer-logo', extraClass].filter(Boolean).join(' ');
        return `<a href="/" class="${classes}" data-store-logo-slot data-logo-variant="footer" aria-label="${escapeFooterHtml(storeName)} Home"></a>`;
    }

    function buildNewsletterSectionHtml(inputId = 'newsletter-email', msgId = 'newsletter-msg') {
        return `
            <div class="footer-newsletter-wrap">
                <h4 class="footer-col-title" data-i18n="footer.newsletter_title">Stay Updated</h4>
                <div class="newsletter-form">
                    <input type="email" id="${inputId}" class="newsletter-input"
                           placeholder="Your email"
                           data-i18n-placeholder="footer.newsletter_placeholder"
                           aria-label="Newsletter email">
                    <button type="button" class="newsletter-btn" onclick="subscribeNewsletter('${inputId}')"
                            data-i18n="footer.newsletter_btn">Subscribe</button>
                </div>
                <p id="${msgId}" class="newsletter-msg" style="display:none" role="status"></p>
            </div>
        `;
    }

    function buildSocialRowHtml(socialLinks) {
        if (!socialLinks.length) return '';
        return `<div class="social-row" aria-label="Social media">${socialLinks.map(renderSocialIcon).join('')}</div>`;
    }

    function buildLinkColumnHtml(title, links) {
        if (!links.length) return '';

        return `
            <div class="footer-col">
                <h4 class="footer-col-title">${escapeFooterHtml(title)}</h4>
                <ul>${links.map(renderFooterLink).join('')}</ul>
            </div>
        `;
    }

    function buildDesktopBrandColumnHtml() {
        return `
            <div class="footer-col footer-col--brand">
                <div class="footer-logo-shell">
                    ${buildBrandLogoHtml('footer-logo--desktop')}
                </div>
                <p class="footer-tagline">${escapeFooterHtml(FOOTER_TAGLINE)}</p>
            </div>
        `;
    }

    function buildSocialColumnHtml(socialLinks) {
        if (!socialLinks.length) return '';

        return `
            <div class="footer-col footer-col--social">
                <h4 class="footer-col-title">Socials</h4>
                ${buildSocialRowHtml(socialLinks)}
            </div>
        `;
    }

    function buildPaymentBadgesHtml(badges) {
        return `<div class="payment-badges" aria-label="Accepted payment methods">${badges.map(renderPaymentBadge).join('')}</div>`;
    }

    function buildMobileFooterHtml(normalized) {
        const { columns, socialLinks, paymentGateways, copyrightText } = normalized;
        const quickLinks = collectQuickLinks(columns);
        const badges = paymentGateways.length ? paymentGateways : DEFAULT_PAYMENT_BADGES;
        const socialHtml = buildSocialRowHtml(socialLinks);

        return `
            <div class="footer-mobile">
                <nav class="footer-mobile-row footer-mobile-row--links" aria-label="Quick links">
                    ${buildQuickLinksHtml(quickLinks, { mobile: true })}
                </nav>
                <div class="footer-mobile-row footer-mobile-row--engage">
                    <div class="footer-newsletter-wrap footer-newsletter-wrap--mobile">
                        <div class="newsletter-form">
                            <input type="email" id="newsletter-email-mobile" class="newsletter-input"
                                   placeholder="Your email"
                                   data-i18n-placeholder="footer.newsletter_placeholder"
                                   aria-label="Newsletter email">
                            <button type="button" class="newsletter-btn" onclick="subscribeNewsletter('newsletter-email-mobile')"
                                    data-i18n="footer.newsletter_btn">Subscribe</button>
                        </div>
                        <p id="newsletter-msg-mobile" class="newsletter-msg" style="display:none" role="status"></p>
                    </div>
                    ${socialHtml}
                </div>
                <div class="footer-mobile-row footer-mobile-row--bottom">
                    <p class="footer-copyright footer-copyright--mobile">${formatCopyrightMobileHtml(copyrightText)}</p>
                    ${buildPaymentBadgesHtml(badges)}
                </div>
            </div>
        `;
    }

    function buildDesktopFooterHtml(normalized) {
        const { columns, socialLinks, paymentGateways, copyrightText } = normalized;
        const quickLinks = collectQuickLinks(columns);
        const badges = paymentGateways.length ? paymentGateways : DEFAULT_PAYMENT_BADGES;

        const companyCol = columns.find((col) => /company/i.test(col.columnTitle)) || columns[0] || null;
        const supportCol = columns.find((col) => /support/i.test(col.columnTitle)) || columns[1] || null;

        const companyLinks = companyCol ? companyCol.links : [];
        const supportLinks = supportCol ? supportCol.links : [];

        return `
            <div class="footer-desktop">
                <div class="footer-desktop-grid">
                    ${buildDesktopBrandColumnHtml()}
                    ${buildLinkColumnHtml('Company', companyLinks)}
                    ${buildLinkColumnHtml('Support', supportLinks)}
                    ${buildLinkColumnHtml('Quick Links', quickLinks)}
                    ${buildNewsletterSectionHtml('newsletter-email', 'newsletter-msg')}
                    ${buildSocialColumnHtml(socialLinks)}
                </div>
                <div class="footer-bottom footer-bottom--desktop">
                    <p class="footer-copyright">${formatCopyrightHtml(copyrightText)}</p>
                    ${buildPaymentBadgesHtml(badges)}
                </div>
            </div>
        `;
    }

    function buildFooterContentHtml(normalized) {
        return `
            ${buildMobileFooterHtml(normalized)}
            ${buildDesktopFooterHtml(normalized)}
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
        ESSENTIAL_QUICK_LINKS,
        normalizePublicSettings,
        buildFooterHtml,
        buildFooterShell,
        escapeFooterHtml
    };
})(typeof window !== 'undefined' ? window : global);
