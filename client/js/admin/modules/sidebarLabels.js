/**
 * Super Admin sidebar label customization.
 */
const SIDEBAR_LABELS_CACHE_KEY = 'adminSidebarLabels';

function isSidebarLabelSuperAdmin() {
    if (typeof window.isAdminSuperAdmin === 'function' && window.isAdminSuperAdmin()) return true;
    const role = String(window.adminRole || '').toLowerCase();
    return role === 'superadmin' || role === 'super_admin' || role === 'super admin';
}

function getSidebarLabelToken() {
    return localStorage.getItem('adminToken');
}

function extractNavLabelText(item) {
    if (item.dataset.navLabelBase) return item.dataset.navLabelBase;
    const clone = item.cloneNode(true);
    clone.querySelectorAll('.sidebar-edit-btn, .sidebar-nav-badge, .sidebar-external-icon').forEach((el) => el.remove());
    const icon = clone.querySelector('i');
    if (icon) icon.remove();
    const text = clone.textContent.replace(/\s+/g, ' ').trim();
    item.dataset.navLabelBase = text;
    return text;
}

function wrapSidebarLabelText(item) {
    if (item.querySelector('.sidebar-nav-label')) return;
    const icon = item.querySelector('i');
    const badge = item.querySelector('.sidebar-nav-badge');
    const base = extractNavLabelText(item);
    const labelSpan = document.createElement('span');
    labelSpan.className = 'sidebar-nav-label';
    labelSpan.textContent = base;

    item.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) node.textContent = '';
    });
    item.querySelectorAll(':scope > :not(i):not(.sidebar-nav-badge):not(.sidebar-edit-btn)').forEach((el) => {
        if (!el.classList.contains('sidebar-nav-label')) el.remove();
    });

    if (icon && badge) {
        icon.after(labelSpan);
    } else if (icon) {
        icon.after(labelSpan);
    } else {
        item.prepend(labelSpan);
    }
}

function applySidebarLabels(labels = {}) {
    document.querySelectorAll('#adminSidebarMenu li[data-target]').forEach((item) => {
        wrapSidebarLabelText(item);
        const key = item.getAttribute('data-target');
        const labelEl = item.querySelector('.sidebar-nav-label');
        const base = item.dataset.navLabelBase || labelEl?.textContent || '';
        const custom = labels[key];
        if (labelEl) labelEl.textContent = custom || base;
    });
}

function attachSidebarEditButtons() {
    if (!isSidebarLabelSuperAdmin()) return;

    document.querySelectorAll('#adminSidebarMenu li[data-target]').forEach((item) => {
        if (item.querySelector('.sidebar-edit-btn')) return;
        wrapSidebarLabelText(item);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sidebar-edit-btn';
        btn.setAttribute('data-sidebar-key', item.getAttribute('data-target') || '');
        btn.setAttribute('aria-label', 'Rename menu item');
        btn.textContent = '✏️';
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            startSidebarLabelEdit(item);
        });
        item.appendChild(btn);
    });
}

function startSidebarLabelEdit(item) {
    const key = item.getAttribute('data-target');
    const labelEl = item.querySelector('.sidebar-nav-label');
    if (!key || !labelEl || item.querySelector('.sidebar-label-edit-input')) return;

    const current = labelEl.textContent.trim();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sidebar-label-edit-input';
    input.value = current;
    input.maxLength = 80;

    const actions = document.createElement('span');
    actions.className = 'sidebar-label-edit-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'sidebar-label-save-btn';
    saveBtn.textContent = '✓';
    saveBtn.title = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'sidebar-label-cancel-btn';
    cancelBtn.textContent = '✗';
    cancelBtn.title = 'Cancel';

    actions.append(saveBtn, cancelBtn);
    labelEl.replaceWith(input);
    item.appendChild(actions);
    input.focus();
    input.select();

    const restore = () => {
        input.replaceWith(labelEl);
        actions.remove();
    };

    cancelBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        restore();
    });

    saveBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const next = input.value.trim();
        if (!next) {
            showToast('Label cannot be empty.', 'warning');
            return;
        }
        try {
            const res = await fetch(`/api/admin/sidebar-labels/${encodeURIComponent(key)}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getSidebarLabelToken()}`
                },
                body: JSON.stringify({ label: next })
            });
            const data = await res.json();
            if (!res.ok || data.success === false) {
                throw new Error(data.message || 'Save failed');
            }
            labelEl.textContent = next;
            const cached = JSON.parse(sessionStorage.getItem(SIDEBAR_LABELS_CACHE_KEY) || '{}');
            cached[key] = next;
            sessionStorage.setItem(SIDEBAR_LABELS_CACHE_KEY, JSON.stringify(cached));
            restore();
            showToast('Sidebar label updated.', 'success');
        } catch (error) {
            console.error('saveSidebarLabel:', error);
            showToast(error.message || 'Could not save label.', 'error');
        }
    });
}

async function loadSidebarLabels(force = false) {
    if (!isSidebarLabelSuperAdmin()) return;

    if (!force) {
        try {
            const cached = sessionStorage.getItem(SIDEBAR_LABELS_CACHE_KEY);
            if (cached) {
                applySidebarLabels(JSON.parse(cached));
                attachSidebarEditButtons();
            }
        } catch (_) { /* ignore */ }
    }

    try {
        const res = await fetch('/api/admin/sidebar-labels', {
            headers: { Authorization: `Bearer ${getSidebarLabelToken()}` }
        });
        const data = await res.json();
        if (!res.ok || data.success === false) return;
        sessionStorage.setItem(SIDEBAR_LABELS_CACHE_KEY, JSON.stringify(data.labels || {}));
        applySidebarLabels(data.labels || {});
        attachSidebarEditButtons();
    } catch (error) {
        console.error('loadSidebarLabels:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadSidebarLabels();
});

Object.assign(window, {
    loadSidebarLabels,
    applySidebarLabels
});
