/**
 * Super Admin — Customize sidebar menu labels from System Settings.
 */
import '../admin-core.js';
import { settingsFetchJson, isSettingsFetchFailure } from './settings-utils.js';

function menuLabelsAuthHeaders(json = false) {
    const headers = { Authorization: `Bearer ${localStorage.getItem('adminToken')}` };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
}

function isMenuLabelsSuperAdmin() {
    if (typeof window.isAdminSuperAdmin === 'function' && window.isAdminSuperAdmin()) return true;
    const role = String(window.adminRole || '').toLowerCase();
    return role === 'superadmin' || role === 'super_admin' || role === 'super admin';
}

function collectDefaultMenuLabels() {
    const defaults = {};
    document.querySelectorAll('#adminSidebarMenu li[data-target]').forEach((item) => {
        const key = item.getAttribute('data-target');
        if (!key) return;
        const clone = item.cloneNode(true);
        clone.querySelectorAll('.sidebar-nav-badge, .sidebar-external-icon').forEach((el) => el.remove());
        const icon = clone.querySelector('i');
        if (icon) icon.remove();
        const text = clone.textContent.replace(/\s+/g, ' ').trim();
        defaults[key] = text;
    });
    return defaults;
}

function renderMenuLabelsTable(defaults, customLabels = {}) {
    const tbody = document.getElementById('menuLabelsTableBody');
    if (!tbody) return;

    const keys = Object.keys(defaults).sort((a, b) => defaults[a].localeCompare(defaults[b]));
    if (!keys.length) {
        tbody.innerHTML = '<tr><td colspan="2" class="table-status-empty">No sidebar menu items found.</td></tr>';
        return;
    }

    tbody.innerHTML = keys.map((key) => {
        const defaultLabel = defaults[key];
        const value = customLabels[key] ?? defaultLabel;
        return `
            <tr data-menu-key="${key}">
                <td>
                    <strong>${defaultLabel}</strong>
                    <div class="table-subtext"><code>${key}</code></div>
                </td>
                <td>
                    <input type="text" class="menu-label-input" data-menu-key="${key}"
                           value="${String(value).replace(/"/g, '&quot;')}"
                           maxlength="80" aria-label="Custom label for ${defaultLabel}">
                </td>
            </tr>`;
    }).join('');
}

async function loadMenuLabelsSettingsPanel() {
    const card = document.getElementById('menuLabelsSettingsCard');
    if (!card || !isMenuLabelsSuperAdmin()) return;

    card.removeAttribute('hidden');
    card.classList.add('superadmin-visible');

    const tbody = document.getElementById('menuLabelsTableBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="2" class="loading-container"><div class="spinner"></div></td></tr>';
    }

    const defaults = collectDefaultMenuLabels();

    const response = await settingsFetchJson('/api/admin/sidebar-labels', {
        headers: menuLabelsAuthHeaders()
    }, { showToast: false });

    if (isSettingsFetchFailure(response)) {
        renderMenuLabelsTable(defaults, {});
        showToast('Could not load saved menu labels.', 'warning');
        return;
    }

    const labels = response.data.success !== false ? (response.data.labels || {}) : {};
    renderMenuLabelsTable(defaults, labels);
    if (typeof window.markSettingsFormSaved === 'function') {
        window.markSettingsFormSaved('menuLabelsSettingsCard');
    }
}

async function saveMenuLabelsSettings() {
    if (!isMenuLabelsSuperAdmin()) return;

    const inputs = document.querySelectorAll('#menuLabelsTableBody .menu-label-input');
    const defaults = collectDefaultMenuLabels();
    const saveBtn = document.getElementById('menuLabelsSaveBtn');

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
    }

    try {
        const labels = {};
        for (const input of inputs) {
            const key = input.getAttribute('data-menu-key');
            const next = input.value.trim();
            const base = defaults[key] || '';
            if (!key || !next || next === base) continue;
            labels[key] = next;
        }

        if (!Object.keys(labels).length) {
            showToast('No changes to save.', 'info');
            return;
        }

        const response = await settingsFetchJson('/api/admin/sidebar-labels', {
            method: 'PUT',
            headers: menuLabelsAuthHeaders(true),
            body: JSON.stringify({ labels })
        });

        if (isSettingsFetchFailure(response)) {
            throw new Error(response.error || 'Failed to save menu labels.');
        }

        const data = response.data;
        if (data.success === false) {
            throw new Error(data.message || 'Failed to save menu labels.');
        }

        sessionStorage.removeItem('adminSidebarLabels');
        if (typeof window.loadSidebarLabels === 'function') {
            await window.loadSidebarLabels(true);
        }
        showToast(data.message || 'Menu labels saved.', 'success');
        await loadMenuLabelsSettingsPanel();
        if (typeof window.markSettingsFormSaved === 'function') {
            window.markSettingsFormSaved('menuLabelsSettingsCard');
        }
    } catch (err) {
        console.error('saveMenuLabelsSettings:', err);
        if (!err.message?.includes('timed out')) {
            showToast(err.message || 'Could not save menu labels.', 'error');
        }
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
        }
    }
}

async function resetMenuLabelsSettings() {
    if (!isMenuLabelsSuperAdmin()) return;

    const result = await Swal.fire({
        icon: 'question',
        title: 'Reset all menu labels?',
        text: 'Sidebar items will revert to their default names.',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'Reset All',
        cancelButtonText: 'Cancel'
    });
    if (!result.isConfirmed) return;

    try {
        const response = await settingsFetchJson('/api/admin/sidebar-labels', {
            method: 'DELETE',
            headers: menuLabelsAuthHeaders()
        });

        if (isSettingsFetchFailure(response)) {
            throw new Error(response.error || 'Reset failed');
        }

        const data = response.data;
        if (data.success === false) {
            throw new Error(data.message || 'Reset failed');
        }

        sessionStorage.removeItem('adminSidebarLabels');
        if (typeof window.loadSidebarLabels === 'function') {
            await window.loadSidebarLabels(true);
        }
        showToast('Menu labels reset to defaults.', 'success');
        await loadMenuLabelsSettingsPanel();
    } catch (err) {
        console.error('resetMenuLabelsSettings:', err);
        if (!err.message?.includes('timed out')) {
            showToast(err.message || 'Could not reset menu labels.', 'error');
        }
    }
}

function setupMenuLabelsSettings() {
    const saveBtn = document.getElementById('menuLabelsSaveBtn');
    const resetBtn = document.getElementById('menuLabelsResetBtn');

    saveBtn?.addEventListener('click', saveMenuLabelsSettings);
    resetBtn?.addEventListener('click', resetMenuLabelsSettings);

    document.querySelector('.admin-settings-tab[data-tab="security"]')?.addEventListener('click', () => {
        setTimeout(loadMenuLabelsSettingsPanel, 0);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupMenuLabelsSettings();
    if (document.getElementById('adminPanelSecurity')?.classList.contains('is-active')) {
        loadMenuLabelsSettingsPanel();
    }
});

Object.assign(window, {
    loadMenuLabelsSettingsPanel,
    saveMenuLabelsSettings,
    resetMenuLabelsSettings
});
