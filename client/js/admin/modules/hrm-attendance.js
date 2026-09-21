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
let dailySheetEditEmployeeId = null;

/** Staff roster is read by all three HRM sections — fetched once per page load. */
let hrmStaffCache = [];
let hrmEmployeeCache = [];

const HRM_FETCH_TIMEOUT_MS = 10000;
let attendancePg = null;
const attendancePgState = { page: 1, limit: 10 };

function initAttendancePg() {
    if (!attendancePg && typeof AdminPagination !== 'undefined') {
        attendancePg = AdminPagination.ensure('attendancePaginationContainer', {
            defaultLimit: 10,
            onPageChange: (page, limit) => {
                attendancePgState.page = page;
                attendancePgState.limit = limit;
                loadAttendanceList();
            }
        });
    }
    return attendancePg;
}

/**
 * Fetch JSON with timeout + res.ok guard. Never leaves callers guessing on HTTP errors.
 */
async function hrmFetchJson(url, options = {}, { timeoutMs = HRM_FETCH_TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        let result = {};
        try {
            result = await res.json();
        } catch {
            result = {};
        }

        if (!res.ok) {
            throw new Error(result.message || `Server error: ${res.status}`);
        }

        return { res, result };
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error('Request timed out. Click Refresh to retry.');
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function hrmNowTimeInputValue() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hrmRegisterErrorRow(message) {
    return `<tr><td colspan="8" class="table-status-error">${hrmEscape(message)}</td></tr>`;
}

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
            const { result } = await hrmFetchJson('/api/admin/hrm/staff', { headers: hrmAuthHeaders() });
            hrmStaffCache = Array.isArray(result.data) ? result.data : [];
        } catch (err) {
            console.error('hrmLoadStaffOptions (staff):', err);
            showHrmToast(err.message || 'Failed to load staff roster.', 'error');
            hrmStaffCache = [];
        }
    }

    if (includeEmployees && !hrmEmployeeCache.length) {
        try {
            const { result } = await hrmFetchJson('/api/admin/hrm/employees?all=true', { headers: hrmAuthHeaders() });
            hrmEmployeeCache = Array.isArray(result.data) ? result.data : [];
        } catch (err) {
            console.error('hrmLoadStaffOptions (employees):', err);
            showHrmToast(err.message || 'Failed to load employees.', 'error');
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

    container.addEventListener('click', (e) => {
        const tab = e.target.closest('.hrm-tab');
        if (!tab) return;

        const panelId = tab.getAttribute('data-hrm-tab');
        container.querySelectorAll('.hrm-tab').forEach((btn) => btn.classList.toggle('active', btn === tab));

        container.parentElement.querySelectorAll('.hrm-panel').forEach((panel) => {
            panel.style.display = panel.id === panelId ? 'block' : 'none';
        });

        if (typeof onShow === 'function') onShow(panelId);
    });
}

function hrmIsSuperAdmin() {
    return typeof window.isAdminSuperAdmin === 'function' && window.isAdminSuperAdmin();
}

function normalizeHrmAdminRole(raw) {
    const role = String(raw || '').toLowerCase();
    if (role === 'superadmin' || role === 'super admin') return 'super_admin';
    return role;
}

function hrmResolveAdminRole() {
    if (window.adminRole) return normalizeHrmAdminRole(window.adminRole);
    try {
        const cached = sessionStorage.getItem('adminProfile');
        if (cached) return normalizeHrmAdminRole(JSON.parse(cached).role);
    } catch (_) { /* ignore corrupt cache */ }
    if (hrmIsSuperAdmin()) return 'super_admin';
    return '';
}

function hrmCanAccessManualEntry() {
    const role = hrmResolveAdminRole();
    return role === 'hr' || role === 'super_admin';
}

function hrmCanRemoveAttendance() {
    return hrmCanAccessManualEntry();
}

function applyManualEntryTabVisibility() {
    const tab = document.getElementById('hrmManualEntryTab')
        || document.querySelector('#hrmAttendanceTabs .hrm-tab[data-hrm-tab="hrm-tab-manual"]');
    if (!tab) return;

    const allowed = hrmCanAccessManualEntry();
    tab.hidden = !allowed;
    tab.style.display = allowed ? '' : 'none';

    if (!allowed && tab.classList.contains('active')) {
        document.querySelector('#hrmAttendanceTabs .hrm-tab[data-hrm-tab="hrm-tab-daily-sheet"]')?.click();
    }
}

function showHrmToast(message, type = 'success') {
    if (typeof showToast === 'function') {
        showToast(message, type, 3000);
        return;
    }

    let stack = document.getElementById('hrmToastStack');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'hrmToastStack';
        stack.className = 'hrm-toast-stack';
        document.body.appendChild(stack);
    }

    const toast = document.createElement('div');
    toast.className = `hrm-toast hrm-toast--${type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'success'}`;
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function hrmTimeInputValue(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

function renderDailySheetActionCell(row) {
    const eid = hrmEscape(row.employeeId);
    if (dailySheetLocked) {
        return '<span class="att-lock-icon" title="Date locked">🔒</span>';
    }
    if (dailySheetPastDateViewOnly) {
        return '<span class="att-view-only-label" title="Past date — view only">View only</span>';
    }

    return `
        <div class="att-action-cell">
            <div class="att-action-row">
                <div class="att-split-btn" data-employee-id="${eid}">
                    <button type="button" class="att-split-btn__main" onclick="markDailySheetStatus('${eid}','present', this)">✓ Present</button>
                    <button type="button" class="att-split-btn__toggle" onclick="toggleDailySheetMenu(this)" aria-label="More statuses">▾</button>
                    <div class="att-split-menu" hidden>
                        <button type="button" onclick="markDailySheetStatus('${eid}','late', this)">Late</button>
                        <button type="button" onclick="markDailySheetStatus('${eid}','half-day', this)">Half-Day</button>
                        <button type="button" onclick="markDailySheetStatus('${eid}','absent', this)">Absent</button>
                        <button type="button" onclick="markDailySheetStatus('${eid}','leave', this)">Leave</button>
                        <button type="button" onclick="markDailySheetStatus('${eid}','holiday', this)">Holiday</button>
                    </div>
                </div>
                <button type="button" class="att-edit-icon" onclick="toggleDailySheetEdit('${eid}')" title="Edit check-in/out" aria-label="Edit attendance">✏️</button>
            </div>
            <span class="att-row-feedback" hidden></span>
        </div>`;
}

function renderDailySheetEditRow(row) {
    const eid = hrmEscape(row.employeeId);
    const checkIn = hrmTimeInputValue(row.attendance?.checkIn);
    const checkOut = hrmTimeInputValue(row.attendance?.checkOut);
    const note = hrmEscape(row.attendance?.note || '');
    const removeBtn = hrmCanRemoveAttendance()
        ? `<button type="button" class="btn-secondary btn-sm" onclick="removeDailySheetAttendance('${eid}')" title="Remove attendance">🗑️ Remove</button>`
        : '';

    return `
        <tr class="att-edit-row" data-edit-for="${eid}">
            <td colspan="9">
                <div class="att-inline-edit">
                    <div class="form-group">
                        <label>Check-in</label>
                        <div class="att-time-field">
                            <input type="time" id="attEditCheckIn-${eid}" value="${checkIn}">
                            <button type="button" class="btn-secondary btn-sm att-set-now-btn" onclick="setDailySheetTimeNow('attEditCheckIn-${eid}')" title="Set current time">🕐 Set Now</button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Check-out</label>
                        <div class="att-time-field">
                            <input type="time" id="attEditCheckOut-${eid}" value="${checkOut}">
                            <button type="button" class="btn-secondary btn-sm att-set-now-btn" onclick="setDailySheetTimeNow('attEditCheckOut-${eid}')" title="Set current time">🕐 Set Now</button>
                        </div>
                    </div>
                    <div class="form-group" style="flex:1;min-width:180px;">
                        <label>Note</label>
                        <input type="text" id="attEditNote-${eid}" value="${note}" placeholder="Optional note">
                    </div>
                    <div class="att-inline-edit-actions">
                        <button type="button" class="btn-primary btn-sm" onclick="saveDailySheetEdit('${eid}')">💾 Save</button>
                        ${removeBtn}
                    </div>
                </div>
            </td>
        </tr>`;
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
        const isEditing = String(dailySheetEditEmployeeId) === String(row.employeeId);
        const mainRow = `
            <tr data-employee-id="${hrmEscape(row.employeeId)}" data-department="${hrmEscape(row.department || '')}">
                <td>${photo}</td>
                <td><code>${hrmEscape(row.empId || '—')}</code></td>
                <td><strong>${hrmEscape(row.name || '—')}</strong></td>
                <td>${hrmEscape(row.designation || '—')}</td>
                <td>${hrmEscape(row.department || '—')}</td>
                <td class="daily-sheet-status-cell">${renderDailySheetStatusPill(status)}</td>
                <td class="daily-sheet-checkin-cell">${hrmFormatTime(row.attendance?.checkIn)}</td>
                <td class="daily-sheet-checkout-cell">${hrmFormatTime(row.attendance?.checkOut)}</td>
                <td>${renderDailySheetActionCell(row)}</td>
            </tr>`;

        return isEditing ? mainRow + renderDailySheetEditRow(row) : mainRow;
    }).join('');
}

function refreshDailySheetRowCells(employeeId) {
    const row = dailySheetCache.find((e) => String(e.employeeId) === String(employeeId));
    const tr = document.querySelector(`#dailySheetTableBody tr[data-employee-id="${employeeId}"]`);
    if (!row || !tr) return;

    const statusCell = tr.querySelector('.daily-sheet-status-cell');
    const checkInCell = tr.querySelector('.daily-sheet-checkin-cell');
    const checkOutCell = tr.querySelector('.daily-sheet-checkout-cell');
    if (statusCell) statusCell.innerHTML = renderDailySheetStatusPill(row.attendance?.status || 'none');
    if (checkInCell) checkInCell.textContent = hrmFormatTime(row.attendance?.checkIn);
    if (checkOutCell) checkOutCell.textContent = hrmFormatTime(row.attendance?.checkOut);
}

function setDailySheetRowFeedback(employeeId, state) {
    const feedback = document.querySelector(
        `#dailySheetTableBody tr[data-employee-id="${employeeId}"] .att-row-feedback`
    );
    if (!feedback) return;

    feedback.dataset.state = state;

    if (state === 'loading') {
        feedback.innerHTML = '<span class="att-row-spinner spinner"></span>';
        feedback.hidden = false;
        return;
    }

    if (state === 'saved') {
        feedback.innerHTML = '<span class="att-feedback--saved">✓ Saved</span>';
        feedback.hidden = false;
        setTimeout(() => {
            if (feedback.dataset.state === 'saved') {
                feedback.hidden = true;
                feedback.dataset.state = 'idle';
            }
        }, 2000);
        return;
    }

    if (state === 'failed') {
        feedback.innerHTML = '<span class="att-feedback--failed">✗ Failed</span>';
        feedback.hidden = false;
        setTimeout(() => {
            if (feedback.dataset.state === 'failed') {
                feedback.hidden = true;
                feedback.dataset.state = 'idle';
            }
        }, 3000);
        return;
    }

    feedback.hidden = true;
    feedback.innerHTML = '';
    feedback.dataset.state = 'idle';
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
        const { result } = await hrmFetchJson(`/api/admin/hrm/attendance/daily-sheet?${params.toString()}`, {
            headers: hrmAuthHeaders()
        });

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
        showHrmToast(err.message || 'Failed to load daily sheet.', 'error');
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="table-status-error">Failed to load. Click Refresh to retry.</td></tr>';
    }
}

function setDailySheetTimeNow(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const nowTime = hrmNowTimeInputValue();
    input.value = nowTime;

    if (inputId.includes('CheckIn') && dailySheetEditEmployeeId && isHrmCheckInLate(nowTime)) {
        showHrmToast('Check-in is after grace period — will be marked Late on save.', 'warning');
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

function toggleDailySheetEdit(employeeId) {
    if (dailySheetPastDateViewOnly || dailySheetLocked) return;
    dailySheetEditEmployeeId = String(dailySheetEditEmployeeId) === String(employeeId) ? null : employeeId;
    renderDailySheetRows(dailySheetCache);
}

async function saveDailySheetEdit(employeeId) {
    if (dailySheetPastDateViewOnly) {
        showHrmToast('Past dates are view-only. Contact HR to make changes.', 'warning');
        return;
    }
    if (dailySheetLocked) {
        showHrmToast('This date is locked.', 'warning');
        return;
    }

    const date = document.getElementById('dailySheetDate')?.value || hrmTodayInputValue();
    const checkIn = document.getElementById(`attEditCheckIn-${employeeId}`)?.value || '';
    const checkOut = document.getElementById(`attEditCheckOut-${employeeId}`)?.value || '';
    const note = document.getElementById(`attEditNote-${employeeId}`)?.value?.trim() || '';

    setDailySheetRowFeedback(employeeId, 'loading');

    try {
        const res = await fetch('/api/admin/hrm/attendance/update', {
            method: 'PUT',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify({ employeeId, date, checkIn, checkOut, note })
        });
        const result = await res.json();

        if (res.status === 423) {
            setDailySheetRowFeedback(employeeId, 'failed');
            showHrmToast(result.message || 'Date is locked.', 'warning');
            return;
        }
        if (res.status === 403) {
            setDailySheetRowFeedback(employeeId, 'failed');
            showHrmToast(result.message || 'Not allowed to edit this date.', 'warning');
            return;
        }
        if (!result.success) {
            setDailySheetRowFeedback(employeeId, 'failed');
            showHrmToast(result.message || 'Failed to update attendance.', 'error');
            return;
        }

        const row = dailySheetCache.find((e) => String(e.employeeId) === String(employeeId));
        if (row) {
            row.attendance = {
                ...(row.attendance || {}),
                status: row.attendance?.status || result.data?.status || 'present',
                checkIn: result.data?.clockIn || null,
                checkOut: result.data?.clockOut || null,
                note: result.data?.notes || note
            };
        }

        dailySheetEditEmployeeId = null;
        renderDailySheetRows(dailySheetCache);
        setDailySheetRowFeedback(employeeId, 'saved');
    } catch (err) {
        console.error('saveDailySheetEdit:', err);
        setDailySheetRowFeedback(employeeId, 'failed');
        showHrmToast('Server error while updating attendance.', 'error');
    }
}

function removeDailySheetAttendance(employeeId) {
    if (!hrmCanRemoveAttendance()) return;

    showCustomConfirm(
        'Remove Attendance',
        'Remove this employee\'s attendance record for the selected date?',
        () => performRemoveDailySheetAttendance(employeeId),
        'danger'
    );
}

async function performRemoveDailySheetAttendance(employeeId) {
    const date = document.getElementById('dailySheetDate')?.value || hrmTodayInputValue();
    setDailySheetRowFeedback(employeeId, 'loading');

    try {
        const res = await fetch('/api/admin/hrm/attendance/remove', {
            method: 'DELETE',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify({ employeeId, date })
        });
        const result = await res.json();

        if (res.status === 423) {
            setDailySheetRowFeedback(employeeId, 'failed');
            showHrmToast(result.message || 'Date is locked.', 'warning');
            return;
        }
        if (res.status === 403) {
            setDailySheetRowFeedback(employeeId, 'failed');
            showHrmToast(result.message || 'Removing attendance requires HR or Super Admin access.', 'error');
            return;
        }
        if (!result.success) {
            setDailySheetRowFeedback(employeeId, 'failed');
            showHrmToast(result.message || 'Failed to remove attendance.', 'error');
            return;
        }

        const row = dailySheetCache.find((e) => String(e.employeeId) === String(employeeId));
        if (row) row.attendance = null;

        dailySheetEditEmployeeId = null;
        renderDailySheetRows(dailySheetCache);
        setDailySheetRowFeedback(employeeId, 'saved');
        showHrmToast('Attendance record removed.', 'success');
    } catch (err) {
        console.error('performRemoveDailySheetAttendance:', err);
        setDailySheetRowFeedback(employeeId, 'failed');
        showHrmToast('Server error while removing attendance.', 'error');
    }
}

async function markDailySheetStatus(employeeId, status, triggerEl) {
    if (dailySheetPastDateViewOnly) {
        showHrmToast('Past dates are view-only. Contact HR to make changes.', 'warning');
        return;
    }
    if (dailySheetLocked) {
        showHrmToast('This date is locked.', 'warning');
        return;
    }

    const date = document.getElementById('dailySheetDate')?.value || hrmTodayInputValue();
    const menu = triggerEl?.closest('.att-split-btn')?.querySelector('.att-split-menu');
    if (menu) menu.hidden = true;

    setDailySheetRowFeedback(employeeId, 'loading');

    try {
        const markBody = { employeeId, date, status };
        if (status === 'present') {
            markBody.checkIn = hrmAttendanceSettings.officeStart || '09:00';
        }

        const res = await fetch('/api/admin/hrm/attendance/mark', {
            method: 'POST',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify(markBody)
        });
        const result = await res.json();

        if (res.status === 423) {
            setDailySheetRowFeedback(employeeId, 'failed');
            showHrmToast(result.message || 'Date is locked.', 'warning');
            return;
        }
        if (res.status === 403) {
            setDailySheetRowFeedback(employeeId, 'failed');
            showHrmToast(result.message || 'Past dates are view-only.', 'warning');
            return;
        }
        if (!result.success) {
            setDailySheetRowFeedback(employeeId, 'failed');
            showHrmToast(result.message || 'Failed to mark attendance.', 'error');
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

        refreshDailySheetRowCells(employeeId);
        setDailySheetRowFeedback(employeeId, 'saved');
    } catch (err) {
        console.error('markDailySheetStatus:', err);
        setDailySheetRowFeedback(employeeId, 'failed');
        showHrmToast('Server error while marking attendance.', 'error');
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
            showHrmToast(result.message || 'Date is locked.', 'warning');
            return;
        }
        if (res.status === 403) {
            showHrmToast(result.message || 'Past dates are view-only.', 'warning');
            return;
        }
        if (!result.success) {
            showHrmToast(result.message || 'Bulk mark failed.', 'error');
            return;
        }

        showHrmToast(`Marked ${result.data?.success || 0} employee(s) as ${status}.`, 'success');
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
            showHrmToast(result.message || 'Failed to lock date.', 'error');
            return;
        }
        showHrmToast('Date locked successfully.', 'success');
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
            showHrmToast(result.message || 'Failed to unlock date.', 'error');
            return;
        }
        showHrmToast('Date unlocked.', 'success');
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
        const { result } = await hrmFetchJson('/api/admin/hrm/attendance/manual-entries?limit=30', {
            headers: hrmAuthHeaders()
        });
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
        showHrmToast(err.message || 'Failed to load manual entries.', 'error');
        tbody.innerHTML = '<tr><td colspan="8" class="table-status-error">Failed to load. Click Refresh to retry.</td></tr>';
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

        if (res.status === 403) {
            showHrmToast(result.message || 'Manual entry requires HR or Super Admin access.', 'error');
            return;
        }
        if (res.status === 423) {
            showHrmToast(result.message || 'Date is locked. Enable override if you are Super Admin.', 'warning');
            return;
        }
        if (!result.success) {
            showHrmToast(result.message || 'Failed to save manual entry.', 'error');
            return;
        }

        showHrmToast(result.message || 'Manual entry saved.', 'success');
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

function renderAttendanceRegisterActions(row) {
    const hasCheckIn = Boolean(row.clockIn);
    const hasCheckOut = Boolean(row.clockOut);
    if (hasCheckIn && !hasCheckOut) {
        const staffId = hrmEscape(row.staffId || '');
        const staffUsername = hrmEscape(row.staffUsername || '');
        const staffType = hrmEscape(row.staffType || 'admin');
        const dateKey = row.date ? new Date(row.date).toISOString().slice(0, 10) : '';
        return `<button type="button" class="btn-secondary btn-sm att-clock-out-btn" onclick="clockOutFromRegister('${staffId}','${staffUsername}','${dateKey}','${staffType}')">Clock Out Now</button>`;
    }
    return '—';
}

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

function applyAttendanceFilters() {
    attendancePgState.page = 1;
    attendancePg?.resetPage();
    loadAttendanceList();
}

async function loadAttendanceList() {
    const tbody = document.getElementById('hrmAttendanceTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="loading-container"><div class="spinner"></div><p>Loading attendance…</p></td></tr>';

    const params = new URLSearchParams({
        page: String(attendancePgState.page),
        limit: String(attendancePgState.limit),
        todayStats: 'true'
    });
    const date = document.getElementById('hrmAttendanceDateFilter')?.value;
    const staff = document.getElementById('hrmAttendanceStaffFilter')?.value;
    const status = document.getElementById('hrmAttendanceStatusFilter')?.value;
    if (date) params.set('date', date);
    if (staff) params.set('staff', staff);
    if (status) params.set('status', status);

    try {
        const { result } = await hrmFetchJson(`/api/admin/hrm/attendance?${params.toString()}`, {
            headers: hrmAuthHeaders()
        });

        renderAttendanceStats(result.todayStats);

        const rows = result.data || [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="table-status-empty">No attendance records for this filter.</td></tr>';
            initAttendancePg()?.setTotal(result.pagination?.total ?? 0);
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
                <td>${renderAttendanceRegisterActions(row)}</td>
            </tr>
        `).join('');

        initAttendancePg()?.setTotal(result.pagination?.total ?? 0);
    } catch (err) {
        console.error('loadAttendanceList:', err);
        showHrmToast(err.message || 'Failed to load attendance.', 'error');
        tbody.innerHTML = hrmRegisterErrorRow('Failed to load. Click Refresh to retry.');
    }
}

async function clockOutFromRegister(staffId, staffUsername, date, staffType = 'admin') {
    const payload = {};
    if (staffId) payload.staffId = staffId;
    else if (staffUsername) payload.staffUsername = staffUsername;
    if (date) payload.date = date;
    if (staffType) payload.staffType = staffType;

    try {
        const { result } = await hrmFetchJson('/api/admin/hrm/attendance/clock-out', {
            method: 'POST',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify(payload)
        });

        if (result.success) {
            showHrmToast(result.message || 'Clocked out successfully.', 'success');
            await loadAttendanceList();
        } else {
            showHrmToast(result.message || 'Failed to clock out.', 'error');
        }
    } catch (err) {
        console.error('clockOutFromRegister:', err);
        showHrmToast(err.message || 'Failed to clock out.', 'error');
    }
}

function resetAttendanceFilters() {
    const date = document.getElementById('hrmAttendanceDateFilter');
    const staff = document.getElementById('hrmAttendanceStaffFilter');
    const status = document.getElementById('hrmAttendanceStatusFilter');
    if (date) date.value = '';
    if (staff) staff.value = '';
    if (status) status.value = '';
    attendancePgState.page = 1;
    attendancePg?.resetPage();
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
let hrmAttendanceSettings = {
    officeStart: '09:00',
    officeEnd: '18:00',
    gracePeriodMinutes: 15,
    halfDayCutoff: '13:00',
    autoMarkAbsentAfter: '20:00',
    weekendSaturday: true,
    weekendSunday: true
};

function parseHrmTimeToMinutes(timeStr) {
    const match = String(timeStr || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
}

function isHrmCheckInLate(timeStr) {
    const checkMin = parseHrmTimeToMinutes(timeStr);
    const startMin = parseHrmTimeToMinutes(hrmAttendanceSettings.officeStart);
    if (checkMin === null || startMin === null) return false;
    return checkMin > startMin + Number(hrmAttendanceSettings.gracePeriodMinutes || 0);
}

function applyAttendanceSettingsToForm(data = {}) {
    hrmAttendanceSettings = { ...hrmAttendanceSettings, ...data };
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.value = val;
    };
    setVal('attOfficeStart', data.officeStart);
    setVal('attOfficeEnd', data.officeEnd);
    setVal('attGracePeriod', data.gracePeriodMinutes);
    setVal('attHalfDayCutoff', data.halfDayCutoff);
    setVal('attAutoAbsentAfter', data.autoMarkAbsentAfter);
    const sat = document.getElementById('attWeekendSat');
    const sun = document.getElementById('attWeekendSun');
    if (sat) sat.checked = data.weekendSaturday !== false;
    if (sun) sun.checked = data.weekendSunday !== false;
}

async function loadAttendanceSettings() {
    try {
        const { result } = await hrmFetchJson('/api/admin/settings/attendance', { headers: hrmAuthHeaders() });
        if (result.data) applyAttendanceSettingsToForm(result.data);
    } catch (err) {
        console.warn('loadAttendanceSettings:', err.message);
    }
}

async function saveAttendanceSettings() {
    const btn = document.getElementById('attendanceSettingsSaveBtn');
    const payload = {
        officeStart: document.getElementById('attOfficeStart')?.value || '09:00',
        officeEnd: document.getElementById('attOfficeEnd')?.value || '18:00',
        gracePeriodMinutes: Number(document.getElementById('attGracePeriod')?.value) || 15,
        halfDayCutoff: document.getElementById('attHalfDayCutoff')?.value || '13:00',
        autoMarkAbsentAfter: document.getElementById('attAutoAbsentAfter')?.value || '20:00',
        weekendSaturday: document.getElementById('attWeekendSat')?.checked !== false,
        weekendSunday: document.getElementById('attWeekendSun')?.checked !== false
    };

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
    }

    try {
        const res = await fetch('/api/admin/settings/attendance', {
            method: 'PUT',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
            throw new Error(result.message || `Server error: ${res.status}`);
        }
        applyAttendanceSettingsToForm(result.data || payload);
        showHrmToast('Attendance settings saved.', 'success');
    } catch (err) {
        showHrmToast(err.message || 'Failed to save attendance settings.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Settings';
        }
    }
}

async function loadShifts() {
    const tbody = document.getElementById('hrmShiftsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="loading-container"><div class="spinner"></div><p>Loading shifts…</p></td></tr>';

    try {
        const { result } = await hrmFetchJson('/api/admin/hrm/shifts', { headers: hrmAuthHeaders() });
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
        showHrmToast(err.message || 'Failed to load shifts.', 'error');
        tbody.innerHTML = '<tr><td colspan="7" class="table-status-error">Failed to load. Click Refresh to retry.</td></tr>';
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
        const { result } = await hrmFetchJson(`/api/admin/hrm/attendance/late-report?month=${month}&year=${year}`, {
            headers: hrmAuthHeaders()
        });
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
        showHrmToast(err.message || 'Failed to load late report.', 'error');
        tbody.innerHTML = '<tr><td colspan="5" class="table-status-error">Failed to load. Click Refresh to retry.</td></tr>';
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

    applyManualEntryTabVisibility();
    await Promise.all([
        hrmLoadStaffOptions(['hrmAttendanceStaffFilter']),
        loadAttendanceSettings()
    ]);

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
    applyManualEntryTabVisibility();

    hrmSetupTabs('hrmAttendanceTabs', (panelId) => {
        if (panelId === 'hrm-tab-daily-sheet') loadDailySheet();
        if (panelId === 'hrm-tab-register') loadAttendanceList();
        if (panelId === 'hrm-tab-shifts') {
            loadShifts();
            loadAttendanceSettings();
        }
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
window.applyAttendanceFilters = applyAttendanceFilters;
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
window.toggleDailySheetEdit = toggleDailySheetEdit;
window.saveDailySheetEdit = saveDailySheetEdit;
window.removeDailySheetAttendance = removeDailySheetAttendance;
window.applyManualEntryTabVisibility = applyManualEntryTabVisibility;
window.showHrmToast = showHrmToast;
window.saveManualEntry = saveManualEntry;
window.setDailySheetTimeNow = setDailySheetTimeNow;
window.saveAttendanceSettings = saveAttendanceSettings;
window.clockOutFromRegister = clockOutFromRegister;
