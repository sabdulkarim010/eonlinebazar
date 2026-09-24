/**
 * Project: EonlineBazar (E-Commerce Platform)
 * File: js/admin/modules/settings-hub.js
 * Description: Unified System Settings hub — tab navigation, embedded sections, SweetAlert2 feedback.
 */
import '../admin-core.js';
import {
    setupSettingsDirtyTracker,
    notifySettingsTabActivated,
    requestSettingsTabSwitch,
    markSettingsFormSaved,
    triggerSettingsQuickSave
} from './settings-dirty-tracker.js';

/** Maps hub tabs to full-page partials mounted inside tab panels. */
const SETTINGS_EMBED_MAP = {
    general: 'view-store-config',
    shipping: 'view-shipping-payments'
};

const SETTINGS_HASH_PREFIX = 'settings-';
const VALID_SETTINGS_TABS = Object.freeze([
    'branding',
    'general',
    'shipping',
    'finance',
    'notifications',
    'security',
    'utilities'
]);

function getSettingsTabFromHash(hash = window.location.hash) {
    const raw = String(hash || '').replace(/^#/, '').trim().toLowerCase();
    if (!raw.startsWith(SETTINGS_HASH_PREFIX)) return null;
    const tabId = raw.slice(SETTINGS_HASH_PREFIX.length);
    return VALID_SETTINGS_TABS.includes(tabId) ? tabId : null;
}

function hashForSettingsTab(tabId) {
    return `#${SETTINGS_HASH_PREFIX}${tabId}`;
}

function updateSettingsTabHash(tabId, { replace = true } = {}) {
    if (!tabId || !VALID_SETTINGS_TABS.includes(tabId)) return;

    const nextHash = hashForSettingsTab(tabId);
    if (window.location.hash === nextHash) return;

    const url = `${window.location.pathname}${window.location.search}${nextHash}`;
    if (replace) {
        history.replaceState(null, '', url);
    } else {
        history.pushState(null, '', url);
    }
}

function applySettingsHashOnInit() {
    const tabId = getSettingsTabFromHash();
    if (!tabId) return;

    const viewSettings = document.getElementById('view-settings');
    if (!viewSettings?.classList.contains('active')) {
        window.__pendingSettingsTabFromHash = tabId;
        const settingsNav = document.querySelector('.sidebar-menu li[data-target="view-settings"]');
        if (settingsNav && typeof navigateAdminSection === 'function') {
            navigateAdminSection('view-settings', settingsNav);
        }
        return;
    }

    requestSettingsTabSwitch(tabId, { skipDirtyCheck: true, updateHash: false });
}

function bindSettingsHashNavigation() {
    if (window.__settingsHashNavBound) return;
    window.__settingsHashNavBound = true;

    window.addEventListener('hashchange', () => {
        const tabId = getSettingsTabFromHash();
        if (!tabId) return;

        const viewSettings = document.getElementById('view-settings');
        if (!viewSettings?.classList.contains('active')) return;

        requestSettingsTabSwitch(tabId, { updateHash: false });
    });
}

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
    section.removeAttribute('hidden');
    section.hidden = false;
    section.classList.add('settings-embedded-section', 'active');

    const header = section.querySelector('.section-header-box');
    if (header) header.style.display = 'none';

    if (typeof window.installSettingsDiscardButtons === 'function') {
        window.installSettingsDiscardButtons(section);
    }
}

function activateUnifiedSettingsTab(tabId, options = {}) {
    if (!tabId) return;

    const previousTab = document.querySelector('.admin-settings-panel.is-active')?.dataset?.panel;
    if (previousTab === 'general' && tabId !== 'general' && window.pageContentEditMode
        && typeof window.exitPageContentEditMode === 'function') {
        window.exitPageContentEditMode({ revert: false });
    }

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
        if (isActive) {
            panel.hidden = false;
            panel.removeAttribute('hidden');
        } else {
            panel.hidden = true;
        }
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
    if (target === 'finance' && typeof window.loadExpenseCategorySettings === 'function') {
        window.loadExpenseCategorySettings();
    }
    if (target === 'security') {
        if (typeof window.refreshTwoFactorSettings === 'function') {
            window.refreshTwoFactorSettings();
        }
        if (typeof window.loadSettingsHistory === 'function') {
            window.loadSettingsHistory();
        }
    }
    if (target === 'branding' && typeof fetchAdminSettings === 'function') {
        fetchAdminSettings();
    }

    notifySettingsTabActivated(target);

    if (options.updateHash !== false) {
        updateSettingsTabHash(target);
    }
}

function openSettingsHubSection(sectionId) {
    const navItem = document.querySelector(`.sidebar-menu li[data-target="${sectionId}"]`);
    if (typeof navigateAdminSection === 'function') {
        navigateAdminSection(sectionId, navItem);
    }
}

function isSettingsViewActive() {
    const view = document.getElementById('view-settings');
    if (!view) return false;
    return view.classList.contains('active') && view.style.display !== 'none';
}

function bindSettingsQuickSaveShortcut() {
    if (window.__settingsQuickSaveBound) return;
    window.__settingsQuickSaveBound = true;

    document.addEventListener('keydown', (event) => {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
        if (!isSettingsViewActive()) return;

        event.preventDefault();

        const result = triggerSettingsQuickSave();
        if (result.saved) {
            settingsHubToast(result.dirty ? 'Saving changes…' : 'Save triggered', 'info');
        } else if (result.reason === 'no-save-target') {
            settingsHubToast('No save action on this tab', 'info');
        }
    });
}

function setupUnifiedSettingsHub() {
    const shell = document.querySelector('.admin-settings-shell');
    if (!shell || shell.dataset.hubBound) return;
    shell.dataset.hubBound = '1';

    setupSettingsDirtyTracker(shell);
    bindSettingsHashNavigation();
    bindSettingsQuickSaveShortcut();
    applySettingsHashOnInit();

    shell.querySelectorAll('.admin-settings-tab').forEach((tab) => {
        tab.addEventListener('click', async () => {
            const tabId = tab.dataset.tab;
            await requestSettingsTabSwitch(tabId);
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

            const allowedRaw = document.getElementById('settingsMaintenanceAllowedIPs')?.value || '';
            const payload = {
                orderPrefix: document.getElementById('settingsOrderPrefix')?.value?.trim(),
                maintenanceMode: document.getElementById('settingsMaintenanceMode')?.checked === true,
                maintenanceMessage: document.getElementById('settingsMaintenanceMessage')?.value?.trim(),
                maintenanceAllowedIPs: allowedRaw.split(/[\n,]+/).map((ip) => ip.trim()).filter(Boolean),
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
                    markSettingsFormSaved(generalForm);
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
window.requestSettingsTabSwitch = requestSettingsTabSwitch;
window.getSettingsTabFromHash = getSettingsTabFromHash;
window.updateSettingsTabHash = updateSettingsTabHash;
window.setupUnifiedSettingsHub = setupUnifiedSettingsHub;
window.restoreAllEmbeddedSettingsSections = restoreAllEmbeddedSections;
window.openSettingsHubSection = openSettingsHubSection;
window.settingsHubToast = settingsHubToast;

document.addEventListener('DOMContentLoaded', setupUnifiedSettingsHub);

Object.assign(window, {
    activateUnifiedSettingsTab,
    requestSettingsTabSwitch,
    getSettingsTabFromHash,
    updateSettingsTabHash,
    setupUnifiedSettingsHub,
    restoreAllEmbeddedSettingsSections: restoreAllEmbeddedSections,
    openSettingsHubSection,
    settingsHubToast
});
