/**
 * Dynamic dashboard quick actions + command palette (localStorage persistence).
 *
 * @typedef {Object} QuickActionDefinition
 * @property {string} id
 * @property {string} label
 * @property {string} icon Font Awesome classes (e.g. fa-solid fa-plus)
 * @property {string} permission
 * @property {string} [permissionAlt] OR permission
 * @property {string} group
 * @property {string} keywords
 * @property {'navigate'|'create-order'|'maintenance'|'superadmin-navigate'} kind
 * @property {string} [sectionId]
 * @property {string} [tone] indigo|emerald|blue|amber|rose|slate|violet
 */

const STORAGE_KEY = 'eob_admin_dashboard_quick_actions_v1';
const STORAGE_VERSION = 1;
const MAX_PINNED = 14;

/** @type {QuickActionDefinition[]} */
export const QUICK_ACTION_CATALOG = [
    {
        id: 'create-order',
        label: 'Create Order',
        icon: 'fa-solid fa-circle-plus',
        permission: 'view_orders',
        group: 'Sales',
        keywords: 'order pos manual',
        kind: 'create-order',
        tone: 'indigo'
    },
    {
        id: 'add-product',
        label: 'Add Product',
        icon: 'fa-solid fa-bag-shopping',
        permission: 'edit_products',
        group: 'Catalog',
        keywords: 'product inventory sku',
        kind: 'navigate',
        sectionId: 'view-add-product',
        tone: 'emerald'
    },
    {
        id: 'process-payout',
        label: 'Process Payout',
        icon: 'fa-solid fa-hand-holding-dollar',
        permission: 'view_payroll',
        group: 'HRM',
        keywords: 'payroll salary payout',
        kind: 'navigate',
        sectionId: 'view-hrm-payroll',
        tone: 'blue'
    },
    {
        id: 'toggle-maintenance',
        label: 'Toggle Maintenance',
        icon: 'fa-solid fa-shield-halved',
        permission: 'manage_settings',
        group: 'System',
        keywords: 'maintenance storefront downtime',
        kind: 'maintenance',
        tone: 'rose'
    },
    {
        id: 'create-coupon',
        label: 'Create Coupon',
        icon: 'fa-solid fa-ticket',
        permission: 'manage_coupons',
        group: 'Marketing',
        keywords: 'coupon discount promo',
        kind: 'navigate',
        sectionId: 'manage-coupons',
        tone: 'violet'
    },
    {
        id: 'add-employee',
        label: 'Add Employee',
        icon: 'fa-solid fa-user-plus',
        permission: 'view_employees',
        group: 'HRM',
        keywords: 'employee staff hire',
        kind: 'navigate',
        sectionId: 'view-hrm-employees',
        tone: 'emerald'
    },
    {
        id: 'financial-report',
        label: 'Financial Reports',
        icon: 'fa-solid fa-chart-pie',
        permission: 'view_financial_reports',
        group: 'Finance',
        keywords: 'report pnl profit finance',
        kind: 'navigate',
        sectionId: 'view-finance',
        tone: 'indigo'
    },
    {
        id: 'open-pos',
        label: 'Open POS',
        icon: 'fa-solid fa-cash-register',
        permission: 'access_pos',
        group: 'Sales',
        keywords: 'pos point of sale',
        kind: 'navigate',
        sectionId: 'view-pos',
        tone: 'amber'
    },
    {
        id: 'purchase-order',
        label: 'Purchase Orders',
        icon: 'fa-solid fa-file-invoice',
        permission: 'manage_purchase_orders',
        group: 'ERP',
        keywords: 'po supplier procurement',
        kind: 'navigate',
        sectionId: 'view-purchase-orders',
        tone: 'slate'
    },
    {
        id: 'support-tickets',
        label: 'Support Tickets',
        icon: 'fa-solid fa-headset',
        permission: 'manage_tickets',
        group: 'CRM',
        keywords: 'support ticket helpdesk',
        kind: 'navigate',
        sectionId: 'view-messages',
        tone: 'blue'
    },
    {
        id: 'abandoned-carts',
        label: 'Abandoned Carts',
        icon: 'fa-solid fa-cart-shopping',
        permission: 'view_abandoned_carts',
        group: 'CRM',
        keywords: 'cart recovery abandoned',
        kind: 'navigate',
        sectionId: 'view-crm-abandoned',
        tone: 'amber'
    },
    {
        id: 'manage-inventory',
        label: 'Inventory',
        icon: 'fa-solid fa-boxes-stacked',
        permission: 'view_products',
        group: 'Catalog',
        keywords: 'stock inventory products',
        kind: 'navigate',
        sectionId: 'view-manage-products',
        tone: 'slate'
    },
    {
        id: 'system-backup',
        label: 'Backup & Recovery',
        icon: 'fa-solid fa-database',
        permission: '',
        group: 'System',
        keywords: 'backup restore disaster',
        kind: 'superadmin-navigate',
        sectionId: 'view-system-backup',
        tone: 'slate'
    },
    {
        id: 'configuration',
        label: 'Configuration Hub',
        icon: 'fa-solid fa-sliders',
        permission: 'manage_settings',
        group: 'System',
        keywords: 'settings config store',
        kind: 'navigate',
        sectionId: 'view-settings',
        tone: 'slate'
    }
];

export const DEFAULT_PINNED_IDS = ['create-order', 'add-product', 'process-payout', 'toggle-maintenance'];

/** @type {QuickActionRuntimeDeps | null} */
let runtimeDeps = null;
let paletteBound = false;
let keyboardBound = false;
/** @type {string[] | null} */
let pinnedIdsOverride = null;
let preferencesHydrated = false;
let persistDebounceTimer = null;
const PERSIST_DEBOUNCE_MS = 450;

/**
 * @typedef {Object} QuickActionRuntimeDeps
 * @property {(key: string) => boolean} can
 * @property {(sectionId: string) => boolean} navigate
 * @property {() => Promise<void>} onCreateOrder
 * @property {() => Promise<void>} onToggleMaintenance
 * @property {(enabled: boolean) => void} updateMaintenanceLabel
 * @property {() => Record<string, string>} [authHeaders]
 */

function catalogById() {
    const map = new Map();
    QUICK_ACTION_CATALOG.forEach((item) => map.set(item.id, item));
    return map;
}

function actionAllowed(def, can) {
    if (!def) return false;
    if (def.kind === 'superadmin-navigate') {
        if (typeof window.isAdminSuperAdmin === 'function') {
            return window.isAdminSuperAdmin();
        }
        return false;
    }
    if (!def.permission) return true;
    if (can(def.permission)) return true;
    if (def.permissionAlt && can(def.permissionAlt)) return true;
    return false;
}

function loadPinnedStateFromLocal() {
    try {
        const raw = window.EOBStorage.get(STORAGE_KEY);
        if (!raw) {
            return { version: STORAGE_VERSION, pinnedIds: [...DEFAULT_PINNED_IDS] };
        }
        const parsed = JSON.parse(raw);
        const pinnedIds = Array.isArray(parsed.pinnedIds) ? parsed.pinnedIds.filter(Boolean) : [];
        return {
            version: STORAGE_VERSION,
            pinnedIds: pinnedIds.length ? pinnedIds : [...DEFAULT_PINNED_IDS]
        };
    } catch (_err) {
        return { version: STORAGE_VERSION, pinnedIds: [...DEFAULT_PINNED_IDS] };
    }
}

function savePinnedState(pinnedIds) {
    const trimmed = pinnedIds.slice(0, MAX_PINNED);
    pinnedIdsOverride = [...trimmed];
    window.EOBStorage.setJSON(STORAGE_KEY, {
        version: STORAGE_VERSION,
        pinnedIds: trimmed
    });
    schedulePersistPreferences(trimmed);
}

function readRawPinnedIds() {
    if (Array.isArray(pinnedIdsOverride) && pinnedIdsOverride.length) {
        return [...pinnedIdsOverride];
    }
    return [...loadPinnedStateFromLocal().pinnedIds];
}

function getEffectivePinnedIds(can) {
    const catalog = catalogById();
    const seen = new Set();
    const result = [];

    readRawPinnedIds().forEach((id) => {
        const def = catalog.get(id);
        if (!def || seen.has(id) || !actionAllowed(def, can)) return;
        seen.add(id);
        result.push(id);
    });

    if (!result.length) {
        DEFAULT_PINNED_IDS.forEach((id) => {
            const def = catalog.get(id);
            if (def && actionAllowed(def, can) && !seen.has(id)) {
                seen.add(id);
                result.push(id);
            }
        });
    }

    return result;
}

function pinAction(actionId, can) {
    const catalog = catalogById();
    const def = catalog.get(actionId);
    if (!def || !actionAllowed(def, can)) return false;

    const pinned = getEffectivePinnedIds(can);
    if (pinned.includes(actionId)) return true;
    if (pinned.length >= MAX_PINNED) pinned.pop();
    pinned.unshift(actionId);
    savePinnedState(pinned);
    return true;
}

function unpinAction(actionId, can) {
    const pinned = getEffectivePinnedIds(can).filter((id) => id !== actionId);
    const fallback = DEFAULT_PINNED_IDS.filter((id) => {
        const def = catalogById().get(id);
        return def && actionAllowed(def, can);
    });
    savePinnedState(pinned.length ? pinned : fallback);
    renderQuickActionChips();
}

function buildAuthHeaders() {
    if (typeof runtimeDeps?.authHeaders === 'function') {
        return runtimeDeps.authHeaders();
    }
    const authToken = window.token || window.EOBStorage.get(window.EOBStorageKeys.ADMIN_TOKEN) || '';
    return { Authorization: `Bearer ${authToken}` };
}

function schedulePersistPreferences(pinnedIds) {
    if (!runtimeDeps || !preferencesHydrated) return;
    if (persistDebounceTimer) clearTimeout(persistDebounceTimer);
    persistDebounceTimer = setTimeout(() => {
        persistDebounceTimer = null;
        void persistPreferencesToServer(pinnedIds);
    }, PERSIST_DEBOUNCE_MS);
}

async function persistPreferencesToServer(pinnedIds) {
    try {
        const response = await fetch('/api/admin/dashboard/quick-actions/preferences', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...buildAuthHeaders()
            },
            body: JSON.stringify({ pinnedIds })
        });

        if (response.status === 401 || response.status === 403) {
            if (typeof handleAdminApiAuthResponse === 'function') {
                handleAdminApiAuthResponse(response, {});
            }
        }
    } catch (_err) {
        /* offline — localStorage already updated */
    }
}

export async function hydrateQuickActionPreferencesFromServer() {
    if (!runtimeDeps) return;

    try {
        const response = await fetch('/api/admin/dashboard/quick-actions/preferences', {
            method: 'GET',
            headers: buildAuthHeaders()
        });

        if (response.ok) {
            const payload = await response.json();
            const serverIds = Array.isArray(payload?.data?.pinnedIds)
                ? payload.data.pinnedIds.filter(Boolean)
                : [];

            if (serverIds.length) {
                savePinnedState(serverIds);
            } else {
                pinnedIdsOverride = readRawPinnedIds();
            }
        } else if (response.status === 401 || response.status === 403) {
            if (typeof handleAdminApiAuthResponse === 'function') {
                handleAdminApiAuthResponse(response, {});
            }
            pinnedIdsOverride = loadPinnedStateFromLocal().pinnedIds;
        } else {
            pinnedIdsOverride = loadPinnedStateFromLocal().pinnedIds;
        }
    } catch (_err) {
        pinnedIdsOverride = loadPinnedStateFromLocal().pinnedIds;
    } finally {
        preferencesHydrated = true;
        renderQuickActionChips();
    }
}

async function runQuickAction(def) {
    if (!runtimeDeps || !def) return;

    if (def.kind === 'create-order') {
        await runtimeDeps.onCreateOrder();
        return;
    }
    if (def.kind === 'maintenance') {
        await runtimeDeps.onToggleMaintenance();
        return;
    }
    if (def.sectionId) {
        runtimeDeps.navigate(def.sectionId);
    }
}

function buildChipElement(def, { pinned = true } = {}) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `quick-action-chip quick-action-chip--${def.tone || 'slate'}`;
    chip.dataset.quickActionId = def.id;
    if (def.permission) chip.dataset.permission = def.permission;

    const icon = document.createElement('i');
    icon.className = def.icon;
    icon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'quick-action-chip__label';
    if (def.kind === 'maintenance') {
        label.dataset.maintenanceLabel = '1';
        label.textContent = 'Maintenance Off';
    } else {
        label.textContent = def.label;
    }

    chip.appendChild(icon);
    chip.appendChild(label);

    if (pinned) {
        const removeBtn = document.createElement('span');
        removeBtn.className = 'quick-action-chip__remove';
        removeBtn.setAttribute('role', 'button');
        removeBtn.setAttribute('tabindex', '0');
        removeBtn.setAttribute('aria-label', `Remove ${def.label} from shortcuts`);
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        removeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            unpinAction(def.id, runtimeDeps.can);
        });
        removeBtn.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                unpinAction(def.id, runtimeDeps.can);
            }
        });
        chip.appendChild(removeBtn);
    }

    chip.addEventListener('click', () => {
        void runQuickAction(def);
    });

    return chip;
}

export function renderQuickActionChips() {
    if (!runtimeDeps) return;

    const host = document.getElementById('dashboard-quick-actions-chips');
    const bar = document.querySelector('.dashboard-quick-actions-bar');
    if (!host || !bar) return;

    const catalog = catalogById();
    const pinnedIds = getEffectivePinnedIds(runtimeDeps.can);

    host.replaceChildren();
    pinnedIds.forEach((id) => {
        const def = catalog.get(id);
        if (!def) return;
        host.appendChild(buildChipElement(def, { pinned: true }));
    });

    const anyAllowed = QUICK_ACTION_CATALOG.some((def) => actionAllowed(def, runtimeDeps.can));
    bar.style.display = anyAllowed ? '' : 'none';

    host.querySelectorAll('[data-permission]').forEach((el) => {
        const key = el.getAttribute('data-permission');
        el.style.display = runtimeDeps.can(key) ? '' : 'none';
    });
}

function renderPaletteResults(query) {
    const list = document.getElementById('dashboard-command-palette-list');
    if (!list || !runtimeDeps) return;

    const q = String(query || '').trim().toLowerCase();
    const pinned = new Set(getEffectivePinnedIds(runtimeDeps.can));
    const catalog = catalogById();

    const matches = QUICK_ACTION_CATALOG.filter((def) => {
        if (!actionAllowed(def, runtimeDeps.can)) return false;
        if (!q) return true;
        const hay = `${def.label} ${def.group} ${def.keywords}`.toLowerCase();
        return hay.includes(q);
    });

    list.replaceChildren();

    if (!matches.length) {
        const empty = document.createElement('p');
        empty.className = 'dashboard-command-palette__empty';
        empty.textContent = 'No actions match your search.';
        list.appendChild(empty);
        return;
    }

    matches.forEach((def) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'dashboard-command-palette__item';
        row.dataset.actionId = def.id;

        const meta = document.createElement('span');
        meta.className = 'dashboard-command-palette__item-meta';
        meta.innerHTML = `<i class="${def.icon}" aria-hidden="true"></i><span>${def.label}</span>`;

        const badge = document.createElement('span');
        badge.className = 'dashboard-command-palette__item-badge';
        badge.textContent = pinned.has(def.id) ? 'Pinned' : def.group;

        row.appendChild(meta);
        row.appendChild(badge);

        row.addEventListener('click', () => {
            pinAction(def.id, runtimeDeps.can);
            renderQuickActionChips();
            closeCommandPalette();
            void runQuickAction(def);
        });

        list.appendChild(row);
    });
}

export function openCommandPalette() {
    const root = document.getElementById('dashboard-command-palette');
    const input = document.getElementById('dashboard-command-palette-input');
    if (!root) return;

    root.hidden = false;
    root.classList.add('is-open');
    document.body.classList.add('dashboard-command-palette-open');

    if (input) {
        input.value = '';
        renderPaletteResults('');
        requestAnimationFrame(() => input.focus());
    }
}

export function closeCommandPalette() {
    const root = document.getElementById('dashboard-command-palette');
    if (!root) return;
    root.hidden = true;
    root.classList.remove('is-open');
    document.body.classList.remove('dashboard-command-palette-open');
}

function bindCommandPalette() {
    if (paletteBound) return;
    paletteBound = true;

    const root = document.getElementById('dashboard-command-palette');
    const backdrop = document.getElementById('dashboard-command-palette-backdrop');
    const input = document.getElementById('dashboard-command-palette-input');
    const closeBtn = document.getElementById('dashboard-command-palette-close');
    const addBtn = document.getElementById('btn-quick-actions-add');

    backdrop?.addEventListener('click', closeCommandPalette);
    closeBtn?.addEventListener('click', closeCommandPalette);

    input?.addEventListener('input', () => {
        renderPaletteResults(input.value);
    });

    input?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeCommandPalette();
        }
    });

    addBtn?.addEventListener('click', () => openCommandPalette());

    root?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeCommandPalette();
    });
}

function bindCommandPaletteShortcut() {
    if (keyboardBound) return;
    keyboardBound = true;

    document.addEventListener('keydown', (event) => {
        const isMac = navigator.platform.toLowerCase().includes('mac');
        const mod = isMac ? event.metaKey : event.ctrlKey;
        if (!mod || event.key.toLowerCase() !== 'k') return;

        const overview = document.getElementById('view-overview');
        if (!overview?.classList.contains('active')) return;

        event.preventDefault();
        const root = document.getElementById('dashboard-command-palette');
        if (root?.classList.contains('is-open')) {
            closeCommandPalette();
        } else {
            openCommandPalette();
        }
    });
}

/**
 * @param {QuickActionRuntimeDeps} deps
 */
export function initDashboardQuickActions(deps) {
    runtimeDeps = deps;
    pinnedIdsOverride = loadPinnedStateFromLocal().pinnedIds;
    bindCommandPalette();
    bindCommandPaletteShortcut();
    renderQuickActionChips();
    void hydrateQuickActionPreferencesFromServer();
}

export function applyDynamicQuickActionPermissions() {
    renderQuickActionChips();
}

export function updateDynamicMaintenanceLabel(enabled) {
    document.querySelectorAll('[data-maintenance-label]').forEach((el) => {
        el.textContent = enabled ? 'Maintenance On' : 'Maintenance Off';
    });
    document.querySelectorAll('[data-quick-action-id="toggle-maintenance"]').forEach((btn) => {
        btn.classList.toggle('is-active', enabled === true);
        btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    });
}
