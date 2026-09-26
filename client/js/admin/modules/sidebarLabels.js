/**
 * Super Admin sidebar label apply (read-only in sidebar — edit in Settings).
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
    clone.querySelectorAll('.sidebar-nav-badge, .sidebar-external-icon').forEach((el) => el.remove());
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
    item.querySelectorAll(':scope > :not(i):not(.sidebar-nav-badge)').forEach((el) => {
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

function extractNavSectionLabelBase(labelWrap) {
    if (labelWrap.dataset.navSectionLabelBase) return labelWrap.dataset.navSectionLabelBase;
    const clone = labelWrap.cloneNode(true);
    clone.querySelectorAll('.nav-emoji').forEach((el) => el.remove());
    const text = clone.textContent.replace(/\s+/g, ' ').trim();
    labelWrap.dataset.navSectionLabelBase = text;
    return text;
}

function applySidebarNavSectionLabels(labels = {}) {
    document.querySelectorAll('#adminSidebarMenu li.menu-group[data-nav-section]').forEach((group) => {
        const sectionKey = group.getAttribute('data-nav-section');
        const labelWrap = group.querySelector('.catalog-toggle-label');
        if (!sectionKey || !labelWrap) return;

        const storageKey = `nav-section:${sectionKey}`;
        const base = extractNavSectionLabelBase(labelWrap);
        const custom = labels[storageKey];
        const text = custom || base;
        const emoji = labelWrap.querySelector('.nav-emoji');
        labelWrap.textContent = '';
        if (emoji) labelWrap.appendChild(emoji);
        labelWrap.append(` ${text}`);
    });
}

function applySidebarLabels(labels = {}) {
    applySidebarNavSectionLabels(labels);
    document.querySelectorAll('#adminSidebarMenu li[data-target]').forEach((item) => {
        wrapSidebarLabelText(item);
        const key = item.getAttribute('data-target');
        const labelEl = item.querySelector('.sidebar-nav-label');
        const base = item.dataset.navLabelBase || labelEl?.textContent || '';
        const custom = labels[key];
        if (labelEl) labelEl.textContent = custom || base;
    });
}

async function loadSidebarLabels(force = false) {
    if (!isSidebarLabelSuperAdmin()) return;

    if (!force) {
        try {
            const cached = sessionStorage.getItem(SIDEBAR_LABELS_CACHE_KEY);
            if (cached) {
                applySidebarLabels(JSON.parse(cached));
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
