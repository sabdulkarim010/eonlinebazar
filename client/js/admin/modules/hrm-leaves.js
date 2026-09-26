/**
 * Project: EOnlineBazar — HRM Leave Management
 * File: js/admin/modules/hrm-leaves.js
 * Description: Pending approvals, full leave history, per-staff balances,
 * and a month calendar of who is away. Shared helpers come from
 * hrm-attendance.js via window.
 */
// STANDARD: Use Swal.fire() for ALL confirmations.
// Never use confirm(), alert(), or window.confirm().
import '../admin-core.js';
import {
    hrmFetchJson,
    hrmHandleLoadError,
    hrmTableErrorRow,
    HRM_INLINE_LOAD_ERROR,
    hrmEscapeInline,
    hrmSanitizeStaffFields
} from './hrm-api.js';

const LEAVE_STATUS_CLASSES = {
    pending: 'status-pending',
    approved: 'status-verified',
    rejected: 'status-blocked'
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Canonical leave id from list API (Mongo legacyId or Postgres id). */
function resolveLeaveRowId(leave) {
    const id = leave?._id ?? leave?.id ?? '';
    return String(id).trim();
}

function leaveActionPath(leaveId, action) {
    const id = encodeURIComponent(String(leaveId || '').trim());
    return `/api/admin/hrm/leaves/${id}/${action}`;
}

let leavePg = null;
const leavePgState = { page: 1, limit: 10 };
let applyLeaveSelfMode = false;

function canApplyLeaveForStaff() {
    return typeof window.hasAdminPermission === 'function'
        && (window.hasAdminPermission('apply_leave_for_staff')
            || window.hasAdminPermission('manage_leave')
            || window.hasAdminPermission('manage_staff'));
}

function canApplyOwnLeave() {
    return typeof window.hasAdminPermission === 'function'
        && window.hasAdminPermission('apply_own_leave');
}

function leaveBalanceApiPath() {
    const year = new Date().getFullYear();
    const selfOnly = canApplyOwnLeave()
        && !canApplyLeaveForStaff()
        && !(typeof window.hasAdminPermission === 'function' && window.hasAdminPermission('view_leave_requests'));
    const base = selfOnly ? '/api/admin/hrm/leaves/my-balance' : '/api/admin/hrm/leaves/balance';
    return `${base}?year=${year}`;
}

function configureApplyLeaveButtons() {
    const forStaffBtn = document.getElementById('applyLeaveForStaffBtn');
    const ownBtn = document.getElementById('applyOwnLeaveBtn');
    const canStaff = canApplyLeaveForStaff();
    const canOwn = canApplyOwnLeave();

    if (forStaffBtn) {
        forStaffBtn.style.display = canStaff ? '' : 'none';
    }
    if (ownBtn) {
        ownBtn.style.display = (canOwn && !canStaff) ? '' : 'none';
    }
}

function initLeavePg() {
    if (!leavePg && typeof AdminPagination !== 'undefined') {
        leavePg = AdminPagination.ensure('leavePaginationContainer', {
            defaultLimit: 10,
            onPageChange: (page, limit) => {
                leavePgState.page = page;
                leavePgState.limit = limit;
                loadAllLeaves();
            }
        });
    }
    return leavePg;
}

function leaveDateRange(leave) {
    const start = window.hrmFormatDate(leave.startDate);
    const end = window.hrmFormatDate(leave.endDate);
    return start === end ? start : `${start} → ${end}`;
}

/* ==================================================================
   PENDING APPROVALS
   ================================================================== */

function updatePendingBadge(count) {
    const badge = document.getElementById('hrmLeavePendingBadge');
    if (!badge) return;

    badge.textContent = count || 0;
    badge.hidden = !count;
}

async function loadPendingLeaves() {
    const tbody = document.getElementById('hrmLeavePendingTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="loading-container"><div class="spinner"></div><p>Loading pending leaves…</p></td></tr>';

    try {
        const { result } = await hrmFetchJson('/api/admin/hrm/leaves?status=pending&limit=100', {
            headers: window.hrmAuthHeaders()
        });
        const rows = result.data || [];

        updatePendingBadge(result.pendingCount);

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-status-empty">No leave applications waiting for approval.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((leave) => `
            <tr>
                <td>
                    <strong>${window.hrmEscape(leave.staffName || leave.staffUsername || '—')}</strong>
                    <div class="table-subtext">${window.hrmEscape(leave.staffUsername || '')}</div>
                </td>
                <td><span class="status-badge status-pending">${window.hrmEscape(leave.leaveType)}</span></td>
                <td>${leaveDateRange(leave)}</td>
                <td>${Number(leave.totalDays) || 0}</td>
                <td>${window.hrmEscape(leave.reason || '—')}</td>
                <td>
                    <div class="catalog-actions">
                        <button type="button" class="catalog-action-btn leave-approve-btn" data-permission="approve_leave" onclick="approveLeave(${JSON.stringify(resolveLeaveRowId(leave))})" title="Approve" style="color:#10b981;">
                            <i class="fa-solid fa-circle-check"></i>
                        </button>
                        <button type="button" class="catalog-action-btn delete leave-reject-btn" data-permission="approve_leave" onclick="rejectLeave(${JSON.stringify(resolveLeaveRowId(leave))})" title="Reject">
                            <i class="fa-solid fa-circle-xmark"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        if (typeof window.applyPermissionGating === 'function') {
            window.applyPermissionGating(document.getElementById('view-hrm-leaves'));
        }
    } catch (err) {
        hrmHandleLoadError(err, { context: 'loadPendingLeaves' });
        tbody.innerHTML = hrmTableErrorRow(6);
    }
}

function approveLeave(id) {
    const leaveId = String(id ?? '').trim();
    if (!leaveId) {
        showToast('Missing leave id — refresh the list and try again.', 'warning');
        return;
    }
    showCustomConfirm('Approve Leave', 'Approve this leave? The days will be marked as holiday on the attendance register.', async () => {
        try {
            const { result } = await hrmFetchJson(leaveActionPath(leaveId, 'approve'), {
                method: 'PATCH',
                headers: window.hrmAuthHeaders(true),
                body: JSON.stringify({})
            });

            showAdminSuccess('Leave Approved', result.message || 'Leave approved.');
            await loadPendingLeaves();
            await loadLeaveBalances();
        } catch (err) {
            showToast(err.message || 'Failed to approve leave.', 'error');
        }
    });
}

async function rejectLeave(id) {
    const leaveId = String(id ?? '').trim();
    if (!leaveId) {
        showToast('Missing leave id — refresh the list and try again.', 'warning');
        return;
    }
    const result = await Swal.fire({
        title: 'Reject Leave Application',
        input: 'textarea',
        inputLabel: 'Reason for rejection',
        inputPlaceholder: 'Explain why this leave is rejected…',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Reject',
        inputValidator: (value) => {
            if (!String(value || '').trim()) return 'A rejection reason is required.';
            return undefined;
        }
    });
    if (!result.isConfirmed) return;
    const reason = String(result.value || '').trim();

    try {
        const { result } = await hrmFetchJson(leaveActionPath(leaveId, 'reject'), {
            method: 'PATCH',
            headers: window.hrmAuthHeaders(true),
            body: JSON.stringify({ rejectionReason: reason })
        });

        showAdminSuccess('Leave Rejected', result.message || 'Leave rejected.');
        await loadPendingLeaves();
    } catch (err) {
        showToast(err.message || 'Failed to reject leave.', 'error');
    }
}

/* ==================================================================
   ALL LEAVES
   ================================================================== */

function applyLeaveFilters() {
    leavePgState.page = 1;
    leavePg?.resetPage();
    loadAllLeaves();
}

async function loadAllLeaves() {
    const tbody = document.getElementById('hrmLeaveAllTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="loading-container"><div class="spinner"></div><p>Loading leave applications…</p></td></tr>';

    const params = new URLSearchParams();
    params.set('page', String(leavePgState.page));
    params.set('limit', String(leavePgState.limit));
    const status = document.getElementById('hrmLeaveStatusFilter')?.value;
    const leaveType = document.getElementById('hrmLeaveTypeFilter')?.value;
    if (status) params.set('status', status);
    if (leaveType) params.set('leaveType', leaveType);

    try {
        const { result } = await hrmFetchJson(`/api/admin/hrm/leaves?${params.toString()}`, {
            headers: window.hrmAuthHeaders()
        });
        const rows = result.data || [];

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-status-empty">No leave applications for this filter.</td></tr>';
            initLeavePg()?.setTotal(result.pagination?.total ?? 0);
            return;
        }

        tbody.innerHTML = rows.map((leave) => `
            <tr>
                <td>
                    <strong>${window.hrmEscape(leave.staffName || leave.staffUsername || '—')}</strong>
                    <div class="table-subtext">${window.hrmEscape(leave.staffUsername || '')}</div>
                </td>
                <td>${window.hrmEscape(leave.leaveType)}</td>
                <td>${leaveDateRange(leave)}</td>
                <td>${Number(leave.totalDays) || 0}</td>
                <td>${window.hrmEscape(leave.reason || '—')}</td>
                <td><span class="status-badge ${LEAVE_STATUS_CLASSES[leave.status] || 'status-pending'}">${window.hrmEscape(leave.status)}</span></td>
                <td>
                    ${window.hrmEscape(leave.approvedBy || '—')}
                    ${leave.rejectionReason
                        ? `<div class="table-subtext">${window.hrmEscape(leave.rejectionReason)}</div>`
                        : ''}
                </td>
            </tr>
        `).join('');
        initLeavePg()?.setTotal(result.pagination?.total ?? 0);
    } catch (err) {
        hrmHandleLoadError(err, { context: 'loadAllLeaves' });
        tbody.innerHTML = hrmTableErrorRow(7);
    }
}

/* ==================================================================
   LEAVE BALANCES
   ================================================================== */

async function loadLeaveBalances() {
    const grid = document.getElementById('hrmLeaveBalanceGrid');
    if (!grid) return;

    grid.innerHTML = '<p class="table-status-empty">Loading leave balances…</p>';

    try {
        const { result } = await hrmFetchJson(leaveBalanceApiPath(), {
            headers: window.hrmAuthHeaders()
        });
        const rows = result.data || [];

        if (!rows.length) {
            grid.innerHTML = '<p class="table-status-empty">No leave taken yet this year.</p>';
            return;
        }

        grid.innerHTML = rows.map((staff) => `
            <div class="hrm-balance-card">
                <h4>${window.hrmEscape(staff.staffUsername)}</h4>
                <ul>
                    ${staff.balances.map((balance) => `
                        <li>
                            <span>${window.hrmEscape(balance.leaveType)}</span>
                            <strong>${balance.used}/${balance.allowed || '∞'} used</strong>
                            ${balance.pending ? `<em>${balance.pending} pending</em>` : ''}
                        </li>
                    `).join('')}
                </ul>
            </div>
        `).join('');
    } catch (err) {
        hrmHandleLoadError(err, { context: 'loadLeaveBalances' });
        grid.innerHTML = `<p class="table-status-error">${hrmEscapeInline(HRM_INLINE_LOAD_ERROR)}</p>`;
    }
}

/* ==================================================================
   LEAVE CALENDAR
   ================================================================== */

async function loadLeaveCalendar() {
    const grid = document.getElementById('hrmLeaveCalendarGrid');
    if (!grid) return;

    grid.innerHTML = '<p class="table-status-empty">Loading calendar…</p>';

    const month = Number(document.getElementById('hrmLeaveCalendarMonth')?.value) || new Date().getMonth() + 1;
    const year = Number(document.getElementById('hrmLeaveCalendarYear')?.value) || new Date().getFullYear();

    try {
        const { result } = await hrmFetchJson(`/api/admin/hrm/leaves/calendar?month=${month}&year=${year}`, {
            headers: window.hrmAuthHeaders()
        });
        const days = result.data || {};
        const daysInMonth = result.period?.daysInMonth || new Date(year, month, 0).getDate();

        const header = WEEKDAY_LABELS.map((label) => `<div class="hrm-calendar-head">${label}</div>`).join('');

        // Blank cells so day 1 lands under its real weekday column.
        const leadingBlanks = new Date(year, month - 1, 1).getDay();
        const blanks = Array.from({ length: leadingBlanks }, () => '<div class="hrm-calendar-cell is-blank"></div>').join('');

        const cells = Array.from({ length: daysInMonth }, (_, index) => {
            const day = index + 1;
            const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const entries = days[key] || [];

            const chips = entries.map((entry) => `
                <span class="hrm-calendar-chip hrm-calendar-chip--${window.hrmEscape(entry.status)}" title="${window.hrmEscape(entry.leaveType)} leave (${window.hrmEscape(entry.status)})">
                    ${window.hrmEscape(entry.staffUsername)}
                </span>
            `).join('');

            return `
                <div class="hrm-calendar-cell${entries.length ? ' has-leave' : ''}">
                    <span class="hrm-calendar-day">${day}</span>
                    ${chips}
                </div>
            `;
        }).join('');

        grid.innerHTML = `
            <div class="hrm-calendar-title">${window.hrmEscape(window.HRM_MONTHS[month - 1])} ${year}</div>
            <div class="hrm-calendar-grid">${header}${blanks}${cells}</div>
        `;
    } catch (err) {
        hrmHandleLoadError(err, { context: 'loadLeaveCalendar' });
        grid.innerHTML = `<p class="table-status-error">${hrmEscapeInline(HRM_INLINE_LOAD_ERROR)}</p>`;
    }
}

/* ==================================================================
   APPLY LEAVE
   ================================================================== */

function closeApplyLeaveModal() {
    const modal = document.getElementById('applyLeaveModal');
    if (modal) modal.style.display = 'none';
}

async function openApplyLeaveModal(isSelf = false) {
    applyLeaveSelfMode = Boolean(isSelf) && canApplyOwnLeave() && !canApplyLeaveForStaff();

    const staffGroup = document.getElementById('applyLeaveStaffGroup');
    const selfInfo = document.getElementById('applyLeaveSelfInfo');
    const selfName = document.getElementById('applyLeaveSelfName');
    const staffSelect = document.getElementById('applyLeaveStaff');
    const subtitle = document.getElementById('applyLeaveModalSubtitle');

    if (applyLeaveSelfMode) {
        if (staffGroup) staffGroup.style.display = 'none';
        if (selfInfo) selfInfo.style.display = '';
        if (staffSelect) staffSelect.required = false;
        if (subtitle) subtitle.textContent = 'Submit a leave application for yourself';
        const adminName = window.currentAdmin?.name || window.currentAdmin?.username || 'Your account';
        if (selfName) selfName.textContent = adminName;
    } else {
        await window.hrmLoadStaffOptions(['applyLeaveStaff'], { placeholder: 'Select staff member' });
        window.hrmMountStaffSearchSelect('applyLeaveStaff', { placeholder: 'Search staff by name or ID…' });
        if (staffGroup) staffGroup.style.display = '';
        if (selfInfo) selfInfo.style.display = 'none';
        if (staffSelect) staffSelect.required = true;
        if (subtitle) subtitle.textContent = 'Submit a leave application on behalf of a staff member';
    }

    const start = document.getElementById('applyLeaveStartDate');
    const end = document.getElementById('applyLeaveEndDate');
    if (start && !start.value) start.value = window.hrmTodayInputValue();
    if (end && !end.value) end.value = window.hrmTodayInputValue();

    const modal = document.getElementById('applyLeaveModal');
    if (modal) modal.style.display = 'flex';
}

async function submitLeaveApplication() {
    const payload = {
        leaveType: document.getElementById('applyLeaveType')?.value,
        startDate: document.getElementById('applyLeaveStartDate')?.value,
        endDate: document.getElementById('applyLeaveEndDate')?.value,
        reason: document.getElementById('applyLeaveReason')?.value?.trim() || '',
        attachmentUrl: document.getElementById('applyLeaveAttachment')?.value?.trim() || ''
    };

    if (!applyLeaveSelfMode) {
        Object.assign(
            payload,
            hrmSanitizeStaffFields({
                staffSelect: window.hrmGetStaffSearchValue('applyLeaveStaff')
            })
        );
    }

    const hasStaffTarget = Boolean(payload.staffId || payload.staffUsername || payload.employeeId);
    if ((!applyLeaveSelfMode && !hasStaffTarget) || !payload.startDate || !payload.endDate) {
        showToast(applyLeaveSelfMode
            ? 'Start date and end date are required.'
            : 'Staff, start date, and end date are required.', 'warning');
        return;
    }
    if (new Date(payload.endDate) < new Date(payload.startDate)) {
        showToast('End date cannot be before the start date.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('applyLeaveSaveBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const endpoint = applyLeaveSelfMode
            ? '/api/admin/hrm/leaves/apply-own'
            : '/api/admin/hrm/leaves/apply';
        const { result } = await hrmFetchJson(endpoint, {
            method: 'POST',
            headers: window.hrmAuthHeaders(true),
            body: JSON.stringify(payload)
        });

        showAdminSuccess('Leave Submitted', result.message || 'Leave application submitted.');
        closeApplyLeaveModal();
        if (!applyLeaveSelfMode) {
            await loadPendingLeaves();
        }
        await loadLeaveBalances();
    } catch (err) {
        showToast(err.message || 'Server error while submitting the leave application.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

/* ==================================================================
   SECTION BOOTSTRAP
   ================================================================== */

/** Called by core-nav when the Leave Management section opens. */
async function loadHrmLeavesSection() {
    if (typeof window.waitForAdminPermissions === 'function') {
        await window.waitForAdminPermissions();
    }

    const now = new Date();
    window.hrmFillMonthSelect('hrmLeaveCalendarMonth', now.getMonth() + 1);
    window.hrmFillYearInput('hrmLeaveCalendarYear', now.getFullYear());

    if (typeof window.applyPermissionGating === 'function') {
        window.applyPermissionGating(document.getElementById('view-hrm-leaves'));
    }

    configureApplyLeaveButtons();

    const canViewRequests = typeof window.hasAdminPermission === 'function'
        && window.hasAdminPermission('view_leave_requests');
    const canViewOwnBalance = canApplyOwnLeave();

    if (canViewRequests) {
        await loadPendingLeaves();
        await loadLeaveBalances();
    } else if (canViewOwnBalance) {
        await loadLeaveBalances();
    }
}

function setupHrmLeavesSection() {
    window.hrmSetupTabs('hrmLeaveTabs', (panelId) => {
        if (panelId === 'hrm-tab-leaves-all') loadAllLeaves();
        if (panelId === 'hrm-tab-leaves-calendar') loadLeaveCalendar();
    });

    const refreshBtn = document.getElementById('leavesRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', () => {
            loadPendingLeaves();
            loadLeaveBalances();
        });
    }
}

document.addEventListener('DOMContentLoaded', setupHrmLeavesSection);

window.loadHrmLeavesSection = loadHrmLeavesSection;
window.loadPendingLeaves = loadPendingLeaves;
window.loadAllLeaves = loadAllLeaves;
window.applyLeaveFilters = applyLeaveFilters;
window.loadLeaveBalances = loadLeaveBalances;
window.loadLeaveCalendar = loadLeaveCalendar;
window.approveLeave = approveLeave;
window.rejectLeave = rejectLeave;
window.openApplyLeaveModal = openApplyLeaveModal;
window.closeApplyLeaveModal = closeApplyLeaveModal;
window.submitLeaveApplication = submitLeaveApplication;
