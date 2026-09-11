/**
 * Project: EOnlineBazar — HRM Leave Management
 * File: js/admin/modules/hrm-leaves.js
 * Description: Pending approvals, full leave history, per-staff balances,
 * and a month calendar of who is away. Shared helpers come from
 * hrm-attendance.js via window.
 */
import '../admin-core.js';

const LEAVE_STATUS_CLASSES = {
    pending: 'status-pending',
    approved: 'status-verified',
    rejected: 'status-blocked'
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
        const res = await fetch('/api/admin/hrm/leaves?status=pending&limit=100', {
            headers: window.hrmAuthHeaders()
        });
        const result = await res.json();
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
                        <button type="button" class="catalog-action-btn" onclick="approveLeave('${leave._id}')" title="Approve" style="color:#10b981;">
                            <i class="fa-solid fa-circle-check"></i>
                        </button>
                        <button type="button" class="catalog-action-btn delete" onclick="rejectLeave('${leave._id}')" title="Reject">
                            <i class="fa-solid fa-circle-xmark"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadPendingLeaves:', err);
        tbody.innerHTML = '<tr><td colspan="6" class="table-status-error">Failed to load pending leaves.</td></tr>';
    }
}

function approveLeave(id) {
    showCustomConfirm('Approve Leave', 'Approve this leave? The days will be marked as holiday on the attendance register.', async () => {
        try {
            const res = await fetch(`/api/admin/hrm/leaves/${id}/approve`, {
                method: 'PATCH',
                headers: window.hrmAuthHeaders(true),
                body: JSON.stringify({})
            });
            const result = await res.json();

            if (result.success) {
                showAdminSuccess('Leave Approved', result.message || 'Leave approved.');
                await loadPendingLeaves();
                await loadLeaveBalances();
            } else {
                showToast(result.message || 'Failed to approve leave.', 'error');
            }
        } catch (err) {
            console.error('approveLeave:', err);
            showToast('Failed to approve leave.', 'error');
        }
    });
}

async function rejectLeave(id) {
    const reason = window.prompt('Reason for rejecting this leave application:');
    if (reason === null) return;

    if (!reason.trim()) {
        showToast('A rejection reason is required.', 'warning');
        return;
    }

    try {
        const res = await fetch(`/api/admin/hrm/leaves/${id}/reject`, {
            method: 'PATCH',
            headers: window.hrmAuthHeaders(true),
            body: JSON.stringify({ rejectionReason: reason.trim() })
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess('Leave Rejected', result.message || 'Leave rejected.');
            await loadPendingLeaves();
        } else {
            showToast(result.message || 'Failed to reject leave.', 'error');
        }
    } catch (err) {
        console.error('rejectLeave:', err);
        showToast('Failed to reject leave.', 'error');
    }
}

/* ==================================================================
   ALL LEAVES
   ================================================================== */

async function loadAllLeaves() {
    const tbody = document.getElementById('hrmLeaveAllTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="loading-container"><div class="spinner"></div><p>Loading leave applications…</p></td></tr>';

    const params = new URLSearchParams({ limit: '100' });
    const status = document.getElementById('hrmLeaveStatusFilter')?.value;
    const leaveType = document.getElementById('hrmLeaveTypeFilter')?.value;
    if (status) params.set('status', status);
    if (leaveType) params.set('leaveType', leaveType);

    try {
        const res = await fetch(`/api/admin/hrm/leaves?${params.toString()}`, {
            headers: window.hrmAuthHeaders()
        });
        const result = await res.json();
        const rows = result.data || [];

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-status-empty">No leave applications for this filter.</td></tr>';
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
    } catch (err) {
        console.error('loadAllLeaves:', err);
        tbody.innerHTML = '<tr><td colspan="7" class="table-status-error">Failed to load leave applications.</td></tr>';
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
        const res = await fetch(`/api/admin/hrm/leaves/balance?year=${new Date().getFullYear()}`, {
            headers: window.hrmAuthHeaders()
        });
        const result = await res.json();
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
        console.error('loadLeaveBalances:', err);
        grid.innerHTML = '<p class="table-status-error">Failed to load leave balances.</p>';
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
        const res = await fetch(`/api/admin/hrm/leaves/calendar?month=${month}&year=${year}`, {
            headers: window.hrmAuthHeaders()
        });
        const result = await res.json();
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
        console.error('loadLeaveCalendar:', err);
        grid.innerHTML = '<p class="table-status-error">Failed to load the leave calendar.</p>';
    }
}

/* ==================================================================
   APPLY LEAVE
   ================================================================== */

function closeApplyLeaveModal() {
    const modal = document.getElementById('applyLeaveModal');
    if (modal) modal.style.display = 'none';
}

async function openApplyLeaveModal() {
    await window.hrmLoadStaffOptions(['applyLeaveStaff'], { placeholder: 'Select staff member' });

    const start = document.getElementById('applyLeaveStartDate');
    const end = document.getElementById('applyLeaveEndDate');
    if (start && !start.value) start.value = window.hrmTodayInputValue();
    if (end && !end.value) end.value = window.hrmTodayInputValue();

    const modal = document.getElementById('applyLeaveModal');
    if (modal) modal.style.display = 'flex';
}

async function submitLeaveApplication() {
    const payload = {
        staffUsername: document.getElementById('applyLeaveStaff')?.value,
        leaveType: document.getElementById('applyLeaveType')?.value,
        startDate: document.getElementById('applyLeaveStartDate')?.value,
        endDate: document.getElementById('applyLeaveEndDate')?.value,
        reason: document.getElementById('applyLeaveReason')?.value?.trim() || '',
        attachmentUrl: document.getElementById('applyLeaveAttachment')?.value?.trim() || ''
    };

    if (!payload.staffUsername || !payload.startDate || !payload.endDate) {
        showToast('Staff, start date, and end date are required.', 'warning');
        return;
    }
    if (new Date(payload.endDate) < new Date(payload.startDate)) {
        showToast('End date cannot be before the start date.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('applyLeaveSaveBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const res = await fetch('/api/admin/hrm/leaves/apply', {
            method: 'POST',
            headers: window.hrmAuthHeaders(true),
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess('Leave Submitted', result.message || 'Leave application submitted.');
            closeApplyLeaveModal();
            await loadPendingLeaves();
        } else {
            showToast(result.message || 'Failed to submit leave application.', 'error');
        }
    } catch (err) {
        console.error('submitLeaveApplication:', err);
        showToast('Server error while submitting the leave application.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

/* ==================================================================
   SECTION BOOTSTRAP
   ================================================================== */

/** Called by core-nav when the Leave Management section opens. */
async function loadHrmLeavesSection() {
    const now = new Date();
    window.hrmFillMonthSelect('hrmLeaveCalendarMonth', now.getMonth() + 1);
    window.hrmFillYearInput('hrmLeaveCalendarYear', now.getFullYear());

    await loadPendingLeaves();
    await loadLeaveBalances();
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
window.loadLeaveBalances = loadLeaveBalances;
window.loadLeaveCalendar = loadLeaveCalendar;
window.approveLeave = approveLeave;
window.rejectLeave = rejectLeave;
window.openApplyLeaveModal = openApplyLeaveModal;
window.closeApplyLeaveModal = closeApplyLeaveModal;
window.submitLeaveApplication = submitLeaveApplication;
