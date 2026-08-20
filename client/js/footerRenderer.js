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

    const ESSENTIAL_QUICK_LINKS = [
        { label: 'About Us', url: '/about', mobileLabel: 'About Us' },
        { label: 'Contact Us', url: '/contact', mobileLabel: 'Contact Us' },
        { label: 'Return Policy', url: '/return-policy', mobileLabel: 'Return Policy' },
        { label: 'Track Order', url: '/order-track', mobileLabel: 'Track Order' }
    ];

    const DEFAULT_COPYRIGHT = '© 2026 EonlineBazar. All rights reserved. Designed by Abdul Karim Sheikh';
    const FOOTER_TAGLINE = "Bangladesh's trusted online<br>shopping destination";

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
            return `<a href="${href}" target="${target}"${rel} title="${title}" class="footer-social-btn">
                <img src="${escapeFooterHtml(link.iconUrl)}" alt="${title}" loading="lazy" onerror="this.style.display='none'">
            </a>`;
        }

        const iconClass = resolveSocialIconClass(link.iconName);
        return `<a href="${href}" target="${target}"${rel} title="${title}" class="footer-social-btn">
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
            return `<img class="footer-payment-badge footer-payment-badge--img footer-payment-badge--${slug}" src="${escapeFooterHtml(gateway.iconUrl)}" alt="${escapeFooterHtml(name)}" loading="lazy">`;
        }

        return `<span class="footer-payment-badge">${escapeFooterHtml(name)}</span>`;
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
            const yearMatch = designedByMatch[1].match(/©\s*(\d{4})/);
            const year = yearMatch ? yearMatch[1] : '2026';
            const brandMatch = designedByMatch[1].match(/©\s*\d{4}\s+([^.\s]+(?:\s+[^.\s]+)*)/i);
            const brand = brandMatch ? brandMatch[1] : 'EonlineBazar';
            const designer = designedByMatch[3].replace(/\.\s*$/, '').trim();
            return `© ${escapeFooterHtml(year)} ${escapeFooterHtml(brand)} / Designed by <a href="#">${escapeFooterHtml(designer)}</a>.`;
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
                columnTitle: col.columnTitle || col.title || col.heading || '',
                links: (col.links || col.items || [])
                    .filter((link) => link.isActive !== false && (link.label || link.text || link.name))
                    .map((link) => ({
                        label: link.label || link.text || link.name,
                        url: link.url || link.href || '#',
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

        // Master switch hides the entire payment badges strip on storefront
        let paymentGateways = [];
        if (settings.paymentBadgesEnabled !== false) {
            paymentGateways = (Array.isArray(settings.paymentGateways) ? settings.paymentGateways : [])
                .filter((item) => item.isActive !== false && item.name)
                .sort(sortByOrder)
                .map((item) => ({
                    name: item.name,
                    iconUrl: item.iconUrl || '',
                    iconName: item.iconName || ''
                }));

            // Legacy name-only badges fallback
            if (!paymentGateways.length && Array.isArray(settings.paymentBadges) && settings.paymentBadges.length) {
                paymentGateways = settings.paymentBadges
                    .map((item) => ({
                        name: typeof item === 'string' ? item : (item.name || ''),
                        iconUrl: typeof item === 'object' ? (item.iconUrl || '') : '',
                        iconName: typeof item === 'object' ? (item.iconName || '') : ''
                    }))
                    .filter((item) => item.name);
            }
        }

        return {
            copyrightText: settings.copyrightText || DEFAULT_COPYRIGHT,
            columns,
            socialLinks,
            paymentGateways,
            paymentBadgesEnabled: settings.paymentBadgesEnabled !== false
        };
    }

    /** Mobile-only: resolve the 4 essential quick links from active column data. */
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

    function buildMobileQuickLinksHtml(links) {
        return links.map((link, index) => {
            const attrs = link.isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
            const text = link.mobileLabel || link.label;
            const linkHtml = `<a href="${escapeFooterHtml(link.url)}" class="footer-mobile-link"${attrs}>${escapeFooterHtml(text)}</a>`;
            if (index < links.length - 1) {
                return `${linkHtml}<span class="footer-mobile-sep" aria-hidden="true">•</span>`;
            }
            return linkHtml;
        }).join('');
    }

    function buildNewsletterSectionHtml(inputId = 'newsletter-email', msgId = 'newsletter-msg') {
        return `
            <div class="footer-newsletter-block">
                <div class="footer-newsletter-title" data-i18n="footer.newsletter_title">Subscribe to Newsletter</div>
                <div class="footer-newsletter-form-desktop">
                    <input type="email" id="${inputId}" class="footer-newsletter-input-desktop"
                           placeholder="Your email"
                           data-i18n-placeholder="footer.newsletter_placeholder"
                           aria-label="Newsletter email">
                    <button type="button" class="footer-newsletter-btn-desktop" onclick="subscribeNewsletter('${inputId}')"
                            data-i18n="footer.newsletter_btn">Subscribe</button>
                </div>
                <p id="${msgId}" class="footer-newsletter-msg" style="display:none" role="status"></p>
            </div>
        `;
    }

    function buildSocialRowHtml(socialLinks) {
        if (!socialLinks.length) return '';
        return `<div class="footer-social-icons" aria-label="Social media">${socialLinks.map(renderSocialIcon).join('')}</div>`;
    }

    /** Newsletter + Follow Us as stacked, non-overlapping blocks. */
    function buildEngageColumnHtml(socialLinks) {
        const socialBlock = socialLinks.length
            ? `
                <div class="footer-socials-block">
                    <div class="footer-col-heading footer-follow-heading">Follow Us</div>
                    ${buildSocialRowHtml(socialLinks)}
                </div>
            `
            : '';

        return `
            <div class="footer-col footer-col--engage">
                ${buildNewsletterSectionHtml('newsletter-email', 'newsletter-msg')}
                ${socialBlock}
            </div>
        `;
    }

    function buildLinkColumnHtml(title, links) {
        if (!links.length) return '';

        return `
            <div class="footer-col">
                <div class="footer-col-heading">${escapeFooterHtml(title)}</div>
                <ul>${links.map(renderFooterLink).join('')}</ul>
            </div>
        `;
    }

    /** Render all dynamic columns from API data — no hardcoded column names. */
    function renderFooterColumns(columns) {
        if (!columns || columns.length === 0) return '';
        return columns.map((col) => buildLinkColumnHtml(col.columnTitle, col.links)).join('');
    }

    function buildDesktopBrandColumnHtml() {
        return `
            <div class="footer-col footer-col--brand">
                <div class="footer-brand-section">
                    <div class="footer-brand-name">
                        EONLINE<span style="color:#f97316">BAZAR</span>
                    </div>
                    <p class="footer-brand-tagline">
                        ${FOOTER_TAGLINE}
                    </p>
                </div>
            </div>
        `;
    }

    function buildPaymentBadgesHtml(badges) {
        if (!badges || badges.length === 0) return '';
        return `<div class="footer-payment-badges" aria-label="Accepted payment methods">${badges.map(renderPaymentBadge).join('')}</div>`;
    }

    function buildMobileFooterHtml(normalized) {
        const { columns, socialLinks, copyrightText } = normalized;
        const quickLinks = collectQuickLinks(columns);
        const socialIconsHtml = socialLinks.map(renderSocialIcon).join('');

        return `
            <div class="footer-mobile">
                <nav class="footer-mobile-links-row" aria-label="Quick links">
                    ${buildMobileQuickLinksHtml(quickLinks)}
                </nav>
                <div class="footer-newsletter-row">
                    <div class="footer-newsletter-title" data-i18n="footer.newsletter_title">Subscribe to Newsletter</div>
                    <div class="footer-newsletter-form">
                        <input type="email" id="newsletter-email-mobile" class="footer-newsletter-input"
                               placeholder="Enter your email"
                               data-i18n-placeholder="footer.newsletter_placeholder"
                               aria-label="Newsletter email">
                        <button type="button" class="footer-newsletter-btn" onclick="subscribeNewsletter('newsletter-email-mobile')"
                                data-i18n="footer.newsletter_btn">Subscribe</button>
                    </div>
                    <p id="newsletter-msg-mobile" class="footer-newsletter-msg" style="display:none" role="status"></p>
                </div>
                <div class="footer-socials-block footer-socials-block--mobile">
                    <div class="footer-col-heading footer-follow-heading">Follow Us</div>
                    <div class="footer-social-icons" aria-label="Social media">
                        ${socialIconsHtml}
                    </div>
                </div>
                <div class="footer-copyright-row">
                    <p class="footer-copyright-text">${formatCopyrightMobileHtml(copyrightText)}</p>
                </div>
            </div>
        `;
    }

    function buildDesktopFooterHtml(normalized) {
        const { columns, socialLinks, paymentGateways, copyrightText } = normalized;
        const paymentHtml = buildPaymentBadgesHtml(paymentGateways);

        return `
            <div class="footer-desktop">
                <div class="footer-main">
                    ${buildDesktopBrandColumnHtml()}
                    ${renderFooterColumns(columns)}
                    ${buildEngageColumnHtml(socialLinks)}
                </div>
                <div class="footer-bottom-bar">
                    <p class="footer-copyright">${formatCopyrightHtml(copyrightText)}</p>
                    ${paymentHtml}
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
        renderFooterColumns,
        buildFooterHtml,
        buildFooterShell,
        escapeFooterHtml
    };
})(typeof window !== 'undefined' ? window : global);










