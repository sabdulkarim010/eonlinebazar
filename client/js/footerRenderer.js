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
        mastercard: 'Mastercard',
        cod: 'COD'
    };

    const DEFAULT_COPYRIGHT = '© 2026 EonlineBazar. All rights reserved. Designed by Abdul Karim Sheikh';
    const MOBILE_COMPACT_COPYRIGHT = '© 2026 EonlineBazar. Designed by Abdul Karim Sheikh';

    const MOBILE_ESSENTIAL_LINKS = [
        { label: 'About Us', url: '/about', match: ['/about', 'about us'] },
        { label: 'Contact Us', url: '/contact', match: ['/contact', 'contact us'] },
        { label: 'Track Order', url: '/order-track', match: ['/order-track', 'track order', 'track your order'] },
        { label: 'Privacy Policy', url: '/privacy-policy', match: ['/privacy-policy', 'privacy policy'] }
    ];

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

    function renderSocialIcon(link) {
        const title = escapeFooterHtml(link.platform || 'Social');
        const href = escapeFooterHtml(link.linkUrl || '#');
        const target = link.linkUrl && !String(link.linkUrl).startsWith('/') ? '_blank' : '_self';
        const rel = target === '_blank' ? ' rel="noopener noreferrer"' : '';

        if (link.iconUrl) {
            return `<a href="${href}" target="${target}"${rel} title="${title}" class="social-icon">
                <img src="${escapeFooterHtml(link.iconUrl)}" alt="${title}" loading="lazy">
            </a>`;
        }

        const iconClass = resolveSocialIconClass(link.iconName);
        return `<a href="${href}" target="${target}"${rel} title="${title}" class="social-icon">
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

    function renderPaymentBadge(gateway) {
        const slug = String(gateway.iconName || gateway.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const name = escapeFooterHtml(gateway.name || FOOTER_PAYMENT_LABELS[slug] || 'Payment');

        if (gateway.iconUrl) {
            return `<span class="footer-payment-badge footer-payment-badge--${slug}">
                <img src="${escapeFooterHtml(gateway.iconUrl)}" alt="${name}" loading="lazy">
            </span>`;
        }

        return `<span class="footer-payment-badge footer-payment-badge--${slug}">${name}</span>`;
    }

    function flattenColumnLinks(columns) {
        return (columns || []).flatMap((col) => col.links || []);
    }

    function linkMatchesEssential(link, essential) {
        const label = String(link.label || '').trim().toLowerCase();
        const url = String(link.url || '').trim().toLowerCase();
        return essential.match.some((token) => {
            const t = token.toLowerCase();
            return label === t || url === t || url.endsWith(t);
        });
    }

    function resolveMobileEssentialLinks(columns) {
        const flat = flattenColumnLinks(columns);

        return MOBILE_ESSENTIAL_LINKS.map((essential) => {
            const found = flat.find((link) => linkMatchesEssential(link, essential));
            if (found) {
                return {
                    label: found.label,
                    url: found.url || essential.url,
                    isExternal: found.isExternal === true
                };
            }
            return {
                label: essential.label,
                url: essential.url,
                isExternal: false
            };
        });
    }

    function buildMobileQuickLinksHtml(essentialLinks) {
        return essentialLinks.map((link) => {
            const label = escapeFooterHtml(link.label);
            const url = escapeFooterHtml(link.url || '#');
            if (link.isExternal) {
                return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
            }
            return `<a href="${url}">${label}</a>`;
        }).join('');
    }

    function compactCopyrightForMobile(copyrightText) {
        const text = String(copyrightText || DEFAULT_COPYRIGHT).trim();
        if (!text) return MOBILE_COMPACT_COPYRIGHT;
        const shortened = text
            .replace(/\s*All rights reserved\.?\s*/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return shortened || MOBILE_COMPACT_COPYRIGHT;
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

    function buildMobileCompactFooterHtml(normalized) {
        const { columns, socialLinks, copyrightText } = normalized;
        const essentialLinks = resolveMobileEssentialLinks(columns);
        const quickLinksHtml = buildMobileQuickLinksHtml(essentialLinks);

        const socialIconsHtml = socialLinks.length
            ? `<div class="footer-mobile-social-row">
                <div class="footer-social-icons footer-mobile-social-icons">
                    ${socialLinks.map(renderSocialIcon).join('')}
                </div>
            </div>`
            : '';

        return `
            <div class="footer-mobile-compact">
                <div class="footer-mobile-newsletter">
                    <div class="newsletter-section newsletter-section--mobile">
                        <h3 data-i18n="footer.newsletter_title">Subscribe to Newsletter</h3>
                        <div class="newsletter-form">
                            <input type="email" id="newsletter-email-mobile"
                                   placeholder="Enter your email"
                                   data-i18n-placeholder="footer.newsletter_placeholder"
                                   aria-label="Newsletter email">
                            <button type="button" onclick="subscribeNewsletter('newsletter-email-mobile')"
                                    data-i18n="footer.newsletter_btn">Subscribe</button>
                        </div>
                        <p id="newsletter-msg-mobile" class="newsletter-msg" style="display:none" role="status"></p>
                    </div>
                </div>
                <nav class="footer-mobile-quicklinks" aria-label="Essential links">
                    ${quickLinksHtml}
                </nav>
                ${socialIconsHtml}
                <p class="footer-mobile-copyright">${escapeFooterHtml(compactCopyrightForMobile(copyrightText))}</p>
            </div>
        `;
    }

    function buildNewsletterSectionHtml() {
        return `
            <div class="footer-col footer-col--newsletter">
                <div class="newsletter-section">
                    <h3 data-i18n="footer.newsletter_title">Subscribe to Newsletter</h3>
                    <p data-i18n="footer.newsletter_desc">Be the first to know about new products and offers</p>
                    <div class="newsletter-form">
                        <input type="email" id="newsletter-email"
                               placeholder="Enter your email"
                               data-i18n-placeholder="footer.newsletter_placeholder"
                               aria-label="Newsletter email">
                        <button type="button" onclick="subscribeNewsletter()"
                                data-i18n="footer.newsletter_btn">Subscribe</button>
                    </div>
                    <p id="newsletter-msg" class="newsletter-msg" style="display:none" role="status"></p>
                </div>
            </div>
        `;
    }

    function buildDesktopFooterHtml(normalized) {
        const { columns, socialLinks, paymentGateways, copyrightText } = normalized;

        const columnsHtml = columns.map((col) => `
            <div class="footer-col">
                <h4>${escapeFooterHtml(col.columnTitle)}</h4>
                <ul>${(col.links || []).map(renderFooterLink).join('')}</ul>
            </div>
        `).join('');

        const paymentBadgesHtml = paymentGateways.length
            ? `<div class="footer-copyright-payments" aria-label="Accepted payment methods">
                <div class="footer-payment-badges">
                    ${paymentGateways.map(renderPaymentBadge).join('')}
                </div>
            </div>`
            : '';

        const socialHtml = socialLinks.length
            ? `<div class="footer-col footer-col--social">
                <h4>Follow Us</h4>
                <div class="footer-social-icons">
                    ${socialLinks.map(renderSocialIcon).join('')}
                </div>
            </div>`
            : '';

        const newsletterHtml = buildNewsletterSectionHtml();

        const columnsWrapHtml = columnsHtml
            ? `<div class="footer-columns-wrap">${columnsHtml}${newsletterHtml}</div>`
            : `<div class="footer-columns-wrap">${newsletterHtml}</div>`;

        return `
            <div class="footer-desktop">
                <div class="footer-main">
                    ${columnsWrapHtml}
                    ${socialHtml}
                </div>
                <div class="footer-copyright-bar">
                    <div class="footer-copyright-bar-inner">
                        <p class="footer-copyright-text">${escapeFooterHtml(copyrightText)}</p>
                        ${paymentBadgesHtml}
                    </div>
                </div>
            </div>
        `;
    }

    function buildFooterHtml(settings = {}) {
        const normalized = normalizePublicSettings(settings);
        return buildMobileCompactFooterHtml(normalized) + buildDesktopFooterHtml(normalized);
    }

    function buildFooterShell(innerHtml) {
        return `
            <footer class="compact-footer" aria-label="Site footer">
                <div class="footer-container">${innerHtml}</div>
            </footer>
        `;
    }

    global.FooterRenderer = {
        DEFAULT_COPYRIGHT,
        MOBILE_COMPACT_COPYRIGHT,
        FOOTER_SOCIAL_ICON_MAP,
        FOOTER_PAYMENT_LABELS,
        normalizePublicSettings,
        buildFooterHtml,
        buildFooterShell,
        escapeFooterHtml
    };
})(typeof window !== 'undefined' ? window : global);
