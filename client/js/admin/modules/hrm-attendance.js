/**
 * Project: EOnlineBazar — HRM Attendance & Shifts
 * File: js/admin/modules/hrm-attendance.js
 * Description: Attendance register, shift roster CRUD, and the monthly
 * late report. Also owns the shared HRM helpers (staff roster cache, month
 * selects, tab switching) that hrm-payroll.js and hrm-leaves.js reuse.
 */
import '../admin-core.js';

const HRM_MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const ATTENDANCE_STATUS_CLASSES = {
    present: 'status-verified',
    late: 'status-pending',
    absent: 'status-blocked',
    'half-day': 'status-pending',
    holiday: 'status-verified',
    leave: 'status-verified'
};

const DAILY_SHEET_STATUS_META = {
    present: { label: '✓ Present', className: 'att-pill att-pill--present' },
    absent: { label: '✗ Absent', className: 'att-pill att-pill--absent' },
    late: { label: '⏰ Late', className: 'att-pill att-pill--late' },
    'half-day': { label: '◑ Half-Day', className: 'att-pill att-pill--halfday' },
    leave: { label: '🏖 Leave', className: 'att-pill att-pill--leave' },
    holiday: { label: '📅 Holiday', className: 'att-pill att-pill--holiday' },
    none: { label: '— Not Marked', className: 'att-pill att-pill--none' }
};

let dailySheetCache = [];
let dailySheetLocked = false;
let dailySheetLockInfo = null;
let dailySheetPastDateViewOnly = false;

/** Staff roster is read by all three HRM sections — fetched once per page load. */
let hrmStaffCache = [];
let hrmEmployeeCache = [];

function hrmEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function hrmAuthHeaders(json = false) {
    const headers = { Authorization: `Bearer ${token}` };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
}

function hrmFormatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function hrmFormatTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function hrmFormatMoney(amount) {
    const symbol = window.adminCurrencySymbol || '৳';
    return `${symbol} ${(Number(amount) || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
}

/** Today's date as the yyyy-mm-dd string an <input type="date"> expects. */
function hrmTodayInputValue() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function hrmFillMonthSelect(selectId, selectedMonth) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const month = selectedMonth || new Date().getMonth() + 1;
    select.innerHTML = HRM_MONTHS
        .map((name, index) => `<option value="${index + 1}"${index + 1 === month ? ' selected' : ''}>${name}</option>`)
        .join('');
}

function hrmFillYearInput(inputId, year) {
    const input = document.getElementById(inputId);
    if (input && !input.value) input.value = year || new Date().getFullYear();
}

function hrmParseStaffSelect(value) {
    const raw = String(value || '').trim();
    if (!raw) return {};
    if (raw.includes(':')) {
        const [staffType, id] = raw.split(':');
        if (staffType === 'employee') {
            return { staffType: 'employee', staffId: id, employeeId: id };
        }
        return { staffType: 'admin', staffUsername: id, staffId: id };
    }
    return { staffType: 'admin', staffUsername: raw };
}

function hrmInvalidateEmployeeCache() {
    hrmEmployeeCache = [];
}

/** Load admin staff + operational employees into grouped optgroups. */
async function hrmLoadStaffOptions(selectIds = [], { placeholder = 'All staff', includeEmployees = true } = {}) {
    if (!hrmStaffCache.length) {
        try {
            const res = await fetch('/api/admin/hrm/staff', { headers: hrmAuthHeaders() });
            const result = await res.json();
            hrmStaffCache = Array.isArray(result.data) ? result.data : [];
        } catch (err) {
            console.error('hrmLoadStaffOptions (staff):', err);
            hrmStaffCache = [];
        }
    }

    if (includeEmployees && !hrmEmployeeCache.length) {
        try {
            const res = await fetch('/api/admin/hrm/employees?all=true', { headers: hrmAuthHeaders() });
            const result = await res.json();
            hrmEmployeeCache = Array.isArray(result.data) ? result.data : [];
        } catch (err) {
            console.error('hrmLoadStaffOptions (employees):', err);
            hrmEmployeeCache = [];
        }
    }

    selectIds.forEach((selectId) => {
        const select = document.getElementById(selectId);
        if (!select) return;

        const previous = select.value;
        let html = select.multiple ? '' : `<option value="">${hrmEscape(placeholder)}</option>`;

        if (hrmStaffCache.length) {
            html += `<optgroup label="System Staff">`;
            html += hrmStaffCache
                .map((s) => {
                    const roleLabel = s.department || s.username || 'Staff';
                    return `<option value="admin:${hrmEscape(s.username)}">${hrmEscape(s.name || s.username)} — ${hrmEscape(roleLabel)}</option>`;
                })
                .join('');
            html += `</optgroup>`;
        }

        if (includeEmployees && hrmEmployeeCache.length) {
            html += `<optgroup label="Operational Employees">`;
            html += hrmEmployeeCache
                .map((e) => {
                    const designation = e.designation || e.role || 'Employee';
                    return `<option value="employee:${hrmEscape(e.employeeId)}">${hrmEscape(e.fullName)} — ${hrmEscape(designation)}</option>`;
                })
                .join('');
            html += `</optgroup>`;
        }

        select.innerHTML = html;
        if (previous) select.value = previous;
    });

    return { staff: hrmStaffCache, employees: hrmEmployeeCache };
}

function hrmFindStaff(username) {
    return hrmStaffCache.find((s) => s.username === username) || null;
}

/**
 * Wire a `.hrm-tabs` container so clicking a tab shows its `.hrm-panel`.
 * `onShow` receives the panel id the first time each panel is opened, which
 * is when its data should be fetched.
 */
function hrmSetupTabs(containerId, onShow) {
    const container = document.getElementById(containerId);
    if (!container || container.dataset.bound) return;
    container.dataset.bound = '1';

    const loaded = new Set();

    container.addEventListener('click', (e) => {
        const tab = e.target.closest('.hrm-tab');
        if (!tab) return;

        const panelId = tab.getAttribute('data-hrm-tab');
        container.querySelectorAll('.hrm-tab').forEach((btn) => btn.classList.toggle('active', btn === tab));

        container.parentElement.querySelectorAll('.hrm-panel').forEach((panel) => {
            panel.style.display = panel.id === panelId ? 'block' : 'none';
        });

        if (!loaded.has(panelId)) {
            loaded.add(panelId);
            if (typeof onShow === 'function') onShow(panelId);
        }
    });
}

function hrmIsSuperAdmin() {
    return typeof window.isAdminSuperAdmin === 'function' && window.isAdminSuperAdmin();
}

function hrmCanEditPastAttendanceDates() {
    if (hrmIsSuperAdmin()) return true;
    try {
        const cached = sessionStorage.getItem('adminProfile');
        if (cached) {
            const profile = JSON.parse(cached);
            const role = String(profile.role || '').toLowerCase();
            if (role === 'hr' || role === 'superadmin' || role === 'super_admin') return true;
        }
    } catch (_) { /* ignore corrupt cache */ }
    return false;
}

function updateDailySheetPastDateUI() {
    const dateInput = document.getElementById('dailySheetDate');
    const banner = document.getElementById('dailySheetPastDateBanner');
    const today = hrmTodayInputValue();
    const selected = dateInput?.value || today;
    const isPast = selected < today;

    dailySheetPastDateViewOnly = isPast && !hrmCanEditPastAttendanceDates();

    if (dateInput) dateInput.max = today;

    if (banner) banner.hidden = !dailySheetPastDateViewOnly;

    ['dailySheetMarkAllPresentBtn', 'dailySheetMarkAllAbsentBtn'].forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = dailySheetPastDateViewOnly || dailySheetLocked;
    });
}

function renderDailySheetStatusPill(status) {
    const meta = DAILY_SHEET_STATUS_META[status] || DAILY_SHEET_STATUS_META.none;
    return `<span class="${meta.className}">${meta.label}</span>`;
}

function updateDailySheetLockUI() {
    const statusEl = document.getElementById('dailySheetLockStatus');
    const lockBtn = document.getElementById('dailySheetLockBtn');
    const unlockBtn = document.getElementById('dailySheetUnlockBtn');

    if (statusEl) {
        if (dailySheetLocked && dailySheetLockInfo) {
            const when = dailySheetLockInfo.lockedAt
                ? new Date(dailySheetLockInfo.lockedAt).toLocaleString('en-GB')
                : '';
            statusEl.textContent = `🔒 Locked by ${dailySheetLockInfo.lockedByName || 'Admin'}${when ? ` at ${when}` : ''}`;
            statusEl.className = 'att-lock-status att-lock-status--locked';
        } else {
            statusEl.textContent = '🔓 Unlocked';
            statusEl.className = 'att-lock-status att-lock-status--open';
        }
    }

    if (lockBtn) lockBtn.hidden = dailySheetLocked || !hrmIsSuperAdmin();
    if (unlockBtn) unlockBtn.hidden = !dailySheetLocked || !hrmIsSuperAdmin();

    if (typeof window.applySuperAdminOnlyVisibility === 'function') {
        window.applySuperAdminOnlyVisibility();
    }
}

function populateDailySheetDepartments(employees) {
    const select = document.getElementById('dailySheetDept');
    if (!select) return;

    const current = select.value;
    const departments = [...new Set((employees || []).map((e) => e.department).filter(Boolean))].sort();
    select.innerHTML = '<option value="">All departments</option>'
        + departments.map((d) => `<option value="${hrmEscape(d)}">${hrmEscape(d)}</option>`).join('');
    if (current) select.value = current;
}

function renderDailySheetRows(employees) {
    const tbody = document.getElementById('dailySheetTableBody');
    if (!tbody) return;

    const deptFilter = document.getElementById('dailySheetDept')?.value || '';
    const rows = (employees || []).filter((e) => !deptFilter || e.department === deptFilter);

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="table-status-empty">No active employees for this filter.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((row) => {
        const status = row.attendance?.status || 'none';
        const photo = row.photo
            ? `<img src="${hrmEscape(row.photo)}" alt="" class="hrm-employee-thumb">`
            : `<span class="hrm-employee-thumb hrm-employee-thumb--placeholder">${hrmEscape((row.name || '?').charAt(0))}</span>`;

        let actionCell = '';
        if (dailySheetLocked) {
            actionCell = '<span class="att-lock-icon" title="Date locked">🔒</span>';
        } else if (dailySheetPastDateViewOnly) {
            actionCell = '<span class="att-view-only-label" title="Past date — view only">View only</span>';
        } else {
            actionCell = `
                <div class="att-split-btn" data-employee-id="${hrmEscape(row.employeeId)}">
                    <button type="button" class="att-split-btn__main" onclick="markDailySheetStatus('${hrmEscape(row.employeeId)}','present', this)">✓ Present</button>
                    <button type="button" class="att-split-btn__toggle" onclick="toggleDailySheetMenu(this)" aria-label="More statuses">▾</button>
                    <div class="att-split-menu" hidden>
                        <button type="button" onclick="markDailySheetStatus('${hrmEscape(row.employeeId)}','late', this)">Late</button>
                        <button type="button" onclick="markDailySheetStatus('${hrmEscape(row.employeeId)}','half-day', this)">Half-Day</button>
                        <button type="button" onclick="markDailySheetStatus('${hrmEscape(row.employeeId)}','absent', this)">Absent</button>
                        <button type="button" onclick="markDailySheetStatus('${hrmEscape(row.employeeId)}','leave', this)">Leave</button>
                        <button type="button" onclick="markDailySheetStatus('${hrmEscape(row.employeeId)}','holiday', this)">Holiday</button>
                    </div>
                    <span class="att-saved-flash" hidden>✓ Saved</span>
                </div>`;
        }

        return `
            <tr data-employee-id="${hrmEscape(row.employeeId)}" data-department="${hrmEscape(row.department || '')}">
                <td>${photo}</td>
                <td><code>${hrmEscape(row.empId || '—')}</code></td>
                <td><strong>${hrmEscape(row.name || '—')}</strong></td>
                <td>${hrmEscape(row.designation || '—')}</td>
                <td>${hrmEscape(row.department || '—')}</td>
                <td class="daily-sheet-status-cell">${renderDailySheetStatusPill(status)}</td>
                <td>${hrmFormatTime(row.attendance?.checkIn)}</td>
                <td>${hrmFormatTime(row.attendance?.checkOut)}</td>
                <td>${actionCell}</td>
            </tr>`;
    }).join('');
}

async function loadDailySheet() {
    const tbody = document.getElementById('dailySheetTableBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading-container"><div class="spinner"></div><p>Loading daily sheet…</p></td></tr>';
    }

    const date = document.getElementById('dailySheetDate')?.value || hrmTodayInputValue();
    const dept = document.getElementById('dailySheetDept')?.value || '';
    const params = new URLSearchParams({ date });
    if (dept) params.set('dept', dept);

    try {
        const res = await fetch(`/api/admin/hrm/attendance/daily-sheet?${params.toString()}`, {
            headers: hrmAuthHeaders()
        });
        const result = await res.json();

        if (!result.success) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="table-status-error">Failed to load daily sheet.</td></tr>';
            return;
        }

        dailySheetCache = result.data?.employees || [];
        dailySheetLocked = Boolean(result.data?.isLocked);
        dailySheetLockInfo = result.data?.lockInfo || null;

        populateDailySheetDepartments(dailySheetCache);
        updateDailySheetPastDateUI();
        renderDailySheetRows(dailySheetCache);
        updateDailySheetLockUI();
    } catch (err) {
        console.error('loadDailySheet:', err);
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="table-status-error">Failed to load daily sheet.</td></tr>';
    }
}

function toggleDailySheetMenu(btn) {
    const menu = btn.parentElement?.querySelector('.att-split-menu');
    if (!menu) return;
    document.querySelectorAll('.att-split-menu').forEach((el) => {
        if (el !== menu) el.hidden = true;
    });
    menu.hidden = !menu.hidden;
}

function flashDailySheetSaved(employeeId) {
    const row = document.querySelector(`#dailySheetTableBody tr[data-employee-id="${employeeId}"]`);
    const flash = row?.querySelector('.att-saved-flash');
    if (!flash) return;
    flash.hidden = false;
    setTimeout(() => { flash.hidden = true; }, 2000);
}

async function markDailySheetStatus(employeeId, status, triggerEl) {
    if (dailySheetPastDateViewOnly) {
        showToast('Past dates are view-only. Contact HR to make changes.', 'warning');
        return;
    }
    if (dailySheetLocked) {
        showToast('This date is locked.', 'warning');
        return;
    }

    const date = document.getElementById('dailySheetDate')?.value || hrmTodayInputValue();
    const menu = triggerEl?.closest('.att-split-btn')?.querySelector('.att-split-menu');
    if (menu) menu.hidden = true;

    try {
        const res = await fetch('/api/admin/hrm/attendance/mark', {
            method: 'POST',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify({ employeeId, date, status })
        });
        const result = await res.json();

        if (res.status === 423) {
            showToast(result.message || 'Date is locked.', 'warning');
            return;
        }
        if (res.status === 403) {
            showToast(result.message || 'Past dates are view-only.', 'warning');
            return;
        }
        if (!result.success) {
            showToast(result.message || 'Failed to mark attendance.', 'error');
            return;
        }

        const row = dailySheetCache.find((e) => String(e.employeeId) === String(employeeId));
        if (row) {
            row.attendance = {
                status,
                checkIn: result.data?.clockIn || null,
                checkOut: result.data?.clockOut || null,
                note: result.data?.notes || ''
            };
        }

        const tr = document.querySelector(`#dailySheetTableBody tr[data-employee-id="${employeeId}"]`);
        const statusCell = tr?.querySelector('.daily-sheet-status-cell');
        if (statusCell) statusCell.innerHTML = renderDailySheetStatusPill(status);

        flashDailySheetSaved(employeeId);
    } catch (err) {
        console.error('markDailySheetStatus:', err);
        showToast('Server error while marking attendance.', 'error');
    }
}

async function bulkMarkDailySheet(status) {
    if (dailySheetPastDateViewOnly) {
        showToast('Past dates are view-only. Contact HR to make changes.', 'warning');
        return;
    }
    if (dailySheetLocked) {
        showToast('This date is locked.', 'warning');
        return;
    }

    const date = document.getElementById('dailySheetDate')?.value || hrmTodayInputValue();
    const deptFilter = document.getElementById('dailySheetDept')?.value || '';
    const ids = dailySheetCache
        .filter((e) => !deptFilter || e.department === deptFilter)
        .map((e) => e.employeeId);

    if (!ids.length) {
        showToast('No employees to mark.', 'warning');
        return;
    }

    try {
        const res = await fetch('/api/admin/hrm/attendance/bulk-mark', {
            method: 'POST',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify({ date, employeeIds: ids, status })
        });
        const result = await res.json();

        if (res.status === 423) {
            showToast(result.message || 'Date is locked.', 'warning');
            return;
        }
        if (res.status === 403) {
            showToast(result.message || 'Past dates are view-only.', 'warning');
            return;
        }
        if (!result.success) {
            showToast(result.message || 'Bulk mark failed.', 'error');
            return;
        }

        showToast(`Marked ${result.data?.success || 0} employee(s) as ${status}.`, 'success');
        await loadDailySheet();
    } catch (err) {
        console.error('bulkMarkDailySheet:', err);
        showToast('Server error during bulk mark.', 'error');
    }
}

async function lockDailySheetDate() {
    const date = document.getElementById('dailySheetDate')?.value || hrmTodayInputValue();
    try {
        const res = await fetch('/api/admin/hrm/attendance/lock', {
            method: 'POST',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify({ date })
        });
        const result = await res.json();
        if (!result.success) {
            showToast(result.message || 'Failed to lock date.', 'error');
            return;
        }
        showToast('Date locked successfully.', 'success');
        await loadDailySheet();
    } catch (err) {
        console.error('lockDailySheetDate:', err);
        showToast('Failed to lock date.', 'error');
    }
}

async function unlockDailySheetDate() {
    const date = document.getElementById('dailySheetDate')?.value || hrmTodayInputValue();
    try {
        const res = await fetch('/api/admin/hrm/attendance/lock', {
            method: 'DELETE',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify({ date })
        });
        const result = await res.json();
        if (!result.success) {
            showToast(result.message || 'Failed to unlock date.', 'error');
            return;
        }
        showToast('Date unlocked.', 'success');
        await loadDailySheet();
    } catch (err) {
        console.error('unlockDailySheetDate:', err);
        showToast('Failed to unlock date.', 'error');
    }
}

async function loadManualEntries() {
    const tbody = document.getElementById('manualEntriesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="loading-container"><div class="spinner"></div><p>Loading entries…</p></td></tr>';

    try {
        const res = await fetch('/api/admin/hrm/attendance/manual-entries?limit=30', {
            headers: hrmAuthHeaders()
        });
        const result = await res.json();
        const rows = result.data || [];

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="table-status-empty">No manual entries yet.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((row) => `
            <tr>
                <td>${hrmFormatDate(row.date)}</td>
                <td><strong>${hrmEscape(row.employeeName)}</strong>${row.empId ? `<br><code>${hrmEscape(row.empId)}</code>` : ''}</td>
                <td>${renderDailySheetStatusPill(row.status)}</td>
                <td>${hrmFormatTime(row.checkIn)}</td>
                <td>${hrmFormatTime(row.checkOut)}</td>
                <td>${hrmEscape(row.note || '—')}</td>
                <td>${hrmEscape(row.modifiedBy || '—')}</td>
                <td>${hrmFormatDate(row.modifiedAt)} ${hrmFormatTime(row.modifiedAt)}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadManualEntries:', err);
        tbody.innerHTML = '<tr><td colspan="8" class="table-status-error">Failed to load manual entries.</td></tr>';
    }
}

async function loadManualEntryEmployees() {
    const select = document.getElementById('manualEntryEmployee');
    if (!select) return;

    if (!hrmEmployeeCache.length) {
        try {
            const res = await fetch('/api/admin/hrm/employees?all=true', { headers: hrmAuthHeaders() });
            const result = await res.json();
            hrmEmployeeCache = Array.isArray(result.data) ? result.data : [];
        } catch (err) {
            console.error('loadManualEntryEmployees:', err);
        }
    }

    const previous = select.value;
    select.innerHTML = '<option value="">Select employee…</option>'
        + hrmEmployeeCache
            .filter((e) => e.status === 'active')
            .map((e) => `<option value="${hrmEscape(e._id)}">${hrmEscape(e.fullName)} — ${hrmEscape(e.employeeId)}</option>`)
            .join('');
    if (previous) select.value = previous;
}

async function saveManualEntry() {
    const payload = {
        date: document.getElementById('manualEntryDate')?.value,
        employeeId: document.getElementById('manualEntryEmployee')?.value,
        status: document.getElementById('manualEntryStatus')?.value,
        checkIn: document.getElementById('manualEntryCheckIn')?.value || undefined,
        checkOut: document.getElementById('manualEntryCheckOut')?.value || undefined,
        note: document.getElementById('manualEntryNote')?.value?.trim() || '',
        overrideLock: document.getElementById('manualEntryOverrideLock')?.checked || false
    };

    if (!payload.date || !payload.employeeId || !payload.status) {
        showToast('Date, employee, and status are required.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('manualEntrySaveBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const res = await fetch('/api/admin/hrm/attendance/manual-entry', {
            method: 'POST',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (res.status === 423) {
            showToast(result.message || 'Date is locked. Enable override if you are Super Admin.', 'warning');
            return;
        }
        if (!result.success) {
            showToast(result.message || 'Failed to save manual entry.', 'error');
            return;
        }

        showAdminSuccess('Manual Entry Saved', result.message || 'Attendance updated.');
        await loadManualEntries();
        await loadDailySheet();
    } catch (err) {
        console.error('saveManualEntry:', err);
        showToast('Server error while saving entry.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function setupDailySheetSection() {
    const dateInput = document.getElementById('dailySheetDate');
    if (dateInput && !dateInput.value) dateInput.value = hrmTodayInputValue();
    updateDailySheetPastDateUI();

    const deptSelect = document.getElementById('dailySheetDept');
    if (deptSelect && !deptSelect.dataset.bound) {
        deptSelect.dataset.bound = '1';
        deptSelect.addEventListener('change', () => renderDailySheetRows(dailySheetCache));
    }

    const bindClick = (id, fn) => {
        const el = document.getElementById(id);
        if (el && !el.dataset.bound) {
            el.dataset.bound = '1';
            el.addEventListener('click', fn);
        }
    };

    bindClick('dailySheetRefreshBtn', loadDailySheet);
    bindClick('dailySheetMarkAllPresentBtn', () => bulkMarkDailySheet('present'));
    bindClick('dailySheetMarkAllAbsentBtn', () => bulkMarkDailySheet('absent'));
    bindClick('dailySheetLockBtn', lockDailySheetDate);
    bindClick('dailySheetUnlockBtn', unlockDailySheetDate);

    if (dateInput && !dateInput.dataset.bound) {
        dateInput.dataset.bound = '1';
        dateInput.addEventListener('change', () => {
            updateDailySheetPastDateUI();
            loadDailySheet();
        });
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.att-split-btn')) {
            document.querySelectorAll('.att-split-menu').forEach((menu) => { menu.hidden = true; });
        }
    });
}

/* ==================================================================
   ATTENDANCE REGISTER
   ================================================================== */

function renderAttendanceStats(stats) {
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value ?? 0;
    };

    set('hrmAttendancePresent', stats?.present);
    set('hrmAttendanceAbsent', stats?.absent);
    set('hrmAttendanceLate', stats?.late);
    set('hrmAttendanceShiftCount', stats?.activeShifts);
}

async function loadAttendanceList() {
    const tbody = document.getElementById('hrmAttendanceTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="loading-container"><div class="spinner"></div><p>Loading attendance…</p></td></tr>';

    const params = new URLSearchParams({ limit: '100', todayStats: 'true' });
    const date = document.getElementById('hrmAttendanceDateFilter')?.value;
    const staff = document.getElementById('hrmAttendanceStaffFilter')?.value;
    const status = document.getElementById('hrmAttendanceStatusFilter')?.value;
    if (date) params.set('date', date);
    if (staff) params.set('staff', staff);
    if (status) params.set('status', status);

    try {
        const res = await fetch(`/api/admin/hrm/attendance?${params.toString()}`, { headers: hrmAuthHeaders() });
        const result = await res.json();

        renderAttendanceStats(result.todayStats);

        const rows = result.data || [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-status-empty">No attendance records for this filter.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((row) => `
            <tr>
                <td><strong>${hrmEscape(row.staffUsername || '—')}</strong></td>
                <td>${hrmFormatDate(row.date)}</td>
                <td>${hrmFormatTime(row.clockIn)}</td>
                <td>${hrmFormatTime(row.clockOut)}</td>
                <td>${Number(row.hoursWorked) || 0}</td>
                <td><span class="status-badge ${ATTENDANCE_STATUS_CLASSES[row.status] || 'status-pending'}">${hrmEscape(row.status)}</span></td>
                <td>${row.isLate
                    ? `<span class="status-badge status-blocked">${Number(row.lateMinutes) || 0} min</span>`
                    : '—'}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadAttendanceList:', err);
        tbody.innerHTML = '<tr><td colspan="7" class="table-status-error">Failed to load attendance.</td></tr>';
    }
}

function resetAttendanceFilters() {
    const date = document.getElementById('hrmAttendanceDateFilter');
    const staff = document.getElementById('hrmAttendanceStaffFilter');
    const status = document.getElementById('hrmAttendanceStatusFilter');
    if (date) date.value = '';
    if (staff) staff.value = '';
    if (status) status.value = '';
    loadAttendanceList();
}

function closeMarkAttendanceModal() {
    const modal = document.getElementById('markAttendanceModal');
    if (modal) modal.style.display = 'none';
}

async function openMarkAttendanceModal() {
    await hrmLoadStaffOptions(['markAttendanceStaff'], { placeholder: 'Select staff member' });

    const dateInput = document.getElementById('markAttendanceDate');
    if (dateInput && !dateInput.value) dateInput.value = hrmTodayInputValue();

    const modal = document.getElementById('markAttendanceModal');
    if (modal) modal.style.display = 'flex';
}

async function saveAttendance() {
    const staffValue = document.getElementById('markAttendanceStaff')?.value;
    const payload = {
        ...hrmParseStaffSelect(staffValue),
        date: document.getElementById('markAttendanceDate')?.value,
        status: document.getElementById('markAttendanceStatus')?.value,
        shift: document.getElementById('markAttendanceShift')?.value,
        lateMinutes: Number(document.getElementById('markAttendanceLateMinutes')?.value) || 0,
        notes: document.getElementById('markAttendanceNotes')?.value?.trim() || ''
    };

    if (!staffValue || !payload.date || !payload.status) {
        showToast('Staff, date, and status are required.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('markAttendanceSaveBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const res = await fetch('/api/admin/hrm/attendance/mark', {
            method: 'POST',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess('Attendance Saved', result.message || 'Attendance recorded.');
            closeMarkAttendanceModal();
            await loadAttendanceList();
        } else {
            showToast(result.message || 'Failed to save attendance.', 'error');
        }
    } catch (err) {
        console.error('saveAttendance:', err);
        showToast('Server error while saving attendance.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

/* ==================================================================
   SHIFTS
   ================================================================== */

let hrmShiftCache = [];

async function loadShifts() {
    const tbody = document.getElementById('hrmShiftsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="loading-container"><div class="spinner"></div><p>Loading shifts…</p></td></tr>';

    try {
        const res = await fetch('/api/admin/hrm/shifts', { headers: hrmAuthHeaders() });
        const result = await res.json();
        hrmShiftCache = result.data || [];

        if (!hrmShiftCache.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-status-empty">No shifts configured yet.</td></tr>';
            return;
        }

        tbody.innerHTML = hrmShiftCache.map((shift) => `
            <tr>
                <td><strong>${hrmEscape(shift.name)}</strong></td>
                <td>${hrmEscape(shift.startTime || '—')}</td>
                <td>${hrmEscape(shift.endTime || '—')}</td>
                <td>${Number(shift.gracePeriodMinutes) || 0}</td>
                <td>${(shift.assignedStaff || []).length
                    ? hrmEscape((shift.assignedStaff || []).join(', '))
                    : '<span class="table-status-empty">Unassigned</span>'}</td>
                <td>${shift.isDefault ? '<span class="status-badge status-verified">Default</span>' : '—'}</td>
                <td>
                    <div class="catalog-actions">
                        <button type="button" class="catalog-action-btn edit" onclick="openEditShiftModal('${shift._id}')" title="Edit">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button type="button" class="catalog-action-btn delete" onclick="deleteShift('${shift._id}')" title="Delete"${shift.isDefault ? ' disabled' : ''}>
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadShifts:', err);
        tbody.innerHTML = '<tr><td colspan="7" class="table-status-error">Failed to load shifts.</td></tr>';
    }
}

function closeShiftModal() {
    const modal = document.getElementById('shiftModal');
    if (modal) modal.style.display = 'none';
}

function resetShiftForm() {
    document.getElementById('shiftEditId').value = '';
    document.getElementById('shiftName').value = '';
    document.getElementById('shiftStartTime').value = '09:00';
    document.getElementById('shiftEndTime').value = '18:00';
    document.getElementById('shiftGracePeriod').value = '15';
    document.getElementById('shiftIsDefault').checked = false;

    const assigned = document.getElementById('shiftAssignedStaff');
    if (assigned) [...assigned.options].forEach((opt) => { opt.selected = false; });

    const title = document.getElementById('shiftModalTitle');
    if (title) title.innerHTML = '<i class="fa-solid fa-business-time"></i> Add Shift';
}

async function openAddShiftModal() {
    await hrmLoadStaffOptions(['shiftAssignedStaff']);
    resetShiftForm();

    const modal = document.getElementById('shiftModal');
    if (modal) modal.style.display = 'flex';
}

async function openEditShiftModal(id) {
    await hrmLoadStaffOptions(['shiftAssignedStaff']);

    const shift = hrmShiftCache.find((s) => String(s._id) === String(id));
    if (!shift) {
        showToast('Shift not found. Refresh and try again.', 'error');
        return;
    }

    resetShiftForm();
    document.getElementById('shiftEditId').value = shift._id;
    document.getElementById('shiftName').value = shift.name || '';
    document.getElementById('shiftStartTime').value = shift.startTime || '09:00';
    document.getElementById('shiftEndTime').value = shift.endTime || '18:00';
    document.getElementById('shiftGracePeriod').value = Number(shift.gracePeriodMinutes) || 0;
    document.getElementById('shiftIsDefault').checked = !!shift.isDefault;

    const assigned = document.getElementById('shiftAssignedStaff');
    if (assigned) {
        const selected = new Set(shift.assignedStaff || []);
        [...assigned.options].forEach((opt) => { opt.selected = selected.has(opt.value); });
    }

    const title = document.getElementById('shiftModalTitle');
    if (title) title.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Shift';

    const modal = document.getElementById('shiftModal');
    if (modal) modal.style.display = 'flex';
}

async function saveShift() {
    const id = document.getElementById('shiftEditId')?.value?.trim();
    const assigned = document.getElementById('shiftAssignedStaff');

    const payload = {
        name: document.getElementById('shiftName')?.value?.trim(),
        startTime: document.getElementById('shiftStartTime')?.value,
        endTime: document.getElementById('shiftEndTime')?.value,
        gracePeriodMinutes: Number(document.getElementById('shiftGracePeriod')?.value) || 0,
        assignedStaff: assigned ? [...assigned.selectedOptions].map((opt) => opt.value) : [],
        isDefault: document.getElementById('shiftIsDefault')?.checked || false
    };

    if (!payload.name) {
        showToast('Shift name is required.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('shiftSaveBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const res = await fetch(id ? `/api/admin/hrm/shifts/${id}` : '/api/admin/hrm/shifts', {
            method: id ? 'PATCH' : 'POST',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess(id ? 'Shift Updated' : 'Shift Created', result.message || 'Saved.');
            closeShiftModal();
            await loadShifts();
        } else {
            showToast(result.message || 'Failed to save shift.', 'error');
        }
    } catch (err) {
        console.error('saveShift:', err);
        showToast('Server error while saving shift.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function deleteShift(id) {
    showCustomConfirm('Delete Shift', 'Are you sure you want to delete this shift?', async () => {
        try {
            const res = await fetch(`/api/admin/hrm/shifts/${id}`, {
                method: 'DELETE',
                headers: hrmAuthHeaders()
            });
            const result = await res.json();

            if (result.success) {
                showAdminSuccess('Shift Deleted', result.message || 'Shift removed.');
                await loadShifts();
            } else {
                showToast(result.message || 'Failed to delete shift.', 'error');
            }
        } catch (err) {
            console.error('deleteShift:', err);
            showToast('Failed to delete shift.', 'error');
        }
    }, 'danger');
}

/* ==================================================================
   LATE REPORT
   ================================================================== */

async function loadLateReport() {
    const tbody = document.getElementById('hrmLateReportTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="loading-container"><div class="spinner"></div><p>Loading late report…</p></td></tr>';

    const month = document.getElementById('hrmLateMonth')?.value || new Date().getMonth() + 1;
    const year = document.getElementById('hrmLateYear')?.value || new Date().getFullYear();

    try {
        const res = await fetch(`/api/admin/hrm/attendance/late-report?month=${month}&year=${year}`, {
            headers: hrmAuthHeaders()
        });
        const result = await res.json();
        const rows = result.data || [];

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-status-empty">No late arrivals recorded this month.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((row) => `
            <tr>
                <td><strong>${hrmEscape(row.staffUsername || '—')}</strong></td>
                <td><span class="status-badge status-blocked">${row.lateCount}</span></td>
                <td>${row.totalLateMinutes} min</td>
                <td>${row.averageLateMinutes} min</td>
                <td>${hrmFormatDate(row.lastLateOn)}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadLateReport:', err);
        tbody.innerHTML = '<tr><td colspan="5" class="table-status-error">Failed to load late report.</td></tr>';
    }
}

/* ==================================================================
   SECTION BOOTSTRAP
   ================================================================== */

/** Called by core-nav when the Attendance & Shifts section opens. */
async function loadHrmAttendanceSection() {
    const now = new Date();
    hrmFillMonthSelect('hrmLateMonth', now.getMonth() + 1);
    hrmFillYearInput('hrmLateYear', now.getFullYear());

    await hrmLoadStaffOptions(['hrmAttendanceStaffFilter']);

    const pendingStaff = window.hrmPendingAttendanceStaff;
    if (pendingStaff) {
        delete window.hrmPendingAttendanceStaff;
        const filter = document.getElementById('hrmAttendanceStaffFilter');
        if (filter) filter.value = pendingStaff;
        await loadAttendanceList();
        await openMarkAttendanceModal();
        const markSelect = document.getElementById('markAttendanceStaff');
        if (markSelect) markSelect.value = pendingStaff;
        return;
    }

    const dailyDate = document.getElementById('dailySheetDate');
    if (dailyDate && !dailyDate.value) dailyDate.value = hrmTodayInputValue();

    await loadDailySheet();
}

function setupHrmAttendanceSection() {
    setupDailySheetSection();

    hrmSetupTabs('hrmAttendanceTabs', (panelId) => {
        if (panelId === 'hrm-tab-daily-sheet') loadDailySheet();
        if (panelId === 'hrm-tab-shifts') loadShifts();
        if (panelId === 'hrm-tab-late') loadLateReport();
        if (panelId === 'hrm-tab-manual') {
            const manualDate = document.getElementById('manualEntryDate');
            if (manualDate && !manualDate.value) manualDate.value = hrmTodayInputValue();
            loadManualEntryEmployees();
            loadManualEntries();
            if (typeof window.applySuperAdminOnlyVisibility === 'function') {
                window.applySuperAdminOnlyVisibility();
            }
        }
    });

    const refreshBtn = document.getElementById('attendanceRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', loadAttendanceList);
    }
}

document.addEventListener('DOMContentLoaded', setupHrmAttendanceSection);

// Shared HRM helpers — hrm-payroll.js and hrm-leaves.js read these at call
// time, so barrel import order does not matter.
Object.assign(window, {
    hrmEscape,
    hrmAuthHeaders,
    hrmFormatDate,
    hrmFormatTime,
    hrmFormatMoney,
    hrmTodayInputValue,
    hrmFillMonthSelect,
    hrmFillYearInput,
    hrmLoadStaffOptions,
    hrmParseStaffSelect,
    hrmInvalidateEmployeeCache,
    hrmFindStaff,
    hrmSetupTabs,
    HRM_MONTHS
});

window.loadHrmAttendanceSection = loadHrmAttendanceSection;
window.loadAttendanceList = loadAttendanceList;
window.resetAttendanceFilters = resetAttendanceFilters;
window.openMarkAttendanceModal = openMarkAttendanceModal;
window.closeMarkAttendanceModal = closeMarkAttendanceModal;
window.saveAttendance = saveAttendance;
window.loadShifts = loadShifts;
window.openAddShiftModal = openAddShiftModal;
window.openEditShiftModal = openEditShiftModal;
window.closeShiftModal = closeShiftModal;
window.saveShift = saveShift;
window.deleteShift = deleteShift;
window.loadLateReport = loadLateReport;
window.loadDailySheet = loadDailySheet;
window.markDailySheetStatus = markDailySheetStatus;
window.toggleDailySheetMenu = toggleDailySheetMenu;
window.saveManualEntry = saveManualEntry;
