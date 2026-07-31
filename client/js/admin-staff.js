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
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

/** Every staff API call shares the same auth header + error surfacing. */
async function staffApi(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${staffToken()}`,
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

/** Category metadata for the permissions matrix UI. */
const PERMISSION_GROUP_META = {
    Insights: { emoji: '📊', slug: 'insights' },
    Operations: { emoji: '🛒', slug: 'operations' },
    Administration: { emoji: '⚙️', slug: 'administration' },
    General: { emoji: '🔑', slug: 'general' }
};

/** One-click permission presets — keys must match config/permissions.js. */
const ROLE_PRESETS = {
    fullAdmin: null,
    inventoryManager: ['manage_inventory', 'manage_catalog'],
    customerSupport: ['manage_orders', 'manage_customers'],
    clear: []
};

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

    nav.querySelectorAll('li[data-superadmin-only="true"]').forEach(item => {
        item.style.display = isSuperAdmin() ? '' : 'none';
    });

    document.querySelectorAll('[data-superadmin-only="true"]').forEach(el => {
        if (el.tagName === 'LI' && el.closest('.sidebar-menu')) return;
        el.style.display = isSuperAdmin() ? '' : 'none';
    });

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
}

function renderPermissionCheckboxes(container, selectedKeys = []) {
    if (!container) return;

    if (permissionCatalog.length === 0) {
        container.innerHTML = '<p class="empty-hint">No permissions are defined on the server.</p>';
        return;
    }

    const selected = new Set(selectedKeys);
    const groups = permissionCatalog.reduce((acc, permission) => {
        const group = permission.group || 'General';
        (acc[group] = acc[group] || []).push(permission);
        return acc;
    }, {});

    container.innerHTML = Object.entries(groups).map(([group, items]) => {
        const meta = PERMISSION_GROUP_META[group] || PERMISSION_GROUP_META.General;
        return `
        <div class="permission-category-card permission-category-card--${meta.slug}">
            <div class="permission-category-header">
                <span class="permission-category-emoji" aria-hidden="true">${meta.emoji}</span>
                <span class="permission-category-title">${escapeHtml(group)}</span>
            </div>
            <div class="permission-category-items">
                ${items.map(permission => `
                    <label class="permission-toggle-row ${selected.has(permission.key) ? 'is-on' : ''}">
                        <span class="permission-toggle-main">
                            <span class="permission-toggle-icon"><i class="fa-solid ${escapeHtml(permission.icon || 'fa-key')}"></i></span>
                            <span class="permission-toggle-copy">
                                <strong>${escapeHtml(permission.label)}</strong>
                                <small>${escapeHtml(permission.description || '')}</small>
                            </span>
                        </span>
                        <span class="toggle-switch">
                            <input type="checkbox" class="toggle-switch-input permission-toggle-input" value="${escapeHtml(permission.key)}" ${selected.has(permission.key) ? 'checked' : ''}>
                            <span class="toggle-switch-slider" aria-hidden="true"></span>
                        </span>
                    </label>
                `).join('')}
            </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.permission-toggle-input').forEach(box => {
        box.addEventListener('change', () => {
            syncPermissionRowState(box);
            clearPresetHighlight(container);
        });
    });
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
}

function setAllPermissions(container, checked) {
    if (!container) return;
    container.querySelectorAll('.permission-toggle-input').forEach(box => {
        box.checked = checked;
        syncPermissionRowState(box);
    });
}

function applyRolePreset(container, presetKey) {
    if (!container) return;
    setPermissionKeys(container, resolvePresetKeys(presetKey));

    const presetsBar = container.closest('.staff-enterprise-card-body')
        ?.querySelector('.staff-presets-bar');

    presetsBar?.querySelectorAll('.staff-preset-btn').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.preset === presetKey && presetKey !== 'clear');
    });
}

function clearPresetHighlight(container) {
    const presetsBar = container.closest('.staff-enterprise-card-body')
        ?.querySelector('.staff-presets-bar');
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

function getCreateAccountStatus() {
    const selected = document.querySelector('input[name="staffAccountStatus"]:checked');
    return selected?.value === 'blocked' ? 'blocked' : 'active';
}

function resetCreateAccountStatus() {
    const active = document.getElementById('staffStatusActive');
    if (active) active.checked = true;
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
            <tr><td colspan="7" class="empty-row">
                No staff accounts yet. Create one above to delegate work without sharing your Super Admin password.
            </td></tr>`;
        return;
    }

    body.innerHTML = staffAccounts.map(staff => {
        const blocked = staff.status === 'blocked';
        const permissionChips = (staff.permissions || []).length
            ? staff.permissions.map(key => `<span class="permission-chip">${escapeHtml(permissionLabel(key))}</span>`).join('')
            : '<span class="permission-chip empty">No permissions</span>';

        return `
            <tr class="${blocked ? 'staff-row-blocked' : ''}">
                <td>
                    <div class="staff-identity">
                        <span class="staff-avatar">${escapeHtml((staff.name || staff.username).charAt(0).toUpperCase())}</span>
                        <div>
                            <strong>${escapeHtml(staff.name || staff.username)}</strong>
                            <small>Added by ${escapeHtml(staff.createdBy || '—')}</small>
                        </div>
                    </div>
                </td>
                <td><code class="staff-username">${escapeHtml(staff.username)}</code></td>
                <td>${escapeHtml(staff.email || '—')}</td>
                <td><div class="permission-chip-list">${permissionChips}</div></td>
                <td>
                    <span class="status-badge ${blocked ? 'blocked' : 'active'}">
                        <i class="fa-solid ${blocked ? 'fa-ban' : 'fa-circle-check'}"></i>
                        ${blocked ? 'Suspended' : 'Active'}
                    </span>
                </td>
                <td>${escapeHtml(formatDateTime(staff.lastLoginAt))}</td>
                <td>
                    <div class="staff-actions">
                        <button type="button" class="action-btn edit" title="Edit permissions"
                            onclick="openStaffEditModal('${staff.id}')"><i class="fa-solid fa-user-pen"></i></button>
                        <button type="button" class="action-btn ${blocked ? 'activate' : 'block'}"
                            title="${blocked ? 'Activate account' : 'Block account'}"
                            onclick="toggleStaffStatus('${staff.id}')">
                            <i class="fa-solid ${blocked ? 'fa-lock-open' : 'fa-user-lock'}"></i>
                        </button>
                        <button type="button" class="action-btn reset" title="Reset password"
                            onclick="resetStaffPassword('${staff.id}')"><i class="fa-solid fa-key"></i></button>
                        <button type="button" class="action-btn delete" title="Delete account"
                            onclick="deleteStaffAccount('${staff.id}')"><i class="fa-solid fa-trash"></i></button>
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
    set('staffTotalCount', summary?.total ?? staffAccounts.length);
    set('staffActiveCount', summary?.active ?? staffAccounts.filter(s => s.status === 'active').length);
    set('staffBlockedCount', summary?.blocked ?? staffAccounts.filter(s => s.status === 'blocked').length);
}

async function fetchStaffAccounts(options = {}) {
    const { bustCache = false, showTableLoading = true } = options;
    const body = document.getElementById('staffTableBody');

    if (body && showTableLoading) {
        body.innerHTML = '<tr><td colspan="7" class="loading-container"><div class="spinner"></div><p>Loading staff accounts...</p></td></tr>';
    }

    const url = bustCache
        ? `/api/admin/staff?_=${Date.now()}`
        : '/api/admin/staff';

    try {
        const result = await staffApi(url);
        staffAccounts = result.data || [];
        renderStaffSummary(result.summary);
        renderStaffTable();
        return true;
    } catch (error) {
        console.error('Load Staff Error:', error);
        if (body) {
            body.innerHTML = `<tr><td colspan="7" class="empty-row">${escapeHtml(error.message)}</td></tr>`;
        }
        if (!options.suppressErrorToast) {
            notify(error.message, 'error');
        }
        return false;
    }
}

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

    let keepLoadingUntilReload = false;

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
            keepLoadingUntilReload = true;
            if (typeof window.showToast === 'function') {
                window.showToast('Staff API unavailable — reloading page…', 'warning', 2500);
            } else {
                notify('Staff API unavailable — reloading page…', 'warning');
            }
            window.setTimeout(() => window.location.reload(), 900);
            return;
        }

        showStaffRefreshSuccessToast();
    } catch (error) {
        console.error('Staff refresh failed:', error);
        keepLoadingUntilReload = true;
        notify(error.message || 'Could not refresh staff data.', 'error');
        window.setTimeout(() => window.location.reload(), 900);
    } finally {
        staffRefreshInFlight = false;
        if (!keepLoadingUntilReload) {
            setStaffRefreshLoading(false);
        }
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

    const grid = document.getElementById('staffPermissionGrid');
    renderPermissionCheckboxes(grid);
    setupPermissionPresets(
        document.querySelector('[data-permission-presets="create"]'),
        grid
    );
    await fetchStaffAccounts();
}
window.loadStaffSection = loadStaffSection;

/* ==========================================================================
   CREATE STAFF
   ========================================================================== */

function setupCreateStaffForm() {
    const form = document.getElementById('createStaffForm');
    if (!form) return;

    const grid = document.getElementById('staffPermissionGrid');
    const passwordInput = document.getElementById('staffPassword');

    document.getElementById('generateStaffPasswordBtn')?.addEventListener('click', () => {
        if (!passwordInput) return;
        passwordInput.value = generateStrongPassword();
        notify('Strong password generated — copy it before saving.', 'info');
    });

    setupPermissionPresets(
        document.querySelector('[data-permission-presets="create"]'),
        grid
    );

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const submitBtn = document.getElementById('createStaffBtn');
        const desiredStatus = getCreateAccountStatus();
        const payload = {
            name: document.getElementById('staffName').value.trim(),
            username: document.getElementById('staffUsername').value.trim().toLowerCase(),
            email: document.getElementById('staffEmail').value.trim().toLowerCase(),
            password: document.getElementById('staffPassword').value,
            permissions: readSelectedPermissions(grid),
            requireTwoFactor: document.getElementById('staffRequireTwoFactor').checked
        };

        if (payload.permissions.length === 0) {
            return notify('Enable at least one permission for this staff member.', 'warning');
        }

        if (submitBtn) submitBtn.disabled = true;

        try {
            const result = await staffApi('/api/admin/staff', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (desiredStatus === 'blocked' && result.data?.id) {
                await staffApi(`/api/admin/staff/${result.data.id}/status`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: 'blocked' })
                });
            }

            notify(result.message, 'success');
            form.reset();
            resetCreateAccountStatus();
            setAllPermissions(grid, false);
            clearPresetHighlight(grid);
            await fetchStaffAccounts();
        } catch (error) {
            notify(error.message, 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

/* ==========================================================================
   EDIT / STATUS / RESET / DELETE
   ========================================================================== */

window.openStaffEditModal = function openStaffEditModal(staffId) {
    const staff = staffAccounts.find(s => String(s.id) === String(staffId));
    if (!staff) return notify('Staff account not found. Try refreshing.', 'error');

    document.getElementById('editStaffId').value = staff.id;
    document.getElementById('editStaffName').value = staff.name || '';
    document.getElementById('editStaffEmail').value = staff.email || '';
    document.getElementById('editStaffRequireTwoFactor').checked = staff.twoFactorEnabled !== false;
    setEditAccountStatus(staff.status);
    document.getElementById('staffEditModalSubtitle').textContent =
        `${staff.username} · changes apply on their very next request`;

    const grid = document.getElementById('editStaffPermissionGrid');
    renderPermissionCheckboxes(grid, staff.permissions || []);
    setupPermissionPresets(
        document.querySelector('[data-permission-presets="edit"]'),
        grid
    );
    document.getElementById('staffEditModal').style.display = 'flex';
};

window.closeStaffEditModal = function closeStaffEditModal() {
    const modal = document.getElementById('staffEditModal');
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
        const desiredStatus = getEditAccountStatus();
        const staff = staffAccounts.find(s => String(s.id) === String(staffId));

        if (permissions.length === 0) {
            return notify('A staff member must keep at least one permission.', 'warning');
        }

        try {
            const result = await staffApi(`/api/admin/staff/${staffId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name: document.getElementById('editStaffName').value.trim(),
                    email: document.getElementById('editStaffEmail').value.trim().toLowerCase(),
                    permissions,
                    requireTwoFactor: document.getElementById('editStaffRequireTwoFactor').checked
                })
            });

            if (staff && staff.status !== desiredStatus) {
                await staffApi(`/api/admin/staff/${staffId}/status`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: desiredStatus })
                });
            }

            notify(result.message, 'success');
            window.closeStaffEditModal();
            await fetchStaffAccounts();
        } catch (error) {
            notify(error.message, 'error');
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
        console.error('RBAC bootstrap failed:', error);
        return;
    }

    applyRoleToSidebar();
    setupCreateStaffForm();
    setupEditStaffForm();
    setupStaffRefreshButton();

    if (isSuperAdmin() && document.getElementById('staffPermissionGrid')) {
        const grid = document.getElementById('staffPermissionGrid');
        renderPermissionCheckboxes(grid);
        setupPermissionPresets(
            document.querySelector('[data-permission-presets="create"]'),
            grid
        );
    }
});
