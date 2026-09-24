/**
 * Tracks unsaved form changes in the System Settings hub — dirty state, tab guards, save chips.
 */
import '../admin-core.js';

const TRACKABLE_SELECTOR = [
    'input:not([type="hidden"]):not([data-settings-dirty-ignore])',
    'select:not([data-settings-dirty-ignore])',
    'textarea:not([data-settings-dirty-ignore])'
].join(', ');

const baselineByScope = new Map();
const baselineTimers = new Map();
let hubShell = null;
let beforeUnloadBound = false;

function getFieldKey(el, scopeKey) {
    const id = el.id || el.name;
    if (!id) return null;
    return `${scopeKey}::${id}`;
}

function serializeFieldValue(el) {
    if (el.type === 'checkbox' || el.type === 'radio') {
        return el.checked ? '1' : '0';
    }
    if (el.type === 'file') {
        const file = el.files?.[0];
        return file ? `${file.name}:${file.size}:${file.lastModified}` : '';
    }
    return String(el.value ?? '');
}

function applyFieldValue(el, serialized) {
    if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = serialized === '1';
        return;
    }
    if (el.type === 'file') {
        el.value = '';
        return;
    }
    el.value = serialized ?? '';
}

function getScopeKey(scopeEl) {
    if (!scopeEl) return null;
    if (scopeEl.id) return scopeEl.id;
    if (scopeEl.dataset.settingsDirtyScope) return scopeEl.dataset.settingsDirtyScope;
    return null;
}

function collectScopesInPanel(panel) {
    if (!panel) return [];
    const scopes = new Set();
    panel.querySelectorAll('form[id]').forEach((form) => scopes.add(form));
    panel.querySelectorAll('[data-settings-dirty-scope]').forEach((el) => scopes.add(el));
    return [...scopes];
}

function serializeScope(scopeEl) {
    const scopeKey = getScopeKey(scopeEl);
    if (!scopeKey) return '';

    const parts = [];
    scopeEl.querySelectorAll(TRACKABLE_SELECTOR).forEach((el) => {
        if (el.disabled || el.readOnly) return;
        if (el.closest('[data-settings-dirty-ignore]')) return;
        if (el.dataset.settingsImmediateSave === 'true') return;

        const key = getFieldKey(el, scopeKey);
        if (!key) return;
        parts.push(`${key}=${serializeFieldValue(el)}`);
    });

    return parts.sort().join('|');
}

function findFooterForScope(scopeEl) {
    if (!scopeEl) return null;
    return scopeEl.querySelector(
        '.saas-settings-card-footer, .system-settings-card-footer, .menu-labels-footer'
    ) || scopeEl.closest('.saas-settings-card, .system-settings-card')
        ?.querySelector('.saas-settings-card-footer, .system-settings-card-footer, .menu-labels-footer');
}

function ensureSaveStateChip(footer) {
    if (!footer) return null;
    let chip = footer.querySelector('.settings-save-state-chip');
    if (chip) return chip;

    chip = document.createElement('span');
    chip.className = 'settings-save-state-chip';
    chip.setAttribute('aria-live', 'polite');
    chip.hidden = true;
    chip.innerHTML = '<span class="settings-save-state-dot" aria-hidden="true"></span> Unsaved changes';

    const saveBtn = footer.querySelector(
        '.saas-settings-save-btn, .system-settings-save-btn, #menuLabelsSaveBtn'
    );
    if (saveBtn) {
        footer.insertBefore(chip, saveBtn);
    } else {
        footer.appendChild(chip);
    }
    return chip;
}

function setScopeDirtyUI(scopeEl, isDirty) {
    const footer = findFooterForScope(scopeEl);
    const chip = ensureSaveStateChip(footer);
    if (chip) chip.hidden = !isDirty;

    const card = scopeEl.closest('.saas-settings-card, .system-settings-card')
        || (scopeEl.classList?.contains('saas-settings-card') ? scopeEl : null)
        || (scopeEl.classList?.contains('system-settings-card') ? scopeEl : null);
    if (card) card.classList.toggle('has-unsaved-changes', isDirty);
}

function isScopeDirty(scopeEl) {
    const scopeKey = getScopeKey(scopeEl);
    if (!scopeKey) return false;
    const baseline = baselineByScope.get(scopeKey);
    if (baseline === undefined) return false;
    return serializeScope(scopeEl) !== baseline;
}

function captureScopeBaseline(scopeEl) {
    const scopeKey = getScopeKey(scopeEl);
    if (!scopeKey) return;
    baselineByScope.set(scopeKey, serializeScope(scopeEl));
    setScopeDirtyUI(scopeEl, false);
}

function markSettingsFormSaved(scopeEl) {
    if (!scopeEl) return;
    if (typeof scopeEl === 'string') {
        scopeEl = document.getElementById(scopeEl)
            || document.querySelector(`[data-settings-dirty-scope="${scopeEl}"]`);
    }
    if (!scopeEl) return;
    captureScopeBaseline(scopeEl);
}

function refreshSettingsTabBaseline(tabId) {
    const panel = document.querySelector(`.admin-settings-panel[data-panel="${tabId}"]`);
    if (!panel) return;
    collectScopesInPanel(panel).forEach(captureScopeBaseline);
}

function scheduleSettingsTabBaselineCapture(tabId, delayMs = 650) {
    clearTimeout(baselineTimers.get(tabId));
    const timer = setTimeout(() => refreshSettingsTabBaseline(tabId), delayMs);
    baselineTimers.set(tabId, timer);
}

function getActiveSettingsTabId() {
    return document.querySelector('.admin-settings-panel.is-active')?.dataset?.panel || null;
}

function isSettingsTabDirty(tabId) {
    const panel = document.querySelector(`.admin-settings-panel[data-panel="${tabId}"]`);
    if (!panel) return false;
    return collectScopesInPanel(panel).some(isScopeDirty);
}

function hasAnyUnsavedSettings() {
    const tabId = getActiveSettingsTabId();
    return tabId ? isSettingsTabDirty(tabId) : false;
}

function revertSettingsScopeToBaseline(scopeEl) {
    if (!scopeEl) return false;

    const scopeKey = getScopeKey(scopeEl);
    if (!scopeKey) return false;

    const baseline = baselineByScope.get(scopeKey);
    if (baseline === undefined) return false;

    const values = new Map();
    baseline.split('|').forEach((part) => {
        const idx = part.indexOf('=');
        if (idx === -1) return;
        values.set(part.slice(0, idx), part.slice(idx + 1));
    });

    scopeEl.querySelectorAll(TRACKABLE_SELECTOR).forEach((el) => {
        if (el.dataset.settingsImmediateSave === 'true') return;
        const key = getFieldKey(el, scopeKey);
        if (!key || !values.has(key)) return;
        applyFieldValue(el, values.get(key));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    captureScopeBaseline(scopeEl);
    return true;
}

function revertSettingsTabToBaseline(tabId) {
    const panel = document.querySelector(`.admin-settings-panel[data-panel="${tabId}"]`);
    if (!panel) return;

    collectScopesInPanel(panel).forEach((scopeEl) => {
        revertSettingsScopeToBaseline(scopeEl);
    });
}

function resolveScopeFromFooter(footer) {
    if (!footer) return null;

    const form = footer.closest('form[id]');
    if (form) return form;

    const scoped = footer.closest('[data-settings-dirty-scope]');
    if (scoped) return scoped;

    const card = footer.closest('.saas-settings-card, .system-settings-card');
    if (!card) return null;

    if (!card.dataset.settingsDirtyScope) {
        card.dataset.settingsDirtyScope = card.id || `settings-scope-${Date.now()}`;
    }
    return card;
}

function handleDiscardScope(scopeEl) {
    if (!scopeEl || !isScopeDirty(scopeEl)) return;

    revertSettingsScopeToBaseline(scopeEl);

    if (scopeEl.id === 'storeBrandingForm' && typeof window.fetchAdminSettings === 'function') {
        window.fetchAdminSettings();
    }

    if (typeof window.showToast === 'function') {
        window.showToast('Changes discarded.', 'info');
    }
}

function installSettingsDiscardButtons(root = hubShell) {
    if (!root) return;

    root.querySelectorAll(
        '.saas-settings-card-footer, .system-settings-card-footer, .menu-labels-footer'
    ).forEach((footer) => {
        if (footer.querySelector('.settings-discard-btn')) return;

        const saveBtn = footer.querySelector(
            '.saas-settings-save-btn, .system-settings-save-btn, #menuLabelsSaveBtn'
        );
        if (!saveBtn) return;

        const scopeEl = resolveScopeFromFooter(footer);
        if (!scopeEl) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-secondary settings-discard-btn';
        btn.setAttribute('aria-label', 'Discard unsaved changes');
        btn.innerHTML = '<i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Discard';
        btn.addEventListener('click', () => handleDiscardScope(scopeEl));

        footer.insertBefore(btn, saveBtn);
        ensureSaveStateChip(footer);
    });
}

async function confirmDiscardSettingsChanges() {
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: 'Unsaved changes',
            text: 'You have unsaved changes. Discard them?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Discard',
            cancelButtonText: 'Keep editing',
            confirmButtonColor: '#ef4444',
            reverseButtons: true
        });
        return result.isConfirmed === true;
    }
    return window.confirm('You have unsaved changes. Discard them?');
}

async function requestSettingsTabSwitch(tabId, options = {}) {
    if (!tabId) return false;

    const currentTab = getActiveSettingsTabId();
    if (!options.skipDirtyCheck && currentTab && currentTab !== tabId && isSettingsTabDirty(currentTab)) {
        const confirmed = await confirmDiscardSettingsChanges();
        if (!confirmed) return false;
        revertSettingsTabToBaseline(currentTab);
    }

    if (typeof window.activateUnifiedSettingsTab === 'function') {
        window.activateUnifiedSettingsTab(tabId, options);
    }
    return true;
}

function handleSettingsFieldChange(event) {
    const target = event.target;
    if (!target?.matches?.(TRACKABLE_SELECTOR)) return;
    if (target.dataset.settingsImmediateSave === 'true') return;
    if (!hubShell?.contains(target)) return;

    const panel = target.closest('.admin-settings-panel');
    if (!panel || panel.hidden) return;

    const scopeEl = target.closest('form[id]')
        || target.closest('[data-settings-dirty-scope]');
    if (!scopeEl) return;

    setScopeDirtyUI(scopeEl, isScopeDirty(scopeEl));
}

function bindBeforeUnloadGuard() {
    if (beforeUnloadBound) return;
    beforeUnloadBound = true;
    window.addEventListener('beforeunload', (event) => {
        const viewSettings = document.getElementById('view-settings');
        if (!viewSettings || viewSettings.style.display === 'none' || !viewSettings.classList.contains('active')) {
            return;
        }
        if (!hasAnyUnsavedSettings()) return;
        event.preventDefault();
        event.returnValue = '';
    });
}

function installSaveStateChips(panel) {
    collectScopesInPanel(panel).forEach((scopeEl) => {
        ensureSaveStateChip(findFooterForScope(scopeEl));
    });
}

function setupSettingsDirtyTracker(shell) {
    if (!shell || shell.dataset.dirtyTrackerBound) return;
    shell.dataset.dirtyTrackerBound = '1';
    hubShell = shell;

    shell.querySelectorAll('.admin-settings-panel').forEach((panel) => {
        installSaveStateChips(panel);
        installSettingsDiscardButtons(panel);
    });

    shell.addEventListener('input', handleSettingsFieldChange, true);
    shell.addEventListener('change', handleSettingsFieldChange, true);

    bindBeforeUnloadGuard();

    const activeTab = getActiveSettingsTabId();
    if (activeTab) scheduleSettingsTabBaselineCapture(activeTab);
}

function notifySettingsTabActivated(tabId) {
    scheduleSettingsTabBaselineCapture(tabId);
    const panel = document.querySelector(`.admin-settings-panel[data-panel="${tabId}"]`);
    if (panel) {
        installSaveStateChips(panel);
        installSettingsDiscardButtons(panel);
    }
}

const TAB_DEFAULT_SAVE_SELECTORS = Object.freeze({
    branding: '#platformSettingsForm',
    general: '#form-system-general',
    shipping: '#form-system-tax-vat',
    notifications: '#notifEmailForm',
    security: '#adminProfileForm'
});

function getFirstDirtyScopeInTab(tabId) {
    const panel = document.querySelector(`.admin-settings-panel[data-panel="${tabId}"]`);
    if (!panel) return null;
    return collectScopesInPanel(panel).find(isScopeDirty) || null;
}

function getDefaultSaveScopeForTab(tabId) {
    const selector = TAB_DEFAULT_SAVE_SELECTORS[tabId];
    if (!selector) return null;
    return document.querySelector(selector);
}

function triggerSaveForScope(scopeEl) {
    if (!scopeEl) return false;

    const footer = findFooterForScope(scopeEl);
    const saveBtn = footer?.querySelector(
        '.saas-settings-save-btn, .system-settings-save-btn, #menuLabelsSaveBtn'
    );
    if (!saveBtn || saveBtn.disabled) return false;

    if (saveBtn.id === 'menuLabelsSaveBtn') {
        saveBtn.click();
        return true;
    }

    const form = saveBtn.closest('form') || scopeEl.closest('form') || (scopeEl.matches('form') ? scopeEl : null);
    if (form?.requestSubmit) {
        form.requestSubmit(saveBtn.type === 'submit' ? saveBtn : undefined);
        return true;
    }

    saveBtn.click();
    return true;
}

function triggerSettingsQuickSave() {
    const tabId = getActiveSettingsTabId();
    if (!tabId) return { saved: false, reason: 'no-tab' };

    const dirtyScope = getFirstDirtyScopeInTab(tabId);
    const scopeEl = dirtyScope || getDefaultSaveScopeForTab(tabId);
    if (!scopeEl) {
        return { saved: false, reason: 'no-save-target', tabId };
    }

    const ok = triggerSaveForScope(scopeEl);
    return { saved: ok, tabId, dirty: Boolean(dirtyScope) };
}

Object.assign(window, {
    setupSettingsDirtyTracker,
    notifySettingsTabActivated,
    refreshSettingsTabBaseline,
    scheduleSettingsTabBaselineCapture,
    markSettingsFormSaved,
    isSettingsTabDirty,
    hasAnyUnsavedSettings,
    requestSettingsTabSwitch,
    confirmDiscardSettingsChanges,
    revertSettingsTabToBaseline,
    revertSettingsScopeToBaseline,
    handleDiscardScope,
    installSettingsDiscardButtons,
    getActiveSettingsTabId,
    getFirstDirtyScopeInTab,
    getDefaultSaveScopeForTab,
    triggerSaveForScope,
    triggerSettingsQuickSave
});

export {
    setupSettingsDirtyTracker,
    notifySettingsTabActivated,
    refreshSettingsTabBaseline,
    scheduleSettingsTabBaselineCapture,
    markSettingsFormSaved,
    isSettingsTabDirty,
    hasAnyUnsavedSettings,
    requestSettingsTabSwitch,
    confirmDiscardSettingsChanges,
    revertSettingsTabToBaseline,
    revertSettingsScopeToBaseline,
    handleDiscardScope,
    installSettingsDiscardButtons,
    getActiveSettingsTabId,
    getFirstDirtyScopeInTab,
    getDefaultSaveScopeForTab,
    triggerSaveForScope,
    triggerSettingsQuickSave
};
