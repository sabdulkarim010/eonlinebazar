/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/catalog-navbar.js
 * Description: Navbar menu links and optional CMS page creator.
 */
import '../admin-core.js';
/* ==========================================================================
   SECTION 9B1: NAVBAR MENU LINKS (top-bar promo links → /api/navbar-links)
   Optional Quill CMS page creator → PageContent at /page/:slug
   ========================================================================== */

/* shared state: globalNavbarLinks lives on window (admin-core) */

/* shared state: navbarLinkQuill lives on window (admin-core) */

function slugifyNavbarLinkText(text) {
    return String(text || '')
        .toLowerCase()
        .trim()
        .replace(/^\/+/, '')
        .replace(/^pages?\//, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function getNavbarLinkSlugPreview() {
    const slugInput = document.getElementById('navbarLinkSlug')?.value?.trim() || '';
    const title = document.getElementById('navbarLinkTitle')?.value?.trim() || '';
    return slugifyNavbarLinkText(slugInput || title) || 'your-slug';
}

function updateNavbarLinkRoutePreview() {
    const route = `/page/${getNavbarLinkSlugPreview()}`;
    const preview = document.getElementById('navbarLinkRoutePreview');
    if (preview) preview.textContent = route;
    const openLink = document.getElementById('navbarLinkRouteOpen');
    if (openLink) openLink.href = route;
    const customOn = !!document.getElementById('navbarLinkCustomPage')?.checked;
    const urlInput = document.getElementById('navbarLinkUrl');
    if (customOn && urlInput) {
        urlInput.value = route;
    }
}

function registerNavbarLinkQuillFormats() {
    if (typeof Quill === 'undefined' || window.__navbarQuillFormatsRegistered) return;
    const Font = Quill.import('formats/font');
    Font.whitelist = ['serif', 'monospace', 'arial', 'georgia', 'tahoma', 'verdana', 'poppins', 'hind-siliguri'];
    Quill.register(Font, true);

    const SizeStyle = Quill.import('attributors/style/size');
    SizeStyle.whitelist = ['12px', '14px', '16px', '18px', '24px', '32px', '48px'];
    Quill.register(SizeStyle, true);

    const AlignStyle = Quill.import('attributors/style/align');
    Quill.register(AlignStyle, true);
    window.__navbarQuillFormatsRegistered = true;
}

function ensureNavbarLinkQuill() {
    if (navbarLinkQuill) return navbarLinkQuill;
    if (typeof Quill === 'undefined') {
        console.warn('Quill.js not loaded — custom page editor unavailable.');
        return null;
    }

    registerNavbarLinkQuillFormats();
    const editorEl = document.getElementById('navbarLinkQuillEditor');
    const toolbarEl = document.getElementById('navbarLinkQuillToolbar');
    if (!editorEl || !toolbarEl) return null;

    navbarLinkQuill = new Quill(editorEl, {
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
        placeholder: 'Write promotional page content…'
    });

    document.getElementById('navbarLinkHtmlEmbedBtn')?.addEventListener('click', () => {
        insertNavbarLinkHtmlEmbed(navbarLinkQuill);
    });

    navbarLinkQuill.on('text-change', () => {
        const hidden = document.getElementById('navbarLinkPageHtml');
        if (hidden) hidden.value = navbarLinkQuill.root.innerHTML;
    });

    return navbarLinkQuill;
}

function pickNavbarLinkImage(quill) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return;
        if (file.size > 1.5 * 1024 * 1024) {
            showToast('Image must be under 1.5 MB (or paste an image URL).', 'warning');
            const url = window.prompt('Or paste an image URL:');
            if (url) insertNavbarLinkImageUrl(quill, url.trim());
            return;
        }
        const reader = new FileReader();
        reader.onload = () => insertNavbarLinkImageUrl(quill, String(reader.result || ''));
        reader.readAsDataURL(file);
    };
    input.click();
}

function insertNavbarLinkImageUrl(quill, url) {
    if (!quill || !url) return;
    const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
    quill.insertEmbed(range.index, 'image', url, 'user');
    quill.setSelection(range.index + 1, 0, 'silent');
}

async function insertNavbarLinkHtmlEmbed(quill) {
    if (!quill) return;
    let html = '';
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: 'Embed HTML',
            input: 'textarea',
            inputLabel: 'Paste HTML (iframe, styled blocks, etc.)',
            inputPlaceholder: '<iframe src="https://www.youtube.com/embed/…"></iframe>',
            inputAttributes: { 'aria-label': 'HTML to embed' },
            showCancelButton: true,
            confirmButtonText: 'Insert',
            width: 640
        });
        if (!result.isConfirmed) return;
        html = String(result.value || '').trim();
    } else {
        html = String(window.prompt('Paste HTML to embed:') || '').trim();
    }
    if (!html) return;
    const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
    quill.clipboard.dangerouslyPasteHTML(range.index, html, 'user');
}

/** Decode entity-escaped HTML (&lt;p&gt; → <p>) so Quill/DB store raw markup. */
function decodeHtmlEntities(value) {
    let html = String(value ?? '');
    if (!html) return '';
    for (let i = 0; i < 3; i += 1) {
        if (!/&(?:lt|gt|amp|quot|#39|#x27);/i.test(html)) break;
        const ta = document.createElement('textarea');
        ta.innerHTML = html;
        const next = ta.value;
        if (next === html) break;
        html = next;
    }
    return html;
}

function setNavbarLinkQuillHtml(html) {
    const quill = ensureNavbarLinkQuill();
    const safe = decodeHtmlEntities(String(html || '').trim()) || '<p><br></p>';
    if (quill) {
        quill.setContents([]);
        quill.clipboard.dangerouslyPasteHTML(0, safe, 'silent');
        // Prefer root HTML after paste (raw tags, not entities)
        const hidden = document.getElementById('navbarLinkPageHtml');
        if (hidden) {
            const out = quill.root.innerHTML;
            hidden.value = (!quill.getText().replace(/\n/g, '').trim()
                && !quill.root.querySelector('img,iframe')) ? '' : out;
        }
        return;
    }
    const hidden = document.getElementById('navbarLinkPageHtml');
    if (hidden) hidden.value = safe === '<p><br></p>' ? '' : safe;
}

function getNavbarLinkQuillHtml() {
    if (navbarLinkQuill) {
        const text = navbarLinkQuill.getText().replace(/\n/g, '').trim();
        if (!text && !navbarLinkQuill.root.querySelector('img,iframe')) return '';
        return decodeHtmlEntities(navbarLinkQuill.root.innerHTML);
    }
    return decodeHtmlEntities(document.getElementById('navbarLinkPageHtml')?.value || '');
}

function syncNavbarLinkCustomPageUi() {
    const customOn = !!document.getElementById('navbarLinkCustomPage')?.checked;
    const panel = document.getElementById('navbarLinkCmsPanel');
    const urlInput = document.getElementById('navbarLinkUrl');
    const urlHint = document.getElementById('navbarLinkUrlHint');
    if (panel) panel.hidden = !customOn;
    if (urlInput) {
        urlInput.required = !customOn;
        urlInput.readOnly = customOn;
        urlInput.classList.toggle('is-readonly', customOn);
    }
    if (urlHint) {
        urlHint.textContent = customOn
            ? 'Auto-set from slug — content is saved to a CMS page at this route.'
            : 'External or site-relative path. Auto-set when creating a custom CMS page.';
    }
    if (customOn) {
        // Defer so the panel is visible before Quill measures toolbar/editor size.
        requestAnimationFrame(() => {
            ensureNavbarLinkQuill();
            updateNavbarLinkRoutePreview();
        });
    }
}

async function fetchNavbarLinks() {
    try {
        const response = await fetch('/api/navbar-links/admin', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            globalNavbarLinks = data.data || [];
            renderNavbarLinkTable();
        } else {
            showToast(data.message || 'Failed to load navbar links', 'error');
        }
    } catch (error) {
        console.error('Navbar links load error:', error);
        showToast('Server error while loading navbar links!', 'error');
    }
}
window.fetchNavbarLinks = fetchNavbarLinks;

function renderNavbarLinkTable() {
    const list = document.getElementById('navbarLinkTableBody');
    if (!list) return;

    if (!globalNavbarLinks.length) {
        list.innerHTML = `
            <div class="navbar-links-empty" role="status">
                <i class="fa-regular fa-compass"></i>
                <h5>No navbar links yet</h5>
                <p>Add promo links like “Today's Deals” or create a custom CMS page above.</p>
            </div>`;
        return;
    }

    list.innerHTML = globalNavbarLinks.map((link, index) => {
        const id = link.id || link._id;
        const safeId = escHtml(id);
        const title = escHtml(link.title || '');
        const url = escHtml(link.url || '');
        const slug = escHtml(link.slug || '');
        const target = link.target === '_blank' ? '_blank' : '_self';
        const published = link.isPublished === true;
        const cms = link.hasCustomPage === true;
        const isFirst = index === 0;
        const isLast = index === globalNavbarLinks.length - 1;
        const orderLabel = Number.isFinite(Number(link.sortOrder)) ? Number(link.sortOrder) : index;

        return `
        <article class="navbar-link-card ${published ? 'is-published' : 'is-draft'}${cms ? ' has-cms' : ''}" data-id="${safeId}" role="listitem">
            <div class="navbar-link-card-order">
                <button type="button" class="navbar-link-order-btn" title="Move up" ${isFirst ? 'disabled' : ''}
                    onclick="moveNavbarLink('${safeId}', -1)" aria-label="Move up">
                    <i class="fa-solid fa-chevron-up"></i>
                </button>
                <span class="navbar-link-order-num">${orderLabel}</span>
                <button type="button" class="navbar-link-order-btn" title="Move down" ${isLast ? 'disabled' : ''}
                    onclick="moveNavbarLink('${safeId}', 1)" aria-label="Move down">
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
            </div>
            <div class="navbar-link-card-body">
                <div class="navbar-link-card-title-row">
                    <h5>${title}</h5>
                    ${cms ? '<span class="navbar-link-cms-badge" title="Custom CMS page">CMS</span>' : ''}
                    <span class="navbar-link-badge ${published ? 'is-published' : 'is-draft'}">
                        ${published ? 'Published' : 'Draft'}
                    </span>
                </div>
                <div class="navbar-link-card-meta">
                    <a class="navbar-link-url" href="${url}" target="_blank" rel="noopener noreferrer" title="Open link">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> ${url}
                    </a>
                    ${slug ? `<span class="navbar-link-slug">slug: ${slug}</span>` : ''}
                    <span class="navbar-link-target">${target === '_blank' ? 'New tab' : 'Same tab'}</span>
                </div>
            </div>
            <div class="navbar-link-card-actions">
                <label class="navbar-link-toggle" title="${published ? 'Unpublish' : 'Publish'}">
                    <input type="checkbox" ${published ? 'checked' : ''}
                        onchange="toggleNavbarLinkPublished('${safeId}', this.checked)">
                    <span>Live</span>
                </label>
                <button type="button" class="catalog-action-btn edit" onclick="editNavbarLink('${safeId}')" title="Edit" aria-label="Edit">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button type="button" class="catalog-action-btn delete" onclick="deleteNavbarLink('${safeId}')" title="Delete" aria-label="Delete">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </article>`;
    }).join('');
}

window.resetNavbarLinkForm = function resetNavbarLinkForm() {
    const form = document.getElementById('navbarLinkForm');
    if (form) form.reset();
    const editId = document.getElementById('navbarLinkEditId');
    if (editId) editId.value = '';
    const published = document.getElementById('navbarLinkPublished');
    if (published) published.checked = true;
    const target = document.getElementById('navbarLinkTarget');
    if (target) target.value = '_self';
    const custom = document.getElementById('navbarLinkCustomPage');
    if (custom) custom.checked = false;
    const submitLabel = document.getElementById('navbarLinkSubmitLabel');
    if (submitLabel) submitLabel.textContent = 'Add Link';
    const submitBtn = document.getElementById('navbarLinkSubmitBtn');
    if (submitBtn) {
        const icon = submitBtn.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-plus';
    }
    const heading = document.getElementById('navbarLinkFormHeading');
    if (heading) heading.textContent = 'Add Navbar Link';
    const cancelBtn = document.getElementById('navbarLinkCancelBtn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    setNavbarLinkQuillHtml('');
    syncNavbarLinkCustomPageUi();
    updateNavbarLinkRoutePreview();
};

window.editNavbarLink = function editNavbarLink(id) {
    const link = globalNavbarLinks.find((l) => String(l.id || l._id) === String(id));
    if (!link) return;

    document.getElementById('navbarLinkEditId').value = link.id || link._id || '';
    document.getElementById('navbarLinkTitle').value = link.title || '';
    document.getElementById('navbarLinkUrl').value = link.url || '';
    document.getElementById('navbarLinkSlug').value = link.slug || '';
    document.getElementById('navbarLinkTarget').value = link.target === '_blank' ? '_blank' : '_self';
    document.getElementById('navbarLinkPublished').checked = link.isPublished !== false;
    const custom = document.getElementById('navbarLinkCustomPage');
    if (custom) custom.checked = link.hasCustomPage === true;

    const submitLabel = document.getElementById('navbarLinkSubmitLabel');
    if (submitLabel) submitLabel.textContent = 'Update Link';
    const submitBtn = document.getElementById('navbarLinkSubmitBtn');
    if (submitBtn) {
        const icon = submitBtn.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-floppy-disk';
    }
    const heading = document.getElementById('navbarLinkFormHeading');
    if (heading) heading.textContent = 'Edit Navbar Link';
    const cancelBtn = document.getElementById('navbarLinkCancelBtn');
    if (cancelBtn) cancelBtn.style.display = '';

    syncNavbarLinkCustomPageUi();
    if (link.hasCustomPage) {
        // Wait for Quill after panel is shown
        requestAnimationFrame(() => setNavbarLinkQuillHtml(link.pageHtml || ''));
    } else {
        setNavbarLinkQuillHtml('');
    }
    updateNavbarLinkRoutePreview();

    document.getElementById('navbarLinkTitle')?.focus();
    document.getElementById('manage-navbar-links')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

async function saveNavbarLinkForm(event) {
    if (event) event.preventDefault();

    const id = document.getElementById('navbarLinkEditId')?.value?.trim() || '';
    const title = document.getElementById('navbarLinkTitle')?.value?.trim() || '';
    const slug = document.getElementById('navbarLinkSlug')?.value?.trim() || '';
    const target = document.getElementById('navbarLinkTarget')?.value || '_self';
    const isPublished = !!document.getElementById('navbarLinkPublished')?.checked;
    const hasCustomPage = !!document.getElementById('navbarLinkCustomPage')?.checked;
    let url = document.getElementById('navbarLinkUrl')?.value?.trim() || '';

    if (!title) return showToast('Please enter a title!', 'warning');

    const payload = { title, target, isPublished, hasCustomPage };
    if (slug) payload.slug = slug;

    if (hasCustomPage) {
        const resolvedSlug = slugifyNavbarLinkText(slug || title);
        if (!resolvedSlug) return showToast('A valid slug is required for a custom page.', 'warning');
        payload.slug = resolvedSlug;
        payload.pageHtml = getNavbarLinkQuillHtml();
        payload.url = `/page/${resolvedSlug}`;
    } else {
        if (!url) return showToast('Please enter a URL!', 'warning');
        payload.url = url;
        payload.pageHtml = '';
    }

    const submitBtn = document.getElementById('navbarLinkSubmitBtn');
    const restore = typeof setButtonLoading === 'function'
        ? setButtonLoading(submitBtn, 'Saving...')
        : () => {};

    try {
        const res = await fetch(id ? `/api/navbar-links/admin/${id}` : '/api/navbar-links/admin', {
            method: id ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!result.success) {
            throw new Error(result.message || 'Failed to save navbar link.');
        }
        showAdminSuccess(id ? 'Link Updated' : 'Link Added', result.message || 'Navbar link saved.');
        resetNavbarLinkForm();
        await fetchNavbarLinks();
    } catch (error) {
        console.error('Save navbar link error:', error);
        showToast(error.message || 'Server error while saving navbar link!', 'error');
    } finally {
        restore();
    }
}

window.deleteNavbarLink = function deleteNavbarLink(id) {
    const link = globalNavbarLinks.find((l) => String(l.id || l._id) === String(id));
    showCustomConfirm(
        'Delete Navbar Link',
        link
            ? `Remove “${link.title}” from the top navigation bar?`
            : 'Remove this link from the top navigation bar?',
        async () => {
            try {
                const res = await fetch(`/api/navbar-links/admin/${id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` }
                });
                const result = await res.json();
                if (result.success) {
                    globalNavbarLinks = globalNavbarLinks.filter(
                        (l) => String(l.id || l._id) !== String(id)
                    );
                    renderNavbarLinkTable();
                    showAdminSuccess('Link Deleted', result.message || 'Navbar link removed.');
                } else {
                    showToast(result.message || 'Failed to delete', 'error');
                }
            } catch (error) {
                showToast('Failed to delete navbar link', 'error');
            }
        },
        'danger'
    );
};

window.toggleNavbarLinkPublished = async function toggleNavbarLinkPublished(id, isPublished) {
    try {
        const res = await fetch(`/api/navbar-links/admin/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ isPublished: !!isPublished })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Toggle failed.');
        await fetchNavbarLinks();
        showToast(isPublished ? 'Link published.' : 'Link unpublished.', 'success');
    } catch (error) {
        console.error('Toggle navbar link error:', error);
        showToast(error.message || 'Failed to update status', 'error');
        await fetchNavbarLinks();
    }
};

window.moveNavbarLink = async function moveNavbarLink(id, direction) {
    const index = globalNavbarLinks.findIndex((l) => String(l.id || l._id) === String(id));
    if (index < 0) return;
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= globalNavbarLinks.length) return;

    const next = globalNavbarLinks.slice();
    const tmp = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = tmp;

    const order = next.map((link, i) => ({
        id: link.id || link._id,
        sortOrder: i
    }));

    try {
        const res = await fetch('/api/navbar-links/admin/reorder', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ order })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Reorder failed.');
        globalNavbarLinks = result.data || [];
        renderNavbarLinkTable();
    } catch (error) {
        console.error('Reorder navbar links error:', error);
        showToast(error.message || 'Failed to reorder', 'error');
        await fetchNavbarLinks();
    }
};

function setupNavbarLinkForm() {
    const form = document.getElementById('navbarLinkForm');
    if (!form || form.dataset.bound === '1') return;
    form.dataset.bound = '1';
    form.addEventListener('submit', saveNavbarLinkForm);

    document.getElementById('navbarLinkCustomPage')?.addEventListener('change', () => {
        syncNavbarLinkCustomPageUi();
        if (document.getElementById('navbarLinkCustomPage')?.checked && !getNavbarLinkQuillHtml()) {
            setNavbarLinkQuillHtml('<p></p>');
        }
    });
    document.getElementById('navbarLinkTitle')?.addEventListener('input', updateNavbarLinkRoutePreview);
    document.getElementById('navbarLinkSlug')?.addEventListener('input', updateNavbarLinkRoutePreview);
    syncNavbarLinkCustomPageUi();
}

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    slugifyNavbarLinkText,
    getNavbarLinkSlugPreview,
    updateNavbarLinkRoutePreview,
    registerNavbarLinkQuillFormats,
    ensureNavbarLinkQuill,
    pickNavbarLinkImage,
    insertNavbarLinkImageUrl,
    insertNavbarLinkHtmlEmbed,
    decodeHtmlEntities,
    setNavbarLinkQuillHtml,
    getNavbarLinkQuillHtml,
    syncNavbarLinkCustomPageUi,
    fetchNavbarLinks,
    renderNavbarLinkTable,
    saveNavbarLinkForm,
    setupNavbarLinkForm
});
