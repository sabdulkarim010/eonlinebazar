/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/settings-footer.js
 * Description: Footer settings manager.
 */
import '../admin-core.js';
const COURIER_PROVIDER_LABELS = window.COURIER_PROVIDER_LABELS;

/* ==========================================================================
   FOOTER SETTINGS MANAGER (dynamic → /api/admin/footer-settings)
   ========================================================================== */

const FOOTER_SOCIAL_PRESETS = [
    { platform: 'Facebook', iconName: 'facebook' },
    { platform: 'Instagram', iconName: 'instagram' },
    { platform: 'TikTok', iconName: 'tiktok' },
    { platform: 'X (Twitter)', iconName: 'x-twitter' },
    { platform: 'YouTube', iconName: 'youtube' },
    { platform: 'LinkedIn', iconName: 'linkedin' },
    { platform: 'WhatsApp', iconName: 'whatsapp' },
    { platform: 'Telegram', iconName: 'telegram' }
];

const FOOTER_PAYMENT_PRESETS = [
    { name: 'bKash', iconName: 'bkash' },
    { name: 'Nagad', iconName: 'nagad' },
    { name: 'Rocket', iconName: 'rocket' },
    { name: 'Visa', iconName: 'visa' },
    { name: 'Mastercard', iconName: 'mastercard' },
    { name: 'COD', iconName: 'cod' }
];

/* shared state: footerSettingsState lives on window (admin-core) */

/** Shared with Page Content Manager — listed here so Footer CMS auto-link can use it early. */

/* shared state: pageContentCatalog lives on window (admin-core) */

/* shared state: pageContentQuill lives on window (admin-core) */

/* shared state: activePageSlug lives on window (admin-core) */

/* shared state: createPageSlugManual lives on window (admin-core) */

/** Common label → CMS slug aliases when page title text differs slightly. */
const FOOTER_CMS_LABEL_ALIASES = {
    'privacy policy': 'privacy-policy',
    'terms': 'terms',
    'terms conditions': 'terms',
    'terms and conditions': 'terms',
    'terms of service': 'terms',
    'terms of use': 'terms',
    'about': 'about',
    'about us': 'about',
    'who we are': 'about',
    'contact': 'contact',
    'contact us': 'contact',
    'careers': 'careers'
};

function footerTempId(prefix = 'tmp') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isFooterPlaceholderUrl(url = '') {
    const raw = String(url || '').trim();
    return !raw || raw === '#' || raw === '/#' || raw === 'javascript:void(0)';
}

function normalizeFooterMatchKey(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Resolve a CMS page from Page Content Manager by footer link label. */
function findFooterCmsPageByLabel(label = '') {
    const pages = Array.isArray(pageContentCatalog) ? pageContentCatalog : [];
    const key = normalizeFooterMatchKey(label);
    if (!key || !pages.length) return null;

    const byTitle = pages.find((p) => normalizeFooterMatchKey(p.title) === key);
    if (byTitle) return byTitle;

    const slugFromLabel = typeof titleToPageSlug === 'function'
        ? titleToPageSlug(label)
        : normalizeFooterMatchKey(label).replace(/\s+/g, '-');
    if (slugFromLabel) {
        const bySlug = pages.find((p) => p.slug === slugFromLabel);
        if (bySlug) return bySlug;
    }

    const aliasSlug = FOOTER_CMS_LABEL_ALIASES[key];
    if (aliasSlug) {
        const byAlias = pages.find((p) => p.slug === aliasSlug);
        if (byAlias) return byAlias;
    }

    return pages.find((p) => {
        const titleKey = normalizeFooterMatchKey(p.title);
        return titleKey && (key.includes(titleKey) || titleKey.includes(key));
    }) || null;
}

function footerCmsPageOptionsHtml(selectedUrl = '') {
    const pages = Array.isArray(pageContentCatalog) ? pageContentCatalog : [];
    const selectedSlug = String(selectedUrl || '').trim().replace(/^\/+/, '').split('/')[0];
    const options = pages.map((page) => {
        const selected = page.slug === selectedSlug ? ' selected' : '';
        return `<option value="${escapeHtml(page.slug)}"${selected}>${escapeHtml(page.title)} (/${escapeHtml(page.slug)})</option>`;
    }).join('');
    return `<option value="">Link CMS page…</option>${options}`;
}

/** Auto-fill '#' / empty URLs from CMS page titles when rendering or typing. */
function autoLinkFooterCmsRoutes(mutateState = true) {
    const pages = Array.isArray(pageContentCatalog) ? pageContentCatalog : [];
    if (!pages.length) return false;

    let changed = false;
    footerSettingsState.columns.forEach((col) => {
        (col.links || []).forEach((link) => {
            if (link.isExternal === true) return;
            if (!isFooterPlaceholderUrl(link.url)) return;
            const page = findFooterCmsPageByLabel(link.label);
            if (!page?.slug) return;
            if (mutateState) {
                link.url = `/${page.slug}`;
                link.isExternal = false;
            }
            changed = true;
        });
    });
    return changed;
}

/** Interactive toggle switch — hidden input, smooth CSS knob (no visible native checkbox). */
function footerToggleHtml({ checked = true, inputClass = '', dataAttrs = {}, variant = 'green', label = 'Active' } = {}) {
    const dataStr = Object.entries(dataAttrs)
        .map(([key, val]) => `data-${key}="${escapeHtml(String(val))}"`)
        .join(' ');
    return `
        <label class="relative inline-flex items-center cursor-pointer footer-toggle-switch footer-toggle-switch--${variant}" title="${escapeHtml(label)}">
            <input type="checkbox" class="footer-toggle-input sr-only ${inputClass}" ${dataStr} ${checked ? 'checked' : ''} aria-label="${escapeHtml(label)}">
            <span class="footer-toggle-track" aria-hidden="true"><span class="footer-toggle-knob"></span></span>
        </label>`;
}

function renderFooterColumnsEditor() {
    const container = document.getElementById('footerColumnsEditor');
    if (!container) return;

    if (!footerSettingsState.columns.length) {
        container.innerHTML = `
            <div class="footer-settings-empty">
                <p>No footer columns yet. Add COMPANY, SUPPORT, or QUICK LINKS sections.</p>
            </div>`;
        return;
    }

    container.innerHTML = footerSettingsState.columns.map((col, colIndex) => `
        <article class="footer-column-card" data-col-index="${colIndex}">
            <div class="footer-column-head">
                <input type="text" class="footer-col-title-input" data-col-index="${colIndex}" value="${escapeHtml(col.columnTitle || '')}" placeholder="Column title (e.g. COMPANY)">
                ${footerToggleHtml({
                    checked: col.isActive !== false,
                    inputClass: 'footer-col-active',
                    dataAttrs: { 'col-index': colIndex },
                    variant: 'blue',
                    label: 'Column active'
                })}
                <button type="button" class="footer-settings-remove-btn" data-action="remove-column" data-col-index="${colIndex}" title="Delete column">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <div class="footer-links-list">
                ${(col.links || []).map((link, linkIndex) => `
                    <div class="footer-link-row" data-col-index="${colIndex}" data-link-index="${linkIndex}">
                        <input type="text" class="footer-link-label" data-col-index="${colIndex}" data-link-index="${linkIndex}" value="${escapeHtml(link.label || '')}" placeholder="Label (e.g. Privacy Policy)" list="footerCmsLabelSuggestions" autocomplete="off">
                        <select class="footer-link-cms-page" data-col-index="${colIndex}" data-link-index="${linkIndex}" title="Pick a Dynamic CMS page to auto-fill the route" aria-label="CMS page">
                            ${footerCmsPageOptionsHtml(link.url || '')}
                        </select>
                        <input type="text" class="footer-link-url" data-col-index="${colIndex}" data-link-index="${linkIndex}" value="${escapeHtml(link.url || '')}" placeholder="/privacy-policy or https://..." list="footerCmsRouteSuggestions">
                        <button type="button" class="footer-ext-pill ${link.isExternal ? 'is-active' : ''}" data-action="toggle-external" data-col-index="${colIndex}" data-link-index="${linkIndex}" title="External link">Ext</button>
                        ${footerToggleHtml({
                            checked: link.isActive !== false,
                            inputClass: 'footer-link-active',
                            dataAttrs: { 'col-index': colIndex, 'link-index': linkIndex },
                            variant: 'blue',
                            label: 'Link active'
                        })}
                        <button type="button" class="footer-settings-remove-btn" data-action="remove-link" data-col-index="${colIndex}" data-link-index="${linkIndex}">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
            <button type="button" class="footer-settings-inline-add" data-action="add-link" data-col-index="${colIndex}">
                <i class="fa-solid fa-plus"></i> Add Link
            </button>
        </article>
    `).join('');

    // Datalist suggestions from Page Content Manager (label + route autocomplete).
    const pages = Array.isArray(pageContentCatalog) ? pageContentCatalog : [];
    const labelOpts = pages.map((p) => `<option value="${escapeHtml(p.title || '')}"></option>`).join('');
    const routeOpts = pages.map((p) => `<option value="/${escapeHtml(p.slug)}"></option>`).join('');
    container.insertAdjacentHTML('beforeend', `
        <datalist id="footerCmsLabelSuggestions">${labelOpts}</datalist>
        <datalist id="footerCmsRouteSuggestions">${routeOpts}</datalist>
    `);
}

function renderFooterSocialEditor() {
    const container = document.getElementById('footerSocialEditor');
    if (!container) return;

    if (!footerSettingsState.socialLinks.length) {
        container.innerHTML = `
            <div class="footer-settings-empty">
                <p>No social links yet. Add Facebook, Instagram, TikTok, and more.</p>
            </div>`;
        return;
    }

    const presetOptions = FOOTER_SOCIAL_PRESETS.map((preset) =>
        `<option value="${escapeHtml(preset.iconName)}">${escapeHtml(preset.platform)}</option>`
    ).join('');

    container.innerHTML = footerSettingsState.socialLinks.map((item, index) => `
        <article class="footer-social-card" data-social-index="${index}">
            <div class="footer-social-grid">
                <input type="text" class="footer-social-platform" data-social-index="${index}" value="${escapeHtml(item.platform || '')}" placeholder="Name" aria-label="Platform name">
                <select class="footer-social-icon-preset" data-social-index="${index}" aria-label="Icon preset">
                    <option value="">Custom / uploaded</option>
                    ${presetOptions}
                </select>
                <input type="text" class="footer-social-icon-name" data-social-index="${index}" value="${escapeHtml(item.iconName || '')}" placeholder="Key" aria-label="Icon key">
                <input type="url" class="footer-social-url" data-social-index="${index}" value="${escapeHtml(item.linkUrl || '')}" placeholder="URL" aria-label="Profile URL">
                <div class="footer-icon-upload-wrap">
                    <input type="file" class="footer-social-icon-file" data-social-index="${index}" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
                    <button type="button" class="footer-settings-inline-add" data-action="upload-social-icon" data-social-index="${index}">
                        <i class="fa-solid fa-upload"></i> Upload
                    </button>
                    ${item.iconUrl ? `<img src="${escapeHtml(item.iconUrl)}" alt="" class="footer-icon-preview" data-social-preview="${index}">` : `<img src="" alt="" class="footer-icon-preview footer-icon-preview--empty" data-social-preview="${index}" hidden>`}
                </div>
                ${footerToggleHtml({
                    checked: item.isActive !== false,
                    inputClass: 'footer-social-active',
                    dataAttrs: { 'social-index': index },
                    variant: 'green',
                    label: 'Social link active'
                })}
                <button type="button" class="footer-settings-remove-btn" data-action="remove-social" data-social-index="${index}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </article>
    `).join('');

    container.querySelectorAll('.footer-social-icon-preset').forEach((select) => {
        const index = Number(select.dataset.socialIndex);
        const current = footerSettingsState.socialLinks[index];
        if (current?.iconName) select.value = current.iconName;
        select.addEventListener('change', () => {
            const preset = FOOTER_SOCIAL_PRESETS.find((p) => p.iconName === select.value);
            if (!preset) return;
            footerSettingsState.socialLinks[index].iconName = preset.iconName;
            footerSettingsState.socialLinks[index].platform = preset.platform;
            renderFooterSocialEditor();
            updateFooterSettingsPreview();
        });
    });
}

function renderFooterPaymentEditor() {
    const container = document.getElementById('footerPaymentEditor');
    if (!container) return;

    if (!footerSettingsState.paymentGateways.length) {
        container.innerHTML = `
            <div class="footer-settings-empty">
                <p>No payment badges yet. Add bKash, Nagad, Visa, Mastercard, or COD.</p>
            </div>`;
        return;
    }

    const presetOptions = FOOTER_PAYMENT_PRESETS.map((preset) =>
        `<option value="${escapeHtml(preset.iconName)}">${escapeHtml(preset.name)}</option>`
    ).join('');

    container.innerHTML = footerSettingsState.paymentGateways.map((item, index) => `
        <article class="footer-payment-card" data-payment-index="${index}">
            <div class="footer-payment-grid">
                <input type="text" class="footer-payment-name" data-payment-index="${index}" value="${escapeHtml(item.name || '')}" placeholder="Name" aria-label="Badge name">
                <select class="footer-payment-preset" data-payment-index="${index}" aria-label="Preset">
                    <option value="">Custom</option>
                    ${presetOptions}
                </select>
                <input type="text" class="footer-payment-icon-name" data-payment-index="${index}" value="${escapeHtml(item.iconName || '')}" placeholder="Key" aria-label="Icon key">
                <div class="footer-icon-upload-wrap">
                    <input type="file" class="footer-payment-icon-file" data-payment-index="${index}" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
                    <button type="button" class="footer-settings-inline-add" data-action="upload-payment-icon" data-payment-index="${index}">
                        <i class="fa-solid fa-upload"></i> Upload
                    </button>
                    ${item.iconUrl
                        ? `<img src="${escapeHtml(item.iconUrl)}" alt="" class="footer-icon-preview" data-payment-preview="${index}">`
                        : `<img src="" alt="" class="footer-icon-preview footer-icon-preview--empty" data-payment-preview="${index}" hidden>`}
                </div>
                ${footerToggleHtml({
                    checked: item.isActive !== false,
                    inputClass: 'footer-payment-active',
                    dataAttrs: { 'payment-index': index },
                    variant: 'green',
                    label: 'Payment badge active'
                })}
                <button type="button" class="footer-settings-remove-btn" data-action="remove-payment" data-payment-index="${index}" title="Delete badge">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </article>
    `).join('');

    container.querySelectorAll('.footer-payment-preset').forEach((select) => {
        const index = Number(select.dataset.paymentIndex);
        const current = footerSettingsState.paymentGateways[index];
        if (current?.iconName) select.value = current.iconName;
        select.addEventListener('change', () => {
            const preset = FOOTER_PAYMENT_PRESETS.find((p) => p.iconName === select.value);
            if (!preset) return;
            footerSettingsState.paymentGateways[index].iconName = preset.iconName;
            footerSettingsState.paymentGateways[index].name = preset.name;
            renderFooterPaymentEditor();
            updateFooterSettingsPreview();
        });
    });
}

function updatePaymentFormVisibilityUI() {
    const enabled = footerSettingsState.paymentBadgesEnabled !== false;
    const card = document.getElementById('footerPaymentBadgesCard');
    const body = document.getElementById('footerPaymentFormBody');
    const toggleBtn = document.getElementById('footerTogglePaymentFormBtn');
    const label = toggleBtn?.querySelector('span');
    const icon = toggleBtn?.querySelector('i');

    card?.classList.toggle('is-payment-form-hidden', !enabled);
    body?.classList.toggle('is-collapsed', !enabled);
    toggleBtn?.classList.toggle('is-hidden-mode', !enabled);

    if (label) label.textContent = enabled ? 'Hide Payment Form' : 'Show Payment Form';
    if (icon) {
        icon.className = enabled ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    }
}

async function toggleEntirePaymentForm() {
    footerSettingsState.paymentBadgesEnabled = !(footerSettingsState.paymentBadgesEnabled !== false);
    updatePaymentFormVisibilityUI();
    updateFooterSettingsPreview();
    await saveFooterSettings();
}

async function clearAllPaymentBadges() {
    if (!footerSettingsState.paymentGateways.length && footerSettingsState.paymentBadgesEnabled === false) {
        showToast('Payment badges form is already empty/hidden.', 'warning');
        return;
    }
    if (!confirm('Wipe the entire payment badges section from the storefront now?')) return;

    footerSettingsState.paymentGateways = [];
    footerSettingsState.paymentBadgesEnabled = false;
    renderFooterPaymentEditor();
    updatePaymentFormVisibilityUI();
    updateFooterSettingsPreview();
    await saveFooterSettings();
}

function updateFooterSettingsPreview() {
    const previewInner = document.getElementById('footerLivePreviewInner');
    if (!previewInner || !window.FooterRenderer?.buildFooterHtml) return;

    syncFooterStateFromDom();
    previewInner.innerHTML = window.FooterRenderer.buildFooterHtml(footerSettingsState);
}

function applyFooterSettingsToUI(data) {
    if (!data) return;
    footerSettingsState = {
        copyrightText: data.copyrightText || '',
        columns: Array.isArray(data.columns) ? JSON.parse(JSON.stringify(data.columns)) : [],
        socialLinks: Array.isArray(data.socialLinks) ? JSON.parse(JSON.stringify(data.socialLinks)) : [],
        paymentGateways: Array.isArray(data.paymentGateways) ? JSON.parse(JSON.stringify(data.paymentGateways)) : [],
        paymentBadgesEnabled: data.paymentBadgesEnabled !== false
    };

    // Migrate legacy name-only paymentBadges if gateways empty
    if (!footerSettingsState.paymentGateways.length && Array.isArray(data.paymentBadges) && data.paymentBadges.length) {
        footerSettingsState.paymentGateways = data.paymentBadges.map((badge, index) => {
            const name = typeof badge === 'string' ? badge : (badge?.name || '');
            return {
                name,
                iconName: String(name).toLowerCase().replace(/[^a-z0-9]+/g, ''),
                iconUrl: typeof badge === 'object' ? (badge.iconUrl || '') : '',
                isActive: true,
                sortOrder: index
            };
        }).filter((item) => item.name);
    }

    const copyrightEl = document.getElementById('footerCopyrightText');
    if (copyrightEl) copyrightEl.value = footerSettingsState.copyrightText;

    // Replace leftover '#' routes with matching CMS page slugs (e.g. Privacy Policy → /privacy-policy).
    autoLinkFooterCmsRoutes(true);

    renderFooterColumnsEditor();
    renderFooterSocialEditor();
    renderFooterPaymentEditor();
    updatePaymentFormVisibilityUI();
    updateFooterSettingsPreview();
}

function syncFooterStateFromDom() {
    const copyrightEl = document.getElementById('footerCopyrightText');
    if (copyrightEl) footerSettingsState.copyrightText = copyrightEl.value.trim();

    document.querySelectorAll('.footer-col-title-input').forEach((input) => {
        const index = Number(input.dataset.colIndex);
        if (footerSettingsState.columns[index]) {
            footerSettingsState.columns[index].columnTitle = input.value.trim();
        }
    });
    document.querySelectorAll('.footer-col-active').forEach((input) => {
        const index = Number(input.dataset.colIndex);
        if (footerSettingsState.columns[index]) {
            footerSettingsState.columns[index].isActive = input.checked;
        }
    });
    document.querySelectorAll('.footer-link-label').forEach((input) => {
        const colIndex = Number(input.dataset.colIndex);
        const linkIndex = Number(input.dataset.linkIndex);
        if (footerSettingsState.columns[colIndex]?.links?.[linkIndex]) {
            footerSettingsState.columns[colIndex].links[linkIndex].label = input.value.trim();
        }
    });
    document.querySelectorAll('.footer-link-url').forEach((input) => {
        const colIndex = Number(input.dataset.colIndex);
        const linkIndex = Number(input.dataset.linkIndex);
        if (footerSettingsState.columns[colIndex]?.links?.[linkIndex]) {
            footerSettingsState.columns[colIndex].links[linkIndex].url = input.value.trim();
        }
    });
    document.querySelectorAll('.footer-link-active').forEach((input) => {
        const colIndex = Number(input.dataset.colIndex);
        const linkIndex = Number(input.dataset.linkIndex);
        if (footerSettingsState.columns[colIndex]?.links?.[linkIndex]) {
            footerSettingsState.columns[colIndex].links[linkIndex].isActive = input.checked;
        }
    });

    document.querySelectorAll('.footer-social-platform').forEach((input) => {
        const index = Number(input.dataset.socialIndex);
        if (footerSettingsState.socialLinks[index]) footerSettingsState.socialLinks[index].platform = input.value.trim();
    });
    document.querySelectorAll('.footer-social-icon-name').forEach((input) => {
        const index = Number(input.dataset.socialIndex);
        if (footerSettingsState.socialLinks[index]) footerSettingsState.socialLinks[index].iconName = input.value.trim();
    });
    document.querySelectorAll('.footer-social-url').forEach((input) => {
        const index = Number(input.dataset.socialIndex);
        if (footerSettingsState.socialLinks[index]) footerSettingsState.socialLinks[index].linkUrl = input.value.trim();
    });
    document.querySelectorAll('.footer-social-active').forEach((input) => {
        const index = Number(input.dataset.socialIndex);
        if (footerSettingsState.socialLinks[index]) footerSettingsState.socialLinks[index].isActive = input.checked;
    });

    document.querySelectorAll('.footer-payment-name').forEach((input) => {
        const index = Number(input.dataset.paymentIndex);
        if (footerSettingsState.paymentGateways[index]) footerSettingsState.paymentGateways[index].name = input.value.trim();
    });
    document.querySelectorAll('.footer-payment-icon-name').forEach((input) => {
        const index = Number(input.dataset.paymentIndex);
        if (footerSettingsState.paymentGateways[index]) footerSettingsState.paymentGateways[index].iconName = input.value.trim();
    });
    document.querySelectorAll('.footer-payment-active').forEach((input) => {
        const index = Number(input.dataset.paymentIndex);
        if (footerSettingsState.paymentGateways[index]) footerSettingsState.paymentGateways[index].isActive = input.checked;
    });
}

function collectFooterSettingsPayload() {
    syncFooterStateFromDom();
    autoLinkFooterCmsRoutes(true);
    return {
        copyrightText: footerSettingsState.copyrightText,
        columns: footerSettingsState.columns.map((col, index) => ({
            columnTitle: col.columnTitle,
            isActive: col.isActive !== false,
            sortOrder: index,
            links: (col.links || []).map((link) => ({
                label: link.label,
                url: link.url || '#',
                isExternal: link.isExternal === true,
                isActive: link.isActive !== false
            }))
        })),
        socialLinks: footerSettingsState.socialLinks.map((item, index) => ({
            platform: item.platform,
            iconName: item.iconName || '',
            iconUrl: item.iconUrl || '',
            linkUrl: item.linkUrl || '#',
            isActive: item.isActive !== false,
            sortOrder: index
        })),
        paymentBadgesEnabled: footerSettingsState.paymentBadgesEnabled !== false,
        paymentGateways: footerSettingsState.paymentGateways.map((item, index) => ({
            name: item.name,
            iconName: item.iconName || '',
            iconUrl: item.iconUrl || '',
            isActive: item.isActive !== false,
            sortOrder: index
        })),
        paymentBadges: footerSettingsState.paymentGateways
            .filter((item) => item.isActive !== false && item.name)
            .map((item) => ({ name: item.name }))
    };
}

async function uploadFooterIcon(file, meta = {}) {
    const formData = new FormData();
    formData.append('icon', file);
    if (meta.platform) formData.append('platform', meta.platform);
    if (meta.name) formData.append('name', meta.name);
    if (meta.iconName) formData.append('iconName', meta.iconName);

    const res = await fetch('/api/admin/footer-settings/upload-icon', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Icon upload failed.');
    return result.data?.iconUrl || '';
}

window.fetchFooterSettings = async function fetchFooterSettings() {
    const manager = document.getElementById('footerSettingsManager');
    if (!manager) return;

    try {
        // Ensure CMS page catalog is available for route auto-suggest / auto-fill.
        if ((!Array.isArray(pageContentCatalog) || !pageContentCatalog.length)
            && typeof fetchPageContentCatalog === 'function') {
            try {
                await fetchPageContentCatalog();
            } catch (_) { /* catalog optional for load */ }
        }

        const res = await fetch('/api/admin/footer-settings', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to load footer settings.');
        applyFooterSettingsToUI(data.data);
    } catch (err) {
        console.error('Footer settings load error:', err);
        showToast(`Footer settings: ${err.message}`, 'error');
    }
};

async function saveFooterSettings() {
    const btn = document.getElementById('footerSettingsSaveBtn');
    const restore = setButtonLoading(btn, 'Saving...');

    try {
        const payload = collectFooterSettingsPayload();
        const res = await fetch('/api/admin/footer-settings', {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Failed to save footer settings.');
        showToast(result.message || 'Footer settings saved.', 'success');
        applyFooterSettingsToUI(result.data);

        // Sync Page Content Manager when footer links auto-create CMS pages
        const created = Array.isArray(result.createdPages) ? result.createdPages : [];
        if (created.length && typeof fetchPageContentCatalog === 'function') {
            const firstSlug = created[0]?.slug;
            if (firstSlug) activePageSlug = firstSlug;
            await fetchPageContentCatalog();
        } else if (typeof fetchPageContentCatalog === 'function') {
            await fetchPageContentCatalog();
        }
    } catch (err) {
        console.error('Save footer settings error:', err);
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        restore();
    }
}

function setupFooterSettingsManager() {
    document.getElementById('footerAddColumnBtn')?.addEventListener('click', () => {
        footerSettingsState.columns.push({
            id: footerTempId('col'),
            columnTitle: 'NEW COLUMN',
            isActive: true,
            sortOrder: footerSettingsState.columns.length,
            links: [{ label: 'New Link', url: '#', isExternal: false, isActive: true }]
        });
        renderFooterColumnsEditor();
        updateFooterSettingsPreview();
    });

    document.getElementById('footerAddSocialBtn')?.addEventListener('click', () => {
        footerSettingsState.socialLinks.push({
            id: footerTempId('social'),
            platform: 'Facebook',
            iconName: 'facebook',
            iconUrl: '',
            linkUrl: 'https://facebook.com/',
            isActive: true,
            sortOrder: footerSettingsState.socialLinks.length
        });
        renderFooterSocialEditor();
        updateFooterSettingsPreview();
    });

    document.getElementById('footerAddPaymentBtn')?.addEventListener('click', () => {
        if (footerSettingsState.paymentBadgesEnabled === false) {
            footerSettingsState.paymentBadgesEnabled = true;
            updatePaymentFormVisibilityUI();
        }
        footerSettingsState.paymentGateways.push({
            id: footerTempId('pay'),
            name: 'bKash',
            iconName: 'bkash',
            iconUrl: '',
            isActive: true,
            sortOrder: footerSettingsState.paymentGateways.length
        });
        renderFooterPaymentEditor();
        updateFooterSettingsPreview();
    });

    document.getElementById('footerTogglePaymentFormBtn')?.addEventListener('click', toggleEntirePaymentForm);
    document.getElementById('footerClearPaymentBadgesBtn')?.addEventListener('click', clearAllPaymentBadges);

    document.getElementById('footerSettingsSaveBtn')?.addEventListener('click', saveFooterSettings);
    document.getElementById('footerCopyrightText')?.addEventListener('input', updateFooterSettingsPreview);

    document.getElementById('footerColumnsEditor')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const colIndex = Number(btn.dataset.colIndex);

        if (btn.dataset.action === 'add-link') {
            footerSettingsState.columns[colIndex].links.push({
                label: 'New Link', url: '#', isExternal: false, isActive: true
            });
            renderFooterColumnsEditor();
            updateFooterSettingsPreview();
        } else if (btn.dataset.action === 'toggle-external') {
            const linkIndex = Number(btn.dataset.linkIndex);
            const link = footerSettingsState.columns[colIndex]?.links?.[linkIndex];
            if (link) {
                link.isExternal = !link.isExternal;
                btn.classList.toggle('is-active', link.isExternal);
                updateFooterSettingsPreview();
            }
        } else if (btn.dataset.action === 'remove-column') {
            footerSettingsState.columns.splice(colIndex, 1);
            renderFooterColumnsEditor();
            updateFooterSettingsPreview();
        } else if (btn.dataset.action === 'remove-link') {
            const linkIndex = Number(btn.dataset.linkIndex);
            footerSettingsState.columns[colIndex].links.splice(linkIndex, 1);
            renderFooterColumnsEditor();
            updateFooterSettingsPreview();
        }
    });

    document.getElementById('footerColumnsEditor')?.addEventListener('input', (e) => {
        const target = e.target;
        if (target?.classList?.contains('footer-link-label')) {
            const colIndex = Number(target.dataset.colIndex);
            const linkIndex = Number(target.dataset.linkIndex);
            const link = footerSettingsState.columns[colIndex]?.links?.[linkIndex];
            if (link && !link.isExternal) {
                link.label = target.value.trim();
                // Typing "Privacy Policy" auto-replaces empty/'#' with /privacy-policy.
                if (isFooterPlaceholderUrl(link.url) || isFooterPlaceholderUrl(
                    document.querySelector(
                        `.footer-link-url[data-col-index="${colIndex}"][data-link-index="${linkIndex}"]`
                    )?.value
                )) {
                    const page = findFooterCmsPageByLabel(link.label);
                    if (page?.slug) {
                        link.url = `/${page.slug}`;
                        link.isExternal = false;
                        const urlInput = document.querySelector(
                            `.footer-link-url[data-col-index="${colIndex}"][data-link-index="${linkIndex}"]`
                        );
                        const cmsSelect = document.querySelector(
                            `.footer-link-cms-page[data-col-index="${colIndex}"][data-link-index="${linkIndex}"]`
                        );
                        if (urlInput) urlInput.value = link.url;
                        if (cmsSelect) cmsSelect.value = page.slug;
                    }
                }
            }
        }
        updateFooterSettingsPreview();
    });

    document.getElementById('footerColumnsEditor')?.addEventListener('change', (e) => {
        const target = e.target;
        if (target?.classList?.contains('footer-link-cms-page')) {
            const colIndex = Number(target.dataset.colIndex);
            const linkIndex = Number(target.dataset.linkIndex);
            const link = footerSettingsState.columns[colIndex]?.links?.[linkIndex];
            const slug = String(target.value || '').trim();
            if (link && slug) {
                const page = (pageContentCatalog || []).find((p) => p.slug === slug);
                link.url = `/${slug}`;
                link.isExternal = false;
                if (!link.label || link.label === 'New Link' || isFooterPlaceholderUrl(link.label)) {
                    link.label = page?.title || slug;
                }
                const labelInput = document.querySelector(
                    `.footer-link-label[data-col-index="${colIndex}"][data-link-index="${linkIndex}"]`
                );
                const urlInput = document.querySelector(
                    `.footer-link-url[data-col-index="${colIndex}"][data-link-index="${linkIndex}"]`
                );
                if (labelInput && link.label) labelInput.value = link.label;
                if (urlInput) urlInput.value = link.url;
                const extBtn = document.querySelector(
                    `[data-action="toggle-external"][data-col-index="${colIndex}"][data-link-index="${linkIndex}"]`
                );
                extBtn?.classList.remove('is-active');
            }
        }
        updateFooterSettingsPreview();
    });

    document.getElementById('footerSocialEditor')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const index = Number(btn.dataset.socialIndex);

        if (btn.dataset.action === 'remove-social') {
            footerSettingsState.socialLinks.splice(index, 1);
            renderFooterSocialEditor();
            updateFooterSettingsPreview();
            return;
        }

        if (btn.dataset.action === 'upload-social-icon') {
            const fileInput = document.querySelector(`.footer-social-icon-file[data-social-index="${index}"]`);
            fileInput?.click();
        }
    });

    document.getElementById('footerSocialEditor')?.addEventListener('change', async (e) => {
        if (e.target.classList.contains('footer-social-icon-file')) {
            const index = Number(e.target.dataset.socialIndex);
            const file = e.target.files?.[0];
            if (!file) return;

            const previewImg = document.querySelector(`img[data-social-preview="${index}"]`);
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (typeof ev.target?.result === 'string') {
                    footerSettingsState.socialLinks[index].iconUrl = ev.target.result;
                    if (previewImg) {
                        previewImg.src = ev.target.result;
                        previewImg.hidden = false;
                    }
                    updateFooterSettingsPreview();
                }
            };
            reader.readAsDataURL(file);

            try {
                const item = footerSettingsState.socialLinks[index];
                const iconUrl = await uploadFooterIcon(file, {
                    platform: item?.platform,
                    iconName: item?.iconName
                });
                footerSettingsState.socialLinks[index].iconUrl = iconUrl;
                if (previewImg) previewImg.src = iconUrl;
                updateFooterSettingsPreview();
                showToast('Social icon uploaded.', 'success');
            } catch (err) {
                showToast(`Upload failed: ${err.message}`, 'error');
            } finally {
                e.target.value = '';
            }
            return;
        }
        updateFooterSettingsPreview();
    });

    document.getElementById('footerSocialEditor')?.addEventListener('input', updateFooterSettingsPreview);

    document.getElementById('footerPaymentEditor')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const index = Number(btn.dataset.paymentIndex);

        if (btn.dataset.action === 'remove-payment') {
            footerSettingsState.paymentGateways.splice(index, 1);
            renderFooterPaymentEditor();
            updateFooterSettingsPreview();
            return;
        }

        if (btn.dataset.action === 'upload-payment-icon') {
            const fileInput = document.querySelector(`.footer-payment-icon-file[data-payment-index="${index}"]`);
            fileInput?.click();
        }
    });

    document.getElementById('footerPaymentEditor')?.addEventListener('change', async (e) => {
        if (e.target.classList.contains('footer-payment-icon-file')) {
            const index = Number(e.target.dataset.paymentIndex);
            const file = e.target.files?.[0];
            if (!file) return;

            const previewImg = document.querySelector(`img[data-payment-preview="${index}"]`);
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (typeof ev.target?.result === 'string') {
                    footerSettingsState.paymentGateways[index].iconUrl = ev.target.result;
                    if (previewImg) {
                        previewImg.src = ev.target.result;
                        previewImg.hidden = false;
                    }
                    updateFooterSettingsPreview();
                }
            };
            reader.readAsDataURL(file);

            try {
                const item = footerSettingsState.paymentGateways[index];
                const iconUrl = await uploadFooterIcon(file, {
                    name: item?.name,
                    iconName: item?.iconName
                });
                footerSettingsState.paymentGateways[index].iconUrl = iconUrl;
                if (previewImg) previewImg.src = iconUrl;
                updateFooterSettingsPreview();
                showToast('Payment badge uploaded.', 'success');
            } catch (err) {
                showToast(`Upload failed: ${err.message}`, 'error');
            } finally {
                e.target.value = '';
            }
            return;
        }
        updateFooterSettingsPreview();
    });

    document.getElementById('footerPaymentEditor')?.addEventListener('input', updateFooterSettingsPreview);

    document.getElementById('footerSettingsManager')?.addEventListener('change', (e) => {
        if (e.target.classList.contains('footer-toggle-input')) {
            updateFooterSettingsPreview();
        }
    });
}

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    footerTempId,
    isFooterPlaceholderUrl,
    normalizeFooterMatchKey,
    findFooterCmsPageByLabel,
    footerCmsPageOptionsHtml,
    autoLinkFooterCmsRoutes,
    footerToggleHtml,
    renderFooterColumnsEditor,
    renderFooterSocialEditor,
    renderFooterPaymentEditor,
    updatePaymentFormVisibilityUI,
    toggleEntirePaymentForm,
    clearAllPaymentBadges,
    updateFooterSettingsPreview,
    applyFooterSettingsToUI,
    syncFooterStateFromDom,
    collectFooterSettingsPayload,
    uploadFooterIcon,
    saveFooterSettings,
    setupFooterSettingsManager
});
