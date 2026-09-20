/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/adminSidebar.js
 * Description: Sidebar admin profile — merged Admin + linked Employee data.
 */
const ADMIN_PROFILE_CACHE_KEY = 'adminProfile';

function formatSidebarRole(role) {
    const normalized = String(role || '').toLowerCase();
    if (normalized === 'superadmin') return 'Super Admin';
    if (normalized === 'staff') return 'Staff';
    return role || 'Admin';
}

function updateSidebarDisplay(profileData = {}) {
    const displayName = profileData.displayName || profileData.username || 'Admin';
    const roleLabel = formatSidebarRole(profileData.role);
    const photo = profileData.photo || profileData.image || null;

    if (typeof window.updateAdminProfileUI === 'function') {
        window.updateAdminProfileUI({
            name: displayName,
            image: photo,
            role: roleLabel
        });
    }

    const linkStatus = document.getElementById('adminEmployeeLinkStatus');
    if (linkStatus) {
        if (profileData.employeeId) {
            const code = profileData.employeeCode ? ` (${profileData.employeeCode})` : '';
            linkStatus.textContent = `Linked to ${profileData.employeeName || 'employee'}${code}`;
            linkStatus.dataset.linked = 'true';
        } else {
            linkStatus.textContent = 'No employee record linked yet.';
            linkStatus.dataset.linked = 'false';
        }
    }

    const linkSelect = document.getElementById('adminEmployeeLinkSelect');
    if (linkSelect && profileData.employeeId) {
        linkSelect.value = profileData.employeeId;
    }
}

function clearAdminSidebarCache() {
    try {
        sessionStorage.removeItem(ADMIN_PROFILE_CACHE_KEY);
        localStorage.removeItem('adminProfilePic');
    } catch (_) { /* ignore */ }
}

async function loadAdminSidebarProfile(forceRefresh = false) {
    if (!forceRefresh) {
        try {
            const cached = sessionStorage.getItem(ADMIN_PROFILE_CACHE_KEY);
            if (cached) {
                updateSidebarDisplay(JSON.parse(cached));
            }
        } catch (_) { /* ignore corrupt cache */ }
    }

    try {
        const res = await fetch('/api/admin/profile/me/full', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await res.json();

        if (typeof handleAdminApiAuthResponse === 'function') {
            const authResult = handleAdminApiAuthResponse(res, data);
            if (authResult === 'auth_failed' || authResult === 'rate_limited') return;
        }

        if (res.ok && data.success && data.data) {
            sessionStorage.setItem(ADMIN_PROFILE_CACHE_KEY, JSON.stringify(data.data));
            updateSidebarDisplay(data.data);
        }
    } catch (error) {
        console.error('Failed to load admin sidebar profile:', error);
    }
}

async function loadActiveEmployeesForLink() {
    const select = document.getElementById('adminEmployeeLinkSelect');
    if (!select) return;

    try {
        const res = await fetch('/api/admin/hrm/employees?all=true&status=active', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();
        if (!result.success || !Array.isArray(result.data)) return;

        const currentValue = select.value;
        select.innerHTML = '<option value="">Select an employee…</option>';
        result.data.forEach((employee) => {
            const option = document.createElement('option');
            option.value = employee._id;
            option.textContent = `${employee.employeeId} — ${employee.fullName}`;
            select.appendChild(option);
        });
        if (currentValue) select.value = currentValue;
    } catch (error) {
        console.error('Failed to load employees for admin link:', error);
    }
}

async function linkAdminToEmployee() {
    const select = document.getElementById('adminEmployeeLinkSelect');
    const btn = document.getElementById('adminEmployeeLinkBtn');
    const employeeId = select?.value?.trim();

    if (!employeeId) {
        showToast('Select an active employee to link.', 'warning');
        return;
    }

    if (btn) btn.disabled = true;
    try {
        const res = await fetch('/api/admin/profile/link-employee', {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ employeeId })
        });
        const result = await res.json();

        if (result.success) {
            showToast(result.message || 'Employee linked successfully.', 'success');
            if (result.data) {
                sessionStorage.setItem(ADMIN_PROFILE_CACHE_KEY, JSON.stringify(result.data));
                updateSidebarDisplay(result.data);
            } else {
                await loadAdminSidebarProfile(true);
            }
        } else {
            showToast(result.message || 'Failed to link employee record.', 'error');
        }
    } catch (error) {
        console.error('linkAdminToEmployee:', error);
        showToast('Could not reach the server. Please try again.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function setupAdminEmployeeLinkSection() {
    const btn = document.getElementById('adminEmployeeLinkBtn');
    if (btn && btn.dataset.bound !== '1') {
        btn.dataset.bound = '1';
        btn.addEventListener('click', linkAdminToEmployee);
    }

    const settingsTab = document.querySelector('[data-settings-hub-tab="account"]');
    if (settingsTab && settingsTab.dataset.linkSectionBound !== '1') {
        settingsTab.dataset.linkSectionBound = '1';
        settingsTab.addEventListener('click', () => {
            loadActiveEmployeesForLink();
            loadAdminSidebarProfile(true);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadAdminSidebarProfile();
    setupAdminEmployeeLinkSection();
});

Object.assign(window, {
    loadAdminSidebarProfile,
    updateSidebarDisplay,
    clearAdminSidebarCache,
    loadActiveEmployeesForLink,
    linkAdminToEmployee
});
