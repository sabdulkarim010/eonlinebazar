/**
 * Project: EOnlineBazar — HRM Attendance & Shifts
 * File: js/admin/modules/hrm-attendance.js
 * Description: Attendance register, shift roster CRUD, and the monthly
 * late report. Also owns the shared HRM helpers (staff roster cache, month
 * selects, tab switching) that hrm-payroll.js and hrm-leaves.js reuse.
 */
// STANDARD: Use Swal.fire() for ALL confirmations.
// Never use confirm(), alert(), or window.confirm().
import '../admin-core.js';
import {
    hrmFetchJson,
    hrmFetchBlob,
    hrmHandleLoadError,
    hrmTableErrorRow,
    HRM_INLINE_LOAD_ERROR,
    hrmParseStaffSelect
} from './hrm-api.js';

const HRM_MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const ATTENDANCE_STATUS_LABELS = {
    present: 'Present',
    absent: 'Absent',
    late: 'Late',
    'half-day': 'Half-Day',
    leave: 'Leave',
    holiday: 'Holiday',
    none: 'Not Marked'
};

const ATTENDANCE_STATUS_PILL_CLASS = {
    present: 'att-pill att-pill--present',
    absent: 'att-pill att-pill--absent',
    late: 'att-pill att-pill--late',
    'half-day': 'att-pill att-pill--halfday',
    leave: 'att-pill att-pill--leave',
    holiday: 'att-pill att-pill--holiday',
    none: 'att-pill att-pill--none'
};

let dailySheetCache = [];
let dailySheetLocked = false;
let dailySheetLockInfo = null;
let dailySheetPastDateViewOnly = false;
let dailySheetEditEmployeeId = null;
let dailySheetPg = null;
const dailySheetPgState = { page: 1, limit: 10, total: 0 };

function initDailySheetPg() {
    if (!dailySheetPg && typeof AdminPagination !== 'undefined') {
        dailySheetPg = AdminPagination.ensure('dailySheetPaginationContainer', {
            defaultLimit: 10,
            onPageChange: (page, limit) => {
                dailySheetPgState.page = page;
                dailySheetPgState.limit = limit;
                loadDailySheet();
            }
        });
    }
    return dailySheetPg;
}

/** Staff roster is read by all three HRM sections — fetched once per page load. */
let hrmStaffCache = [];
let hrmEmployeeCache = [];
let hrmEmployeePickerCache = [];

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

function hrmNowTimeInputValue() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hrmRegisterErrorRow(message = HRM_INLINE_LOAD_ERROR) {
    return hrmTableErrorRow(8, message);
}

function hrmEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function safeEmployeePhoto(url, name) {
    const initials = (name || '?')
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    if (!url) {
        return `<div class="emp-avatar-initials">${hrmEscape(initials)}</div>`;
    }

    return `
        <span class="emp-avatar-wrap">
            <img src="${hrmEscape(url)}"
                alt="${hrmEscape(name || '')}"
                class="emp-avatar-img"
                onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex'">
            <div class="emp-avatar-initials" style="display:none">${hrmEscape(initials)}</div>
        </span>`;
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

function hrmPlatformTimezone() {
    return window.adminPlatformTimezone || 'Asia/Dhaka';
}

/** Today's calendar date (YYYY-MM-DD) in the platform timezone — matches server attendance "today". */
function hrmTodayInputValue() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: hrmPlatformTimezone(),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
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

function hrmInvalidateEmployeeCache() {
    hrmEmployeeCache = [];
    hrmEmployeePickerCache = [];
}

/** Load admin staff + operational employees into grouped optgroups. */
async function hrmLoadStaffOptions(selectIds = [], {
    placeholder = 'All staff',
    includeEmployees = true,
    forStaffPicker = false
} = {}) {
    const employeeListRef = forStaffPicker ? hrmEmployeePickerCache : hrmEmployeeCache;
    const staffNeeded = !hrmStaffCache.length;
    const employeesNeeded = includeEmployees && !employeeListRef.length;

    if (staffNeeded || employeesNeeded) {
        const tasks = [];
        if (staffNeeded) {
            tasks.push(
                hrmFetchJson('/api/admin/hrm/staff', { headers: hrmAuthHeaders() })
                    .then(({ result }) => {
                        hrmStaffCache = Array.isArray(result.data) ? result.data : [];
                    })
                    .catch((err) => {
                        hrmHandleLoadError(err, { context: 'hrmLoadStaffOptions (staff)' });
                        hrmStaffCache = [];
                    })
            );
        }
        if (employeesNeeded) {
            const qs = forStaffPicker ? '?all=true&forStaffPicker=true' : '?all=true';
            tasks.push(
                hrmFetchJson(`/api/admin/hrm/employees${qs}`, { headers: hrmAuthHeaders() })
                    .then(({ result }) => {
                        const rows = Array.isArray(result.data) ? result.data : [];
                        if (forStaffPicker) hrmEmployeePickerCache = rows;
                        else hrmEmployeeCache = rows;
                    })
                    .catch((err) => {
                        hrmHandleLoadError(err, { context: 'hrmLoadStaffOptions (employees)' });
                        if (forStaffPicker) hrmEmployeePickerCache = [];
                        else hrmEmployeeCache = [];
                    })
            );
        }
        await Promise.all(tasks);
    }

    const activeEmployeeCache = forStaffPicker ? hrmEmployeePickerCache : hrmEmployeeCache;

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

        if (includeEmployees && activeEmployeeCache.length) {
            html += `<optgroup label="Operational Employees">`;
            html += activeEmployeeCache
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

    return { staff: hrmStaffCache, employees: activeEmployeeCache };
}

const hrmStaffSearchInstances = {};

/** Type-to-search staff picker — list hidden until the user types. */
function hrmMountStaffSearchSelect(selectId, { placeholder = 'Search staff by name or ID…' } = {}) {
    const select = document.getElementById(selectId);
    if (!select || typeof window.createSearchableSelect !== 'function') return null;

    if (hrmStaffSearchInstances[selectId]?.destroy) {
        hrmStaffSearchInstances[selectId].destroy();
        delete hrmStaffSearchInstances[selectId];
    }

    const options = [...select.options]
        .filter((opt) => opt.value)
        .map((opt) => ({ value: opt.value, label: opt.textContent.trim() }));

    const instance = window.createSearchableSelect({
        mountEl: select,
        placeholder,
        options,
        ariaLabel: 'Staff member'
    });

    hrmStaffSearchInstances[selectId] = instance;
    return instance;
}

function hrmGetStaffSearchValue(selectId) {
    return hrmStaffSearchInstances[selectId]?.getValue?.()
        || document.getElementById(selectId)?.value
        || '';
}

function hrmSetStaffSearchValue(selectId, value) {
    const val = String(value ?? '').trim();
    const instance = hrmStaffSearchInstances[selectId];
    if (instance?.setValue) {
        instance.setValue(val);
        return;
    }
    const select = document.getElementById(selectId);
    if (select) {
        select.value = val;
    }
}

function hrmClearStaffSearchSelect(selectId, { placeholder = 'Select staff member' } = {}) {
    if (hrmStaffSearchInstances[selectId]?.destroy) {
        hrmStaffSearchInstances[selectId].destroy();
        delete hrmStaffSearchInstances[selectId];
    }
    const select = document.getElementById(selectId);
    if (select) {
        select.innerHTML = `<option value="">${hrmEscape(placeholder)}</option>`;
        select.value = '';
    }
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
    return typeof window.hasAdminPermission === 'function'
        && window.hasAdminPermission('manual_attendance');
}

function hrmCanRemoveAttendance() {
    return hrmCanAccessManualEntry();
}

function applyPermissionGating(root = document) {
    if (!root) return;

    root.querySelectorAll('[data-permission]').forEach((el) => {
        const perm = el.dataset.permission;
        if (!perm) return;

        const allowed = typeof window.hasAdminPermission === 'function'
            && window.hasAdminPermission(perm);

        if (!allowed) {
            el.style.display = 'none';
            el.hidden = true;
            return;
        }

        if (el.dataset.superadminOnly === 'true') return;

        el.hidden = false;
        el.style.display = '';
    });
}

function applyAttendanceTabPermissions() {
    const tabs = document.querySelectorAll('.hrm-attendance-tabs [data-permission]');
    tabs.forEach((tab) => {
        const perm = tab.dataset.permission;
        const allowed = typeof window.hasAdminPermission === 'function'
            && window.hasAdminPermission(perm);

        tab.hidden = !allowed;
        tab.style.display = allowed ? '' : 'none';
    });

    const activeTab = document.querySelector('.hrm-attendance-tabs .hrm-tab.active');
    if (activeTab && activeTab.style.display === 'none') {
        activeTab.classList.remove('active');
    }

    const firstVisible = [...tabs].find((tab) => tab.style.display !== 'none');
    if (firstVisible) {
        firstVisible.click();
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
    return typeof window.hasAdminPermission === 'function'
        && window.hasAdminPermission('mark_attendance_any_date');
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

/** Shared attendance status badge — Daily Sheet + Register tabs. */
function renderAttendanceStatusBadge(status) {
    const key = status || 'none';
    const className = ATTENDANCE_STATUS_PILL_CLASS[key] || ATTENDANCE_STATUS_PILL_CLASS.none;
    const label = ATTENDANCE_STATUS_LABELS[key] || hrmEscape(key);
    return `<span class="${className}">${label}</span>`;
}

function renderDailySheetStatusPill(status) {
    return renderAttendanceStatusBadge(status);
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

    const canLock = typeof window.hasAdminPermission === 'function'
        && window.hasAdminPermission('lock_attendance_dates');

    if (lockBtn) lockBtn.hidden = dailySheetLocked || !canLock;
    if (unlockBtn) unlockBtn.hidden = !dailySheetLocked || !canLock;

    applyPermissionGating(document.getElementById('view-hrm-attendance'));
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

const DAILY_SHEET_MENU_OPTIONS = [
    { status: 'late', label: 'Late', dotClass: 'att-split-dot--late' },
    { status: 'half-day', label: 'Half-Day', dotClass: 'att-split-dot--halfday' },
    { status: 'absent', label: 'Absent', dotClass: 'att-split-dot--absent', dividerBefore: true },
    { status: 'leave', label: 'Leave', dotClass: 'att-split-dot--leave' },
    { status: 'holiday', label: 'Holiday', dotClass: 'att-split-dot--holiday' }
];

function renderDailySheetMenuOptions(employeeId) {
    const eid = hrmEscape(employeeId);
    return DAILY_SHEET_MENU_OPTIONS.map((option) => {
        const divider = option.dividerBefore ? '<div class="att-split-menu__divider" aria-hidden="true"></div>' : '';
        return `${divider}<button type="button" class="att-split-menu__item" data-daily-mark="${eid}" data-daily-status="${option.status}"><span class="att-split-dot ${option.dotClass}" aria-hidden="true"></span>${option.label}</button>`;
    }).join('');
}

function renderDailySheetActionCell(row) {
    const eid = hrmEscape(row.employeeId);
    const canMark = typeof window.hasAdminPermission === 'function'
        && (
            window.hasAdminPermission('mark_attendance_today')
            || window.hasAdminPermission('mark_attendance_any_date')
            || window.hasAdminPermission('manage_staff')
        );

    if (dailySheetLocked) {
        return '<span class="att-lock-icon" title="Date locked">🔒</span>';
    }
    if (dailySheetPastDateViewOnly || !canMark) {
        return '<span class="att-view-only-label" title="Past date — view only">View only</span>';
    }

    return `
        <div class="att-action-cell">
            <div class="att-action-row">
                <div class="att-split-btn" data-employee-id="${eid}">
                    <button type="button" class="att-split-btn__main" data-daily-mark="${eid}" data-daily-status="present">✓ Present</button>
                    <button type="button" class="att-split-btn__toggle" data-daily-menu-toggle="1" aria-label="More statuses">▾</button>
                    <div class="att-split-menu" hidden>
                        ${renderDailySheetMenuOptions(row.employeeId)}
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
    closeAllDailySheetMenus();

    const tbody = document.getElementById('dailySheetTableBody');
    if (!tbody) return;

    const rows = employees || [];

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="table-status-empty">No active employees for this filter.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((row) => {
        const status = row.attendance?.status || 'none';
        const photo = safeEmployeePhoto(row.photo, row.name);
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
    const params = new URLSearchParams({
        date,
        page: String(dailySheetPgState.page),
        limit: String(dailySheetPgState.limit)
    });
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
        dailySheetPgState.total = result.total ?? result.data?.total ?? dailySheetCache.length;

        populateDailySheetDepartments(dailySheetCache);
        updateDailySheetPastDateUI();
        renderDailySheetRows(dailySheetCache);
        updateDailySheetLockUI();

        initDailySheetPg()?.setTotal(dailySheetPgState.total);
        if (typeof AdminPagination !== 'undefined') {
            AdminPagination.render('dailySheetPaginationContainer', {
                total: dailySheetPgState.total,
                page: dailySheetPgState.page,
                limit: dailySheetPgState.limit,
                onPageChange: (newPage, newLimit) => {
                    dailySheetPgState.page = newPage;
                    dailySheetPgState.limit = newLimit;
                    loadDailySheet();
                }
            });
        }
    } catch (err) {
        hrmHandleLoadError(err, { context: 'loadDailySheet' });
        if (tbody) tbody.innerHTML = hrmTableErrorRow(9);
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

function closeAllDailySheetMenus() {
    document.querySelectorAll('.att-split-menu[data-floating="true"]').forEach((menu) => {
        menu.hidden = true;
        const host = menu.__attSplitHost;
        if (host && host.isConnected) {
            host.appendChild(menu);
        }
        delete menu.dataset.floating;
        menu.style.position = '';
        menu.style.top = '';
        menu.style.left = '';
        menu.__attSplitHost = null;
    });
}

function positionDailySheetMenu(btn, menu) {
    const host = btn.parentElement;
    if (!host) return;

    menu.__attSplitHost = host;
    menu.hidden = false;
    document.body.appendChild(menu);
    menu.dataset.floating = 'true';

    const btnRect = btn.getBoundingClientRect();
    const menuHeight = menu.offsetHeight || 220;
    const menuWidth = menu.offsetWidth || 160;
    const spaceBelow = window.innerHeight - btnRect.bottom;
    const spaceAbove = btnRect.top;

    if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
        menu.style.top = `${btnRect.top + window.scrollY - menuHeight - 4}px`;
    } else {
        menu.style.top = `${btnRect.bottom + window.scrollY + 4}px`;
    }

    menu.style.left = `${btnRect.right + window.scrollX - menuWidth}px`;
    menu.style.position = 'absolute';
}

function toggleDailySheetMenu(btn) {
    const host = btn.parentElement;
    if (!host) return;

    const floatingMenu = document.querySelector('.att-split-menu[data-floating="true"]');
    const wasOpen = floatingMenu && floatingMenu.__attSplitHost === host && !floatingMenu.hidden;

    closeAllDailySheetMenus();
    if (wasOpen) return;

    const menu = host.querySelector('.att-split-menu');
    if (!menu) return;

    positionDailySheetMenu(btn, menu);
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
        const { res, result } = await hrmFetchJson('/api/admin/hrm/attendance/update', {
            method: 'PUT',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify({ employeeId, date, checkIn, checkOut, note }),
            throwOnHttpError: false
        });

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
        if (!res.ok || result.success === false) {
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
        setDailySheetRowFeedback(employeeId, 'failed');
        showHrmToast(err.message || 'Server error while updating attendance.', 'error');
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
        const { res, result } = await hrmFetchJson('/api/admin/hrm/attendance/remove', {
            method: 'DELETE',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify({ employeeId, date }),
            throwOnHttpError: false
        });

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
        if (!res.ok || result.success === false) {
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
        setDailySheetRowFeedback(employeeId, 'failed');
        showHrmToast(err.message || 'Server error while removing attendance.', 'error');
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
    closeAllDailySheetMenus();

    setDailySheetRowFeedback(employeeId, 'loading');

    try {
        const markBody = { employeeId, date, status };
        if (status === 'present') {
            markBody.checkIn = hrmAttendanceSettings.officeStart || '09:00';
            markBody.checkOut = hrmAttendanceSettings.officeEnd || '18:00';
        }

        const { res, result } = await hrmFetchJson('/api/admin/hrm/attendance/mark', {
            method: 'POST',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify(markBody),
            throwOnHttpError: false
        });

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
        if (!res.ok || result.success === false) {
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
        await invalidateHrmAttendanceMetrics();
    } catch (err) {
        console.error('markDailySheetStatus:', err);
        setDailySheetRowFeedback(employeeId, 'failed');
        showHrmToast('Server error while marking attendance.', 'error');
    }
}

async function confirmBulkMarkDailySheet(status) {
    if (dailySheetPastDateViewOnly) {
        showToast('Past dates are view-only. Contact HR to make changes.', 'warning');
        return;
    }
    if (dailySheetLocked) {
        showToast('This date is locked.', 'warning');
        return;
    }

    const isPresent = status === 'present';
    const title = isPresent ? 'Mark All Present?' : 'Mark All Absent?';
    const text = isPresent
        ? 'This will mark all employees as Present today.'
        : 'This will mark all employees as Absent today.';

    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title,
            text,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: isPresent ? 'Yes, Mark All' : 'Yes, Mark All Absent',
            confirmButtonColor: isPresent ? '#10b981' : '#ef4444',
            cancelButtonColor: '#6b7280',
            reverseButtons: true
        });
        if (!result.isConfirmed) return;
    }

    await bulkMarkDailySheet(status);
}

async function bulkMarkDailySheet(status) {
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
        const { res, result } = await hrmFetchJson('/api/admin/hrm/attendance/bulk-mark', {
            method: 'POST',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify({ date, employeeIds: ids, status }),
            throwOnHttpError: false
        });

        if (res.status === 423) {
            showHrmToast(result.message || 'Date is locked.', 'warning');
            return;
        }
        if (res.status === 403) {
            showHrmToast(result.message || 'Past dates are view-only.', 'warning');
            return;
        }
        if (!res.ok || result.success === false) {
            showHrmToast(result.message || 'Bulk mark failed.', 'error');
            return;
        }

        showHrmToast(`Marked ${result.data?.success || 0} employee(s) as ${status}.`, 'success');
        await loadDailySheet();
        await invalidateHrmAttendanceMetrics();
    } catch (err) {
        console.error('bulkMarkDailySheet:', err);
        showToast('Server error during bulk mark.', 'error');
    }
}

async function lockDailySheetDate() {
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: 'Lock This Date?',
            text: 'No further attendance edits will be allowed until unlocked.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Lock Date',
            confirmButtonColor: '#f59e0b',
            cancelButtonColor: '#6b7280',
            reverseButtons: true
        });
        if (!result.isConfirmed) return;
    }

    const date = document.getElementById('dailySheetDate')?.value || hrmTodayInputValue();
    try {
        const { result } = await hrmFetchJson('/api/admin/hrm/attendance/lock', {
            method: 'POST',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify({ date })
        });
        if (result.success === false) {
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
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: 'Unlock This Date?',
            text: 'Attendance edits will be allowed again for this date.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Unlock',
            confirmButtonColor: '#3b82f6',
            cancelButtonColor: '#6b7280',
            reverseButtons: true
        });
        if (!result.isConfirmed) return;
    }

    const date = document.getElementById('dailySheetDate')?.value || hrmTodayInputValue();
    try {
        const { result } = await hrmFetchJson('/api/admin/hrm/attendance/lock', {
            method: 'DELETE',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify({ date })
        });
        if (result.success === false) {
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
        hrmHandleLoadError(err, { context: 'loadManualEntries' });
        tbody.innerHTML = hrmTableErrorRow(8);
    }
}

async function loadManualEntryEmployees() {
    const select = document.getElementById('manualEntryEmployee');
    if (!select) return;

    if (!hrmEmployeeCache.length) {
        try {
            const { result } = await hrmFetchJson('/api/admin/hrm/employees?all=true', {
                headers: hrmAuthHeaders(),
                silent: true
            });
            hrmEmployeeCache = Array.isArray(result.data) ? result.data : [];
        } catch (err) {
            console.warn('loadManualEntryEmployees:', err.message);
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

    try {
        await window.hrmWithSubmitButton(saveBtn, 'Save Entry', async () => {
        const { res, result } = await hrmFetchJson('/api/admin/hrm/attendance/manual-entry', {
            method: 'POST',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify(payload),
            throwOnHttpError: false
        });

        if (res.status === 403) {
            showHrmToast(result.message || 'Manual entry requires HR or Super Admin access.', 'error');
            return;
        }
        if (res.status === 423) {
            showHrmToast(result.message || 'Date is locked. Enable override if you are Super Admin.', 'warning');
            return;
        }
        if (!res.ok || result.success === false) {
            showHrmToast(result.message || 'Failed to save manual entry.', 'error');
            return;
        }

        showHrmToast(result.message || 'Manual entry saved.', 'success');
        await loadManualEntries();
        await loadDailySheet();
        await invalidateHrmAttendanceMetrics();
        });
    } catch (err) {
        console.error('saveManualEntry:', err);
        showToast('Server error while saving entry.', 'error');
    }
}

function setupHrmAttendanceActionDelegation() {
    const root = document.getElementById('view-hrm-attendance');
    if (!root || root.dataset.hrmAttActionDeleg) return;
    root.dataset.hrmAttActionDeleg = '1';

    root.addEventListener('click', (e) => {
        const clockOut = e.target.closest('[data-att-action="clock-out"]');
        if (clockOut) {
            e.preventDefault();
            clockOutFromRegister(
                clockOut.dataset.staffId || '',
                clockOut.dataset.staffUsername || '',
                clockOut.dataset.attDate || '',
                clockOut.dataset.staffType || 'admin',
                clockOut
            );
            return;
        }

        const menuToggle = e.target.closest('[data-daily-menu-toggle]');
        if (menuToggle) {
            e.preventDefault();
            toggleDailySheetMenu(menuToggle);
            return;
        }

        const markBtn = e.target.closest('[data-daily-mark]');
        if (markBtn) {
            e.preventDefault();
            markDailySheetStatus(
                markBtn.dataset.dailyMark,
                markBtn.dataset.dailyStatus,
                markBtn
            );
        }
    });
}

function setupDailySheetSection() {
    const dateInput = document.getElementById('dailySheetDate');
    if (dateInput && !dateInput.value) dateInput.value = hrmTodayInputValue();
    updateDailySheetPastDateUI();

    const deptSelect = document.getElementById('dailySheetDept');
    if (deptSelect && !deptSelect.dataset.bound) {
        deptSelect.dataset.bound = '1';
        deptSelect.addEventListener('change', () => {
            dailySheetPgState.page = 1;
            dailySheetPg?.resetPage?.();
            loadDailySheet();
        });
    }

    const bindClick = (id, fn) => {
        const el = document.getElementById(id);
        if (el && !el.dataset.bound) {
            el.dataset.bound = '1';
            el.addEventListener('click', fn);
        }
    };

    bindClick('dailySheetRefreshBtn', refreshDailySheetWithStats);
    bindClick('dailySheetMarkAllPresentBtn', () => confirmBulkMarkDailySheet('present'));
    bindClick('dailySheetMarkAllAbsentBtn', () => confirmBulkMarkDailySheet('absent'));
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
        if (!e.target.closest('.att-split-btn') && !e.target.closest('.att-split-menu')) {
            closeAllDailySheetMenus();
        }
    });

    window.addEventListener('scroll', closeAllDailySheetMenus, true);
    window.addEventListener('resize', closeAllDailySheetMenus);
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
        return `<button type="button" class="btn-secondary btn-sm att-clock-out-btn" data-att-action="clock-out" data-staff-id="${staffId}" data-staff-username="${staffUsername}" data-att-date="${dateKey}" data-staff-type="${staffType}">Clock Out Now</button>`;
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

/** Fetch today's KPI row without reloading the register table. */
async function refreshTodayAttendanceStats() {
    try {
        const { result } = await hrmFetchJson('/api/admin/hrm/attendance?limit=1&todayStats=true', {
            headers: hrmAuthHeaders(),
            silent: true
        });
        if (result.todayStats) renderAttendanceStats(result.todayStats);
    } catch (err) {
        console.warn('refreshTodayAttendanceStats:', err.message);
    }
}

/** Sync HRM stat strip + Super Admin dashboard enterprise summary after writes. */
async function invalidateHrmAttendanceMetrics() {
    await refreshTodayAttendanceStats();
    if (typeof window.fetchEnterpriseSummary === 'function') {
        window.fetchEnterpriseSummary();
    }
}

function getActiveHrmAttendanceTabId() {
    const active = document.querySelector('#hrmAttendanceTabs .hrm-tab.active');
    return active?.getAttribute('data-hrm-tab') || 'hrm-tab-daily-sheet';
}

async function withButtonLoading(btnId, fn, { loadingHtml = '<i class="fa-solid fa-spinner fa-spin"></i> Loading…' } = {}) {
    const btn = document.getElementById(btnId);
    if (!btn) {
        await fn();
        return;
    }
    if (btn.dataset.loading === '1') return;

    const originalHtml = btn.innerHTML;
    btn.dataset.loading = '1';
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.innerHTML = loadingHtml;

    try {
        await fn();
    } finally {
        btn.disabled = false;
        btn.dataset.loading = '0';
        btn.classList.remove('is-loading');
        btn.innerHTML = originalHtml;
    }
}

async function withAttendanceRefreshButtonLoading(fn) {
    await withButtonLoading('attendanceRefreshBtn', fn, {
        loadingHtml: '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing…'
    });
}

/** Header Refresh — dispatches to the active attendance tab's loader. */
async function refreshActiveHrmAttendanceTab() {
    await withAttendanceRefreshButtonLoading(async () => {
        const panelId = getActiveHrmAttendanceTabId();

        switch (panelId) {
            case 'hrm-tab-daily-sheet':
                await loadDailySheet();
                await refreshTodayAttendanceStats();
                break;
            case 'hrm-tab-register':
                await loadAttendanceList();
                break;
            case 'hrm-tab-shifts':
                await loadShifts();
                await loadAttendanceSettings();
                break;
            case 'hrm-tab-late':
                await loadLateReport();
                break;
            case 'hrm-tab-manual':
                await loadManualEntryEmployees();
                await loadManualEntries();
                break;
            default:
                await loadDailySheet();
                await refreshTodayAttendanceStats();
        }
    });
}

async function refreshDailySheetWithStats() {
    await withButtonLoading('dailySheetRefreshBtn', async () => {
        await loadDailySheet();
        await refreshTodayAttendanceStats();
    }, {
        loadingHtml: '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing…'
    });
}

function applyAttendanceFilters() {
    attendancePgState.page = 1;
    attendancePg?.resetPage();
    loadAttendanceList();
}

async function loadAttendanceList(options = {}) {
    const { soft = false } = options;
    const tbody = document.getElementById('hrmAttendanceTableBody');
    if (!tbody) return;

    const loadMarker = soft
        ? window.hrmBeginSoftTableLoad?.(tbody) || { end() {} }
        : window.hrmTableLoadingRow?.(tbody, 8, 'Loading attendance…') || { end() {} };

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
            <tr data-hrm-row="1">
                <td><strong>${hrmEscape(row.staffUsername || '—')}</strong></td>
                <td>${hrmFormatDate(row.date)}</td>
                <td>${hrmFormatTime(row.clockIn)}</td>
                <td>${hrmFormatTime(row.clockOut)}</td>
                <td>${Number(row.hoursWorked) || 0}</td>
                <td>${renderAttendanceStatusBadge(row.status)}</td>
                <td>${row.isLate
                    ? `<span class="status-badge status-blocked">${Number(row.lateMinutes) || 0} min</span>`
                    : '—'}</td>
                <td>${renderAttendanceRegisterActions(row)}</td>
            </tr>
        `).join('');

        initAttendancePg()?.setTotal(result.pagination?.total ?? 0);
    } catch (err) {
        hrmHandleLoadError(err, { context: 'loadAttendanceList' });
        tbody.innerHTML = hrmRegisterErrorRow();
    } finally {
        loadMarker.end?.();
    }
}

async function clockOutFromRegister(staffId, staffUsername, date, staffType = 'admin', triggerBtn = null) {
    const payload = {};
    if (staffId) payload.staffId = staffId;
    else if (staffUsername) payload.staffUsername = staffUsername;
    if (date) payload.date = date;
    if (staffType) payload.staffType = staffType;

    const run = async () => {
        const { result } = await hrmFetchJson('/api/admin/hrm/attendance/clock-out', {
            method: 'POST',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify(payload)
        });

        if (result.success) {
            showHrmToast(result.message || 'Clocked out successfully.', 'success');
            await loadAttendanceList({ soft: true });
            await invalidateHrmAttendanceMetrics();
        } else {
            showHrmToast(result.message || 'Failed to clock out.', 'error');
        }
    };

    try {
        if (triggerBtn && window.hrmWithButtonElement) {
            await window.hrmWithButtonElement(triggerBtn, run, {
                loadingHtml: '<i class="fa-solid fa-spinner fa-spin"></i>'
            });
        } else {
            await run();
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

function resetMarkAttendanceForm() {
    window.hrmResetFormById?.('markAttendanceForm');
    hrmClearStaffSearchSelect('markAttendanceStaff', { placeholder: 'Select staff member' });
    const dateInput = document.getElementById('markAttendanceDate');
    if (dateInput) {
        dateInput.value = hrmTodayInputValue();
    }
}

function closeMarkAttendanceModal() {
    const modal = document.getElementById('markAttendanceModal');
    if (modal) modal.style.display = 'none';
    resetMarkAttendanceForm();
}

async function openMarkAttendanceModal(triggerBtn = null, { preselectStaff = null, skipReset = false } = {}) {
    await window.hrmRunModalOpen({
        triggerBtn,
        modalId: 'markAttendanceModal',
        onReset: skipReset ? null : resetMarkAttendanceForm,
        prepare: async () => {
            await hrmLoadStaffOptions(['markAttendanceStaff'], {
                placeholder: 'Select staff member',
                forStaffPicker: true
            });
            hrmMountStaffSearchSelect('markAttendanceStaff', { placeholder: 'Search staff by name or ID…' });
            if (preselectStaff) {
                hrmSetStaffSearchValue('markAttendanceStaff', preselectStaff);
            }
            const dateInput = document.getElementById('markAttendanceDate');
            if (dateInput && !dateInput.value) {
                dateInput.value = hrmTodayInputValue();
            }
        }
    });
}

async function saveAttendance() {
    const staffValue = hrmGetStaffSearchValue('markAttendanceStaff');
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
    try {
        await window.hrmWithSubmitButton(saveBtn, 'Save Attendance', async () => {
            const { result } = await hrmFetchJson('/api/admin/hrm/attendance/mark', {
                method: 'POST',
                headers: hrmAuthHeaders(true),
                body: JSON.stringify(payload)
            });

            showAdminSuccess('Attendance Saved', result.message || 'Attendance recorded.');
            closeMarkAttendanceModal();
            await loadAttendanceList({ soft: true });
            await invalidateHrmAttendanceMetrics();
        });
    } catch (err) {
        showToast(err.message || 'Server error while saving attendance.', 'error');
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
    weekendSunday: true,
    weekendDays: [0, 6]
};

function readWeekendDaysFromForm() {
    return [...document.querySelectorAll('.weekend-day-cb:checked')]
        .map((cb) => Number(cb.value))
        .filter((d) => d >= 0 && d <= 6)
        .sort((a, b) => a - b);
}

function applyWeekendDaysToForm(weekendDays = []) {
    const selected = new Set((weekendDays || []).map(Number));
    document.querySelectorAll('.weekend-day-cb').forEach((cb) => {
        cb.checked = selected.has(Number(cb.value));
    });
}

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
    let weekendDays = Array.isArray(data.weekendDays) ? data.weekendDays : null;
    if (!weekendDays) {
        weekendDays = [];
        if (data.weekendSunday !== false) weekendDays.push(0);
        if (data.weekendSaturday !== false) weekendDays.push(6);
    }
    applyWeekendDaysToForm(weekendDays.length ? weekendDays : [0, 6]);
}

async function loadAttendanceSettings() {
    try {
        const { result } = await hrmFetchJson('/api/admin/settings/attendance', {
            headers: hrmAuthHeaders(),
            silent: true
        });
        if (result.data) applyAttendanceSettingsToForm(result.data);
    } catch (err) {
        console.warn('loadAttendanceSettings:', err.message);
    }
}

async function saveAttendanceSettings() {
    const btn = document.getElementById('attendanceSettingsSaveBtn');
    const weekendDays = readWeekendDaysFromForm();
    const payload = {
        officeStart: document.getElementById('attOfficeStart')?.value || '09:00',
        officeEnd: document.getElementById('attOfficeEnd')?.value || '18:00',
        gracePeriodMinutes: Number(document.getElementById('attGracePeriod')?.value) || 15,
        halfDayCutoff: document.getElementById('attHalfDayCutoff')?.value || '13:00',
        autoMarkAbsentAfter: document.getElementById('attAutoAbsentAfter')?.value || '20:00',
        weekendDays,
        weekendSaturday: weekendDays.includes(6),
        weekendSunday: weekendDays.includes(0)
    };

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
    }

    try {
        const { result } = await hrmFetchJson('/api/admin/settings/attendance', {
            method: 'PUT',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify(payload)
        });
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
        hrmHandleLoadError(err, { context: 'loadShifts' });
        tbody.innerHTML = hrmTableErrorRow(7);
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
    await hrmLoadStaffOptions(['shiftAssignedStaff'], { forStaffPicker: true });
    resetShiftForm();

    const modal = document.getElementById('shiftModal');
    if (modal) modal.style.display = 'flex';
}

async function openEditShiftModal(id) {
    await hrmLoadStaffOptions(['shiftAssignedStaff'], { forStaffPicker: true });

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
        const { result } = await hrmFetchJson(id ? `/api/admin/hrm/shifts/${id}` : '/api/admin/hrm/shifts', {
            method: id ? 'PATCH' : 'POST',
            headers: hrmAuthHeaders(true),
            body: JSON.stringify(payload)
        });

        showAdminSuccess(id ? 'Shift Updated' : 'Shift Created', result.message || 'Saved.');
        closeShiftModal();
        await loadShifts();
    } catch (err) {
        showToast(err.message || 'Server error while saving shift.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function deleteShift(id) {
    showCustomConfirm('Delete Shift', 'Are you sure you want to delete this shift?', async () => {
        try {
            const { result } = await hrmFetchJson(`/api/admin/hrm/shifts/${id}`, {
                method: 'DELETE',
                headers: hrmAuthHeaders()
            });

            showAdminSuccess('Shift Deleted', result.message || 'Shift removed.');
            await loadShifts();
        } catch (err) {
            showToast(err.message || 'Failed to delete shift.', 'error');
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
        hrmHandleLoadError(err, { context: 'loadLateReport' });
        tbody.innerHTML = hrmTableErrorRow(5);
    }
}

/* ==================================================================
   SECTION BOOTSTRAP
   ================================================================== */

/** Called by core-nav when the Attendance & Shifts section opens. */
async function loadHrmAttendanceSection() {
    if (typeof window.waitForAdminPermissions === 'function') {
        await window.waitForAdminPermissions();
    }

    const now = new Date();
    hrmFillMonthSelect('hrmLateMonth', now.getMonth() + 1);
    hrmFillYearInput('hrmLateYear', now.getFullYear());

    applyAttendanceTabPermissions();
    applyPermissionGating(document.getElementById('view-hrm-attendance'));

    if (typeof window.hasAdminPermission === 'function' && window.hasAdminPermission('view_shifts')) {
        await loadAttendanceSettings();
    }
    if (typeof window.hasAdminPermission === 'function' && window.hasAdminPermission('manage_staff')) {
        await hrmLoadStaffOptions(['hrmAttendanceStaffFilter']);
    }

    const pendingStaff = window.hrmPendingAttendanceStaff;
    if (pendingStaff) {
        delete window.hrmPendingAttendanceStaff;
        const filter = document.getElementById('hrmAttendanceStaffFilter');
        if (filter) filter.value = pendingStaff;
        await loadAttendanceList();
        await openMarkAttendanceModal(null, { preselectStaff: pendingStaff, skipReset: false });
        return;
    }

    const dailyDate = document.getElementById('dailySheetDate');
    if (dailyDate && !dailyDate.value) dailyDate.value = hrmTodayInputValue();

    await refreshTodayAttendanceStats();

    if (typeof window.hasAdminPermission === 'function' && window.hasAdminPermission('view_daily_sheet')) {
        await loadDailySheet();
    }
}

function setupHrmAttendanceSection() {
    setupDailySheetSection();
    setupHrmAttendanceActionDelegation();

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
            applyPermissionGating(document.getElementById('view-hrm-attendance'));
        }
    });

    const refreshBtn = document.getElementById('attendanceRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', () => {
            refreshActiveHrmAttendanceTab().catch((err) => {
                console.error('refreshActiveHrmAttendanceTab:', err);
            });
        });
    }
}

document.addEventListener('DOMContentLoaded', setupHrmAttendanceSection);

// Shared HRM helpers — hrm-payroll.js and hrm-leaves.js read these at call
// time, so barrel import order does not matter.
Object.assign(window, {
    hrmEscape,
    safeEmployeePhoto,
    hrmAuthHeaders,
    hrmFormatDate,
    hrmFormatTime,
    hrmFormatMoney,
    hrmTodayInputValue,
    hrmPlatformTimezone,
    hrmFillMonthSelect,
    hrmFillYearInput,
    hrmLoadStaffOptions,
    hrmMountStaffSearchSelect,
    hrmGetStaffSearchValue,
    hrmSetStaffSearchValue,
    hrmClearStaffSearchSelect,
    hrmParseStaffSelect,
    hrmInvalidateEmployeeCache,
    hrmFindStaff,
    hrmSetupTabs,
    HRM_MONTHS
});

window.applyPermissionGating = applyPermissionGating;
window.applyAttendanceTabPermissions = applyAttendanceTabPermissions;
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
window.applyManualEntryTabVisibility = applyAttendanceTabPermissions;
window.showHrmToast = showHrmToast;
window.saveManualEntry = saveManualEntry;
window.setDailySheetTimeNow = setDailySheetTimeNow;
window.saveAttendanceSettings = saveAttendanceSettings;
window.clockOutFromRegister = clockOutFromRegister;
window.refreshActiveHrmAttendanceTab = refreshActiveHrmAttendanceTab;
window.refreshTodayAttendanceStats = refreshTodayAttendanceStats;
window.invalidateHrmAttendanceMetrics = invalidateHrmAttendanceMetrics;
