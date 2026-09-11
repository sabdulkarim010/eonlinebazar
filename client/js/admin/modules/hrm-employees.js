/**
 * Project: EOnlineBazar — HRM Employees (ultra-dynamic operational staff)
 * File: js/admin/modules/hrm-employees.js
 */
import '../admin-core.js';

const EMPLOYEE_STATUS_CLASSES = {
    active: 'status-verified',
    inactive: 'status-pending',
    terminated: 'status-blocked'
};

let designationCache = [];
let shiftCache = [];
let pendingPhotoFile = null;
let activeProfileData = null;

function employeeEscape(value) {
    return window.hrmEscape ? window.hrmEscape(value) : String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function employeeAuthHeaders(json = false) {
    return window.hrmAuthHeaders ? window.hrmAuthHeaders(json) : { Authorization: `Bearer ${token}` };
}

function employeeFormatMoney(amount) {
    return window.hrmFormatMoney ? window.hrmFormatMoney(amount) : `৳ ${Number(amount || 0).toLocaleString()}`;
}

function employeePhotoCell(photo, name) {
    if (photo) {
        return `<img src="${employeeEscape(photo)}" alt="" class="staff-avatar-thumb employee-avatar-sm">`;
    }
    const initials = encodeURIComponent(String(name || 'E').slice(0, 2));
    return `<img src="https://ui-avatars.com/api/?name=${initials}&background=64748b&color=fff&size=72" alt="" class="staff-avatar-thumb employee-avatar-sm">`;
}

function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ==================================================================
   STATS & FILTERS
   ================================================================== */

function renderEmployeeStats(stats) {
    const activeEl = document.getElementById('employeeStatActive');
    const inactiveEl = document.getElementById('employeeStatInactive');
    const desigEl = document.getElementById('employeeStatDesignations');

    if (activeEl) activeEl.textContent = stats?.totalActive ?? 0;
    if (inactiveEl) inactiveEl.textContent = stats?.totalInactive ?? 0;

    const byDesig = stats?.byDesignation || [];
    if (desigEl) {
        desigEl.textContent = byDesig.length
            ? byDesig.map((r) => `${r.designation}: ${r.count}`).join(' · ')
            : '—';
    }

    const deptFilter = document.getElementById('employeeDepartmentFilter');
    const deptRows = stats?.byDepartment || [];
    if (deptFilter && deptRows.length) {
        const current = deptFilter.value;
        deptFilter.innerHTML = `<option value="">All departments</option>${deptRows
            .map((r) => `<option value="${employeeEscape(r.department)}">${employeeEscape(r.department)} (${r.count})</option>`)
            .join('')}`;
        if (current) deptFilter.value = current;
    }

    const desigFilter = document.getElementById('employeeDesignationFilter');
    if (desigFilter && byDesig.length) {
        const current = desigFilter.value;
        desigFilter.innerHTML = `<option value="">All designations</option>${byDesig
            .map((r) => `<option value="${employeeEscape(r.designation)}">${employeeEscape(r.designation)} (${r.count})</option>`)
            .join('')}`;
        if (current) desigFilter.value = current;
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

/* ==================================================================
   TABLE
   ================================================================== */

function renderEmployeeTable(rows) {
    const tbody = document.getElementById('employeeTableBody');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="table-status-empty">No employees found.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((e) => `
        <tr>
            <td>${employeePhotoCell(e.photo, e.fullName)}</td>
            <td><code>${employeeEscape(e.employeeId || '—')}</code></td>
            <td><strong>${employeeEscape(e.fullName)}</strong></td>
            <td>${employeeEscape(e.designation || e.role || '—')}</td>
            <td>${employeeEscape(e.department || 'Operations')}</td>
            <td>${employeeEscape(e.phone || '—')}</td>
            <td>${employeeEscape(e.employeeType || 'permanent')}</td>
            <td>${employeeFormatMoney(e.baseSalary)}</td>
            <td><span class="status-badge ${EMPLOYEE_STATUS_CLASSES[e.status] || 'status-pending'}">${employeeEscape(e.status || 'active')}</span></td>
            <td>
                <div class="catalog-actions">
                    <button type="button" class="catalog-action-btn" onclick="openEmployeeProfile('${e._id}')" title="View Profile">
                        <i class="fa-solid fa-id-card"></i>
                    </button>
                    <button type="button" class="catalog-action-btn edit" onclick="openEditEmployeeModal('${e._id}')" title="Edit">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button type="button" class="catalog-action-btn" onclick="markEmployeeAttendance('employee:${employeeEscape(e.employeeId)}')" title="Mark Attendance">
                        <i class="fa-solid fa-user-clock"></i>
                    </button>
                    ${e.status !== 'terminated' ? `
                    <button type="button" class="catalog-action-btn delete" onclick="terminateEmployee('${e._id}')" title="Terminate">
                        <i class="fa-solid fa-user-slash"></i>
                    </button>` : ''}
                    ${!e.linkedAdminId ? `
                    <button type="button" class="catalog-action-btn grant-access-btn" onclick='openGrantAccessModal(${JSON.stringify(e._id)}, ${JSON.stringify(e.fullName)}, ${JSON.stringify(e.email || '')}, ${JSON.stringify(e.phone || '')})' title="Grant Access">
                        🔐 Grant Access
                    </button>` : `
                    <span class="status-badge status-verified employee-system-user-badge" title="System User">✅ System User</span>
                    <button type="button" class="catalog-action-btn" onclick="openManageAccessModal('${e._id}')" title="Manage Access">
                        ⚙️ Manage
                    </button>`}
                </div>
            </td>
        </tr>
    `).join('');
}

async function loadEmployees() {
    const tbody = document.getElementById('employeeTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="10" class="loading-container"><div class="spinner"></div><p>Loading employees…</p></td></tr>';

    const params = new URLSearchParams({ limit: '100' });
    const department = document.getElementById('employeeDepartmentFilter')?.value;
    const designation = document.getElementById('employeeDesignationFilter')?.value;
    const employeeType = document.getElementById('employeeTypeFilter')?.value;
    const status = document.getElementById('employeeStatusFilter')?.value;
    const search = document.getElementById('employeeSearchInput')?.value?.trim();

    if (department) params.set('department', department);
    if (designation) params.set('designation', designation);
    if (employeeType) params.set('employeeType', employeeType);
    if (status) params.set('status', status);
    if (search) params.set('search', search);

    try {
        const res = await fetch(`/api/admin/hrm/employees?${params}`, { headers: employeeAuthHeaders() });
        const result = await res.json();
        renderEmployeeTable(result.data || []);
    } catch (err) {
        console.error('loadEmployees:', err);
        tbody.innerHTML = '<tr><td colspan="10" class="table-status-error">Failed to load employees.</td></tr>';
    }
}

/* ==================================================================
   DESIGNATIONS
   ================================================================== */

async function loadDesignationsDropdown() {
    try {
        const res = await fetch('/api/admin/hrm/designations?activeOnly=true', { headers: employeeAuthHeaders() });
        const result = await res.json();
        designationCache = result.data || [];

        const select = document.getElementById('employeeDesignation');
        if (!select) return designationCache;

        const current = select.value;
        select.innerHTML = `<option value="">Select designation</option>${designationCache
            .map((d) => `<option value="${employeeEscape(d.name)}" data-dept="${employeeEscape(d.department || '')}">${employeeEscape(d.name)}</option>`)
            .join('')}`;
        if (current) select.value = current;

        return designationCache;
    } catch (err) {
        console.error('loadDesignationsDropdown:', err);
        return [];
    }
}

async function loadShiftsDropdown() {
    try {
        const res = await fetch('/api/admin/hrm/shifts', { headers: employeeAuthHeaders() });
        const result = await res.json();
        shiftCache = result.data || [];

        const select = document.getElementById('employeeShift');
        if (!select) return;

        const current = select.value;
        select.innerHTML = `<option value="">No shift assigned</option>${shiftCache
            .map((s) => `<option value="${employeeEscape(s.name)}">${employeeEscape(s.name)} (${employeeEscape(s.startTime)}–${employeeEscape(s.endTime)})</option>`)
            .join('')}`;
        if (current) select.value = current;
    } catch (err) {
        console.error('loadShiftsDropdown:', err);
    }
}

async function openDesignationManager() {
    const modal = document.getElementById('designationManagerModal');
    if (modal) modal.style.display = 'flex';
    await renderDesignationTable();
}

function closeDesignationManager() {
    const modal = document.getElementById('designationManagerModal');
    if (modal) modal.style.display = 'none';
}

async function renderDesignationTable() {
    const tbody = document.getElementById('designationTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="loading-container"><div class="spinner"></div></td></tr>';

    try {
        const res = await fetch('/api/admin/hrm/designations', { headers: employeeAuthHeaders() });
        const result = await res.json();
        const rows = result.data || [];
        designationCache = rows;

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="table-status-empty">No designations yet.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((d) => `
            <tr data-designation-id="${d._id}">
                <td><input type="text" class="desig-edit-name" value="${employeeEscape(d.name)}" data-id="${d._id}"></td>
                <td><input type="text" class="desig-edit-dept" value="${employeeEscape(d.department || '')}" data-id="${d._id}"></td>
                <td><span class="status-badge ${d.employeeCount ? 'status-pending' : 'status-verified'}">${d.employeeCount || 0}</span></td>
                <td>
                    <div class="catalog-actions">
                        <button type="button" class="catalog-action-btn edit" onclick="saveDesignationEdit('${d._id}')" title="Save">
                            <i class="fa-solid fa-floppy-disk"></i>
                        </button>
                        <button type="button" class="catalog-action-btn delete" onclick="deleteDesignation('${d._id}')" title="Delete">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('renderDesignationTable:', err);
        tbody.innerHTML = '<tr><td colspan="4" class="table-status-error">Failed to load designations.</td></tr>';
    }
}

async function addDesignation() {
    const name = document.getElementById('newDesignationName')?.value?.trim();
    const department = document.getElementById('newDesignationDept')?.value?.trim() || 'Operations';

    if (!name) {
        showToast('Designation name is required.', 'warning');
        return;
    }

    try {
        const res = await fetch('/api/admin/hrm/designations', {
            method: 'POST',
            headers: employeeAuthHeaders(true),
            body: JSON.stringify({ name, department })
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess('Designation Added', result.message || 'Saved.');
            document.getElementById('newDesignationName').value = '';
            await renderDesignationTable();
            await loadDesignationsDropdown();
        } else {
            showToast(result.message || 'Failed to add designation.', 'error');
        }
    } catch (err) {
        console.error('addDesignation:', err);
        showToast('Failed to add designation.', 'error');
    }
}

async function saveDesignationEdit(id) {
    const row = document.querySelector(`tr[data-designation-id="${id}"]`);
    if (!row) return;

    const name = row.querySelector('.desig-edit-name')?.value?.trim();
    const department = row.querySelector('.desig-edit-dept')?.value?.trim() || 'Operations';

    if (!name) {
        showToast('Name cannot be empty.', 'warning');
        return;
    }

    try {
        const res = await fetch(`/api/admin/hrm/designations/${id}`, {
            method: 'PATCH',
            headers: employeeAuthHeaders(true),
            body: JSON.stringify({ name, department })
        });
        const result = await res.json();

        if (result.success) {
            showToast('Designation updated.', 'success');
            await renderDesignationTable();
            await loadDesignationsDropdown();
            if (window.hrmInvalidateEmployeeCache) window.hrmInvalidateEmployeeCache();
        } else {
            showToast(result.message || 'Update failed.', 'error');
        }
    } catch (err) {
        console.error('saveDesignationEdit:', err);
        showToast('Update failed.', 'error');
    }
}

async function deleteDesignation(id) {
    try {
        const res = await fetch(`/api/admin/hrm/designations/${id}`, {
            method: 'DELETE',
            headers: employeeAuthHeaders()
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess('Designation Deleted', result.message || 'Removed.');
            await renderDesignationTable();
            await loadDesignationsDropdown();
        } else {
            showToast(result.message || 'Cannot delete designation.', 'error');
        }
    } catch (err) {
        console.error('deleteDesignation:', err);
        showToast('Delete failed.', 'error');
    }
}

function openQuickAddDesignation() {
    document.getElementById('quickDesignationName').value = '';
    document.getElementById('quickDesignationDept').value = 'Operations';
    document.getElementById('quickDesignationModal').style.display = 'flex';
}

function closeQuickAddDesignation() {
    document.getElementById('quickDesignationModal').style.display = 'none';
}

async function submitQuickDesignation() {
    const name = document.getElementById('quickDesignationName')?.value?.trim();
    const department = document.getElementById('quickDesignationDept')?.value?.trim() || 'Operations';
    if (!name) return;

    try {
        const res = await fetch('/api/admin/hrm/designations', {
            method: 'POST',
            headers: employeeAuthHeaders(true),
            body: JSON.stringify({ name, department })
        });
        const result = await res.json();

        if (result.success) {
            closeQuickAddDesignation();
            await loadDesignationsDropdown();
            const select = document.getElementById('employeeDesignation');
            if (select) select.value = name;
            const deptInput = document.getElementById('employeeDepartment');
            if (deptInput && department) deptInput.value = department;
            showToast('Designation added.', 'success');
        } else {
            showToast(result.message || 'Failed.', 'error');
        }
    } catch (err) {
        console.error('submitQuickDesignation:', err);
    }
}

/* ==================================================================
   FORM TABS & PAYLOAD
   ================================================================== */

function switchEmployeeFormTab(tabId) {
    document.querySelectorAll('#employeeFormTabs .hrm-tab').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-employee-tab') === tabId);
    });
    document.querySelectorAll('.employee-form-panel').forEach((panel) => {
        panel.style.display = panel.id === tabId ? 'block' : 'none';
    });
}

function copyPresentToPermanent() {
    const same = document.getElementById('employeeSameAsPresent')?.checked;
    const present = document.getElementById('employeePresentAddress');
    const permanent = document.getElementById('employeePermanentAddress');
    if (same && present && permanent) {
        permanent.value = present.value;
        permanent.readOnly = true;
    } else if (permanent) {
        permanent.readOnly = false;
    }
}

function resetEmployeeForm() {
    pendingPhotoFile = null;
    switchEmployeeFormTab('emp-tab-personal');

    const fields = [
        ['employeeEditId', ''], ['employeeFullName', ''], ['employeePhone', ''],
        ['employeeAlternatePhone', ''], ['employeeEmail', ''], ['employeePresentAddress', ''],
        ['employeePermanentAddress', ''], ['employeeDateOfBirth', ''], ['employeeReligion', ''],
        ['employeeEmergencyName', ''], ['employeeEmergencyPhone', ''], ['employeeEmergencyRelation', ''],
        ['employeeDisplayId', ''], ['employeeDepartment', 'Operations'], ['employeeNationalId', ''],
        ['employeeJoiningDate', ''], ['employeeBaseSalary', '0'], ['employeeBankName', ''],
        ['employeeBankAccount', ''], ['employeeBkash', ''], ['employeeNotes', ''],
        ['employeeRef1Name', ''], ['employeeRef1Phone', ''], ['employeeRef1Relation', ''], ['employeeRef1Address', ''],
        ['employeeRef2Name', ''], ['employeeRef2Phone', ''], ['employeeRef2Relation', ''], ['employeeRef2Address', '']
    ];
    fields.forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });

    ['employeeGender', 'employeeBloodGroup', 'employeeMaritalStatus'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    document.getElementById('employeeType').value = 'permanent';
    document.getElementById('employeeSalaryType').value = 'monthly';
    document.getElementById('employeeStatus').value = 'active';
    document.getElementById('employeeDesignation').value = '';
    document.getElementById('employeeShift').value = '';
    document.getElementById('employeeSameAsPresent').checked = false;

    const preview = document.getElementById('employeePhotoPreview');
    const placeholder = document.getElementById('employeePhotoPlaceholder');
    if (preview) { preview.style.display = 'none'; preview.src = ''; }
    if (placeholder) placeholder.style.display = 'flex';

    const title = document.getElementById('employeeModalTitle');
    if (title) title.innerHTML = '<i class="fa-solid fa-user-plus"></i> Add Employee';
}

function fillEmployeeForm(e) {
    document.getElementById('employeeEditId').value = e._id;
    document.getElementById('employeeFullName').value = e.fullName || '';
    document.getElementById('employeePhone').value = e.phone || '';
    document.getElementById('employeeAlternatePhone').value = e.alternatePhone || '';
    document.getElementById('employeeEmail').value = e.email || '';
    document.getElementById('employeePresentAddress').value = e.presentAddress || e.address || '';
    document.getElementById('employeePermanentAddress').value = e.permanentAddress || '';
    document.getElementById('employeeDateOfBirth').value = e.dateOfBirth ? new Date(e.dateOfBirth).toISOString().slice(0, 10) : '';
    document.getElementById('employeeGender').value = e.gender || '';
    document.getElementById('employeeBloodGroup').value = e.bloodGroup || '';
    document.getElementById('employeeMaritalStatus').value = e.maritalStatus || '';
    document.getElementById('employeeReligion').value = e.religion || '';
    document.getElementById('employeeDisplayId').value = e.employeeId || '';
    document.getElementById('employeeDesignation').value = e.designation || e.role || '';
    document.getElementById('employeeDepartment').value = e.department || 'Operations';
    document.getElementById('employeeType').value = e.employeeType || 'permanent';
    document.getElementById('employeeShift').value = e.shift || '';
    document.getElementById('employeeJoiningDate').value = e.joiningDate ? new Date(e.joiningDate).toISOString().slice(0, 10) : '';
    document.getElementById('employeeNationalId').value = e.nationalId || '';
    document.getElementById('employeeStatus').value = e.status || 'active';
    document.getElementById('employeeBaseSalary').value = e.baseSalary ?? 0;
    document.getElementById('employeeSalaryType').value = e.salaryType || 'monthly';
    document.getElementById('employeeBankName').value = e.bankName || '';
    document.getElementById('employeeBankAccount').value = e.bankAccountNumber || '';
    document.getElementById('employeeBkash').value = e.bkashNumber || '';
    document.getElementById('employeeEmergencyName').value = e.emergencyContact?.name || '';
    document.getElementById('employeeEmergencyPhone').value = e.emergencyContact?.phone || '';
    document.getElementById('employeeEmergencyRelation').value = e.emergencyContact?.relation || '';
    document.getElementById('employeeNotes').value = e.notes || '';

    const refs = e.references || [];
    if (refs[0]) {
        document.getElementById('employeeRef1Name').value = refs[0].name || '';
        document.getElementById('employeeRef1Phone').value = refs[0].phone || '';
        document.getElementById('employeeRef1Relation').value = refs[0].relation || '';
        document.getElementById('employeeRef1Address').value = refs[0].address || '';
    }
    if (refs[1]) {
        document.getElementById('employeeRef2Name').value = refs[1].name || '';
        document.getElementById('employeeRef2Phone').value = refs[1].phone || '';
        document.getElementById('employeeRef2Relation').value = refs[1].relation || '';
        document.getElementById('employeeRef2Address').value = refs[1].address || '';
    }

    const preview = document.getElementById('employeePhotoPreview');
    const placeholder = document.getElementById('employeePhotoPlaceholder');
    if (e.photo && preview) {
        preview.src = e.photo;
        preview.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
    }
}

function buildEmployeePayload() {
    const refs = [];
    const r1 = {
        name: document.getElementById('employeeRef1Name')?.value?.trim(),
        phone: document.getElementById('employeeRef1Phone')?.value?.trim(),
        relation: document.getElementById('employeeRef1Relation')?.value?.trim(),
        address: document.getElementById('employeeRef1Address')?.value?.trim()
    };
    const r2 = {
        name: document.getElementById('employeeRef2Name')?.value?.trim(),
        phone: document.getElementById('employeeRef2Phone')?.value?.trim(),
        relation: document.getElementById('employeeRef2Relation')?.value?.trim(),
        address: document.getElementById('employeeRef2Address')?.value?.trim()
    };
    if (r1.name || r1.phone) refs.push(r1);
    if (r2.name || r2.phone) refs.push(r2);

    const present = document.getElementById('employeePresentAddress')?.value?.trim() || '';
    const designation = document.getElementById('employeeDesignation')?.value?.trim();

    return {
        fullName: document.getElementById('employeeFullName')?.value?.trim(),
        phone: document.getElementById('employeePhone')?.value?.trim(),
        alternatePhone: document.getElementById('employeeAlternatePhone')?.value?.trim() || '',
        email: document.getElementById('employeeEmail')?.value?.trim() || '',
        presentAddress: present,
        permanentAddress: document.getElementById('employeePermanentAddress')?.value?.trim() || '',
        address: present,
        dateOfBirth: document.getElementById('employeeDateOfBirth')?.value || null,
        gender: document.getElementById('employeeGender')?.value || '',
        bloodGroup: document.getElementById('employeeBloodGroup')?.value || '',
        maritalStatus: document.getElementById('employeeMaritalStatus')?.value || '',
        religion: document.getElementById('employeeReligion')?.value?.trim() || '',
        designation,
        role: designation,
        department: document.getElementById('employeeDepartment')?.value?.trim() || 'Operations',
        employeeType: document.getElementById('employeeType')?.value || 'permanent',
        shift: document.getElementById('employeeShift')?.value || '',
        joiningDate: document.getElementById('employeeJoiningDate')?.value || null,
        nationalId: document.getElementById('employeeNationalId')?.value?.trim() || '',
        baseSalary: Number(document.getElementById('employeeBaseSalary')?.value) || 0,
        salaryType: document.getElementById('employeeSalaryType')?.value || 'monthly',
        bankName: document.getElementById('employeeBankName')?.value?.trim() || '',
        bankAccountNumber: document.getElementById('employeeBankAccount')?.value?.trim() || '',
        bkashNumber: document.getElementById('employeeBkash')?.value?.trim() || '',
        emergencyContact: {
            name: document.getElementById('employeeEmergencyName')?.value?.trim() || '',
            phone: document.getElementById('employeeEmergencyPhone')?.value?.trim() || '',
            relation: document.getElementById('employeeEmergencyRelation')?.value?.trim() || ''
        },
        references: refs,
        notes: document.getElementById('employeeNotes')?.value?.trim() || '',
        status: document.getElementById('employeeStatus')?.value || 'active'
    };
}

function closeEmployeeModal() {
    const modal = document.getElementById('employeeModal');
    if (modal) modal.style.display = 'none';
    pendingPhotoFile = null;
}

async function openAddEmployeeModal() {
    resetEmployeeForm();
    await Promise.all([loadDesignationsDropdown(), loadShiftsDropdown()]);
    document.getElementById('employeeModal').style.display = 'flex';
}

async function openEditEmployeeModal(id) {
    closeEmployeeProfileModal();
    try {
        const res = await fetch(`/api/admin/hrm/employees/${id}`, { headers: employeeAuthHeaders() });
        const result = await res.json();
        if (!result.success || !result.data) {
            showToast(result.message || 'Employee not found.', 'error');
            return;
        }

        resetEmployeeForm();
        await Promise.all([loadDesignationsDropdown(), loadShiftsDropdown()]);
        fillEmployeeForm(result.data);

        const title = document.getElementById('employeeModalTitle');
        if (title) title.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Employee';

        document.getElementById('employeeModal').style.display = 'flex';
    } catch (err) {
        console.error('openEditEmployeeModal:', err);
        showToast('Failed to load employee.', 'error');
    }
}

function handleEmployeePhotoPick(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    pendingPhotoFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('employeePhotoPreview');
        const placeholder = document.getElementById('employeePhotoPlaceholder');
        if (preview) {
            preview.src = e.target.result;
            preview.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

async function uploadEmployeePhoto(id, file) {
    const formData = new FormData();
    formData.append('photo', file);

    const res = await fetch(`/api/admin/hrm/employees/${id}/photo`, {
        method: 'POST',
        headers: { Authorization: employeeAuthHeaders().Authorization },
        body: formData
    });
    return res.json();
}

async function saveEmployee() {
    const id = document.getElementById('employeeEditId')?.value?.trim();
    const payload = buildEmployeePayload();

    if (!payload.fullName || !payload.phone || !payload.designation) {
        showToast('Full name, phone, and designation are required.', 'warning');
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

        if (!result.success) {
            showToast(result.message || 'Failed to save employee.', 'error');
            return;
        }

        const savedId = id || result.data?._id;

        if (pendingPhotoFile && savedId) {
            const photoResult = await uploadEmployeePhoto(savedId, pendingPhotoFile);
            if (!photoResult.success) {
                showToast('Employee saved but photo upload failed.', 'warning');
            }
        }

        showAdminSuccess(id ? 'Employee Updated' : 'Employee Added', result.message || 'Saved.');
        closeEmployeeModal();
        if (window.hrmInvalidateEmployeeCache) window.hrmInvalidateEmployeeCache();
        await loadEmployeeStats();
        await loadEmployees();
    } catch (err) {
        console.error('saveEmployee:', err);
        showToast('Server error while saving employee.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

/* ==================================================================
   PROFILE MODAL
   ================================================================== */

function switchProfileTab(tabId) {
    document.querySelectorAll('#employeeProfileTabs .hrm-tab').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-profile-tab') === tabId);
    });
    document.querySelectorAll('.employee-profile-panel').forEach((panel) => {
        panel.style.display = panel.id === tabId ? 'block' : 'none';
    });
}

function closeEmployeeProfileModal() {
    const modal = document.getElementById('employeeProfileModal');
    if (modal) modal.style.display = 'none';
    activeProfileData = null;
}

function renderProfileOverview(data) {
    const e = data.employee;
    const panel = document.getElementById('profile-tab-overview');
    if (!panel) return;

    panel.innerHTML = `
        <div class="employee-profile-grid">
            <section>
                <h4>Personal</h4>
                <dl class="detail-list">
                    <dt>Date of Birth</dt><dd>${formatDate(e.dateOfBirth)}</dd>
                    <dt>Gender</dt><dd>${employeeEscape(e.gender || '—')}</dd>
                    <dt>Blood Group</dt><dd>${employeeEscape(e.bloodGroup || '—')}</dd>
                    <dt>Religion</dt><dd>${employeeEscape(e.religion || '—')}</dd>
                    <dt>Marital Status</dt><dd>${employeeEscape(e.maritalStatus || '—')}</dd>
                    <dt>National ID</dt><dd>${employeeEscape(e.nationalId || '—')}</dd>
                </dl>
            </section>
            <section>
                <h4>Contact</h4>
                <dl class="detail-list">
                    <dt>Phone</dt><dd>${employeeEscape(e.phone)}</dd>
                    <dt>Alternate</dt><dd>${employeeEscape(e.alternatePhone || '—')}</dd>
                    <dt>Email</dt><dd>${employeeEscape(e.email || '—')}</dd>
                    <dt>Present Address</dt><dd>${employeeEscape(e.presentAddress || e.address || '—')}</dd>
                    <dt>Permanent Address</dt><dd>${employeeEscape(e.permanentAddress || '—')}</dd>
                    <dt>Emergency</dt><dd>${employeeEscape(e.emergencyContact?.name || '—')} · ${employeeEscape(e.emergencyContact?.phone || '—')}</dd>
                </dl>
            </section>
            <section>
                <h4>Employment</h4>
                <dl class="detail-list">
                    <dt>Employee ID</dt><dd><code>${employeeEscape(e.employeeId)}</code></dd>
                    <dt>Designation</dt><dd>${employeeEscape(e.designation || e.role || '—')}</dd>
                    <dt>Department</dt><dd>${employeeEscape(e.department || 'Operations')}</dd>
                    <dt>Type</dt><dd>${employeeEscape(e.employeeType || 'permanent')}</dd>
                    <dt>Shift</dt><dd>${employeeEscape(e.shift || '—')}</dd>
                    <dt>Joining Date</dt><dd>${formatDate(e.joiningDate)}</dd>
                </dl>
            </section>
            <section>
                <h4>Salary &amp; Bank</h4>
                <dl class="detail-list">
                    <dt>Base Salary</dt><dd>${employeeFormatMoney(e.baseSalary)} (${employeeEscape(e.salaryType || 'monthly')})</dd>
                    <dt>Bank</dt><dd>${employeeEscape(e.bankName || '—')}</dd>
                    <dt>Account</dt><dd>${employeeEscape(e.bankAccountNumber || '—')}</dd>
                    <dt>bKash</dt><dd>${employeeEscape(e.bkashNumber || '—')}</dd>
                </dl>
            </section>
        </div>
        ${(e.references || []).length ? `
        <section class="employee-profile-refs">
            <h4>References</h4>
            ${(e.references || []).map((r) => `
                <p><strong>${employeeEscape(r.name)}</strong> — ${employeeEscape(r.phone)} (${employeeEscape(r.relation || '—')})<br>
                <span class="table-subtext">${employeeEscape(r.address || '')}</span></p>
            `).join('')}
        </section>` : ''}
        ${e.notes ? `<section><h4>Notes</h4><p>${employeeEscape(e.notes)}</p></section>` : ''}
    `;
}

function renderProfileDocuments(docs) {
    const list = document.getElementById('profileDocumentsList');
    if (!list) return;

    if (!docs?.length) {
        list.innerHTML = '<p class="table-status-empty">No documents attached yet.</p>';
        return;
    }

    list.innerHTML = docs.map((doc) => {
        const icon = doc.fileType === 'pdf' ? 'fa-file-pdf' : 'fa-file-image';
        return `
            <div class="employee-doc-card">
                <div class="employee-doc-icon"><i class="fa-solid ${icon}"></i></div>
                <div class="employee-doc-meta">
                    <strong>${employeeEscape(doc.title || 'Document')}</strong>
                    <span class="table-subtext">${formatDate(doc.uploadedAt)}</span>
                </div>
                <div class="catalog-actions">
                    <a href="${employeeEscape(doc.fileUrl)}" target="_blank" rel="noopener" class="catalog-action-btn" title="View">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    </a>
                    <button type="button" class="catalog-action-btn delete" onclick="deleteDocument('${activeProfileData?.employee?._id}', '${doc._id}')" title="Delete">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderProfileAttendance(data) {
    const summaryEl = document.getElementById('profileAttendanceSummary');
    const calEl = document.getElementById('profileAttendanceCalendar');
    const s = data.attendanceSummary || {};

    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="hrm-balance-card"><h4>This Month</h4><ul>
                <li><span>Present</span><strong>${s.present ?? 0}</strong></li>
                <li><span>Absent</span><strong>${s.absent ?? 0}</strong></li>
                <li><span>Late</span><strong>${s.late ?? 0}</strong></li>
                <li><span>Half-day</span><strong>${s.halfDay ?? 0}</strong></li>
            </ul></div>
        `;
    }

    if (calEl) {
        calEl.innerHTML = '<p class="hrm-modal-hint">Attendance calendar loads from the monthly register. Use Attendance &amp; Shifts for full history.</p>';
    }
}

function renderProfilePayroll(rows) {
    const tbody = document.getElementById('profilePayrollBody');
    if (!tbody) return;

    if (!rows?.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-status-empty">No payroll records yet.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((r) => `
        <tr>
            <td>${employeeEscape(window.HRM_MONTHS?.[r.month - 1] || r.month)} ${r.year}</td>
            <td>${employeeFormatMoney(r.baseSalary)}</td>
            <td>${employeeFormatMoney(r.bonus)}</td>
            <td>${employeeFormatMoney(r.deductions)}</td>
            <td><strong>${employeeFormatMoney(r.totalSalary)}</strong></td>
            <td><span class="status-badge ${EMPLOYEE_STATUS_CLASSES[r.status === 'paid' ? 'active' : 'inactive'] || 'status-pending'}">${employeeEscape(r.status)}</span></td>
            <td>
                <button type="button" class="catalog-action-btn" onclick="downloadPaySlip('${r._id}')" title="Download pay slip">
                    <i class="fa-solid fa-file-pdf"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderProfileLeave(data) {
    const balanceEl = document.getElementById('profileLeaveBalance');
    const recentEl = document.getElementById('profileLeaveRecent');

    if (balanceEl) {
        balanceEl.innerHTML = (data.leaveBalance || []).map((b) => `
            <div class="hrm-balance-card">
                <h4>${employeeEscape(b.leaveType)}</h4>
                <ul>
                    <li><span>Allowed</span><strong>${b.allowed}</strong></li>
                    <li><span>Used</span><strong>${b.used}</strong></li>
                    <li><span>Pending</span><strong>${b.pending}</strong></li>
                    <li><span>Remaining</span><strong>${b.remaining}</strong></li>
                </ul>
            </div>
        `).join('');
    }

    if (recentEl) {
        const leaves = data.recentLeaves || [];
        recentEl.innerHTML = leaves.length
            ? `<div class="table-container"><table class="data-table"><thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th></tr></thead><tbody>
                ${leaves.map((l) => `
                    <tr>
                        <td>${employeeEscape(l.leaveType)}</td>
                        <td>${formatDate(l.startDate)} – ${formatDate(l.endDate)}</td>
                        <td>${l.totalDays}</td>
                        <td>${employeeEscape(l.status)}</td>
                    </tr>
                `).join('')}
            </tbody></table></div>`
            : '<p class="table-status-empty">No leave applications this year.</p>';
    }
}

async function openEmployeeProfile(id) {
    window._activeProfileEmployeeId = id;

    try {
        const res = await fetch(`/api/admin/hrm/employees/${id}/profile`, { headers: employeeAuthHeaders() });
        const result = await res.json();

        if (!result.success || !result.data) {
            showToast(result.message || 'Profile not found.', 'error');
            return;
        }

        activeProfileData = result.data;
        const e = result.data.employee;

        const photo = document.getElementById('profileHeaderPhoto');
        if (photo) {
            if (e.photo) {
                photo.src = e.photo;
                photo.style.display = 'block';
            } else {
                photo.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(e.fullName || 'E')}&background=2563eb&color=fff&size=128`;
            }
        }

        document.getElementById('profileHeaderName').textContent = e.fullName || 'Employee';
        document.getElementById('profileHeaderMeta').textContent = `${e.employeeId || ''} · ${e.department || 'Operations'}`;

        const desigBadge = document.getElementById('profileDesignationBadge');
        if (desigBadge) desigBadge.textContent = e.designation || e.role || 'Staff';

        const statusBadge = document.getElementById('profileStatusBadge');
        if (statusBadge) {
            statusBadge.textContent = e.status || 'active';
            statusBadge.className = `status-badge ${EMPLOYEE_STATUS_CLASSES[e.status] || 'status-pending'}`;
        }

        renderProfileOverview(result.data);
        renderProfileDocuments(result.data.documents || e.documents || []);
        renderProfileAttendance(result.data);
        renderProfilePayroll(result.data.payrollHistory || []);
        renderProfileLeave(result.data);

        switchProfileTab('profile-tab-overview');
        document.getElementById('employeeProfileModal').style.display = 'flex';
    } catch (err) {
        console.error('openEmployeeProfile:', err);
        showToast('Failed to load profile.', 'error');
    }
}

/* ==================================================================
   DOCUMENTS
   ================================================================== */

function openDocumentUpload() {
    if (!activeProfileData?.employee?._id) {
        showToast('Open an employee profile first.', 'warning');
        return;
    }
    document.getElementById('employeeDocTitle').value = '';
    document.getElementById('employeeDocFile').value = '';
    document.getElementById('employeeDocumentModal').style.display = 'flex';
}

function closeDocumentUploadModal() {
    document.getElementById('employeeDocumentModal').style.display = 'none';
}

async function submitEmployeeDocument() {
    const employeeId = activeProfileData?.employee?._id;
    const title = document.getElementById('employeeDocTitle')?.value?.trim();
    const file = document.getElementById('employeeDocFile')?.files?.[0];

    if (!employeeId || !title || !file) {
        showToast('Title and file are required.', 'warning');
        return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('document', file);

    const btn = document.getElementById('employeeDocSaveBtn');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch(`/api/admin/hrm/employees/${employeeId}/documents`, {
            method: 'POST',
            headers: { Authorization: employeeAuthHeaders().Authorization },
            body: formData
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess('Document Uploaded', result.message || 'Saved.');
            closeDocumentUploadModal();
            renderProfileDocuments(result.data);
            activeProfileData.documents = result.data;
        } else {
            showToast(result.message || 'Upload failed.', 'error');
        }
    } catch (err) {
        console.error('submitEmployeeDocument:', err);
        showToast('Upload failed.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function deleteDocument(employeeId, docId) {
    confirmAdminAction('Remove this document?', async () => {
        try {
            const res = await fetch(`/api/admin/hrm/employees/${employeeId}/documents/${docId}`, {
                method: 'DELETE',
                headers: employeeAuthHeaders()
            });
            const result = await res.json();

            if (result.success) {
                showToast('Document removed.', 'success');
                renderProfileDocuments(result.data);
                if (activeProfileData) activeProfileData.documents = result.data;
            } else {
                showToast(result.message || 'Delete failed.', 'error');
            }
        } catch (err) {
            console.error('deleteDocument:', err);
            showToast('Delete failed.', 'error');
        }
    }, 'danger');
}

/* ==================================================================
   TERMINATE & ATTENDANCE SHORTCUT
   ================================================================== */

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
                closeEmployeeProfileModal();
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

function markEmployeeAttendance(staffKey) {
    window.hrmPendingAttendanceStaff = staffKey;
    const nav = document.querySelector('[data-target="view-hrm-attendance"]');
    if (nav && window.navigateAdminSection) {
        window.navigateAdminSection('view-hrm-attendance', nav);
    }
}

/* ==================================================================
   SECTION BOOTSTRAP
   ================================================================== */

async function loadHrmEmployeesSection() {
    await Promise.all([loadEmployeeStats(), loadDesignationsDropdown()]);
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

    const desigSelect = document.getElementById('employeeDesignation');
    if (desigSelect && !desigSelect.dataset.bound) {
        desigSelect.dataset.bound = '1';
        desigSelect.addEventListener('change', () => {
            const opt = desigSelect.selectedOptions[0];
            const dept = opt?.getAttribute('data-dept');
            if (dept) {
                const deptInput = document.getElementById('employeeDepartment');
                if (deptInput) deptInput.value = dept;
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', setupHrmEmployeesSection);

// Backward-compatible alias
async function viewEmployeeDetails(id) {
    return openEmployeeProfile(id);
}

window.loadEmployees = loadEmployees;
window.loadEmployeeStats = loadEmployeeStats;
window.renderEmployeeTable = renderEmployeeTable;
window.openAddEmployeeModal = openAddEmployeeModal;
window.openEditEmployeeModal = openEditEmployeeModal;
window.closeEmployeeModal = closeEmployeeModal;
window.saveEmployee = saveEmployee;
window.switchEmployeeFormTab = switchEmployeeFormTab;
window.handleEmployeePhotoPick = handleEmployeePhotoPick;
window.uploadEmployeePhoto = uploadEmployeePhoto;
window.copyPresentToPermanent = copyPresentToPermanent;
window.openEmployeeProfile = openEmployeeProfile;
window.closeEmployeeProfileModal = closeEmployeeProfileModal;
window.switchProfileTab = switchProfileTab;
window.viewEmployeeDetails = viewEmployeeDetails;
window.openDocumentUpload = openDocumentUpload;
window.closeDocumentUploadModal = closeDocumentUploadModal;
window.submitEmployeeDocument = submitEmployeeDocument;
window.deleteDocument = deleteDocument;
window.openDesignationManager = openDesignationManager;
window.closeDesignationManager = closeDesignationManager;
window.addDesignation = addDesignation;
window.deleteDesignation = deleteDesignation;
window.saveDesignationEdit = saveDesignationEdit;
window.loadDesignationsDropdown = loadDesignationsDropdown;
window.openQuickAddDesignation = openQuickAddDesignation;
window.closeQuickAddDesignation = closeQuickAddDesignation;
window.submitQuickDesignation = submitQuickDesignation;
window.terminateEmployee = terminateEmployee;
window.markEmployeeAttendance = markEmployeeAttendance;
window.loadHrmEmployeesSection = loadHrmEmployeesSection;

function closeGrantAccessModal() {
    const modal = document.getElementById('grantAccessModal');
    if (modal) modal.style.display = 'none';
}

function closeManageAccessModal() {
    const modal = document.getElementById('manageAccessModal');
    if (modal) modal.style.display = 'none';
}

window.openGrantAccessModal = function openGrantAccessModal(employeeId, name, email, phone) {
    document.getElementById('grantEmpId').value = employeeId;
    document.getElementById('grantEmpName').value = name;
    document.getElementById('grantEmpEmail').value = email || '';
    document.getElementById('grantEmpPhone').value = phone || '';
    document.getElementById('grantPassword').value = '';
    document.getElementById('grantConfirmPassword').value = '';
    document.querySelectorAll('#grantAccessModal input[type=checkbox]').forEach((cb) => { cb.checked = false; });
    const suggested = String(name || '').toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '');
    document.getElementById('grantUsername').value = suggested;
    document.getElementById('grantAccessModal').style.display = 'flex';
};

window.submitGrantAccess = async function submitGrantAccess() {
    const id = document.getElementById('grantEmpId').value;
    const username = document.getElementById('grantUsername').value.trim();
    const password = document.getElementById('grantPassword').value;
    const confirm = document.getElementById('grantConfirmPassword').value;
    if (!username || !password) {
        alert('Username and password required');
        return;
    }
    if (password !== confirm) {
        alert('Passwords do not match');
        return;
    }
    const permissions = Array.from(
        document.querySelectorAll('#grantAccessModal input[type=checkbox]:checked')
    ).map((cb) => cb.value);
    if (permissions.length === 0) {
        alert('Select at least one permission');
        return;
    }

    try {
        const res = await fetch(`/api/admin/hrm/employees/${id}/grant-access`, {
            method: 'POST',
            headers: { ...employeeAuthHeaders(true) },
            body: JSON.stringify({ username, password, permissions })
        });
        const data = await res.json();
        if (data.success) {
            alert(`System access granted to ${data.username}`);
            closeGrantAccessModal();
            await loadEmployees();
        } else {
            alert(data.error || 'Failed to grant access');
        }
    } catch (err) {
        console.error('submitGrantAccess:', err);
        alert('Failed to grant access');
    }
};

window.applyPermissionPreset = function applyPermissionPreset(preset) {
    const presets = {
        full: ['manage_orders', 'manage_inventory', 'manage_catalog', 'manage_customers',
            'manage_settings', 'manage_marketing', 'manage_security', 'manage_staff'],
        inventory: ['manage_inventory', 'manage_catalog'],
        orders: ['manage_orders', 'manage_customers'],
        pos: ['manage_orders', 'manage_inventory'],
        hr: ['manage_staff']
    };
    const perms = presets[preset] || [];
    document.querySelectorAll('#grantAccessModal input[type=checkbox]').forEach((cb) => {
        cb.checked = perms.includes(cb.value);
    });
};

window.openManageAccessModal = async function openManageAccessModal(employeeId) {
    try {
        const res = await fetch(`/api/admin/hrm/employees/${employeeId}/access-status`, {
            headers: employeeAuthHeaders()
        });
        const data = await res.json();
        if (!data.hasAccess) {
            alert('No system access found');
            return;
        }

        document.getElementById('manageAccessUsername').textContent = data.admin.username;
        const statusEl = document.getElementById('manageAccessStatus');
        statusEl.textContent = data.admin.status;
        statusEl.className = `status-badge ${data.admin.status === 'active' ? 'status-verified' : 'status-blocked'}`;
        document.getElementById('manageAccessLastLogin').textContent = data.admin.lastLoginAt
            ? formatDate(data.admin.lastLoginAt)
            : 'Never';
        document.getElementById('manageAccessPermissions').textContent = (data.admin.permissions || []).join(', ') || '—';
        document.getElementById('manageAccessEmpId').value = employeeId;
        document.getElementById('manageAccessModal').style.display = 'flex';
    } catch (err) {
        console.error('openManageAccessModal:', err);
        alert('Failed to load access status');
    }
};

window.revokeAccess = async function revokeAccess() {
    const id = document.getElementById('manageAccessEmpId').value;
    if (!confirm('Suspend this employee login? They will not be able to log in.')) return;

    try {
        const res = await fetch(`/api/admin/hrm/employees/${id}/revoke-access`, {
            method: 'POST',
            headers: employeeAuthHeaders(true)
        });
        const data = await res.json();
        if (data.success) {
            alert('Access suspended.');
            closeManageAccessModal();
            await loadEmployees();
        } else {
            alert(data.error || 'Failed to suspend access');
        }
    } catch (err) {
        console.error('revokeAccess:', err);
        alert('Failed to suspend access');
    }
};

window.closeGrantAccessModal = closeGrantAccessModal;
window.closeManageAccessModal = closeManageAccessModal;
