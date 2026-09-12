/**
 * Project: EonlineBazar (E-Commerce Platform)
 * File: js/admin/modules/settings-hub.js
 * Description: Unified System Settings hub — tab navigation, embedded sections, SweetAlert2 feedback.
 */
import '../admin-core.js';

const SETTINGS_TAB_LABELS = {
    branding: 'Store Branding & Info',
    general: 'General Configuration',
    shipping: 'Shipping & Payments',
    security: 'Security & Access',
    utilities: 'System Utilities'
};

/** Maps hub tabs to full-page partials mounted inside tab panels. */
const SETTINGS_EMBED_MAP = {
    general: 'view-store-config',
    shipping: 'view-shipping-payments'
};

const embeddedSectionState = new Map();

function settingsHubToast(title, icon = 'info') {
    if (typeof Swal === 'undefined') {
        if (typeof showToast === 'function') showToast(title, icon === 'success' ? 'success' : 'info');
        return;
    }
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon,
        title,
        showConfirmButton: false,
        timer: 2200,
        timerProgressBar: true
    });
}

function rememberEmbedOrigin(section) {
    if (!section || embeddedSectionState.has(section.id)) return;
    embeddedSectionState.set(section.id, {
        parent: section.parentElement,
        nextSibling: section.nextElementSibling
    });
}

function restoreEmbeddedSection(sectionId) {
    const section = document.getElementById(sectionId);
    const origin = embeddedSectionState.get(sectionId);
    if (!section || !origin?.parent) return;

    if (origin.nextSibling) {
        origin.parent.insertBefore(section, origin.nextSibling);
    } else {
        origin.parent.appendChild(section);
    }
    section.style.display = 'none';
    section.classList.remove('settings-embedded-section', 'active');
}

function restoreAllEmbeddedSections() {
    Object.values(SETTINGS_EMBED_MAP).forEach(restoreEmbeddedSection);
}

function mountEmbeddedSettingsSection(tabId) {
    const sectionId = SETTINGS_EMBED_MAP[tabId];
    const mount = document.getElementById(`settingsEmbed_${tabId}`);
    if (!sectionId || !mount) return;

    const section = document.getElementById(sectionId);
    if (!section) return;

    rememberEmbedOrigin(section);

    if (!mount.contains(section)) {
        mount.appendChild(section);
    }

    section.style.display = 'block';
    section.classList.add('settings-embedded-section');

    const header = section.querySelector('.section-header-box');
    if (header) header.style.display = 'none';
}

function activateUnifiedSettingsTab(tabId, { silent = false } = {}) {
    if (!tabId) return;

    const tabs = document.querySelectorAll('.admin-settings-tab');
    const panels = document.querySelectorAll('.admin-settings-panel');
    const tab =
        document.querySelector(`.admin-settings-tab[data-tab="${tabId}"]`) ||
        document.querySelector(`#adminTab${tabId.charAt(0).toUpperCase()}${tabId.slice(1)}`);

    if (!tab) return;

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

    if (SETTINGS_EMBED_MAP[target]) {
        mountEmbeddedSettingsSection(target);
    }

    if (target === 'shipping' && typeof fetchMasterSettings === 'function') {
        fetchMasterSettings();
    }
    if (target === 'general' && typeof fetchMasterSettings === 'function') {
        fetchMasterSettings();
    }
    if (target === 'utilities' && typeof loadSandboxStatus === 'function') {
        loadSandboxStatus();
    }
    if (target === 'security' && typeof window.refreshTwoFactorSettings === 'function') {
        window.refreshTwoFactorSettings();
    }
    if (target === 'branding' && typeof fetchAdminSettings === 'function') {
        fetchAdminSettings();
    }

    if (!silent) {
        settingsHubToast(SETTINGS_TAB_LABELS[target] || 'Settings', 'info');
    }
}

function openSettingsHubSection(sectionId) {
    const navItem = document.querySelector(`.sidebar-menu li[data-target="${sectionId}"]`);
    if (typeof navigateAdminSection === 'function') {
        navigateAdminSection(sectionId, navItem);
    }
}

function setupUnifiedSettingsHub() {
    const shell = document.querySelector('.admin-settings-shell');
    if (!shell || shell.dataset.hubBound) return;
    shell.dataset.hubBound = '1';

    shell.querySelectorAll('.admin-settings-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            activateUnifiedSettingsTab(tabId);
        });
    });

    shell.querySelectorAll('[data-settings-hub-link]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const sectionId = btn.getAttribute('data-settings-hub-link');
            const tabId = btn.getAttribute('data-settings-hub-tab') || 'security';
            if (sectionId) openSettingsHubSection(sectionId, tabId);
        });
    });

    const generalForm = document.getElementById('form-system-general');
    if (generalForm && !generalForm.dataset.bound) {
        generalForm.dataset.bound = '1';
        generalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = generalForm.querySelector('.system-settings-save-btn');
            const restore = typeof setButtonLoading === 'function'
                ? setButtonLoading(submitBtn, 'Saving...')
                : () => {};

            const payload = {
                vatRate: document.getElementById('settingsVatRate')?.value,
                orderPrefix: document.getElementById('settingsOrderPrefix')?.value?.trim(),
                maintenanceMode: document.getElementById('settingsMaintenanceMode')?.checked === true,
                maintenanceMessage: document.getElementById('settingsMaintenanceMessage')?.value?.trim(),
                defaultProductsPerPage: document.getElementById('settingsDefaultProductsPerPage')?.value
            };

            try {
                const res = await fetch('/api/admin/master-settings/update', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();
                if (result.success) {
                    if (result.data && typeof applyMasterSettingsToUI === 'function') {
                        applyMasterSettingsToUI(result.data);
                    }
                    settingsHubToast('General configuration saved.', 'success');
                } else if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Save failed', text: result.message || 'Could not save settings.' });
                } else {
                    showToast(result.message || 'Save failed.', 'error');
                }
            } catch (err) {
                console.error('General settings save error:', err);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Save failed', text: 'Could not reach the server.' });
                }
            } finally {
                restore();
            }
        });
    }
}

window.activateUnifiedSettingsTab = activateUnifiedSettingsTab;
window.setupUnifiedSettingsHub = setupUnifiedSettingsHub;
window.restoreAllEmbeddedSettingsSections = restoreAllEmbeddedSections;
window.openSettingsHubSection = openSettingsHubSection;
window.settingsHubToast = settingsHubToast;

document.addEventListener('DOMContentLoaded', setupUnifiedSettingsHub);

Object.assign(window, {
    activateUnifiedSettingsTab,
    setupUnifiedSettingsHub,
    restoreAllEmbeddedSettingsSections: restoreAllEmbeddedSections,
    openSettingsHubSection,
    settingsHubToast
});
