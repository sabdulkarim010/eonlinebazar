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
    return Array.isArray(currentAdmin?.permissions) && currentAdmin.permissions.includes(permission);
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
    Orders: '🛒'
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
}

/**
 * Hide the sidebar entries (and collapse empty groups) that the signed-in
 * account has no permission for, then make sure the visible section is one
 * they are allowed to see.
 */
function applyRoleToSidebar() {
    const nav = document.querySelector('.sidebar-menu');
    if (!nav) return;

    applySuperAdminOnlyVisibility();

    nav.querySelectorAll('li[data-target]').forEach(item => {
        if (item.dataset.superadminOnly === 'true') return;

        const required = sectionPermissionMap[item.getAttribute('data-target')];
        item.style.display = hasPermission(required) ? '' : 'none';
    });

    // A collapsible group with nothing left inside it is just noise.
    nav.querySelectorAll('li.menu-group').forEach(group => {
        const visibleChildren = [...group.querySelectorAll('li[data-target]')]
            .filter(child => child.style.display !== 'none');
        group.style.display = visibleChildren.length ? '' : 'none';
    });

    // Any element can opt into permission gating with data-permission="key"
    // (settings cards, the finance shortcut, action buttons, …).
    document.querySelectorAll('[data-permission]').forEach(el => {
        el.style.display = hasPermission(el.dataset.permission) ? '' : 'none';
    });

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
        staffAssignEmployeeSearch: 'staffAssignEmployeeError',
        staffAssignUsername: 'staffAssignUsernameError',
        staffAssignPassword: 'staffAssignPasswordError',
        staffAssignConfirmPassword: 'staffAssignConfirmError',
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
                        <input type="checkbox" class="permission-toggle-input" data-module="${module.id}" value="${escapeHtml(permission.key)}" ${selected.has(permission.key) ? 'checked' : ''} tabindex="-1" aria-hidden="true">
                        <div class="perm-toggle ${selected.has(permission.key) ? 'on' : ''}" role="switch" aria-checked="${selected.has(permission.key) ? 'true' : 'false'}" tabindex="0" aria-label="${escapeHtml(permission.label)}"></div>
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
    return [...container.querySelectorAll('.permission-toggle-input:checked')].map(box => box.value);
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
    setPermissionKeys(container, resolvePresetKeys(presetKey));

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
    if (!presetsBar || !grid || presetsBar.dataset.bound === 'true') return;
    presetsBar.dataset.bound = 'true';

    presetsBar.querySelectorAll('.staff-preset-btn').forEach(btn => {
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
                <td>
                    <div class="staff-actions staff-actions--directory">
                        <button type="button" class="action-btn edit" title="Edit permissions"
                            onclick="openStaffEditModal('${staff.id}')"><i class="fa-solid fa-pen"></i> Edit Permissions</button>
                        <button type="button" class="action-btn ${blocked ? 'activate' : 'block'}"
                            title="${blocked ? 'Activate account' : 'Suspend account'}"
                            onclick="toggleStaffStatus('${staff.id}')">
                            <i class="fa-solid ${blocked ? 'fa-play' : 'fa-pause'}"></i> ${blocked ? 'Activate' : 'Suspend'}
                        </button>
                        <button type="button" class="action-btn delete" title="Revoke access"
                            onclick="revokeStaffAccess('${staff.id}')"><i class="fa-solid fa-user-slash"></i> Revoke</button>
                    </div>
                </td>
            </tr>`;
    }).join('');
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

async function refreshStaffAssignCandidates() {
    try {
        const result = await staffApi('/api/admin/hrm/employees?hasAccess=false&all=true');
        staffAssignCandidates = Array.isArray(result.data) ? result.data : [];
    } catch (error) {
        console.error('refreshStaffAssignCandidates:', error);
        staffAssignCandidates = [];
    }
}
window.refreshStaffAssignCandidates = refreshStaffAssignCandidates;

/* ==========================================================================
   ASSIGN ACCESS MODAL
   ========================================================================== */

function suggestUsernameFromName(fullName) {
    const first = String(fullName || '').trim().split(/\s+/).filter(Boolean)[0] || '';
    return first.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function ensureStaffPermissionCatalog() {
    if (permissionCatalog.length) return true;
    try {
        const result = await staffApi('/api/admin/permissions');
        permissionCatalog = result.permissions || [];
        return permissionCatalog.length > 0;
    } catch (error) {
        console.error('ensureStaffPermissionCatalog:', error);
        permissionCatalog = [];
        return false;
    }
}

function renderStaffAssignPermissionGrid(selectedKeys = [], errorMessage = '') {
    const grid = document.getElementById('staffAssignPermissionGrid');
    if (!grid) return;

    if (errorMessage) {
        grid.innerHTML = `<p class="table-status-error">${escapeHtml(errorMessage)}</p>`;
        return;
    }

    renderPermissionCheckboxes(grid, selectedKeys);
    setupPermissionPresets(document.querySelector('[data-permission-presets="assign"]'), grid);
}

function renderStaffAssignDropdown(filter = '') {
    const dropdown = document.getElementById('staffAssignEmployeeDropdown');
    if (!dropdown) return;

    const needle = String(filter || '').trim().toLowerCase();
    const matches = staffAssignCandidates.filter((e) => {
        if (!needle) return true;
        const hay = `${e.fullName} ${e.employeeId} ${e.phone || ''} ${e.department || ''}`.toLowerCase();
        return hay.includes(needle);
    }).slice(0, 12);

    if (!staffAssignCandidates.length) {
        dropdown.innerHTML = '<p class="staff-assign-dropdown-empty">No employees available — all may already have access.</p>';
        dropdown.hidden = false;
        return;
    }

    if (!matches.length) {
        dropdown.innerHTML = '<p class="staff-assign-dropdown-empty">No matching employees without access</p>';
        dropdown.hidden = false;
        return;
    }

    dropdown.innerHTML = matches.map((e) => `
        <button type="button" class="staff-assign-dropdown-item" data-employee-id="${escapeHtml(e._id)}">
            ${e.photo ? `<img src="${escapeHtml(e.photo)}" alt="" class="staff-assign-dropdown-photo">` : '<span class="staff-assign-dropdown-photo staff-assign-dropdown-photo--placeholder"><i class="fa-solid fa-user"></i></span>'}
            <span class="staff-assign-dropdown-copy">
                <strong>${escapeHtml(e.fullName)}</strong>
                <small>${escapeHtml(e.employeeId || 'EMP')} · ${escapeHtml(e.department || 'Operations')}</small>
            </span>
        </button>
    `).join('');

    dropdown.querySelectorAll('.staff-assign-dropdown-item').forEach((btn) => {
        btn.addEventListener('click', () => selectStaffAssignEmployee(btn.getAttribute('data-employee-id')));
    });
    dropdown.hidden = false;
}

function selectStaffAssignEmployee(employeeId) {
    const employee = staffAssignCandidates.find((e) => String(e._id) === String(employeeId));
    if (!employee) return;

    staffAssignSelectedEmployee = employee;
    document.getElementById('staffAssignEmpId').value = employee._id;
    document.getElementById('staffAssignEmployeeSearch').value = `${employee.fullName} · ${employee.employeeId || 'EMP'}`;
    document.getElementById('staffAssignSelectedHint').textContent = `Selected: ${employee.fullName} · ${employee.employeeId || 'EMP'} · ${employee.department || 'Operations'}`;

    const suggested = suggestUsernameFromName(employee.fullName);
    document.getElementById('staffAssignUsername').value = suggested;

    document.getElementById('staffAssignEmployeeSearch')?.classList.remove('is-invalid');
    document.getElementById('staffAssignEmployeeError').hidden = true;

    const dropdown = document.getElementById('staffAssignEmployeeDropdown');
    if (dropdown) dropdown.hidden = true;
}

async function openStaffAssignModal(prefillEmployee = null) {
    clearStaffAssignFieldErrors();
    staffAssignSelectedEmployee = prefillEmployee || null;
    document.getElementById('staffAssignEmpId').value = prefillEmployee?._id || '';
    document.getElementById('staffAssignEmployeeSearch').value = prefillEmployee
        ? `${prefillEmployee.fullName} · ${prefillEmployee.employeeId || 'EMP'}`
        : '';
    document.getElementById('staffAssignUsername').value = prefillEmployee
        ? suggestUsernameFromName(prefillEmployee.fullName)
        : '';
    document.getElementById('staffAssignPassword').value = '';
    document.getElementById('staffAssignConfirmPassword').value = '';

    const employeeField = document.getElementById('staffAssignEmployeeField');
    if (employeeField) {
        employeeField.hidden = !!prefillEmployee;
    }
    document.getElementById('staffAssignSelectedHint').textContent = prefillEmployee
        ? `Linking access for ${prefillEmployee.fullName}`
        : 'Only employees without linked admin access are listed.';

    if (!prefillEmployee) {
        await refreshStaffAssignCandidates();
    }

    const catalogOk = await ensureStaffPermissionCatalog();
    renderStaffAssignPermissionGrid([], catalogOk ? '' : 'Could not load permissions. Check your connection and try again.');

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
    const grid = document.getElementById('staffAssignPermissionGrid');
    const permissions = readSelectedPermissions(grid);

    if (!employeeId) {
        showStaffAssignFieldError('staffAssignEmployeeSearch', 'Select an employee from the list.');
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
        showStaffAssignFieldError('staffAssignPermissionGrid', 'Select at least one permission.');
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
    const searchInput = document.getElementById('staffAssignEmployeeSearch');
    const debouncedSearch = debounce((value) => renderStaffAssignDropdown(value), 300);

    assignBtn?.addEventListener('click', () => openStaffAssignModal());
    form?.addEventListener('submit', submitStaffAssignAccess);

    searchInput?.addEventListener('focus', () => renderStaffAssignDropdown(searchInput.value));
    searchInput?.addEventListener('input', () => {
        staffAssignSelectedEmployee = null;
        document.getElementById('staffAssignEmpId').value = '';
        debouncedSearch(searchInput.value);
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
        if (e.target.closest('.staff-assign-search-wrap')) return;
        dropdown.hidden = true;
    });
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
    if (typeof window.applyDashboardWidgetPermissions === 'function') {
        window.applyDashboardWidgetPermissions();
    }
    setupStaffAssignModal();
    setupEditStaffForm();
    setupStaffRefreshButton();

    if (isSuperAdmin()) {
        if (typeof window.loadSandboxStatus === 'function') {
            window.loadSandboxStatus();
        }
        if (typeof window.loadSidebarLabels === 'function') {
            window.loadSidebarLabels(true);
        }
    }
});







