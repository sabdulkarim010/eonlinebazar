/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/settings-cms.js
 * Description: CMS page content manager.
 */
import '../admin-core.js';
const COURIER_PROVIDER_LABELS = window.COURIER_PROVIDER_LABELS;

/* ==========================================================================
   PAGE CONTENT MANAGER (CMS → /api/admin/pages) — fully dynamic from DB
   ========================================================================== */

function titleToPageSlug(title = '') {
    return String(title || '')
        .trim()
        .toLowerCase()
        .replace(/^\/+/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function getPageContentTabLabel(page) {
    if (!page) return 'Page';
    return page.title || page.slug || 'Page';
}

function updatePageContentFooterActions() {
    const addBtn = document.getElementById('pageContentAddToFooterBtn');
    const saveBtn = document.getElementById('pageContentSaveBtn');
    const hasPage = Boolean(getActivePageState());
    if (addBtn) addBtn.style.display = hasPage ? '' : 'none';
    if (saveBtn) saveBtn.style.display = hasPage ? '' : 'none';
}

function renderPageContentTabs() {
    const tabs = document.getElementById('pageContentTabs');
    if (!tabs) return;

    if (!pageContentCatalog.length) {
        tabs.innerHTML = `
            <p class="page-content-empty-hint">
                No pages in the database yet. Click <strong>+ Create New Page</strong>,
                or save an internal footer link (e.g. <code>/return-policy</code>) under Footer Columns &amp; Links.
            </p>`;
        updatePageContentFooterActions();
        return;
    }

    tabs.innerHTML = pageContentCatalog.map((page) => `
        <button type="button" class="page-content-tab ${page.slug === activePageSlug ? 'is-active' : ''}" data-slug="${escapeHtml(page.slug)}" role="tab" title="/${escapeHtml(page.slug)}">
            ${escapeHtml(getPageContentTabLabel(page))}
        </button>
    `).join('');

    tabs.querySelectorAll('.page-content-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            syncPageContentFromDom();
            activePageSlug = btn.dataset.slug;
            renderPageContentTabs();
            renderPageContentEditor();
        });
    });
    updatePageContentFooterActions();
}

function getActivePageState() {
    return pageContentCatalog.find((p) => p.slug === activePageSlug) || null;
}

function destroyPageContentQuill() {
    pageContentQuill = null;
}

function buildPageContentQuillToolbarHtml() {
    return `
        <div id="pageContentQuillToolbar" class="navbar-link-quill-toolbar page-content-quill-toolbar">
            <span class="ql-formats">
                <select class="ql-font">
                    <option selected></option>
                    <option value="serif">Serif</option>
                    <option value="monospace">Monospace</option>
                    <option value="arial">Arial</option>
                    <option value="georgia">Georgia</option>
                    <option value="tahoma">Tahoma</option>
                    <option value="verdana">Verdana</option>
                    <option value="poppins">Poppins</option>
                    <option value="hind-siliguri">Hind Siliguri</option>
                </select>
                <select class="ql-size">
                    <option value="12px">12px</option>
                    <option value="14px">14px</option>
                    <option value="16px" selected></option>
                    <option value="18px">18px</option>
                    <option value="24px">24px</option>
                    <option value="32px">32px</option>
                    <option value="48px">48px</option>
                </select>
            </span>
            <span class="ql-formats">
                <button class="ql-bold" type="button"></button>
                <button class="ql-italic" type="button"></button>
                <button class="ql-underline" type="button"></button>
                <button class="ql-strike" type="button"></button>
            </span>
            <span class="ql-formats">
                <select class="ql-color"></select>
                <select class="ql-background"></select>
            </span>
            <span class="ql-formats">
                <button class="ql-list" value="ordered" type="button"></button>
                <button class="ql-list" value="bullet" type="button"></button>
                <select class="ql-align">
                    <option selected></option>
                    <option value="center"></option>
                    <option value="right"></option>
                    <option value="justify"></option>
                </select>
            </span>
            <span class="ql-formats">
                <button class="ql-link" type="button"></button>
                <button class="ql-image" type="button"></button>
                <button id="pageContentHtmlEmbedBtn" type="button" class="ql-html-embed" title="Insert HTML">HTML</button>
                <button class="ql-clean" type="button"></button>
            </span>
        </div>`;
}

function resolvePageContentEditorHtml(page) {
    if (!page) return '<p><br></p>';
    let html = '';
    if (page.contentFormat === 'html' && page.bodyHtml) {
        html = page.bodyHtml;
    } else if (page.bodyHtml && /<[a-z][\s\S]*>/i.test(page.bodyHtml) && !/&lt;\/?[a-z]/i.test(page.bodyHtml)) {
        html = page.bodyHtml;
    } else if (page.bodyMarkdown) {
        if (typeof window.MarkdownToHtml?.markdownToHtml === 'function') {
            html = window.MarkdownToHtml.markdownToHtml(page.bodyMarkdown);
        } else {
            html = page.bodyMarkdown;
        }
    } else if (page.bodyHtml) {
        html = page.bodyHtml;
    }
    html = decodeHtmlEntities(html);
    return html.trim() || '<p><br></p>';
}

function setPageContentQuillHtml(html) {
    const quill = pageContentQuill || ensurePageContentQuill();
    const safe = decodeHtmlEntities(String(html || '').trim()) || '<p><br></p>';
    if (!quill) {
        const hidden = document.getElementById('pageContentBodyHtml');
        if (hidden) hidden.value = safe === '<p><br></p>' ? '' : safe;
        return;
    }
    quill.setContents([]);
    quill.clipboard.dangerouslyPasteHTML(0, safe, 'silent');
    const hidden = document.getElementById('pageContentBodyHtml');
    if (hidden) hidden.value = decodeHtmlEntities(quill.root.innerHTML);
}

function getPageContentQuillHtml() {
    if (pageContentQuill) {
        const text = pageContentQuill.getText().replace(/\n/g, '').trim();
        if (!text && !pageContentQuill.root.querySelector('img,iframe')) return '';
        return decodeHtmlEntities(pageContentQuill.root.innerHTML);
    }
    return decodeHtmlEntities(document.getElementById('pageContentBodyHtml')?.value || '');
}

function ensurePageContentQuill() {
    if (pageContentQuill) return pageContentQuill;
    if (typeof Quill === 'undefined') {
        console.warn('Quill.js not loaded — page content rich editor unavailable.');
        return null;
    }
    const editorEl = document.getElementById('pageContentQuillEditor');
    const toolbarEl = document.getElementById('pageContentQuillToolbar');
    if (!editorEl || !toolbarEl) return null;

    registerNavbarLinkQuillFormats();
    pageContentQuill = new Quill(editorEl, {
        theme: 'snow',
        modules: {
            toolbar: {
                container: toolbarEl,
                handlers: {
                    image() {
                        pickNavbarLinkImage(this.quill);
                    }
                }
            }
        },
        placeholder: 'Write page content…'
    });

    document.getElementById('pageContentHtmlEmbedBtn')?.addEventListener('click', () => {
        insertNavbarLinkHtmlEmbed(pageContentQuill);
    });

    pageContentQuill.on('text-change', () => {
        const hidden = document.getElementById('pageContentBodyHtml');
        if (hidden) hidden.value = decodeHtmlEntities(pageContentQuill.root.innerHTML);
    });

    return pageContentQuill;
}

function renderPageContentEditor() {
    const editor = document.getElementById('pageContentEditor');
    if (!editor) return;

    destroyPageContentQuill();

    const page = getActivePageState();
    if (!page) {
        editor.innerHTML = `
            <div class="page-content-empty-state">
                <i class="fa-solid fa-file-circle-plus"></i>
                <p>No page selected. Create a page to start editing rich content.</p>
                <button type="button" class="page-content-create-btn" id="pageContentEmptyCreateBtn">
                    <i class="fa-solid fa-plus"></i> Create New Page
                </button>
            </div>`;
        document.getElementById('pageContentEmptyCreateBtn')?.addEventListener('click', openCreatePageModal);
        updatePageContentFooterActions();
        return;
    }

    const meta = page.contactMeta || {};
    const contactMetaFields = page.slug === 'contact' ? `
            <div class="page-content-contact-meta">
                <h5><i class="fa-solid fa-store"></i> Contact Page — Store Details</h5>
                <div class="page-content-form">
                    <div class="form-group form-group-full">
                        <label for="contactMetaAddress">Store Address</label>
                        <input type="text" id="contactMetaAddress" value="${escapeHtml(meta.address || '')}">
                    </div>
                    <div class="form-group">
                        <label for="contactMetaPhone">Phone</label>
                        <input type="text" id="contactMetaPhone" value="${escapeHtml(meta.phone || '')}">
                    </div>
                    <div class="form-group">
                        <label for="contactMetaEmail">Support Email</label>
                        <input type="email" id="contactMetaEmail" value="${escapeHtml(meta.email || '')}">
                    </div>
                    <div class="form-group form-group-full">
                        <label for="contactMetaHours">Operating Hours</label>
                        <textarea id="contactMetaHours" rows="3">${escapeHtml(meta.hours || '')}</textarea>
                    </div>
                    <div class="form-group form-group-full">
                        <label for="contactMetaMap">Google Maps Embed URL</label>
                        <input type="url" id="contactMetaMap" value="${escapeHtml(meta.mapEmbedUrl || '')}" placeholder="https://www.google.com/maps/embed?pb=...">
                    </div>
                </div>
            </div>` : '';

    editor.innerHTML = `
        <div class="page-content-form">
            <div class="form-group">
                <label for="pageContentTitle">Page Title</label>
                <input type="text" id="pageContentTitle" maxlength="120" value="${escapeHtml(page.title || '')}">
            </div>
            <div class="form-group">
                <label for="pageContentSubtitle">Subtitle (optional)</label>
                <input type="text" id="pageContentSubtitle" maxlength="240" value="${escapeHtml(page.subtitle || '')}">
            </div>
            <div class="form-group form-group-full">
                <label>Content (Rich Text)</label>
                <div class="navbar-link-quill-shell page-content-quill-shell">
                    ${buildPageContentQuillToolbarHtml()}
                    <div id="pageContentQuillEditor" class="navbar-link-quill-editor page-content-quill-editor" aria-label="Page content rich text editor"></div>
                </div>
                <textarea id="pageContentBodyHtml" class="sr-only" hidden aria-hidden="true"></textarea>
                <small class="field-hint">Styles (font size, color, etc.) are saved as raw HTML and rendered on the storefront.</small>
            </div>
            ${contactMetaFields}
            <div class="page-content-publish-row">
                ${footerToggleHtml({
                    checked: page.isPublished !== false,
                    inputClass: 'page-content-published',
                    variant: 'green',
                    label: 'Published on storefront'
                })}
                <div class="page-content-publish-copy">
                    <span class="page-content-publish-label">Published on storefront</span>
                    <small class="field-hint">When <strong>OFF</strong>: footer links to this page are hidden and direct visits show a 404 unavailable page.</small>
                </div>
                <span class="page-content-route-hint">Route: <code>/${escapeHtml(page.slug)}</code> · <code>/pages/${escapeHtml(page.slug)}</code></span>
            </div>
        </div>`;

    requestAnimationFrame(() => {
        ensurePageContentQuill();
        setPageContentQuillHtml(resolvePageContentEditorHtml(page));
    });
    updatePageContentFooterActions();
}

function syncPageContentFromDom() {
    const page = getActivePageState();
    if (!page) return;

    page.title = document.getElementById('pageContentTitle')?.value?.trim() || page.title;
    page.subtitle = document.getElementById('pageContentSubtitle')?.value?.trim() || '';
    page.bodyHtml = getPageContentQuillHtml();
    page.contentFormat = 'html';
    page.bodyMarkdown = '';
    page.isPublished = document.querySelector('.page-content-published')?.checked !== false;
    page.isActive = page.isPublished;

    if (page.slug === 'contact') {
        page.contactMeta = {
            address: document.getElementById('contactMetaAddress')?.value?.trim() || '',
            phone: document.getElementById('contactMetaPhone')?.value?.trim() || '',
            email: document.getElementById('contactMetaEmail')?.value?.trim() || '',
            hours: document.getElementById('contactMetaHours')?.value?.trim() || '',
            mapEmbedUrl: document.getElementById('contactMetaMap')?.value?.trim() || ''
        };
    }
}

function populateFooterColumnSelects() {
    const columns = Array.isArray(footerSettingsState?.columns) ? footerSettingsState.columns : [];
    const options = columns.length
        ? columns.map((col, idx) =>
            `<option value="${idx}">${escapeHtml(col.columnTitle || `Column ${idx + 1}`)}</option>`
        ).join('')
        : '<option value="0">No columns — add one under Footer Settings</option>';

    const createSelect = document.getElementById('createPageFooterColumn');
    const addSelect = document.getElementById('addPageToFooterColumn');
    if (createSelect) createSelect.innerHTML = options;
    if (addSelect) addSelect.innerHTML = options;
}

function syncCreatePageSlugPreview() {
    const slugInput = document.getElementById('createPageSlug');
    const preview = document.getElementById('createPageSlugPreview');
    if (!slugInput || !preview) return;
    const slug = titleToPageSlug(slugInput.value) || 'page-slug';
    preview.textContent = `/${slug}`;
}

function openCreatePageModal() {
    createPageSlugManual = false;
    const modal = document.getElementById('createPageModal');
    if (!modal) return;

    populateFooterColumnSelects();
    const titleEl = document.getElementById('createPageTitle');
    const slugEl = document.getElementById('createPageSlug');
    const subtitleEl = document.getElementById('createPageSubtitle');
    const mdEl = document.getElementById('createPageMarkdown');
    const addFooterEl = document.getElementById('createPageAddToFooter');
    if (titleEl) titleEl.value = '';
    if (slugEl) slugEl.value = '';
    if (subtitleEl) subtitleEl.value = '';
    if (mdEl) mdEl.value = '';
    if (addFooterEl) addFooterEl.checked = true;
    syncCreatePageSlugPreview();
    updateCreatePageFooterColumnVisibility();

    modal.style.display = 'flex';
    titleEl?.focus();
}

window.closeCreatePageModal = function closeCreatePageModal() {
    const modal = document.getElementById('createPageModal');
    if (modal) modal.style.display = 'none';
};

function updateCreatePageFooterColumnVisibility() {
    const checked = document.getElementById('createPageAddToFooter')?.checked;
    const select = document.getElementById('createPageFooterColumn');
    if (select) select.disabled = !checked;
}

async function submitCreatePage() {
    const title = document.getElementById('createPageTitle')?.value?.trim() || '';
    const slugRaw = document.getElementById('createPageSlug')?.value?.trim() || '';
    const slug = titleToPageSlug(slugRaw || title);
    const subtitle = document.getElementById('createPageSubtitle')?.value?.trim() || '';
    const bodyMarkdown = document.getElementById('createPageMarkdown')?.value || '';
    const addToFooter = document.getElementById('createPageAddToFooter')?.checked === true;
    const footerColumnIndex = Number(document.getElementById('createPageFooterColumn')?.value || 0);

    if (!title) {
        showToast('Page title is required.', 'error');
        return;
    }
    if (!slug) {
        showToast('A valid route / slug is required.', 'error');
        return;
    }

    const btn = document.getElementById('createPageSubmitBtn');
    const restore = setButtonLoading(btn, 'Creating...');

    try {
        const res = await fetch('/api/admin/pages', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title,
                slug,
                subtitle,
                bodyMarkdown: bodyMarkdown || `## ${title}\n\nWrite details here...`,
                isPublished: true,
                addToFooter,
                footerColumnIndex: addToFooter ? footerColumnIndex : undefined
            })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Failed to create page.');

        if (result.footer && typeof applyFooterSettingsToUI === 'function') {
            applyFooterSettingsToUI(result.footer);
        }

        activePageSlug = result.data?.slug || slug;
        closeCreatePageModal();
        await fetchPageContentCatalog();
        showToast(result.message || 'Page created.', 'success');
    } catch (err) {
        console.error('Create page error:', err);
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        restore();
    }
}

function openAddPageToFooterModal() {
    const page = getActivePageState();
    if (!page) return;
    populateFooterColumnSelects();
    const hint = document.getElementById('addPageToFooterHint');
    if (hint) {
        hint.innerHTML = `Add <strong>${escapeHtml(page.title)}</strong> (<code>/${escapeHtml(page.slug)}</code>) to a footer column.`;
    }
    const modal = document.getElementById('addPageToFooterModal');
    if (modal) modal.style.display = 'flex';
}

window.closeAddPageToFooterModal = function closeAddPageToFooterModal() {
    const modal = document.getElementById('addPageToFooterModal');
    if (modal) modal.style.display = 'none';
};

async function confirmAddPageToFooter() {
    const page = getActivePageState();
    if (!page) return;

    const columnIndex = Number(document.getElementById('addPageToFooterColumn')?.value || 0);
    const btn = document.getElementById('addPageToFooterConfirmBtn');
    const restore = setButtonLoading(btn, 'Adding...');

    try {
        const res = await fetch(`/api/admin/pages/${encodeURIComponent(page.slug)}/footer-link`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                columnIndex,
                label: page.title
            })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Failed to add footer link.');

        if (result.footer && typeof applyFooterSettingsToUI === 'function') {
            applyFooterSettingsToUI(result.footer);
        }

        closeAddPageToFooterModal();
        showToast(result.message || 'Linked to footer.', 'success');
    } catch (err) {
        console.error('Add page to footer error:', err);
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        restore();
    }
}

window.fetchPageContentCatalog = async function fetchPageContentCatalog() {
    const manager = document.getElementById('pageContentManager');
    if (!manager) return;

    try {
        const res = await fetch('/api/admin/pages', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to load pages.');

        // Only DB pages — never inject hardcoded default tabs
        pageContentCatalog = Array.isArray(data.data) ? data.data : [];
        if (!pageContentCatalog.find((p) => p.slug === activePageSlug)) {
            activePageSlug = pageContentCatalog[0]?.slug || '';
        }

        renderPageContentTabs();
        renderPageContentEditor();

        // Keep Footer Columns CMS dropdowns / '#' auto-links in sync with catalog.
        if (document.getElementById('footerColumnsEditor') && footerSettingsState.columns?.length) {
            const healed = autoLinkFooterCmsRoutes(true);
            renderFooterColumnsEditor();
            if (healed) updateFooterSettingsPreview();
        }
    } catch (err) {
        console.error('Page content load error:', err);
        const editor = document.getElementById('pageContentEditor');
        if (editor) editor.innerHTML = `<p class="page-content-loading">${escapeHtml(err.message)}</p>`;
        updatePageContentFooterActions();
    }
};

async function savePageContent() {
    syncPageContentFromDom();
    const page = getActivePageState();
    if (!page) return;

    const btn = document.getElementById('pageContentSaveBtn');
    const restore = setButtonLoading(btn, 'Saving...');

    try {
        const res = await fetch(`/api/admin/pages/${encodeURIComponent(page.slug)}`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: page.title,
                subtitle: page.subtitle,
                bodyHtml: decodeHtmlEntities(page.bodyHtml || ''),
                contentFormat: 'html',
                isPublished: page.isPublished !== false,
                isActive: page.isPublished !== false,
                contactMeta: page.slug === 'contact' ? page.contactMeta : undefined
            })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Failed to save page.');

        const idx = pageContentCatalog.findIndex((p) => p.slug === page.slug);
        if (idx >= 0) pageContentCatalog[idx] = result.data;

        showToast(result.message || 'Page content saved.', 'success');
        renderPageContentTabs();
        renderPageContentEditor();
    } catch (err) {
        console.error('Save page content error:', err);
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        restore();
    }
}

function setupPageContentManager() {
    document.getElementById('pageContentSaveBtn')?.addEventListener('click', savePageContent);
    document.getElementById('pageContentCreateBtn')?.addEventListener('click', openCreatePageModal);
    document.getElementById('pageContentAddToFooterBtn')?.addEventListener('click', openAddPageToFooterModal);

    document.getElementById('createPageModalCloseBtn')?.addEventListener('click', closeCreatePageModal);
    document.getElementById('createPageCancelBtn')?.addEventListener('click', closeCreatePageModal);
    document.getElementById('createPageSubmitBtn')?.addEventListener('click', submitCreatePage);
    document.getElementById('createPageAddToFooter')?.addEventListener('change', updateCreatePageFooterColumnVisibility);

    document.getElementById('createPageTitle')?.addEventListener('input', (e) => {
        if (createPageSlugManual) return;
        const slugEl = document.getElementById('createPageSlug');
        if (slugEl) slugEl.value = titleToPageSlug(e.target.value);
        syncCreatePageSlugPreview();
    });
    document.getElementById('createPageSlug')?.addEventListener('input', () => {
        createPageSlugManual = true;
        syncCreatePageSlugPreview();
    });

    document.getElementById('addPageToFooterCloseBtn')?.addEventListener('click', closeAddPageToFooterModal);
    document.getElementById('addPageToFooterCancelBtn')?.addEventListener('click', closeAddPageToFooterModal);
    document.getElementById('addPageToFooterConfirmBtn')?.addEventListener('click', confirmAddPageToFooter);
}


function applyWhatsAppSettingsToUI(settings) {
    if (!settings) return;

    const publicEl = document.getElementById('publicSupportWhatsApp');
    if (publicEl && settings.publicSupportWhatsApp !== undefined) {
        publicEl.value = settings.publicSupportWhatsApp || '';
    }

    const privateEl = document.getElementById('privateAdminAlertWhatsApp');
    if (privateEl && settings.privateAdminAlertWhatsApp !== undefined) {
        privateEl.value = settings.privateAdminAlertWhatsApp || '';
    }

    const alertsToggle = document.getElementById('enableWhatsAppOrderAlerts');
    if (alertsToggle && settings.enableWhatsAppOrderAlerts !== undefined) {
        alertsToggle.checked = settings.enableWhatsAppOrderAlerts === true;
    }

    const providerEl = document.getElementById('whatsAppAlertProvider');
    if (providerEl && settings.whatsAppAlertProvider !== undefined) {
        providerEl.value = settings.whatsAppAlertProvider || '';
    }

    const apiKeyEl = document.getElementById('whatsAppAlertApiKey');
    if (apiKeyEl && settings.whatsAppAlertApiKey !== undefined) {
        apiKeyEl.value = settings.whatsAppAlertApiKey || '';
    }

    const instanceEl = document.getElementById('whatsAppAlertInstanceId');
    if (instanceEl && settings.whatsAppAlertInstanceId !== undefined) {
        instanceEl.value = settings.whatsAppAlertInstanceId || '';
    }

    updateWhatsAppSettingsPreview();
}

function updateWhatsAppSettingsPreview() {
    const previewEl = document.getElementById('whatsappSettingsPreviewText');
    if (!previewEl) return;

    const publicNumber = document.getElementById('publicSupportWhatsApp')?.value?.trim() || '';
    const privateNumber = document.getElementById('privateAdminAlertWhatsApp')?.value?.trim() || '';
    const alertsEnabled = document.getElementById('enableWhatsAppOrderAlerts')?.checked === true;
    const provider = document.getElementById('whatsAppAlertProvider')?.value || '';
    const hasApiKey = Boolean(document.getElementById('whatsAppAlertApiKey')?.value?.trim());

    if (!publicNumber && !privateNumber) {
        previewEl.textContent = 'Add a public customer number for storefront chat and a private admin number for order alerts.';
        return;
    }

    const publicLabel = publicNumber
        ? `Public chat: +${publicNumber.replace(/^88?/, '')} (live on storefront)`
        : 'Public chat: not set — storefront button will use the default fallback';
    const gatewayLabel = provider && hasApiKey
        ? `Auto-send via ${provider}`
        : 'No gateway — wa.me fallback badge in admin header when orders arrive';
    const alertLabel = alertsEnabled
        ? (privateNumber
            ? `Order alerts ON → private line …${privateNumber.slice(-4)} · ${gatewayLabel}`
            : 'Order alerts ON — add the private admin number to receive alerts')
        : 'Order alerts OFF';

    previewEl.textContent = `${publicLabel} · ${alertLabel}`;
}

function applyCourierSettingsToUI(settings) {
    if (!settings) return;

    cacheAdminCourierSettings(settings);

    const providerEl = document.getElementById('defaultCourierProvider');
    if (providerEl && settings.defaultCourierProvider !== undefined) {
        providerEl.value = normalizeAdminCourierSlug(settings.defaultCourierProvider || '');
    }

    const apiKeyEl = document.getElementById('courierApiKey');
    if (apiKeyEl && settings.courierApiKey !== undefined) {
        apiKeyEl.value = settings.courierApiKey || '';
    }

    const secretKeyEl = document.getElementById('courierSecretKey');
    if (secretKeyEl && settings.courierSecretKey !== undefined) {
        secretKeyEl.value = settings.courierSecretKey || '';
    }

    updateCourierSettingsPreview();
}

function updateCourierSettingsPreview() {
    const previewEl = document.getElementById('courierSettingsPreviewText');
    if (!previewEl) return;

    const provider = normalizeAdminCourierSlug(document.getElementById('defaultCourierProvider')?.value || '');
    const hasApiKey = Boolean(document.getElementById('courierApiKey')?.value?.trim());
    const hasSecretKey = Boolean(document.getElementById('courierSecretKey')?.value?.trim());

    toggleCourierCredentialPanels(provider);

    if (!provider) {
        previewEl.textContent = 'No provider selected — pick one to label the booking button in Live Orders.';
        return;
    }

    const providerLabel = COURIER_PROVIDER_LABELS[provider] || provider;

    if (provider === 'steadfast' && (!hasApiKey || !hasSecretKey)) {
        const missing = !hasApiKey && !hasSecretKey
            ? 'API key and secret key'
            : (!hasApiKey ? 'API key' : 'secret key');
        previewEl.textContent = `${providerLabel} selected — add the ${missing} to enable one-click booking.`;
        return;
    }

    if (provider === 'pathao') {
        previewEl.textContent = `${providerLabel} selected — configure PATHAO_* keys and PATHAO_STORE_ID in .env for live booking.`;
        return;
    }

    if (provider === 'redx') {
        previewEl.textContent = `${providerLabel} selected — configure REDX_API_TOKEN in .env for live booking.`;
        return;
    }

    previewEl.textContent = `${providerLabel} ready — "Send to Courier" is live on every unbooked order in Live Orders.`;
}

function toggleCourierCredentialPanels(provider = '') {
    const slug = normalizeAdminCourierSlug(provider || document.getElementById('defaultCourierProvider')?.value || '');
    const steadfastFields = document.getElementById('courierSteadfastFields');
    const steadfastSecret = document.getElementById('courierSteadfastSecretField');
    const pathaoPanel = document.getElementById('courierPathaoEnvPanel');
    const redxPanel = document.getElementById('courierRedxEnvPanel');
    const showSteadfast = !slug || slug === 'steadfast';

    if (steadfastFields) steadfastFields.style.display = showSteadfast ? '' : 'none';
    if (steadfastSecret) steadfastSecret.style.display = showSteadfast ? '' : 'none';
    if (pathaoPanel) pathaoPanel.style.display = slug === 'pathao' ? '' : 'none';
    if (redxPanel) redxPanel.style.display = slug === 'redx' ? '' : 'none';
}

function applySmsSettingsToUI(settings) {
    if (!settings) return;

    const smsToggle = document.getElementById('enableSmsNotifications');
    if (smsToggle && settings.enableSmsNotifications !== undefined) {
        smsToggle.checked = settings.enableSmsNotifications === true;
    }

    const providerEl = document.getElementById('smsGatewayProvider');
    if (providerEl && settings.smsGatewayProvider !== undefined) {
        providerEl.value = settings.smsGatewayProvider || '';
    }

    const apiKeyEl = document.getElementById('smsApiKey');
    if (apiKeyEl && settings.smsApiKey !== undefined) {
        apiKeyEl.value = settings.smsApiKey || '';
    }

    const senderEl = document.getElementById('smsSenderId');
    if (senderEl && settings.smsSenderId !== undefined) {
        senderEl.value = settings.smsSenderId || '';
    }

    updateSmsSettingsPreview();
}

function updateSmsSettingsPreview() {
    const previewEl = document.getElementById('smsSettingsPreviewText');
    if (!previewEl) return;

    const enabled = document.getElementById('enableSmsNotifications')?.checked === true;
    const provider = document.getElementById('smsGatewayProvider')?.value || '';
    const hasKey = Boolean(document.getElementById('smsApiKey')?.value?.trim());
    const senderId = document.getElementById('smsSenderId')?.value?.trim() || 'EOBAZAR';

    if (!enabled) {
        previewEl.textContent = 'Disabled — enable the toggle to send order and status SMS.';
        return;
    }

    if (!provider || !hasKey) {
        previewEl.textContent = 'Enabled — select a gateway provider and enter your API key to go live.';
        return;
    }

    previewEl.textContent = `Enabled — ${provider} · Sender: ${senderId} · credentials loaded from System Settings.`;
}

function applyFlashSaleSettingsToUI(settings) {
    if (!settings) return;

    const enabledEl = document.getElementById('flashSaleEnabled');
    if (enabledEl) enabledEl.checked = settings.flashSaleEnabled === true;

    const titleEl = document.getElementById('flashSaleTitle');
    if (titleEl && settings.flashSaleTitle !== undefined) titleEl.value = settings.flashSaleTitle || '';

    const discountEl = document.getElementById('flashSaleDiscountPercent');
    if (discountEl && settings.flashSaleDiscountPercent !== undefined) {
        discountEl.value = settings.flashSaleDiscountPercent;
    }

    const productsEl = document.getElementById('flashSaleProductIds');
    if (productsEl && Array.isArray(settings.flashSaleProductIds)) {
        productsEl.value = settings.flashSaleProductIds.join(', ');
    }

    const endDateEl = document.getElementById('flashSaleEndDate');
    const endTimeEl = document.getElementById('flashSaleEndTime');
    if (settings.flashSaleEndDate || settings.endsAt) {
        const end = new Date(settings.flashSaleEndDate || settings.endsAt);
        if (!Number.isNaN(end.getTime())) {
            if (endDateEl) endDateEl.value = end.toISOString().slice(0, 10);
            if (endTimeEl) endTimeEl.value = end.toTimeString().slice(0, 5);
        }
    }

    updateFlashSaleSettingsPreview();
}

function updateFlashSaleSettingsPreview() {
    const previewEl = document.getElementById('flashSaleSettingsPreviewText');
    if (!previewEl) return;

    const enabled = document.getElementById('flashSaleEnabled')?.checked === true;
    const title = document.getElementById('flashSaleTitle')?.value?.trim() || 'Flash Sale';
    const discount = Number(document.getElementById('flashSaleDiscountPercent')?.value || 0);
    const endDate = document.getElementById('flashSaleEndDate')?.value;
    const endTime = document.getElementById('flashSaleEndTime')?.value || '23:59';
    const productCount = (document.getElementById('flashSaleProductIds')?.value || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean).length;

    if (!enabled) {
        previewEl.textContent = 'Flash sale is currently inactive.';
        return;
    }

    if (!endDate || discount <= 0 || productCount === 0) {
        previewEl.textContent = `${title} enabled — add end date, discount, and at least one product ID to go live.`;
        return;
    }

    previewEl.textContent = `${title} · ${discount}% off · ${productCount} product(s) · ends ${endDate} ${endTime}`;
}

function applyAnnouncementSettingsToUI(settings) {
    if (!settings) return;

    const textEl = document.getElementById('announcementText');
    const activeEl = document.getElementById('isAnnouncementActive');

    if (textEl && settings.announcementText !== undefined) {
        textEl.value = settings.announcementText || '';
    }
    if (activeEl && settings.isAnnouncementActive !== undefined) {
        activeEl.checked = settings.isAnnouncementActive !== false;
    }

    updateAnnouncementSettingsPreview();
}

/**
 * Mirrors the server's announcement builder so the admin sees the exact
 * sentence customers will get before saving.
 */
function buildAnnouncementPreviewText() {
    const threshold = Number(document.getElementById('masterFreeShippingThreshold')?.value || 0);
    const cashback = Number(document.getElementById('masterCashbackPercentage')?.value || 0);
    const takaPerPoint = Number(document.getElementById('masterTakaToPointsRatio')?.value || 0);

    const shippingSentence = threshold > 0
        ? `Enjoy Free Shipping on orders over ৳${threshold.toLocaleString('en-US')}!`
        : 'Enjoy Free Shipping on every order!';

    const perks = [];
    if (cashback > 0) perks.push(`${cashback}% cashback straight to your wallet`);
    if (takaPerPoint > 0) perks.push(`1 loyalty point for every ৳${takaPerPoint.toLocaleString('en-US')} you spend`);

    return perks.length === 0
        ? shippingSentence
        : `${shippingSentence} Earn ${perks.join(' and ')}.`;
}

function updateAnnouncementSettingsPreview() {
    const previewEl = document.getElementById('announcementSettingsPreviewText');
    if (!previewEl) return;

    const isActive = document.getElementById('isAnnouncementActive')?.checked !== false;
    const customText = document.getElementById('announcementText')?.value?.trim() || '';

    if (!isActive) {
        previewEl.textContent = 'Announcement hidden from customer dashboard.';
        return;
    }

    previewEl.textContent = customText || buildAnnouncementPreviewText();
}

function updateMasterSettingsPreview() {
    const previewEl = document.getElementById('masterSettingsPreviewText');

    // The announcement copy quotes the cashback and points rates, so it has to
    // refresh whenever the rewards fields change too.
    updateAnnouncementSettingsPreview();
    updateSmsSettingsPreview();
    updateCourierSettingsPreview();
    updateWhatsAppSettingsPreview();
    if (!previewEl) return;

    const cashback = Number(document.getElementById('masterCashbackPercentage')?.value || 0);
    const takaRatio = Number(document.getElementById('masterTakaToPointsRatio')?.value || 100);
    const conversion = Number(document.getElementById('masterPointsConversionRate')?.value || 0);
    const refundHours = Number(document.getElementById('masterRefundUndoWindow')?.value || 0);
    const threshold = Number(document.getElementById('masterFreeShippingThreshold')?.value || 0);

    const pointsPerThousand = takaRatio > 0 ? (1000 / takaRatio).toFixed(2) : '0';
    let shippingNote = 'free shipping on every order';
    if (threshold > 0) {
        const thresholdLabel = `৳${threshold.toLocaleString('en-US')}`;
        shippingNote = 1000 >= threshold
            ? `free shipping (meets ${thresholdLabel} threshold)`
            : `shipping charged (${thresholdLabel} threshold not met)`;
    }
    previewEl.textContent =
        `৳1,000 order → ${cashback}% cashback (৳${(1000 * cashback / 100).toFixed(0)}) + ~${pointsPerThousand} pts · 100 pts → ৳${conversion} · Refund undo: ${refundHours}h · ${shippingNote}`;
}

async function fetchMasterSettings() {
    try {
        const res = await fetch('/api/admin/master-settings', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.data) {
            applyMasterSettingsToUI(data.data);
        } else {
            showToast(data.message || 'Failed to load system settings.', 'error');
        }
    } catch (err) {
        console.error('Failed to load system settings:', err);
        showToast('Error: Could not load system settings.', 'error');
    }

    // Payment catalog lives on its own endpoints — keep it in sync with System Settings.
    await fetchPaymentMethodsCatalog();
    await fetchFooterSettings();
    await fetchPageContentCatalog();
}

async function saveMasterSettings(payload) {
    const res = await fetch('/api/admin/master-settings/update', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    return res.json();
}

/**
 * Binds an isolated System Settings card form — only its fields are POSTed,
 * with a section-specific loading state and toast on success.
 */
function bindSystemSettingsSectionForm(formId, { getPayload, successMessage, onSuccess } = {}) {
    const form = document.getElementById(formId);
    if (!form || typeof getPayload !== 'function') return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = form.querySelector('.system-settings-save-btn');
        const restore = setButtonLoading(submitBtn, 'Saving...');

        try {
            const payload = getPayload();
            const result = await saveMasterSettings(payload);

            if (result.success) {
                showToast(successMessage || 'Settings updated successfully!', 'success');
                if (result.data) applyMasterSettingsToUI(result.data);
                if (typeof onSuccess === 'function') onSuccess(result);
            } else {
                showToast(`Error: ${result.message || 'Failed to save settings.'}`, 'error');
            }
        } catch (err) {
            console.error(`Save ${formId} error:`, err);
            showToast('Error: Could not reach the server. Please try again.', 'error');
        } finally {
            restore();
        }
    });
}

function setupSystemSettingsSectionForms() {
    bindSystemSettingsSectionForm('form-system-announcement', {
        successMessage: 'Announcement & shipping settings updated successfully!',
        getPayload: () => ({
            announcementText: document.getElementById('announcementText')?.value?.trim() || '',
            isAnnouncementActive: document.getElementById('isAnnouncementActive')?.checked !== false,
            freeShippingThreshold: document.getElementById('masterFreeShippingThreshold')?.value
        }),
        onSuccess: () => fetchAdminSettings()
    });

    bindSystemSettingsSectionForm('form-system-sms', {
        successMessage: 'SMS gateway settings updated successfully!',
        getPayload: () => ({
            enableSmsNotifications: document.getElementById('enableSmsNotifications')?.checked === true,
            smsGatewayProvider: document.getElementById('smsGatewayProvider')?.value || '',
            smsApiKey: document.getElementById('smsApiKey')?.value?.trim() || '',
            smsSenderId: document.getElementById('smsSenderId')?.value?.trim() || ''
        })
    });

    bindSystemSettingsSectionForm('form-system-courier', {
        successMessage: 'Courier booking settings updated successfully!',
        getPayload: () => ({
            defaultCourierProvider: document.getElementById('defaultCourierProvider')?.value || '',
            courierApiKey: document.getElementById('courierApiKey')?.value?.trim() || '',
            courierSecretKey: document.getElementById('courierSecretKey')?.value?.trim() || ''
        })
    });

    bindSystemSettingsSectionForm('form-system-whatsapp', {
        successMessage: 'WhatsApp configuration updated successfully!',
        getPayload: () => ({
            publicSupportWhatsApp: document.getElementById('publicSupportWhatsApp')?.value?.trim() || '',
            privateAdminAlertWhatsApp: document.getElementById('privateAdminAlertWhatsApp')?.value?.trim() || '',
            enableWhatsAppOrderAlerts: document.getElementById('enableWhatsAppOrderAlerts')?.checked === true,
            whatsAppAlertProvider: document.getElementById('whatsAppAlertProvider')?.value || '',
            whatsAppAlertApiKey: document.getElementById('whatsAppAlertApiKey')?.value?.trim() || '',
            whatsAppAlertInstanceId: document.getElementById('whatsAppAlertInstanceId')?.value?.trim() || ''
        })
    });

    setupPaymentMethodsManager();
    setupFooterSettingsManager();
    setupPageContentManager();
    setupMessagesInbox();

    bindSystemSettingsSectionForm('form-system-flash-sale', {
        successMessage: 'Flash sale settings updated successfully!',
        getPayload: () => ({
            flashSaleEnabled: document.getElementById('flashSaleEnabled')?.checked === true,
            flashSaleTitle: document.getElementById('flashSaleTitle')?.value?.trim() || 'Flash Sale',
            flashSaleEndDate: document.getElementById('flashSaleEndDate')?.value || '',
            flashSaleEndTime: document.getElementById('flashSaleEndTime')?.value || '23:59',
            flashSaleDiscountPercent: document.getElementById('flashSaleDiscountPercent')?.value,
            flashSaleProductIds: document.getElementById('flashSaleProductIds')?.value || ''
        })
    });

    bindSystemSettingsSectionForm('form-system-vip', {
        successMessage: 'VIP segmentation thresholds updated successfully!',
        getPayload: () => ({
            vipMinTotalSpent: document.getElementById('vipMinTotalSpent')?.value,
            vipMinOrderCount: document.getElementById('vipMinOrderCount')?.value,
            frequentBuyerMinOrders: document.getElementById('frequentBuyerMinOrders')?.value
        })
    });

    bindSystemSettingsSectionForm('form-system-catalog', {
        successMessage: 'Catalog pagination settings updated successfully!',
        getPayload: () => ({
            defaultProductsPerPage: document.getElementById('defaultProductsPerPage')?.value
        })
    });

    bindSystemSettingsSectionForm('form-system-rewards', {
        successMessage: 'Rewards & refund settings updated successfully!',
        getPayload: () => ({
            cashbackPercentage: document.getElementById('masterCashbackPercentage')?.value,
            takaToPointsRatio: document.getElementById('masterTakaToPointsRatio')?.value,
            pointsToTakaConversionRate: document.getElementById('masterPointsConversionRate')?.value,
            refundUndoWindowHours: document.getElementById('masterRefundUndoWindow')?.value
        })
    });
}

async function saveStoreBrandingForm(form) {
    const formData = new FormData(form);
    const logoFile = formData.get('logo');
    const faviconFile = formData.get('favicon');
    const hasLogo = logoFile instanceof File && logoFile.size > 0;
    const hasFavicon = faviconFile instanceof File && faviconFile.size > 0;

    if (!hasLogo && !hasFavicon) {
        showToast('Please choose a logo or favicon before saving.', 'warning');
        return;
    }

    const saveBtn = form.querySelector('button[type="submit"]');
    const restore = setButtonLoading(saveBtn, 'Saving...');

    try {
        const res = await fetch('/api/admin/upload-branding', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        let result;
        try {
            result = await res.json();
        } catch (parseErr) {
            throw new Error('Invalid server response.');
        }

        if (result.success) {
            showToast('Success: Store Branding updated successfully!', 'success');
            if (result.logoUrl) applyBrandingAsset('logo', result.logoUrl);
            if (result.faviconUrl) applyBrandingAsset('favicon', result.faviconUrl);
            window.__STORE_SETTINGS__ = {
                ...(window.__STORE_SETTINGS__ || {}),
                storeName: document.getElementById('settingsStoreName')?.value?.trim() || window.__STORE_SETTINGS__?.storeName || 'EonlineBazar',
                logoPath: result.logoUrl || window.__STORE_SETTINGS__?.logoPath || '',
                faviconPath: result.faviconUrl || window.__STORE_SETTINGS__?.faviconPath || '/images/favicon.png',
                logoUrl: result.logoUrl || window.__STORE_SETTINGS__?.logoUrl || '',
                faviconUrl: result.faviconUrl || window.__STORE_SETTINGS__?.faviconUrl || '/images/favicon.png',
                storeLogo: result.logoUrl || window.__STORE_SETTINGS__?.storeLogo || '',
                v: Date.now()
            };
            if (typeof window.notifyStoreBrandingUpdated === 'function') {
                window.notifyStoreBrandingUpdated();
            }
            if (typeof window.refreshStoreBranding === 'function') window.refreshStoreBranding();
            form.reset();
        } else {
            showToast(`Error: ${result.message || 'Failed to upload store branding.'}`, 'error');
            fetchAdminSettings();
        }
    } catch (err) {
        console.error('Store branding upload error:', err);
        showToast('Error: Could not reach the server. Please try again.', 'error');
        fetchAdminSettings();
    } finally {
        restore();
    }
}
window.saveStoreBranding = () => {
    const form = document.getElementById('storeBrandingForm');
    if (form) saveStoreBrandingForm(form);
};

/**
 * Handles a logo/favicon file selection: validates it and shows an instant local preview.
 */
function previewBrandingFile(input, assetType, label) {
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast(`Error: Please choose a valid image file for the ${label}.`, 'error');
        input.value = '';
        return;
    }

    showLocalBrandingPreview(assetType, file);

    const dropzone = document.getElementById(assetType === 'logo' ? 'logoPreviewBox' : 'faviconPreviewBox');
    if (dropzone) dropzone.classList.add('has-preview');

    showToast(`${label} ready — click "Save Store Branding" to publish it.`, 'info');
}

/**
 * বাটনকে সাময়িকভাবে লোডিং অবস্থায় নিয়ে যায় ("Saving..." + স্পিনার + disabled)
 * @returns {Function} restore() — বাটনকে আগের অবস্থায় ফিরিয়ে আনে
 */
function setButtonLoading(btn, loadingText = 'Saving...') {
    if (!btn) return () => {};
    const originalHTML = btn.innerHTML;
    const wasDisabled = btn.disabled;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${loadingText}`;
    return () => {
        btn.disabled = wasDisabled;
        btn.classList.remove('is-loading');
        btn.innerHTML = originalHTML;
    };
}

/**
 * নতুন লোগো/ফ্যাভিকন URL সঙ্গে সঙ্গে পুরো DOM-এ প্রয়োগ করে (রিফ্রেশ ছাড়াই)
 */
function applyBrandingAsset(assetType, url) {
    if (!url) return;

    if (assetType === 'logo') {
        setBrandingPreviewImage('logo', url);
    } else if (assetType === 'favicon') {
        setBrandingPreviewImage('favicon', url);
        updateSiteFaviconLink(url);
    }
}

/**
 * ফাইল সিলেক্ট করার সঙ্গে সঙ্গে লোকাল প্রিভিউ দেখায় (আপলোডের আগেই)
 */
function showLocalBrandingPreview(assetType, file) {
    revokeBrandingObjectUrl(assetType);
    const objectUrl = URL.createObjectURL(file);
    brandingPreviewObjectUrls[assetType] = objectUrl;
    setBrandingPreviewImage(assetType, objectUrl);
}

function setupAdminSettingsTabs() {
    const tabs = document.querySelectorAll('.admin-settings-tab');
    const panels = document.querySelectorAll('.admin-settings-panel');
    if (!tabs.length || !panels.length) return;

    const activateTab = (tab) => {
        const target = tab.dataset.tab;
        if (!target) return;

        tabs.forEach((t) => {
            const isActive = t === tab;
            t.classList.toggle('is-active', isActive);
            t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        panels.forEach((panel) => {
            const isActive = panel.dataset.panel === target;
            panel.classList.toggle('is-active', isActive);
            panel.hidden = !isActive;
        });

        if (target === 'profile' && typeof loadSandboxStatus === 'function') {
            loadSandboxStatus();
        }
    };

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => activateTab(tab));
    });
}

function assignBrandingFile(input, file, assetType, label) {
    if (!input || !file) return;
    if (!file.type.startsWith('image/')) {
        showToast(`Error: Please choose a valid image file for the ${label}.`, 'error');
        return;
    }

    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    showLocalBrandingPreview(assetType, file);

    const dropzone = document.getElementById(assetType === 'logo' ? 'logoPreviewBox' : 'faviconPreviewBox');
    if (dropzone) dropzone.classList.add('has-preview');

    showToast(`${label} ready — click "Save Store Branding" to publish it.`, 'info');
}

function setupBrandingDropzones() {
    const zones = document.querySelectorAll('.branding-dropzone[data-asset]');
    zones.forEach((zone) => {
        const assetType = zone.dataset.asset;
        const inputId = assetType === 'logo' ? 'settingsLogoInput' : 'settingsFaviconInput';
        const input = document.getElementById(inputId);
        const label = assetType === 'logo' ? 'Store logo' : 'Favicon';
        if (!input) return;

        const openPicker = () => input.click();

        zone.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            openPicker();
        });

        zone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPicker();
            }
        });

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('is-dragover');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('is-dragover');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('is-dragover');
            const file = e.dataTransfer?.files?.[0];
            if (file) assignBrandingFile(input, file, assetType, label);
        });
    });
}

function setupAdminSettingsForms() {
    populateShopHomeCityOptions();

    [
        'masterCashbackPercentage',
        'masterTakaToPointsRatio',
        'masterPointsConversionRate',
        'masterRefundUndoWindow',
        'masterFreeShippingThreshold',
        'announcementText',
        'isAnnouncementActive',
        'enableSmsNotifications',
        'smsGatewayProvider',
        'smsApiKey',
        'smsSenderId',
        'defaultCourierProvider',
        'courierApiKey',
        'courierSecretKey',
        'publicSupportWhatsApp',
        'privateAdminAlertWhatsApp',
        'enableWhatsAppOrderAlerts',
        'whatsAppAlertProvider',
        'whatsAppAlertApiKey',
        'whatsAppAlertInstanceId',
        'flashSaleTitle',
        'flashSaleEndDate',
        'flashSaleEndTime',
        'flashSaleDiscountPercent',
        'flashSaleProductIds',
        'vipMinTotalSpent',
        'vipMinOrderCount',
        'frequentBuyerMinOrders'
    ].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', updateMasterSettingsPreview);
        if (el.type === 'checkbox' || el.tagName === 'SELECT') {
            el.addEventListener('change', updateMasterSettingsPreview);
        }
    });

    const flashEnabledEl = document.getElementById('flashSaleEnabled');
    if (flashEnabledEl) {
        flashEnabledEl.addEventListener('change', updateFlashSaleSettingsPreview);
    }

    setupSystemSettingsSectionForms();

    const profileForm = document.getElementById('adminProfileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const displayName = document.getElementById('settingsDisplayName')?.value?.trim();
            const username = document.getElementById('settingsUsername')?.value?.trim();
            const email = document.getElementById('settingsAdminEmail')?.value?.trim() || '';
            const currentPassword = document.getElementById('settingsCurrentPassword')?.value;
            const newPassword = document.getElementById('settingsNewPassword')?.value;

            if (!currentPassword) {
                return showToast('Error: Current password is required to save changes.', 'warning');
            }

            const submitBtn = profileForm.querySelector('button[type="submit"]');
            const restore = setButtonLoading(submitBtn, 'Saving...');
            try {
                const result = await saveAdminProfile({
                    displayName,
                    username,
                    email,
                    currentPassword,
                    ...(newPassword ? { newPassword } : {})
                });

                if (result.success) {
                    showToast('Success: Admin Profile updated successfully!', 'success');
                    if (result.data) applyAdminSettingsToUI(result.data);
                    document.getElementById('settingsCurrentPassword').value = '';
                    document.getElementById('settingsNewPassword').value = '';
                    if (typeof window.refreshTwoFactorSettings === 'function') window.refreshTwoFactorSettings();

                    // Changing the username or password invalidates this token —
                    // the server already revoked every session, so sign back in.
                    if (result.requireRelogin) {
                        showToast(result.message || 'Please sign in again with your new credentials.', 'info');
                        setTimeout(() => { window.location.href = '/admin/logout'; }, 1800);
                    }
                } else {
                    showToast(`Error: ${result.message || 'Failed to update profile.'}`, 'error');
                }
            } catch (err) {
                console.error('Save profile error:', err);
                showToast('Error: Could not reach the server. Please try again.', 'error');
            } finally {
                restore();
            }
        });
    }

    const platformForm = document.getElementById('platformSettingsForm');
    if (platformForm) {
        platformForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('platformCurrentPassword')?.value;
            if (!currentPassword) return showToast('Error: Current password is required to save changes.', 'warning');

            const submitBtn = platformForm.querySelector('button[type="submit"]');
            const restore = setButtonLoading(submitBtn, 'Saving...');
            try {
                const result = await saveAdminSettings({
                    currentPassword,
                    storeName: document.getElementById('settingsStoreName')?.value?.trim(),
                    currency: document.getElementById('settingsCurrency')?.value?.trim(),
                    currencySymbol: document.getElementById('settingsCurrencySymbol')?.value?.trim(),
                    timezone: document.getElementById('settingsTimezone')?.value
                });

                if (result.success) {
                    showToast('Success: Platform preferences saved!', 'success');
                    applyAdminSettingsToUI(result.data);
                    document.getElementById('platformCurrentPassword').value = '';

                    if (result.requireRelogin) {
                        showToast(result.message || 'Please sign in again with your new credentials.', 'info');
                        setTimeout(() => { window.location.href = '/admin/logout'; }, 1800);
                    }
                } else {
                    showToast(`Error: ${result.message || 'Failed to save platform settings.'}`, 'error');
                }
            } catch (err) {
                console.error('Save platform settings error:', err);
                showToast('Error: Could not reach the server. Please try again.', 'error');
            } finally {
                restore();
            }
        });
    }

    const deliveryForm = document.getElementById('deliverySettingsForm');
    if (deliveryForm) {
        deliveryForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const shopHomeCity = document.getElementById('settingsShopHomeCity')?.value;
            const deliveryInsideCity = document.getElementById('settingsDeliveryInsideCity')?.value;
            const deliveryOutsideCity = document.getElementById('settingsDeliveryOutsideCity')?.value;
            const freeShippingMinAmount = document.getElementById('settingsFreeShippingMinAmount')?.value;

            const submitBtn = deliveryForm.querySelector('button[type="submit"]');
            const restore = setButtonLoading(submitBtn, 'Saving...');
            try {
                const result = await saveDeliverySettings({
                    shopHomeCity,
                    deliveryInsideCity,
                    deliveryOutsideCity,
                    freeShippingMinAmount
                });

                if (result.success) {
                    showToast('Success: Delivery settings saved successfully!', 'success');
                    if (result.data) applyDeliverySettingsToUI(result.data);
                    // System Settings shares the free-shipping threshold.
                    fetchMasterSettings();
                } else {
                    showToast(`Error: ${result.message || 'Failed to save delivery settings.'}`, 'error');
                }
            } catch (err) {
                console.error('Save delivery settings error:', err);
                showToast('Error: Could not reach the server. Please try again.', 'error');
            } finally {
                restore();
            }
        });
    }

    const brandingForm = document.getElementById('storeBrandingForm');
    if (brandingForm) {
        brandingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveStoreBrandingForm(brandingForm);
        });
    }

    const logoInput = document.getElementById('settingsLogoInput');
    if (logoInput) {
        logoInput.addEventListener('change', () => previewBrandingFile(logoInput, 'logo', 'Store logo'));
    }

    const favInput = document.getElementById('settingsFaviconInput');
    if (favInput) {
        favInput.addEventListener('change', () => previewBrandingFile(favInput, 'favicon', 'Favicon'));
    }

    setupAdminSettingsTabs();
    setupBrandingDropzones();
}

/**
 * ১৩.১: অ্যাডমিন প্রোফাইল পিকচার লাইভ প্রিভিউ ও সার্ভারে আপলোড
 * @param {Event} event - ফাইল ইনপুট ইভেন্ট
 */

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    titleToPageSlug,
    getPageContentTabLabel,
    updatePageContentFooterActions,
    renderPageContentTabs,
    getActivePageState,
    destroyPageContentQuill,
    buildPageContentQuillToolbarHtml,
    resolvePageContentEditorHtml,
    setPageContentQuillHtml,
    getPageContentQuillHtml,
    ensurePageContentQuill,
    renderPageContentEditor,
    syncPageContentFromDom,
    populateFooterColumnSelects,
    syncCreatePageSlugPreview,
    openCreatePageModal,
    updateCreatePageFooterColumnVisibility,
    submitCreatePage,
    openAddPageToFooterModal,
    confirmAddPageToFooter,
    savePageContent,
    setupPageContentManager,
    applyWhatsAppSettingsToUI,
    updateWhatsAppSettingsPreview,
    applyCourierSettingsToUI,
    updateCourierSettingsPreview,
    toggleCourierCredentialPanels,
    applySmsSettingsToUI,
    updateSmsSettingsPreview,
    applyFlashSaleSettingsToUI,
    updateFlashSaleSettingsPreview,
    applyAnnouncementSettingsToUI,
    buildAnnouncementPreviewText,
    updateAnnouncementSettingsPreview,
    updateMasterSettingsPreview,
    fetchMasterSettings,
    saveMasterSettings,
    bindSystemSettingsSectionForm,
    setupSystemSettingsSectionForms,
    saveStoreBrandingForm,
    previewBrandingFile,
    setButtonLoading,
    applyBrandingAsset,
    showLocalBrandingPreview,
    setupAdminSettingsTabs,
    assignBrandingFile,
    setupBrandingDropzones,
    setupAdminSettingsForms
});
