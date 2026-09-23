/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * Author: Abdul Karim
 * File: js/admin-staff.js
 * Description: RBAC front-end — Staff Management console (Super Admin) plus
 * permission-aware gating of the admin sidebar. The server is always the real
 * gate; this module only hides what the signed-in account cannot use so staff
 * never click into an Access Denied wall.
 */

const staffToken = () => localStorage.getItem('adminToken');

/** Bearer token headers for every /api/admin/* request (verifyAdmin reads Authorization header). */
function authHeaders(json = true) {
    const headers = { Authorization: `Bearer ${staffToken() || ''}` };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
}

/* ==========================================================================
   STATE
   ========================================================================== */

let currentAdmin = null;          // { username, role, permissions, ... }
let permissionCatalog = [];       // [{ key, label, description, icon, group }]
let sectionPermissionMap = {};    // { 'view-orders': 'manage_orders', ... }
let permissionImplications = {};  // parent key → implied child keys (from API)
let staffAccounts = [];

/* ==========================================================================
   HELPERS
   ========================================================================== */

function notify(message, type = 'success') {
    if (typeof window.showToast === 'function') return window.showToast(message, type);
    console[type === 'error' ? 'error' : 'log'](message);
}

function confirmAction(title, message, onConfirm, type = 'warning') {
    if (typeof window.showCustomConfirm === 'function') {
        return window.showCustomConfirm(title, message, onConfirm, type);
    }
    const isDelete = type === 'danger' || type === 'warning';
    return Swal.fire({
        icon: isDelete ? 'warning' : 'question',
        title: title || 'Are you sure?',
        text: message,
        showCancelButton: true,
        confirmButtonColor: isDelete ? '#dc2626' : '#f59e0b',
        cancelButtonColor: '#6b7280',
        confirmButtonText: isDelete ? 'Yes, proceed' : 'Yes',
        cancelButtonText: 'Cancel'
    }).then((result) => {
        if (result.isConfirmed && typeof onConfirm === 'function') onConfirm();
    });
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

/** Every staff API call shares the same auth header + error surfacing. */
async function staffApi(url, options = {}) {
    const useJson = options.body !== undefined && !(options.headers || {})['Content-Type'];
    const response = await fetch(url, {
        ...options,
        headers: {
            ...authHeaders(useJson),
            ...(options.headers || {})
        }
    });

    let data = {};
    try {
        data = await response.json();
    } catch (err) {
        data = {};
    }

    if (!response.ok || data.success === false) {
        const error = new Error(data.message || `Request failed (${response.status})`);
        error.status = response.status;
        error.payload = data;
        throw error;
    }

    return data;
}

function isSuperAdmin() {
    return !!currentAdmin && currentAdmin.role === 'superadmin';
}

/**
 * Show or hide every [data-superadmin-only] element (sidebar items, sandbox card, …).
 * Callable from admin.js after settings navigation so the card is not left hidden.
 */
function applySuperAdminOnlyVisibility() {
    const show = isSuperAdmin();

    document.querySelectorAll('[data-superadmin-only="true"]').forEach((el) => {
        // Full-page admin views are shown only via navigateAdminSection — not here.
        if (el.classList.contains('admin-section')) return;

        el.classList.toggle('superadmin-visible', show);
        if (show) {
            el.removeAttribute('hidden');
        } else {
            el.setAttribute('hidden', '');
        }
    });
}

function hasPermission(permission) {
    if (isSuperAdmin()) return true;
    if (!permission) return true;

    const granted = Array.isArray(currentAdmin?.permissions) ? currentAdmin.permissions : [];
    if (granted.includes(permission)) return true;

    for (const [parent, children] of Object.entries(permissionImplications)) {
        if (granted.includes(parent) && Array.isArray(children) && children.includes(permission)) {
            return true;
        }
    }

    return false;
}

/**
 * initDashboard() must not fire permission-gated API calls until /me + /permissions
 * have populated currentAdmin (hasAdminPermission exists earlier but reads empty state).
 */
function waitForAdminPermissions() {
    return new Promise((resolve) => {
        if (currentAdmin) return resolve();
        const iv = setInterval(() => {
            if (currentAdmin) {
                clearInterval(iv);
                resolve();
            }
        }, 50);
    });
}

function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function permissionLabel(key) {
    const found = permissionCatalog.find(p => p.key === key);
    return found ? found.label : key;
}

function generateStrongPassword(length = 14) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
    const bytes = new Uint32Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, n => alphabet[n % alphabet.length]).join('');
}

const STAFF_GROUP_EMOJI = {
    Insights: '📊',
    Operations: '🛠️',
    Administration: '⚙️',
    Attendance: '🕐',
    HRM: '👥',
    Inventory: '📦',
    Orders: '🛒',
    Marketing: '📣',
    Accounts: '💰'
};

/** One-click permission presets — keys must match config/permissions.js. */
const ROLE_PRESETS = {
    fullAdmin: null,
    inventoryManager: ['view_products', 'edit_products', 'manage_stock', 'manage_catalog', 'manage_inventory'],
    orderManager: ['view_orders', 'update_order_status', 'process_refunds', 'manage_customers', 'manage_orders'],
    posOperator: ['view_orders', 'update_order_status', 'view_products', 'manage_stock'],
    hrManager: [
        'view_attendance', 'mark_attendance_today', 'mark_attendance_any_date',
        'lock_attendance_dates', 'manual_attendance',
        'view_employees', 'edit_employees', 'manage_payroll', 'manage_leave', 'manage_staff'
    ],
    clear: []
};

let staffAssignCandidates = [];
let staffAssignSubmitInFlight = false;
let staffAssignSelectedEmployee = null;
let staffAssignSearchTimer = null;

function buildPermissionGroups(catalog = []) {
    const groups = [];
    const indexByName = new Map();
    catalog.forEach((permission) => {
        const groupName = permission.group || 'Other';
        if (!indexByName.has(groupName)) {
            indexByName.set(groupName, groups.length);
            groups.push({
                id: groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                label: groupName,
                emoji: STAFF_GROUP_EMOJI[groupName] || '🔑',
                items: []
            });
        }
        groups[indexByName.get(groupName)].items.push(permission);
    });
    return groups;
}

function formatRelativeTime(value) {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Never';
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function resolvePresetKeys(presetKey) {
    if (presetKey === 'fullAdmin') {
        return permissionCatalog.map(p => p.key);
    }
    return ROLE_PRESETS[presetKey] || [];
}

/* ==========================================================================
   IDENTITY & SIDEBAR GATING
   ========================================================================== */

async function loadCurrentAdmin() {
    const [meResult, catalogResult] = await Promise.all([
        staffApi('/api/admin/me'),
        staffApi('/api/admin/permissions')
    ]);

    currentAdmin = meResult.admin;
    permissionCatalog = catalogResult.permissions || [];
    sectionPermissionMap = catalogResult.sectionPermissions || {};
    permissionImplications = catalogResult.permissionImplications || {};
}

/**
 * Hide the sidebar entries (and collapse empty groups) that the signed-in
 * account has no permission for, then make sure the visible section is one
 * they are allowed to see.
 */
function hideEmptyMenuGroups(nav = document.querySelector('.sidebar-menu')) {
    if (!nav) return;

    nav.querySelectorAll('li.menu-group').forEach((group) => {
        const visibleTargets = [...group.querySelectorAll('li[data-target]')]
            .filter((child) => child.style.display !== 'none');
        const visibleSubItems = [...group.querySelectorAll('.submenu > li')]
            .filter((child) => child.style.display !== 'none');
        group.style.display = (visibleTargets.length || visibleSubItems.length) ? '' : 'none';
    });
}

function applyRoleToSidebar() {
    const nav = document.querySelector('.sidebar-menu');
    if (!nav) return;

    applySuperAdminOnlyVisibility();

    nav.querySelectorAll('li[data-target]').forEach(item => {
        if (item.dataset.superadminOnly === 'true') return;

        const required = item.dataset.permission
            || sectionPermissionMap[item.getAttribute('data-target')];
        item.style.display = hasPermission(required) ? '' : 'none';
    });

    // Any element can opt into permission gating with data-permission="key"
    // (settings cards, the finance shortcut, action buttons, …).
    nav.querySelectorAll('[data-permission]').forEach(el => {
        const host = el.closest('li[data-target]') || el;
        host.style.display = hasPermission(el.dataset.permission) ? '' : 'none';
    });

    // Hide group headers when all children hidden
    document.querySelectorAll('.sidebar-menu .menu-group').forEach((group) => {
        const visible = [...group.querySelectorAll('li[data-target]')]
            .filter((li) => li.style.display !== 'none');
        group.style.display = visible.length === 0 ? 'none' : '';
    });

    document.querySelectorAll('.sidebar-menu .has-submenu').forEach((parent) => {
        const visibleChildren = [...parent.querySelectorAll('li[data-target]')]
            .filter((li) => li.style.display !== 'none');
        if (visibleChildren.length === 0) {
            parent.style.display = 'none';
        }
    });

    hideEmptyMenuGroups(nav);

    // Show the role on the sidebar profile card instead of a hardcoded label.
    const profileInfo = document.querySelector('.admin-profile .info');
    if (profileInfo && currentAdmin) {
        const nameEl = profileInfo.querySelector('h4');
        const roleEl = profileInfo.querySelector('p');
        if (nameEl) nameEl.textContent = currentAdmin.name || currentAdmin.username;
        if (roleEl) roleEl.textContent = isSuperAdmin() ? 'Super Admin' : 'Staff';
    }

    // Staff must not land on a section they cannot load.
    const active = document.querySelector('.admin-section.active');
    const activeAllowed = active ? hasPermission(sectionPermissionMap[active.id]) : false;

    if (!activeAllowed) {
        const firstAllowed = [...nav.querySelectorAll('li[data-target]')]
            .find(item => item.style.display !== 'none');

        if (firstAllowed && typeof window.navigateAdminSection === 'function') {
            window.navigateAdminSection(firstAllowed.getAttribute('data-target'), firstAllowed);
        }
    }
}

/* ==========================================================================
   PERMISSION TOGGLE MATRIX (rendered from the server catalog)
   ========================================================================== */

function syncPermissionRowState(box) {
    const row = box.closest('.permission-toggle-row');
    if (row) row.classList.toggle('is-on', box.checked);
    const toggle = row?.querySelector('.perm-toggle');
    if (toggle && box) {
        toggle.classList.toggle('on', box.checked);
        toggle.setAttribute('aria-checked', box.checked ? 'true' : 'false');
    }
}

function syncPermToggleVisuals(container) {
    if (!container) return;
    container.querySelectorAll('.permission-toggle-input').forEach((box) => syncPermissionRowState(box));
    container.querySelectorAll('.permission-module-select-all-input').forEach((box) => {
        syncModuleSelectAllState(container, box.dataset.module);
    });
}

function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

function clearStaffAssignFieldErrors() {
    document.querySelectorAll('#staffAssignAccessForm .staff-field-error, #staffAssignAccessForm .staff-form-error').forEach((el) => {
        el.hidden = true;
        el.textContent = '';
    });
    document.querySelectorAll('#staffAssignAccessForm .is-invalid').forEach((el) => el.classList.remove('is-invalid'));
}

function showStaffAssignFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorMap = {
        empSearchInput: 'staffAssignEmployeeError',
        staffAssignEmployeeSearch: 'staffAssignEmployeeError',
        staffAssignUsername: 'staffAssignUsernameError',
        staffAssignPassword: 'staffAssignPasswordError',
        staffAssignConfirmPassword: 'staffAssignConfirmError',
        permissionsGrid: 'staffAssignPermissionsError',
        staffAssignPermissionGrid: 'staffAssignPermissionsError'
    };
    const errorEl = document.getElementById(errorMap[fieldId] || 'staffAssignFormError');
    if (field) field.classList.add('is-invalid');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.hidden = false;
    }
}

function togglePasswordVisibility(button) {
    const inputId = button.getAttribute('data-target');
    const input = document.getElementById(inputId);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    const icon = button.querySelector('i');
    if (icon) {
        icon.className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    }
}

function permissionByKey(key) {
    return permissionCatalog.find((p) => p.key === key);
}

function renderPermissionCheckboxes(container, selectedKeys = []) {
    if (!container) return;

    if (permissionCatalog.length === 0) {
        container.innerHTML = '<p class="empty-hint">Loading permissions…</p>';
        return;
    }

    const selected = new Set(selectedKeys);
    const modules = buildPermissionGroups(permissionCatalog);

    container.innerHTML = modules.map((module) => {
        const items = module.items;
        if (!items.length) return '';
        const allChecked = items.every((p) => selected.has(p.key));

        return `
        <div class="permission-category-card permission-category-card--${module.id}">
            <div class="permission-category-header">
                <span class="permission-category-emoji" aria-hidden="true">${module.emoji}</span>
                <span class="permission-category-title">${escapeHtml(module.label)}</span>
                <label class="permission-module-select-all">
                    <input type="checkbox" class="permission-module-select-all-input" data-module="${module.id}" ${allChecked ? 'checked' : ''}>
                    <span>Select all</span>
                </label>
            </div>
            <div class="permission-category-items" data-module-items="${module.id}">
                ${items.map((permission) => `
                    <div class="permission-toggle-row ${selected.has(permission.key) ? 'is-on' : ''}">
                        <span class="permission-toggle-main">
                            <span class="permission-toggle-icon"><i class="fa-solid ${escapeHtml(permission.icon || 'fa-key')}"></i></span>
                            <span class="permission-toggle-copy">
                                <strong>${escapeHtml(permission.label)}</strong>
                                <small>${escapeHtml(permission.description || '')}</small>
                            </span>
                        </span>
                        <input type="checkbox" class="permission-toggle-input" data-module="${module.id}" data-key="${escapeHtml(permission.key)}" value="${escapeHtml(permission.key)}" ${selected.has(permission.key) ? 'checked' : ''} tabindex="-1" aria-hidden="true">
                        <div class="perm-toggle ${selected.has(permission.key) ? 'on' : ''}" data-key="${escapeHtml(permission.key)}" role="switch" aria-checked="${selected.has(permission.key) ? 'true' : 'false'}" tabindex="0" aria-label="${escapeHtml(permission.label)}"></div>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.permission-toggle-row').forEach((row) => {
        const box = row.querySelector('.permission-toggle-input');
        const toggle = row.querySelector('.perm-toggle');
        const main = row.querySelector('.permission-toggle-main');

        const flip = () => {
            if (!box) return;
            box.checked = !box.checked;
            syncPermissionRowState(box);
            clearPresetHighlight(container);
            syncModuleSelectAllState(container, box.dataset.module);
        };

        toggle?.addEventListener('click', (e) => {
            e.stopPropagation();
            flip();
        });
        toggle?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                flip();
            }
        });
        main?.addEventListener('click', flip);
    });

    container.querySelectorAll('.permission-module-select-all-input').forEach((box) => {
        box.addEventListener('change', () => {
            const moduleId = box.dataset.module;
            container.querySelectorAll(`.permission-toggle-input[data-module="${moduleId}"]`).forEach((input) => {
                input.checked = box.checked;
                syncPermissionRowState(input);
            });
            clearPresetHighlight(container);
        });
    });
}

function syncModuleSelectAllState(container, moduleId) {
    if (!container || !moduleId) return;
    const inputs = [...container.querySelectorAll(`.permission-toggle-input[data-module="${moduleId}"]`)];
    const selectAll = container.querySelector(`.permission-module-select-all-input[data-module="${moduleId}"]`);
    if (!selectAll || !inputs.length) return;
    selectAll.checked = inputs.every((input) => input.checked);
}

function readSelectedPermissions(container) {
    if (!container) return [];
    if (container.querySelector('.perm-group-block')) {
        return [...container.querySelectorAll('.perm-toggle.on[data-key]')]
            .map((toggle) => toggle.dataset.key)
            .filter(Boolean);
    }
    const fromChecks = [...container.querySelectorAll('.permission-toggle-input:checked')]
        .map((box) => box.value || box.dataset.key)
        .filter(Boolean);
    if (fromChecks.length) return fromChecks;
    return [...container.querySelectorAll('.perm-toggle.on[data-key]')]
        .map((toggle) => toggle.dataset.key)
        .filter(Boolean);
}

function setAssignPermissionKeys(container, keys = []) {
    if (!container) return;
    const allowed = new Set(keys);
    container.querySelectorAll('.perm-toggle[data-key]').forEach((toggle) => {
        toggle.classList.toggle('on', allowed.has(toggle.dataset.key));
        toggle.setAttribute('aria-checked', allowed.has(toggle.dataset.key) ? 'true' : 'false');
    });
    container.querySelectorAll('.group-select-all').forEach((cb) => {
        const block = cb.closest('.perm-group-block');
        if (!block) return;
        const toggles = block.querySelectorAll('.perm-toggle[data-key]');
        cb.checked = [...toggles].every((t) => t.classList.contains('on'));
    });
}

function setPermissionKeys(container, keys = []) {
    if (!container) return;
    const allowed = new Set(keys);
    container.querySelectorAll('.permission-toggle-input').forEach(box => {
        box.checked = allowed.has(box.value);
        syncPermissionRowState(box);
    });
    syncPermToggleVisuals(container);
}

function setAllPermissions(container, checked) {
    if (!container) return;
    container.querySelectorAll('.permission-toggle-input').forEach(box => {
        box.checked = checked;
        syncPermissionRowState(box);
    });
}

function findPresetsBar(container) {
    if (!container) return null;
    const root = container.closest('.staff-assign-form, .staff-permissions-panel-form, form, .admin-modal');
    return root?.querySelector('.staff-presets-bar') || container.parentElement?.querySelector('.staff-presets-bar');
}

function applyRolePreset(container, presetKey) {
    if (!container) return;
    const keys = resolvePresetKeys(presetKey);
    if (container.querySelector('.perm-group-block')) {
        setAssignPermissionKeys(container, keys);
    } else {
        setPermissionKeys(container, keys);
    }

    const presetsBar = findPresetsBar(container);
    presetsBar?.querySelectorAll('.staff-preset-btn').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.preset === presetKey && presetKey !== 'clear');
    });
}

function clearPresetHighlight(container) {
    const presetsBar = findPresetsBar(container);
    presetsBar?.querySelectorAll('.staff-preset-btn').forEach(btn => btn.classList.remove('is-active'));
}

function setupPermissionPresets(presetsBar, grid) {
    if (!presetsBar || !grid) return;

    presetsBar.querySelectorAll('.staff-preset-btn').forEach(btn => {
        if (btn.dataset.bound === 'true') return;
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => {
            applyRolePreset(grid, btn.dataset.preset || 'clear');
            if (btn.dataset.preset === 'clear') {
                notify('All permission toggles cleared.', 'info');
            }
        });
    });
}

function deriveStaffRoleBadge(staff) {
    const perms = staff.permissions || [];
    const permSet = new Set(perms);
    if (staff.role === 'superadmin') {
        return { label: 'Full Admin', className: 'staff-role-badge staff-role-badge--super' };
    }
    const hrKeys = ROLE_PRESETS.hrManager || [];
    if (hrKeys.length && hrKeys.every((k) => permSet.has(k)) && perms.length <= hrKeys.length + 2) {
        return { label: 'HR Manager', className: 'staff-role-badge staff-role-badge--hr' };
    }
    if (permSet.has('manage_settings') && permSet.has('manage_staff')) {
        return { label: 'Manager', className: 'staff-role-badge staff-role-badge--manager' };
    }
    if (perms.length >= permissionCatalog.length - 2) {
        return { label: 'Full Admin', className: 'staff-role-badge staff-role-badge--super' };
    }
    if (perms.length >= 4) return { label: 'Manager', className: 'staff-role-badge staff-role-badge--manager' };
    return { label: 'Operator', className: 'staff-role-badge staff-role-badge--operator' };
}

function countDistinctPermissionSets(accounts) {
    const sets = new Set(accounts.map((s) => [...(s.permissions || [])].sort().join('|')));
    sets.delete('');
    return sets.size;
}

function getEditAccountStatus() {
    const selected = document.querySelector('input[name="editStaffAccountStatus"]:checked');
    return selected?.value === 'blocked' ? 'blocked' : 'active';
}

function setEditAccountStatus(status) {
    const active = document.getElementById('editStaffStatusActive');
    const suspended = document.getElementById('editStaffStatusSuspended');
    if (status === 'blocked' && suspended) suspended.checked = true;
    else if (active) active.checked = true;
}

/* ==========================================================================
   STAFF TABLE
   ========================================================================== */

function renderStaffTable() {
    const body = document.getElementById('staffTableBody');
    if (!body) return;

    if (staffAccounts.length === 0) {
        body.innerHTML = `
            <tr><td colspan="6" class="empty-row">
                No staff accounts yet. Use <strong>Assign New Access</strong> to link an employee from HRM.
            </td></tr>`;
        return;
    }

    const totalPerms = permissionCatalog.length || 25;

    body.innerHTML = staffAccounts.map(staff => {
        const blocked = staff.status === 'blocked';
        const roleBadge = deriveStaffRoleBadge(staff);
        const permCount = staff.permissionCount ?? (staff.permissions || []).length;
        const photo = staff.linkedEmployeePhoto || staff.image || '';
        const empCode = staff.linkedEmployeeCode || staff.employeeId || '';
        const initial = (staff.name || staff.username).charAt(0).toUpperCase();
        const avatarHtml = photo
            ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(initial)}" class="staff-avatar-img" onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('span'),{className:'staff-avatar',textContent:this.getAttribute('alt')||'?'}))">`
            : `<span class="staff-avatar">${escapeHtml(initial)}</span>`;

        return `
            <tr class="${blocked ? 'staff-row-blocked' : ''}">
                <td>
                    <div class="staff-identity staff-identity--directory">
                        ${avatarHtml}
                        <div>
                            <strong>${escapeHtml(staff.name || staff.username)}</strong>
                            <small><code class="staff-username">${escapeHtml(empCode || staff.username)}</code></small>
                        </div>
                    </div>
                </td>
                <td><span class="${roleBadge.className}">${escapeHtml(roleBadge.label)}</span></td>
                <td>
                    <button type="button" class="staff-perm-count-btn" onclick="showStaffPermissionDetail('${staff.id}')" title="View permissions">
                        ${permCount} of ${staff.permissionTotal || totalPerms}
                    </button>
                </td>
                <td>
                    <span class="status-badge staff-status-dot ${blocked ? 'blocked' : 'active'}">
                        <i class="fa-solid fa-circle"></i>
                        ${blocked ? 'Suspended' : 'Active'}
                    </span>
                </td>
                <td>${escapeHtml(formatRelativeTime(staff.lastLoginAt))}</td>
                <td class="staff-actions-cell">
                    <div class="staff-action-group">
                        <button type="button" class="staff-action-btn edit-perm-btn" data-id="${staff.id}" title="Edit Permissions">
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                        <button type="button" class="staff-action-btn suspend-btn" data-id="${staff.id}" data-status="${staff.status}" title="${blocked ? 'Activate Account' : 'Suspend Account'}">
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                        </button>
                        <button type="button" class="staff-action-btn revoke-btn danger" data-id="${staff.id}" data-name="${escapeHtml(staff.name || staff.username)}" title="Revoke Access">
                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');

    bindStaffRowActions();
}

function bindStaffRowActions() {
    document.querySelectorAll('#staffTableBody .edit-perm-btn').forEach((btn) => {
        if (btn.dataset.bound === 'true') return;
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => {
            if (btn.dataset.id) openStaffEditModal(btn.dataset.id);
        });
    });

    document.querySelectorAll('#staffTableBody .suspend-btn').forEach((btn) => {
        if (btn.dataset.bound === 'true') return;
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => {
            if (btn.dataset.id) toggleStaffStatus(btn.dataset.id);
        });
    });

    document.querySelectorAll('#staffTableBody .revoke-btn').forEach((btn) => {
        if (btn.dataset.bound === 'true') return;
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => {
            if (btn.dataset.id) revokeStaffAccess(btn.dataset.id);
        });
    });
}

function renderStaffSummary(summary) {
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    const active = summary?.active ?? summary?.activeCount ?? staffAccounts.filter(s => s.status === 'active').length;
    const without2fa = staffAccounts.filter(s => s.twoFactorEnabled === false).length;

    set('staffActiveCount', active);
    set('staffRoleTemplatesCount', countDistinctPermissionSets(staffAccounts));

    const securityEl = document.getElementById('staffSecurityStatus');
    const hintEl = document.getElementById('staffSecurityHint');
    if (securityEl) {
        if (without2fa > 0) {
            securityEl.textContent = `${without2fa} without 2FA`;
            securityEl.className = 'staff-security-badge staff-security-badge--warn';
            if (hintEl) hintEl.textContent = 'Enable 2FA on staff accounts for stronger security';
        } else if (staffAccounts.length) {
            securityEl.textContent = 'All accounts using 2FA';
            securityEl.className = 'staff-security-badge staff-security-badge--ok';
            if (hintEl) hintEl.textContent = 'Email OTP enforced on every account';
        } else {
            securityEl.textContent = 'Audit Logs Active';
            securityEl.className = 'staff-security-badge';
            if (hintEl) hintEl.textContent = 'Security monitoring is enabled';
        }
    }
}

async function fetchStaffAccounts(options = {}) {
    const { bustCache = false, showTableLoading = true } = options;
    const body = document.getElementById('staffTableBody');

    if (body && showTableLoading) {
        body.innerHTML = '<tr><td colspan="6" class="loading-container"><div class="spinner"></div><p>Loading staff accounts...</p></td></tr>';
    }

    const url = bustCache
        ? `/api/admin/staff?_=${Date.now()}`
        : '/api/admin/staff';

    try {
        const result = await staffApi(url);
        staffAccounts = result.data || result.staff || [];
        renderStaffSummary(result.summary || { active: result.activeCount, total: result.total });
        renderStaffTable();
        return true;
    } catch (error) {
        console.error('Load Staff Error:', error);
        if (body) {
            body.innerHTML = `<tr><td colspan="6" class="empty-row">${escapeHtml(error.message)}</td></tr>`;
        }
        if (!options.suppressErrorToast) {
            notify(error.message, 'error');
        }
        return false;
    }
}
window.fetchStaffAccounts = fetchStaffAccounts;
window.refreshStaffList = fetchStaffAccounts;

const STAFF_REFRESH_BTN_IDLE_HTML =
    '<i class="fa-solid fa-rotate staff-refresh-btn__icon" aria-hidden="true"></i>' +
    '<span class="staff-refresh-btn__label">Refresh</span>';

const STAFF_REFRESH_BTN_LOADING_HTML =
    '<i class="fa-solid fa-spinner fa-spin staff-refresh-btn__icon" aria-hidden="true"></i>' +
    '<span class="staff-refresh-btn__label">Refreshing...</span>';

const STAFF_REFRESH_SUCCESS_MESSAGE = '✅ Staff panel and metrics refreshed successfully!';

let staffRefreshInFlight = false;

function setStaffRefreshLoading(loading) {
    const btn = document.getElementById('staffRefreshBtn');
    if (!btn) return;

    btn.disabled = loading;
    btn.setAttribute('aria-busy', loading ? 'true' : 'false');
    btn.classList.toggle('is-refreshing', loading);
    btn.innerHTML = loading ? STAFF_REFRESH_BTN_LOADING_HTML : STAFF_REFRESH_BTN_IDLE_HTML;
}

function showStaffRefreshSuccessToast() {
    if (typeof window.showToast === 'function') {
        window.showToast(STAFF_REFRESH_SUCCESS_MESSAGE, 'success', 3000);
        return;
    }
    notify(STAFF_REFRESH_SUCCESS_MESSAGE, 'success');
}

/**
 * Refresh button handler — reloads metrics + table via GET /api/admin/staff.
 * Falls back to a full page reload if the API is unreachable.
 */
async function refreshStaffData() {
    if (staffRefreshInFlight) return;
    staffRefreshInFlight = true;
    setStaffRefreshLoading(true);

    try {
        if (!currentAdmin) {
            await loadCurrentAdmin();
        }

        if (!isSuperAdmin()) {
            notify('Only Super Admins can refresh staff data.', 'warning');
            return;
        }

        const ok = await fetchStaffAccounts({
            bustCache: true,
            showTableLoading: true,
            suppressErrorToast: true
        });

        if (!ok) {
            notify('Staff API unavailable — please try again in a moment.', 'warning');
            return;
        }

        showStaffRefreshSuccessToast();
    } catch (error) {
        console.error('Staff refresh failed:', error);
        notify(error.message || 'Could not refresh staff data.', 'error');
    } finally {
        staffRefreshInFlight = false;
        setStaffRefreshLoading(false);
    }
}
window.refreshStaffData = refreshStaffData;

function setupStaffRefreshButton() {
    const btn = document.getElementById('staffRefreshBtn');
    if (!btn || btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', () => refreshStaffData());
}

/**
 * Entry point used by the sidebar router (admin.js refreshMap) and the
 * Refresh button.
 */
async function loadStaffSection() {
    if (!currentAdmin) {
        try {
            await loadCurrentAdmin();
        } catch (error) {
            console.error('Staff section bootstrap failed:', error);
            return;
        }
    }

    if (!isSuperAdmin()) return;

    await fetchStaffAccounts();
    await refreshStaffAssignCandidates();
}
window.loadStaffSection = loadStaffSection;
window.applySuperAdminOnlyVisibility = applySuperAdminOnlyVisibility;
window.isAdminSuperAdmin = isSuperAdmin;
window.hasAdminPermission = hasPermission;
window.waitForAdminPermissions = waitForAdminPermissions;
window.getCurrentAdminProfile = () => currentAdmin;

function normalizeAssignEmployee(row) {
    if (!row || typeof row !== 'object') return null;
    const id = row._id || row.id;
    if (!id) return null;
    const empCode = row.employeeId || row.empCode || row.empId || '';
    return {
        ...row,
        _id: id,
        employeeId: empCode,
        empCode
    };
}

function employeeMatchesQuery(employee, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return false;
    const hay = [
        employee.fullName,
        employee.employeeId,
        employee.empCode,
        employee.empId,
        employee.phone,
        employee.department
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
}

async function loadAssignEmployees() {
    const token = staffToken();
    const headers = { Authorization: `Bearer ${token || ''}` };

    try {
        let res = await fetch('/api/admin/hrm/employees?hasAccess=false&all=true&assignable=true', { headers });
        let data = await res.json().catch(() => ({}));

        let list = Array.isArray(data.data)
            ? data.data
            : (Array.isArray(data.employees) ? data.employees : []);

        if ((!list.length || !res.ok) && token) {
            res = await fetch('/api/admin/hrm/employees?all=true', { headers });
            data = await res.json().catch(() => ({}));
            const all = Array.isArray(data.data) ? data.data : (Array.isArray(data.employees) ? data.employees : []);
            list = all.filter((row) => !row.linkedAdminId);
        }

        staffAssignCandidates = list.map(normalizeAssignEmployee).filter(Boolean);
    } catch (error) {
        console.error('loadAssignEmployees:', error);
        staffAssignCandidates = [];
    }

    return staffAssignCandidates;
}

async function refreshStaffAssignCandidates() {
    return loadAssignEmployees();
}
window.refreshStaffAssignCandidates = refreshStaffAssignCandidates;

/* ==========================================================================
   ASSIGN ACCESS MODAL
   ========================================================================== */

function suggestUsernameFromName(fullName) {
    const first = String(fullName || '').trim().split(/\s+/).filter(Boolean)[0] || '';
    return first.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function loadAssignPermissions(force = false) {
    if (!force && permissionCatalog.length) return permissionCatalog;

    try {
        const res = await fetch('/api/admin/permissions', {
            headers: { Authorization: `Bearer ${staffToken() || ''}` }
        });
        const data = await res.json().catch(() => ({}));
        console.log('[DEBUG permissions raw]', JSON.stringify(data));
        permissionCatalog = normalizePermissionsList(data).filter(isValidPermissionEntry);
        if (!sectionPermissionMap || !Object.keys(sectionPermissionMap).length) {
            sectionPermissionMap = data.sectionPermissions || sectionPermissionMap;
        }
        if (data.permissionImplications && typeof data.permissionImplications === 'object') {
            permissionImplications = data.permissionImplications;
        }
        return permissionCatalog;
    } catch (error) {
        console.error('loadAssignPermissions:', error);
        permissionCatalog = [];
        return [];
    }
}

async function ensureStaffPermissionCatalog(force = false) {
    const catalog = await loadAssignPermissions(force);
    return catalog.length > 0;
}

function isValidPermissionEntry(p) {
    return Boolean(
        p !== null
        && p !== undefined
        && typeof p === 'object'
        && typeof p.key === 'string'
        && p.key.length > 0
        && !p.key.includes(' ')
        && typeof p.label === 'string'
        && p.label.length > 0
        && typeof p.group === 'string'
        && p.group.length > 0
    );
}

function normalizePermissionsList(rawData) {
    if (Array.isArray(rawData)) {
        return rawData.filter(isValidPermissionEntry);
    }
    if (Array.isArray(rawData?.permissions)) {
        return rawData.permissions.filter(isValidPermissionEntry);
    }
    if (rawData?.groups && typeof rawData.groups === 'object') {
        return Object.values(rawData.groups)
            .flatMap((arr) => (Array.isArray(arr) ? arr : []))
            .filter(isValidPermissionEntry);
    }
    return [];
}

function renderAssignPermissions(rawData, activeKeys = []) {
    let perms = normalizePermissionsList(rawData);
    if (!perms.length && Array.isArray(rawData)) {
        perms = rawData.filter(isValidPermissionEntry);
    }

    // Remove non-permission objects (e.g. { sectionPermissions: {...} } metadata)
    perms = perms.filter((p) =>
        p !== null
        && p !== undefined
        && typeof p === 'object'
        && typeof p.key === 'string'
        && p.key.length > 0
        && !p.key.includes(' ')
        && typeof p.label === 'string'
        && p.label.length > 0
        && typeof p.group === 'string'
        && p.group.length > 0
    );

    console.log('[PERMS-FILTER] after filter:', perms.length, 'items');
    console.log('[PERMS-FILTER] first item:', perms[0]);

    perms = perms.map((p) => ({
        ...p,
        group: String(p.group).trim()
    }));

    const grouped = {};
    perms.forEach((p) => {
        const g = (p.group && String(p.group).trim()) || 'General';
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push(p);
    });

    const container = document.getElementById('permissionsGrid');
    if (!container) {
        console.error('[PERMS] #permissionsGrid not found in DOM');
        return;
    }

    if (!perms.length) {
        container.innerHTML = '<p style="color:#9ca3af;padding:1rem;text-align:center">No permissions available</p>';
        return;
    }

    permissionCatalog = perms;

    const groupIcons = {
        Insights: '📊',
        Analytics: '📊',
        Operations: '⚙️',
        Administration: '🔧',
        Attendance: '📋',
        HRM: '👥',
        Inventory: '📦',
        Orders: '🛒',
        Finance: '💰',
        CMS: '📝',
        Settings: '🔧',
        General: '🔑',
        Marketing: '📣',
        Accounts: '💰',
        Customers: '👤'
    };

    let html = '';
    Object.entries(grouped).forEach(([groupName, items]) => {
        const icon = groupIcons[groupName] || '🔑';
        html += `
        <div class="perm-group-block">
          <div class="perm-group-header">
            <span>${icon}</span>
            <span>${escapeHtml(groupName)}</span>
            <label class="perm-select-all">
              <input type="checkbox" class="group-select-all" data-group="${escapeHtml(groupName)}">
              <span>All</span>
            </label>
          </div>
          <div class="perm-items-list">`;

        items.forEach((p) => {
            const isOn = activeKeys.includes(p.key);
            html += `
            <div class="perm-row">
              <div class="perm-row-text">
                <span class="perm-row-label">${escapeHtml(p.label)}</span>
                <span class="perm-row-desc">${escapeHtml(p.description || '')}</span>
              </div>
              <div class="perm-toggle ${isOn ? 'on' : ''}" data-key="${escapeHtml(p.key)}"></div>
            </div>`;
        });

        html += `
          </div>
        </div>`;
    });

    container.innerHTML = html;

    container.querySelectorAll('.perm-toggle').forEach((t) => {
        t.addEventListener('click', () => {
            t.classList.toggle('on');
            const block = t.closest('.perm-group-block');
            if (!block) return;
            const total = block.querySelectorAll('.perm-toggle').length;
            const onCount = block.querySelectorAll('.perm-toggle.on').length;
            const cb = block.querySelector('.group-select-all');
            if (cb) cb.checked = total === onCount;
            clearPresetHighlight(container);
        });
    });

    container.querySelectorAll('.group-select-all').forEach((cb) => {
        cb.addEventListener('change', () => {
            const block = cb.closest('.perm-group-block');
            if (!block) return;
            block.querySelectorAll('.perm-toggle').forEach((toggle) => {
                toggle.classList.toggle('on', cb.checked);
            });
            clearPresetHighlight(container);
        });
    });

    console.log('[PERMS-ASSIGN] rendered groups:',
        Object.keys(grouped),
        'total items:', perms.length,
        'container children:', container.children.length
    );
}

function getSelectedPermissions() {
    return Array.from(
        document.querySelectorAll('#permissionsGrid .perm-toggle.on')
    ).map((t) => t.dataset.key).filter(Boolean);
}
window.getSelectedPermissions = getSelectedPermissions;

function renderStaffAssignPermissionGrid(selectedKeys = [], errorMessage = '') {
    const grid = document.getElementById('permissionsGrid');
    if (!grid) return;

    if (errorMessage) {
        grid.innerHTML = `<p class="table-status-error">${escapeHtml(errorMessage)}</p>`;
        return;
    }

    renderAssignPermissions(permissionCatalog, selectedKeys);
    setupPermissionPresets(document.querySelector('[data-permission-presets="assign"]'), grid);
}

function hideStaffAssignDropdown() {
    const dropdown = document.getElementById('staffAssignEmployeeDropdown');
    if (dropdown) {
        dropdown.classList.add('hidden');
        dropdown.hidden = true;
    }
}

function showStaffAssignDropdown() {
    const dropdown = document.getElementById('staffAssignEmployeeDropdown');
    if (dropdown) {
        dropdown.classList.remove('hidden');
        dropdown.hidden = false;
    }
}

function renderStaffAssignDropdown(filter = '') {
    const dropdown = document.getElementById('staffAssignEmployeeDropdown');
    if (!dropdown) return;

    const needle = String(filter || '').trim();
    if (!needle) {
        hideStaffAssignDropdown();
        return;
    }

    if (!staffAssignCandidates.length) {
        dropdown.innerHTML = '<p class="emp-no-results">No employees available — all may already have access.</p>';
        showStaffAssignDropdown();
        return;
    }

    const matches = staffAssignCandidates
        .filter((e) => employeeMatchesQuery(e, needle))
        .slice(0, 12);

    if (!matches.length) {
        dropdown.innerHTML = '<p class="emp-no-results">No results found</p>';
        showStaffAssignDropdown();
        return;
    }

    dropdown.innerHTML = matches.map((e) => {
        const initial = String(e.fullName || '?').charAt(0).toUpperCase();
        const code = e.employeeId || e.empCode || 'EMP';
        return `
        <button type="button" class="emp-option"
                data-employee-id="${escapeHtml(e._id)}"
                data-name="${escapeHtml(e.fullName || '')}"
                data-code="${escapeHtml(code)}">
            <span class="emp-avatar">
                ${e.photo
                    ? `<img src="${escapeHtml(e.photo)}" alt="">`
                    : escapeHtml(initial)}
            </span>
            <span class="emp-info">
                <strong>${escapeHtml(e.fullName)}</strong>
                <small>${escapeHtml(code)} · ${escapeHtml(e.department || 'Operations')}</small>
            </span>
        </button>`;
    }).join('');

    dropdown.querySelectorAll('.emp-option').forEach((btn) => {
        btn.addEventListener('click', () => {
            selectStaffAssignEmployee(
                btn.getAttribute('data-employee-id'),
                btn.getAttribute('data-name'),
                btn.getAttribute('data-code')
            );
        });
    });
    showStaffAssignDropdown();
}

function selectStaffAssignEmployee(employeeId, name, code) {
    const employee = staffAssignCandidates.find((e) => String(e._id) === String(employeeId));
    const fullName = name || employee?.fullName || '';
    const empCode = code || employee?.employeeId || employee?.empCode || 'EMP';
    if (!employeeId || !fullName) return;

    staffAssignSelectedEmployee = employee || { _id: employeeId, fullName, employeeId: empCode };
    document.getElementById('staffAssignEmpId').value = employeeId;

    const searchInput = document.getElementById('empSearchInput');
    const clearBtn = document.getElementById('empSearchClear');
    if (searchInput) {
        searchInput.value = `${fullName} · ${empCode}`;
        searchInput.classList.remove('is-invalid');
    }
    if (clearBtn) clearBtn.style.display = 'block';

    document.getElementById('staffAssignSelectedHint').textContent = `Selected: ${fullName} · ${empCode} · ${employee?.department || 'Operations'}`;

    const usernameInput = document.getElementById('staffAssignUsername');
    if (usernameInput) {
        usernameInput.value = suggestUsernameFromName(fullName);
        usernameInput.placeholder = 'e.g. john-doe';
        usernameInput.classList.remove('is-invalid');
    }

    const err = document.getElementById('staffAssignEmployeeError');
    if (err) err.hidden = true;

    hideStaffAssignDropdown();
}

function resetAssignModal() {
    staffAssignSelectedEmployee = null;
    staffAssignSubmitInFlight = false;

    document.getElementById('staffAssignEmpId').value = '';

    const searchInput = document.getElementById('empSearchInput');
    const clearBtn = document.getElementById('empSearchClear');
    if (searchInput) {
        searchInput.value = '';
        searchInput.classList.remove('is-invalid');
    }
    if (clearBtn) clearBtn.style.display = 'none';

    const usernameInput = document.getElementById('staffAssignUsername');
    if (usernameInput) {
        usernameInput.value = '';
        usernameInput.placeholder = 'e.g. john-doe';
        usernameInput.classList.remove('is-invalid');
    }

    const passwordInput = document.getElementById('staffAssignPassword');
    const confirmInput = document.getElementById('staffAssignConfirmPassword');
    if (passwordInput) {
        passwordInput.value = '';
        passwordInput.classList.remove('is-invalid');
    }
    if (confirmInput) {
        confirmInput.value = '';
        confirmInput.classList.remove('is-invalid');
    }

    clearStaffAssignFieldErrors();
    hideStaffAssignDropdown();

    document.getElementById('staffAssignSelectedHint').textContent = 'Only employees without linked admin access are listed.';

    document.querySelectorAll('[data-permission-presets="assign"] .staff-preset-btn').forEach((btn) => {
        btn.classList.remove('is-active');
    });

    document.querySelectorAll('#permissionsGrid .perm-toggle.on').forEach((t) => {
        t.classList.remove('on');
    });
    document.querySelectorAll('#permissionsGrid .group-select-all').forEach((cb) => {
        cb.checked = false;
    });
}

async function openStaffAssignModal(prefillEmployee = null) {
    resetAssignModal();

    if (prefillEmployee) {
        staffAssignSelectedEmployee = prefillEmployee;
        document.getElementById('staffAssignEmpId').value = prefillEmployee._id || '';
        const prefillSearch = document.getElementById('empSearchInput');
        if (prefillSearch) prefillSearch.value = `${prefillEmployee.fullName} · ${prefillEmployee.employeeId || 'EMP'}`;
        document.getElementById('staffAssignUsername').value = suggestUsernameFromName(prefillEmployee.fullName);
        document.getElementById('staffAssignSelectedHint').textContent = `Linking access for ${prefillEmployee.fullName}`;
        const employeeField = document.getElementById('staffAssignEmployeeField');
        if (employeeField) employeeField.hidden = true;
    } else {
        const employeeField = document.getElementById('staffAssignEmployeeField');
        if (employeeField) employeeField.hidden = false;
        await loadAssignEmployees();
    }

    const catalog = await loadAssignPermissions(true);
    const catalogOk = catalog.length > 0;
    if (catalogOk) {
        renderAssignPermissions(catalog, []);
        setupPermissionPresets(document.querySelector('[data-permission-presets="assign"]'), document.getElementById('permissionsGrid'));
    } else {
        renderStaffAssignPermissionGrid([], 'Could not load permissions. Check your connection and try again.');
    }

    const submitBtn = document.getElementById('staffAssignSubmitBtn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-link"></i> Link Account →';
    }

    const modal = document.getElementById('staffAssignAccessModal');
    if (!modal) {
        notify('Assign access modal is not available on this page.', 'warning');
        return;
    }

    modal.style.display = 'flex';
}

window.openStaffAssignModalForEmployee = async function openStaffAssignModalForEmployee(employeeId, name, employeeCode, email, phone) {
    await openStaffAssignModal({
        _id: employeeId,
        fullName: name,
        employeeId: employeeCode || '',
        email: email || '',
        phone: phone || ''
    });
};

function closeStaffAssignModal() {
    const modal = document.getElementById('staffAssignAccessModal');
    if (modal) modal.style.display = 'none';
    const dropdown = document.getElementById('staffAssignEmployeeDropdown');
    if (dropdown) dropdown.hidden = true;
}
window.closeStaffAssignModal = closeStaffAssignModal;

function validateStaffAssignForm() {
    clearStaffAssignFieldErrors();
    let valid = true;

    const employeeId = document.getElementById('staffAssignEmpId').value;
    const username = document.getElementById('staffAssignUsername').value.trim();
    const password = document.getElementById('staffAssignPassword').value;
    const confirmPwd = document.getElementById('staffAssignConfirmPassword').value;
    const grid = document.getElementById('permissionsGrid');
    const selectedPerms = getSelectedPermissions();
    const permissions = selectedPerms.length ? selectedPerms : readSelectedPermissions(grid);

    if (!employeeId) {
        showStaffAssignFieldError('empSearchInput', 'Select an employee from the list.');
        valid = false;
    }
    if (!username) {
        showStaffAssignFieldError('staffAssignUsername', 'Username is required.');
        valid = false;
    }
    if (!password || password.length < 8) {
        showStaffAssignFieldError('staffAssignPassword', 'Password must be at least 8 characters.');
        valid = false;
    }
    if (password !== confirmPwd) {
        showStaffAssignFieldError('staffAssignConfirmPassword', 'Passwords must match.');
        valid = false;
    }
    if (!permissions.length) {
        showStaffAssignFieldError('permissionsGrid', 'Select at least one permission.');
        valid = false;
    }

    return { valid, employeeId, username, password, permissions };
}

async function submitStaffAssignAccess(event) {
    event.preventDefault();
    if (staffAssignSubmitInFlight) return;

    const validation = validateStaffAssignForm();
    if (!validation.valid) return;

    const { employeeId, username, password, permissions } = validation;
    const submitBtn = document.getElementById('staffAssignSubmitBtn');
    const employeeName = staffAssignSelectedEmployee?.fullName || username;

    staffAssignSubmitInFlight = true;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Linking…';
    }

    try {
        const response = await fetch(`/api/admin/hrm/employees/${employeeId}/grant-access`, {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({ username, password, permissions })
        });
        const data = await response.json().catch(() => ({}));

        if (response.status === 409 || (data.error && /already granted/i.test(String(data.error)))) {
            notify('ℹ️ Already has access', 'info');
            closeStaffAssignModal();
            await fetchStaffAccounts({ showTableLoading: false, suppressErrorToast: true });
            await refreshStaffAssignCandidates();
            return;
        }

        if (!response.ok || data.success === false) {
            const formError = document.getElementById('staffAssignFormError');
            if (formError) {
                formError.textContent = data.error || data.message || 'Failed to grant access.';
                formError.hidden = false;
            }
            notify(data.error || data.message || 'Failed to grant access.', 'error');
            return;
        }

        notify(`✅ Access granted to ${employeeName}`, 'success');
        closeStaffAssignModal();
        await fetchStaffAccounts({ showTableLoading: false });
        await refreshStaffAssignCandidates();
    } catch (error) {
        const formError = document.getElementById('staffAssignFormError');
        if (formError) {
            formError.textContent = error.message || 'Failed to link system account.';
            formError.hidden = false;
        }
        notify(error.message || 'Failed to link system account.', 'error');
    } finally {
        staffAssignSubmitInFlight = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-link"></i> Link Account →';
        }
    }
}

function setupStaffAssignModal() {
    const assignBtn = document.getElementById('staffAssignAccessBtn');
    const form = document.getElementById('staffAssignAccessForm');
    const searchInput = document.getElementById('empSearchInput');
    const clearBtn = document.getElementById('empSearchClear');
    const usernameInput = document.getElementById('staffAssignUsername');
    const debouncedSearch = debounce((value) => renderStaffAssignDropdown(value), 300);

    assignBtn?.addEventListener('click', () => openStaffAssignModal());
    form?.addEventListener('submit', submitStaffAssignAccess);

    searchInput?.addEventListener('focus', () => {
        if (searchInput.value.trim()) renderStaffAssignDropdown(searchInput.value);
    });
    searchInput?.addEventListener('input', () => {
        if (clearBtn) clearBtn.style.display = searchInput.value ? 'block' : 'none';
        staffAssignSelectedEmployee = null;
        document.getElementById('staffAssignEmpId').value = '';
        if (usernameInput) usernameInput.value = '';
        debouncedSearch(searchInput.value);
    });

    clearBtn?.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        hideStaffAssignDropdown();
        staffAssignSelectedEmployee = null;
        document.getElementById('staffAssignEmpId').value = '';
        if (usernameInput) {
            usernameInput.value = '';
            usernameInput.placeholder = 'e.g. john-doe';
        }
    });

    document.querySelectorAll('.staff-password-toggle').forEach((btn) => {
        btn.addEventListener('click', () => togglePasswordVisibility(btn));
    });

    const passwordInput = document.getElementById('staffAssignPassword');
    const confirmInput = document.getElementById('staffAssignConfirmPassword');
    const validatePasswordMatch = () => {
        if (!confirmInput?.value) return;
        const err = document.getElementById('staffAssignConfirmError');
        if (passwordInput.value !== confirmInput.value) {
            confirmInput.classList.add('is-invalid');
            if (err) {
                err.textContent = 'Passwords must match.';
                err.hidden = false;
            }
        } else {
            confirmInput.classList.remove('is-invalid');
            if (err) err.hidden = true;
        }
    };
    passwordInput?.addEventListener('input', validatePasswordMatch);
    confirmInput?.addEventListener('input', validatePasswordMatch);

    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('staffAssignEmployeeDropdown');
        if (!dropdown || dropdown.hidden) return;
        if (e.target.closest('.emp-search-wrap')) return;
        hideStaffAssignDropdown();
    });
}

async function cleanupOrphanStaffRecords() {
    try {
        const res = await fetch('/api/admin/staff/cleanup-orphans', {
            method: 'POST',
            headers: authHeaders(false)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
            throw new Error(data.message || 'Cleanup failed.');
        }
        notify(data.message || 'Orphan records fixed.', 'success');
        await fetchStaffAccounts({ showTableLoading: false });
        await refreshStaffAssignCandidates();
    } catch (error) {
        notify(error.message || 'Could not fix orphan records.', 'error');
    }
}
window.cleanupOrphanStaffRecords = cleanupOrphanStaffRecords;

function setupCleanupOrphansButton() {
    const btn = document.getElementById('cleanupOrphansBtn');
    if (!btn || btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', () => cleanupOrphanStaffRecords());
}

/* ==========================================================================
   EDIT / STATUS / RESET / DELETE
   ========================================================================== */

window.openStaffEditModal = async function openStaffEditModal(staffId) {
    let staff = staffAccounts.find(s => String(s.id) === String(staffId));
    if (!staff) {
        await fetchStaffAccounts({ showTableLoading: false, suppressErrorToast: true });
        staff = staffAccounts.find(s => String(s.id) === String(staffId));
    }
    if (!staff) return notify('Staff account not found. Try refreshing.', 'error');

    document.getElementById('editStaffId').value = staff.id;
    const roleBadge = deriveStaffRoleBadge(staff);
    const titleEl = document.getElementById('staffEditPermissionsTitle');
    const subtitleEl = document.getElementById('staffEditPermissionsSubtitle');
    const roleEl = document.getElementById('staffEditRoleLabel');
    const empCode = staff.linkedEmployeeCode || staff.employeeId || staff.username;

    if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-user-pen"></i> Edit Permissions: ${escapeHtml(staff.name || staff.username)}`;
    if (subtitleEl) subtitleEl.textContent = `${empCode} · changes apply on next login`;
    if (roleEl) roleEl.textContent = roleBadge.label;

    const grid = document.getElementById('editStaffPermissionGrid');
    renderPermissionCheckboxes(grid, staff.permissions || []);
    setupPermissionPresets(document.querySelector('[data-permission-presets="edit"]'), grid);

    document.getElementById('staffEditPermissionsModal').style.display = 'flex';
};

function closeStaffEditModal() {
    const modal = document.getElementById('staffEditPermissionsModal');
    if (modal) modal.style.display = 'none';
}

window.closeStaffEditModal = closeStaffEditModal;
window.closeStaffPermissionsPanel = closeStaffEditModal;

window.showStaffPermissionDetail = function showStaffPermissionDetail(staffId) {
    const staff = staffAccounts.find(s => String(s.id) === String(staffId));
    if (!staff) return;

    const list = document.getElementById('staffPermissionDetailList');
    const title = document.getElementById('staffPermissionDetailTitle');
    if (title) title.textContent = `${staff.name || staff.username} — Permissions`;
    if (list) {
        const perms = staff.permissions || [];
        list.innerHTML = perms.length
            ? perms.map((key) => `<li>${escapeHtml(permissionLabel(key))}</li>`).join('')
            : '<li class="empty-hint">No permissions assigned</li>';
    }
    document.getElementById('staffPermissionDetailModal').style.display = 'flex';
};

window.closeStaffPermissionDetail = function closeStaffPermissionDetail() {
    const modal = document.getElementById('staffPermissionDetailModal');
    if (modal) modal.style.display = 'none';
};

function setupEditStaffForm() {
    const form = document.getElementById('editStaffForm');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const grid = document.getElementById('editStaffPermissionGrid');
        const staffId = document.getElementById('editStaffId').value;
        const permissions = readSelectedPermissions(grid);
        const saveBtn = document.getElementById('staffEditSaveBtn');

        if (permissions.length === 0) {
            return notify('A staff member must keep at least one permission.', 'warning');
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
        }

        try {
            const result = await staffApi(`/api/admin/staff/${staffId}/permissions`, {
                method: 'PUT',
                body: JSON.stringify({ permissions })
            });

            notify(result.message || 'Permissions updated.', 'success');
            closeStaffEditModal();
            await fetchStaffAccounts({ showTableLoading: false });
        } catch (error) {
            notify(error.message, 'error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Permissions';
            }
        }
    });
}

window.toggleStaffStatus = function toggleStaffStatus(staffId) {
    const staff = staffAccounts.find(s => String(s.id) === String(staffId));
    if (!staff) return notify('Staff account not found. Try refreshing.', 'error');

    const blocking = staff.status !== 'blocked';

    confirmAction(
        blocking ? 'Block Staff Account' : 'Activate Staff Account',
        blocking
            ? `Block "${staff.username}"? They will be signed out of every device immediately and cannot log back in.`
            : `Restore access for "${staff.username}"? They will be able to sign in again with their existing password.`,
        async () => {
            try {
                const result = await staffApi(`/api/admin/staff/${staffId}/status`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: blocking ? 'blocked' : 'active' })
                });
                notify(result.message, 'success');
                await fetchStaffAccounts();
            } catch (error) {
                notify(error.message, 'error');
            }
        },
        blocking ? 'warning' : 'question'
    );
};

window.resetStaffPassword = function resetStaffPassword(staffId) {
    const staff = staffAccounts.find(s => String(s.id) === String(staffId));
    if (!staff) return notify('Staff account not found. Try refreshing.', 'error');

    const applyReset = async (newPassword) => {
        try {
            const result = await staffApi(`/api/admin/staff/${staffId}/reset-password`, {
                method: 'POST',
                body: JSON.stringify(newPassword ? { newPassword } : {})
            });

            if (result.generatedPassword && typeof Swal !== 'undefined') {
                await Swal.fire({
                    icon: 'success',
                    title: 'Password reset',
                    html: `Share this one-time password with <strong>${escapeHtml(staff.username)}</strong>:
                           <br><code style="display:inline-block;margin-top:12px;padding:8px 14px;border-radius:6px;background:#0f172a;color:#38bdf8;font-size:15px;">${escapeHtml(result.generatedPassword)}</code>
                           <br><small>It will not be shown again.</small>`,
                    confirmButtonText: 'Copied it'
                });
            } else {
                notify(result.message, 'success');
            }

            await fetchStaffAccounts();
        } catch (error) {
            notify(error.message, 'error');
        }
    };

    if (typeof Swal === 'undefined') {
        const manual = window.prompt(`New password for ${staff.username} (leave blank to auto-generate):`, '');
        if (manual === null) return;
        return applyReset(manual.trim());
    }

    Swal.fire({
        title: `Reset password — ${staff.username}`,
        input: 'text',
        inputPlaceholder: 'Leave blank to generate a strong password',
        inputAttributes: { autocapitalize: 'off', autocomplete: 'new-password' },
        text: 'All of their active sessions will be signed out.',
        showCancelButton: true,
        confirmButtonText: 'Reset Password',
        confirmButtonColor: '#3b82f6'
    }).then(result => {
        if (!result.isConfirmed) return;
        applyReset(String(result.value || '').trim());
    });
};

window.revokeStaffAccess = function revokeStaffAccess(staffId) {
    const staff = staffAccounts.find(s => String(s.id) === String(staffId));
    if (!staff) return notify('Staff account not found. Try refreshing.', 'error');

    confirmAction(
        'Revoke System Access',
        `Remove admin access for ${staff.name || staff.username}? They will be logged out immediately.`,
        async () => {
            try {
                const result = await staffApi(`/api/admin/staff/${staffId}/access`, { method: 'DELETE' });
                notify(result.message, 'success');
                await fetchStaffAccounts();
                await refreshStaffAssignCandidates();
            } catch (error) {
                notify(error.message, 'error');
            }
        },
        'warning'
    );
};

window.deleteStaffAccount = function deleteStaffAccount(staffId) {
    const staff = staffAccounts.find(s => String(s.id) === String(staffId));
    if (!staff) return notify('Staff account not found. Try refreshing.', 'error');

    confirmAction(
        'Delete Staff Account',
        `Permanently delete "${staff.username}"? The record and all of their access will be removed. This cannot be undone.`,
        async () => {
            try {
                const result = await staffApi(`/api/admin/staff/${staffId}`, { method: 'DELETE' });
                notify(result.message, 'success');
                await fetchStaffAccounts();
            } catch (error) {
                notify(error.message, 'error');
            }
        },
        'warning'
    );
};

/* ==========================================================================
   BOOT
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
    if (!staffToken()) return;

    try {
        await loadCurrentAdmin();
    } catch (error) {
        // A blocked or deleted account lands here — verifyAdmin already told the
        // browser where to go, so honour the redirect instead of showing a panel.
        const redirect = error.payload && error.payload.redirect;
        if (error.status === 401 || error.status === 403) {
            localStorage.removeItem('adminToken');
            window.location.replace(redirect || '/admin-login');
            return;
        }
        if (error.status === 429) {
            notify('Too many requests — please wait a moment and try again.', 'warning');
            return;
        }
        console.error('RBAC bootstrap failed:', error);
        return;
    }

    applyRoleToSidebar();
    if (typeof window.loadAdminSidebarProfile === 'function') {
        await window.loadAdminSidebarProfile(true);
    }
    if (typeof window.applyDashboardWidgetPermissions === 'function') {
        window.applyDashboardWidgetPermissions();
    }
    setupStaffAssignModal();
    setupEditStaffForm();
    setupStaffRefreshButton();
    setupCleanupOrphansButton();

    if (isSuperAdmin()) {
        if (typeof window.loadSandboxStatus === 'function') {
            window.loadSandboxStatus();
        }
        if (typeof window.loadSidebarLabels === 'function') {
            window.loadSidebarLabels(true);
        }
    }
});







