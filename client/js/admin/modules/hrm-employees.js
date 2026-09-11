/**
 * Project: EOnlineBazar — HRM Employees (non-login staff)
 * File: js/admin/modules/hrm-employees.js
 */
import '../admin-core.js';

const EMPLOYEE_STATUS_CLASSES = {
    active: 'status-verified',
    inactive: 'status-pending',
    terminated: 'status-blocked'
};

function employeeEscape(value) {
    return window.hrmEscape ? window.hrmEscape(value) : String(value ?? '');
}

function employeeAuthHeaders(json = false) {
    return window.hrmAuthHeaders ? window.hrmAuthHeaders(json) : { Authorization: `Bearer ${token}` };
}

function employeeFormatMoney(amount) {
    return window.hrmFormatMoney ? window.hrmFormatMoney(amount) : `৳ ${Number(amount || 0).toLocaleString()}`;
}

function employeePhotoCell(photo, name) {
    if (photo) {
        return `<img src="${employeeEscape(photo)}" alt="" class="staff-avatar-thumb" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`;
    }
    const initials = encodeURIComponent(String(name || 'E').slice(0, 2));
    return `<img src="https://ui-avatars.com/api/?name=${initials}&background=64748b&color=fff&size=72" alt="" class="staff-avatar-thumb" style="width:36px;height:36px;border-radius:50%;">`;
}

function renderEmployeeStats(stats) {
    const activeEl = document.getElementById('employeeStatActive');
    const deptEl = document.getElementById('employeeStatDepartments');
    if (activeEl) activeEl.textContent = stats?.totalActive ?? 0;

    const rows = stats?.byDepartment || [];
    if (deptEl) {
        deptEl.textContent = rows.length
            ? rows.map((r) => `${r.department}: ${r.count}`).join(' · ')
            : '—';
    }

    const deptFilter = document.getElementById('employeeDepartmentFilter');
    if (deptFilter && rows.length) {
        const current = deptFilter.value;
        const options = rows.map((r) => `<option value="${employeeEscape(r.department)}">${employeeEscape(r.department)} (${r.count})</option>`).join('');
        deptFilter.innerHTML = `<option value="">All departments</option>${options}`;
        if (current) deptFilter.value = current;
    }
}

async function loadEmployeeStats() {
    try {
        const res = await fetch('/api/admin/hrm/employees/stats', { headers: employeeAuthHeaders() });
        const result = await res.json();
        if (result.success) renderEmployeeStats(result.data);
    } catch (err) {
        console.error('loadEmployeeStats:', err);
    }
}

async function loadEmployees() {
    const tbody = document.getElementById('employeeTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" class="loading-container"><div class="spinner"></div><p>Loading employees…</p></td></tr>';

    const params = new URLSearchParams({ limit: '100' });
    const department = document.getElementById('employeeDepartmentFilter')?.value;
    const status = document.getElementById('employeeStatusFilter')?.value;
    const search = document.getElementById('employeeSearchInput')?.value?.trim();
    if (department) params.set('department', department);
    if (status) params.set('status', status);
    if (search) params.set('search', search);

    try {
        const res = await fetch(`/api/admin/hrm/employees?${params}`, { headers: employeeAuthHeaders() });
        const result = await res.json();
        const rows = result.data || [];

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="table-status-empty">No employees found.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((e) => `
            <tr>
                <td>${employeePhotoCell(e.photo, e.fullName)}</td>
                <td><code>${employeeEscape(e.employeeId || '—')}</code></td>
                <td><strong>${employeeEscape(e.fullName)}</strong></td>
                <td>${employeeEscape(e.role || '—')}</td>
                <td>${employeeEscape(e.department || 'Operations')}</td>
                <td>${employeeEscape(e.phone || '—')}</td>
                <td>${employeeFormatMoney(e.baseSalary)}</td>
                <td><span class="status-badge ${EMPLOYEE_STATUS_CLASSES[e.status] || 'status-pending'}">${employeeEscape(e.status || 'active')}</span></td>
                <td>
                    <div class="catalog-actions">
                        <button type="button" class="catalog-action-btn edit" onclick="openEditEmployeeModal('${e._id}')" title="Edit">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button type="button" class="catalog-action-btn" onclick="viewEmployeeDetails('${e._id}')" title="View Details">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button type="button" class="catalog-action-btn" onclick="markEmployeeAttendance('${employeeEscape(e.employeeId)}')" title="Mark Attendance">
                            <i class="fa-solid fa-user-clock"></i>
                        </button>
                        ${e.status !== 'terminated' ? `
                        <button type="button" class="catalog-action-btn delete" onclick="terminateEmployee('${e._id}')" title="Terminate">
                            <i class="fa-solid fa-user-slash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadEmployees:', err);
        tbody.innerHTML = '<tr><td colspan="9" class="table-status-error">Failed to load employees.</td></tr>';
    }
}

function resetEmployeeForm() {
    document.getElementById('employeeEditId').value = '';
    document.getElementById('employeeFullName').value = '';
    document.getElementById('employeePhone').value = '';
    document.getElementById('employeeRole').value = '';
    document.getElementById('employeeDepartment').value = 'Operations';
    document.getElementById('employeeBaseSalary').value = '0';
    document.getElementById('employeeJoiningDate').value = '';
    document.getElementById('employeeNationalId').value = '';
    document.getElementById('employeeAddress').value = '';
    document.getElementById('employeeEmergencyName').value = '';
    document.getElementById('employeeEmergencyPhone').value = '';
    document.getElementById('employeeEmergencyRelation').value = '';
    document.getElementById('employeeNotes').value = '';
    document.getElementById('employeeStatus').value = 'active';
    const title = document.getElementById('employeeModalTitle');
    if (title) title.innerHTML = '<i class="fa-solid fa-user-plus"></i> Add Employee';
}

function closeEmployeeModal() {
    const modal = document.getElementById('employeeModal');
    if (modal) modal.style.display = 'none';
}

function openAddEmployeeModal() {
    resetEmployeeForm();
    const modal = document.getElementById('employeeModal');
    if (modal) modal.style.display = 'flex';
}

async function openEditEmployeeModal(id) {
    try {
        const res = await fetch(`/api/admin/hrm/employees/${id}`, { headers: employeeAuthHeaders() });
        const result = await res.json();
        if (!result.success || !result.data) {
            showToast(result.message || 'Employee not found.', 'error');
            return;
        }

        const e = result.data;
        document.getElementById('employeeEditId').value = e._id;
        document.getElementById('employeeFullName').value = e.fullName || '';
        document.getElementById('employeePhone').value = e.phone || '';
        document.getElementById('employeeRole').value = e.role || '';
        document.getElementById('employeeDepartment').value = e.department || 'Operations';
        document.getElementById('employeeBaseSalary').value = e.baseSalary ?? 0;
        document.getElementById('employeeJoiningDate').value = e.joiningDate
            ? new Date(e.joiningDate).toISOString().slice(0, 10)
            : '';
        document.getElementById('employeeNationalId').value = e.nationalId || '';
        document.getElementById('employeeAddress').value = e.address || '';
        document.getElementById('employeeEmergencyName').value = e.emergencyContact?.name || '';
        document.getElementById('employeeEmergencyPhone').value = e.emergencyContact?.phone || '';
        document.getElementById('employeeEmergencyRelation').value = e.emergencyContact?.relation || '';
        document.getElementById('employeeNotes').value = e.notes || '';
        document.getElementById('employeeStatus').value = e.status || 'active';

        const title = document.getElementById('employeeModalTitle');
        if (title) title.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Employee';

        const modal = document.getElementById('employeeModal');
        if (modal) modal.style.display = 'flex';
    } catch (err) {
        console.error('openEditEmployeeModal:', err);
        showToast('Failed to load employee.', 'error');
    }
}

function buildEmployeePayload() {
    return {
        fullName: document.getElementById('employeeFullName')?.value?.trim(),
        phone: document.getElementById('employeePhone')?.value?.trim(),
        role: document.getElementById('employeeRole')?.value?.trim(),
        department: document.getElementById('employeeDepartment')?.value?.trim() || 'Operations',
        baseSalary: Number(document.getElementById('employeeBaseSalary')?.value) || 0,
        joiningDate: document.getElementById('employeeJoiningDate')?.value || null,
        nationalId: document.getElementById('employeeNationalId')?.value?.trim() || '',
        address: document.getElementById('employeeAddress')?.value?.trim() || '',
        emergencyContact: {
            name: document.getElementById('employeeEmergencyName')?.value?.trim() || '',
            phone: document.getElementById('employeeEmergencyPhone')?.value?.trim() || '',
            relation: document.getElementById('employeeEmergencyRelation')?.value?.trim() || ''
        },
        notes: document.getElementById('employeeNotes')?.value?.trim() || '',
        status: document.getElementById('employeeStatus')?.value || 'active'
    };
}

async function saveEmployee() {
    const id = document.getElementById('employeeEditId')?.value?.trim();
    const payload = buildEmployeePayload();

    if (!payload.fullName || !payload.phone || !payload.role) {
        showToast('Full name, phone, and role are required.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('employeeSaveBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const res = await fetch(id ? `/api/admin/hrm/employees/${id}` : '/api/admin/hrm/employees', {
            method: id ? 'PATCH' : 'POST',
            headers: employeeAuthHeaders(true),
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess(id ? 'Employee Updated' : 'Employee Added', result.message || 'Saved.');
            closeEmployeeModal();
            if (window.hrmInvalidateEmployeeCache) window.hrmInvalidateEmployeeCache();
            await loadEmployeeStats();
            await loadEmployees();
        } else {
            showToast(result.message || 'Failed to save employee.', 'error');
        }
    } catch (err) {
        console.error('saveEmployee:', err);
        showToast('Server error while saving employee.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function closeEmployeeDetailsModal() {
    const modal = document.getElementById('employeeDetailsModal');
    if (modal) modal.style.display = 'none';
}

async function viewEmployeeDetails(id) {
    try {
        const res = await fetch(`/api/admin/hrm/employees/${id}`, { headers: employeeAuthHeaders() });
        const result = await res.json();
        if (!result.success || !result.data) {
            showToast(result.message || 'Employee not found.', 'error');
            return;
        }

        const e = result.data;
        const subtitle = document.getElementById('employeeDetailsSubtitle');
        if (subtitle) subtitle.textContent = `${e.employeeId} · ${e.role}`;

        const body = document.getElementById('employeeDetailsBody');
        if (body) {
            body.innerHTML = `
                <dl class="detail-list">
                    <dt>Full Name</dt><dd>${employeeEscape(e.fullName)}</dd>
                    <dt>Phone</dt><dd>${employeeEscape(e.phone)}</dd>
                    <dt>Department</dt><dd>${employeeEscape(e.department || 'Operations')}</dd>
                    <dt>Base Salary</dt><dd>${employeeFormatMoney(e.baseSalary)}</dd>
                    <dt>Joining Date</dt><dd>${e.joiningDate ? new Date(e.joiningDate).toLocaleDateString() : '—'}</dd>
                    <dt>National ID</dt><dd>${employeeEscape(e.nationalId || '—')}</dd>
                    <dt>Address</dt><dd>${employeeEscape(e.address || '—')}</dd>
                    <dt>Emergency Contact</dt><dd>${employeeEscape(e.emergencyContact?.name || '—')} · ${employeeEscape(e.emergencyContact?.phone || '—')} (${employeeEscape(e.emergencyContact?.relation || '—')})</dd>
                    <dt>Status</dt><dd>${employeeEscape(e.status)}</dd>
                    <dt>Notes</dt><dd>${employeeEscape(e.notes || '—')}</dd>
                </dl>
            `;
        }

        const modal = document.getElementById('employeeDetailsModal');
        if (modal) modal.style.display = 'flex';
    } catch (err) {
        console.error('viewEmployeeDetails:', err);
        showToast('Failed to load employee details.', 'error');
    }
}

async function terminateEmployee(id) {
    confirmAdminAction('Terminate this employee? Their status will be set to terminated.', async () => {
        try {
            const res = await fetch(`/api/admin/hrm/employees/${id}`, {
                method: 'DELETE',
                headers: employeeAuthHeaders()
            });
            const result = await res.json();

            if (result.success) {
                showAdminSuccess('Employee Terminated', result.message || 'Employee terminated.');
                if (window.hrmInvalidateEmployeeCache) window.hrmInvalidateEmployeeCache();
                await loadEmployeeStats();
                await loadEmployees();
            } else {
                showToast(result.message || 'Failed to terminate employee.', 'error');
            }
        } catch (err) {
            console.error('terminateEmployee:', err);
            showToast('Failed to terminate employee.', 'error');
        }
    }, 'danger');
}

function markEmployeeAttendance(employeeId) {
    window.hrmPendingAttendanceStaff = `employee:${employeeId}`;
    const nav = document.querySelector('[data-target="view-hrm-attendance"]');
    if (nav && window.navigateAdminSection) {
        window.navigateAdminSection('view-hrm-attendance', nav);
    }
}

async function loadHrmEmployeesSection() {
    await loadEmployeeStats();
    await loadEmployees();
}

function setupHrmEmployeesSection() {
    const refreshBtn = document.getElementById('employeesRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', async () => {
            await loadEmployeeStats();
            await loadEmployees();
        });
    }

    const searchInput = document.getElementById('employeeSearchInput');
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = '1';
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') loadEmployees();
        });
    }
}

document.addEventListener('DOMContentLoaded', setupHrmEmployeesSection);

window.loadEmployees = loadEmployees;
window.loadEmployeeStats = loadEmployeeStats;
window.openAddEmployeeModal = openAddEmployeeModal;
window.openEditEmployeeModal = openEditEmployeeModal;
window.closeEmployeeModal = closeEmployeeModal;
window.saveEmployee = saveEmployee;
window.terminateEmployee = terminateEmployee;
window.viewEmployeeDetails = viewEmployeeDetails;
window.closeEmployeeDetailsModal = closeEmployeeDetailsModal;
window.markEmployeeAttendance = markEmployeeAttendance;
window.loadHrmEmployeesSection = loadHrmEmployeesSection;
window.renderEmployeeTable = loadEmployees;
