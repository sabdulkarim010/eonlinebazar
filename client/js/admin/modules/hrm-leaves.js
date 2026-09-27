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
    hrmNotifyError,
    hrmTableErrorRow,
    HRM_INLINE_LOAD_ERROR,
    hrmEscapeInline,
    hrmSanitizeStaffFields,
    hrmWithSubmitButton,
    hrmRunModalOpen
} from './hrm-api.js';

const LEAVE_STATUS_CLASSES = {
    pending: 'status-pending',
    approved: 'status-verified',
    rejected: 'status-blocked'
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Mutations (submit / approve / reject) — fail fast so UI never hangs. */
const LEAVE_MUTATION_TIMEOUT_MS = 8000;

/** Staff picker + searchable select warmed on section mount. */
let leaveStaffPickerReady = false;
let leaveApplyResourcesPrefetchPromise = null;

/** Blocks duplicate approve/reject while confirm or API is in flight. */
const leaveActionsBusy = new Set();

function isLeaveAlreadyProcessedError(err) {
    const code = err?.result?.code || err?.code;
    if (code === 'ALREADY_PROCESSED') return true;
    const msg = String(err?.result?.message || err?.message || '');
    return /already been processed|current status:/i.test(msg);
}

/** 400 from approve/reject when the row is no longer pending on the server. */
function isLeavePendingSyncError(err) {
    if (err?.status !== 400) return false;
    if (isLeaveAlreadyProcessedError(err)) return true;
    const code = err?.result?.code || err?.code;
    return code === 'ALREADY_PROCESSED' || code === 'LEAVE_NOT_PENDING';
}

function leaveActionErrorMessage(err, fallbackMessage) {
    return err?.result?.message || err?.message || fallbackMessage;
}

/** Silent background refresh of pending approvals table + badge. */
function fetchPendingLeaves() {
    return loadPendingLeaves({ soft: true });
}

function syncPendingLeaveUiAfterMutation(leaveId) {
    removePendingLeaveRow(leaveId);
    fetchPendingLeaves().catch(() => {});
    loadLeaveBalances().catch(() => {});
}

function handleLeaveActionError(err, leaveId, fallbackMessage) {
    const message = leaveActionErrorMessage(err, fallbackMessage);

    if (isLeavePendingSyncError(err)) {
        syncPendingLeaveUiAfterMutation(leaveId);
        showToast(message, 'warning', 5000);
        return;
    }

    notifyLeaveSubmitError(err, fallbackMessage);
}

function handleLeaveMutationError(err, leaveId, fallbackMessage) {
    handleLeaveActionError(err, leaveId, fallbackMessage);
}

function resetLeaveActionTriggerButton(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.dataset.loading = '0';
    btn.classList.remove('is-loading');
    const defaultHtml = btn.dataset.leaveActionDefaultHtml;
    if (defaultHtml) btn.innerHTML = defaultHtml;
}

async function runLeaveRowMutation(leaveId, triggerBtn, mutationFn, fallbackMessage) {
    if (triggerBtn && !triggerBtn.dataset.leaveActionDefaultHtml) {
        triggerBtn.dataset.leaveActionDefaultHtml = triggerBtn.innerHTML;
    }

    try {
        const exec = async () => mutationFn();
        if (triggerBtn && window.hrmWithButtonElement) {
            await window.hrmWithButtonElement(triggerBtn, exec, {
                loadingHtml: '<i class="fa-solid fa-spinner fa-spin"></i>'
            });
        } else {
            await exec();
        }
    } catch (err) {
        handleLeaveActionError(err, leaveId, fallbackMessage);
    } finally {
        endLeaveAction(leaveId);
        resetLeaveActionTriggerButton(triggerBtn);
    }
}

function removePendingLeaveRow(leaveId) {
    const row = getLeavePendingRow(leaveId);
    if (row) row.remove();

    const tbody = document.getElementById('hrmLeavePendingTableBody');
    if (tbody && !tbody.querySelector('tr[data-leave-id]')) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-status-empty">No leave applications waiting for approval.</td></tr>';
    }

    const badge = document.getElementById('hrmLeavePendingBadge');
    if (badge && !badge.hidden) {
        const next = Math.max(0, (parseInt(badge.textContent, 10) || 0) - 1);
        updatePendingBadge(next);
    }
}

const LEAVE_APPLY_STAFF_SEARCH_PLACEHOLDER = 'Search by staff name or ID…';

function getApplyLeaveNativeSelect() {
    if (typeof window.hrmResolveNativeStaffSelect === 'function') {
        return window.hrmResolveNativeStaffSelect('applyLeaveStaff');
    }
    const el = document.getElementById('applyLeaveStaff');
    if (el?.tagName === 'SELECT') return el;
    return document.querySelector('#applyLeaveStaffGroup select') || null;
}

function applyLeaveStaffSelectHasOptions() {
    const select = getApplyLeaveNativeSelect();
    if (!select?.options) return false;
    return Array.from(select.options).some((opt) => Boolean(opt.value));
}

/**
 * Load active staff for Apply Leave modal (Name - ID labels) + refresh searchable UI.
 * @param {{ force?: boolean }} options — force refetch when cache empty or stale
 */
async function ensureLeaveApplyStaffDropdown({ force = false } = {}) {
    if (!canApplyLeaveForStaff() || typeof window.hrmLoadStaffOptions !== 'function') {
        return;
    }

    const needsFetch = force
        || !leaveStaffPickerReady
        || !applyLeaveStaffSelectHasOptions();

    if (needsFetch) {
        if (force && typeof window.hrmInvalidateStaffPickerCache === 'function') {
            window.hrmInvalidateStaffPickerCache();
        }
        await window.hrmLoadStaffOptions(['applyLeaveStaff'], {
            placeholder: LEAVE_APPLY_STAFF_SEARCH_PLACEHOLDER,
            forStaffPicker: true,
            labelFormat: 'name-id'
        });
    }

    if (!applyLeaveStaffSelectHasOptions()) {
        await window.hrmLoadStaffOptions(['applyLeaveStaff'], {
            placeholder: LEAVE_APPLY_STAFF_SEARCH_PLACEHOLDER,
            forStaffPicker: true,
            labelFormat: 'name-id'
        });
    }

    if (typeof window.hrmRefreshStaffSearchSelect === 'function') {
        window.hrmRefreshStaffSearchSelect('applyLeaveStaff', {
            placeholder: LEAVE_APPLY_STAFF_SEARCH_PLACEHOLDER
        });
    } else if (typeof window.hrmMountStaffSearchSelect === 'function') {
        window.hrmMountStaffSearchSelect('applyLeaveStaff', {
            placeholder: LEAVE_APPLY_STAFF_SEARCH_PLACEHOLDER
        });
    }

    leaveStaffPickerReady = applyLeaveStaffSelectHasOptions();
}

async function prefetchLeaveApplyResources() {
    if (leaveStaffPickerReady && applyLeaveStaffSelectHasOptions()) return;
    if (leaveApplyResourcesPrefetchPromise) {
        await leaveApplyResourcesPrefetchPromise;
        return;
    }

    leaveApplyResourcesPrefetchPromise = (async () => {
        try {
            await ensureLeaveApplyStaffDropdown({ force: false });
        } catch (err) {
            hrmHandleLoadError(err, { context: 'prefetchLeaveApplyResources', silent: true });
        } finally {
            leaveApplyResourcesPrefetchPromise = null;
        }
    })();

    await leaveApplyResourcesPrefetchPromise;
}

function getLeavePendingRow(leaveId) {
    const safeId = typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(String(leaveId))
        : String(leaveId).replace(/"/g, '\\"');
    return document.querySelector(`#hrmLeavePendingTableBody tr[data-leave-id="${safeId}"]`);
}

function setLeaveRowProcessing(leaveId, processing) {
    const row = getLeavePendingRow(leaveId);
    if (!row) return;
    row.classList.toggle('hrm-leave-row-busy', processing);
    row.querySelectorAll('[data-leave-action]').forEach((btn) => {
        btn.disabled = processing;
        btn.setAttribute('aria-disabled', processing ? 'true' : 'false');
    });
}

function beginLeaveAction(leaveId) {
    const id = String(leaveId || '').trim();
    if (!id || leaveActionsBusy.has(id)) return false;
    leaveActionsBusy.add(id);
    setLeaveRowProcessing(id, true);
    return true;
}

function endLeaveAction(leaveId) {
    const id = String(leaveId || '').trim();
    if (!id) return;
    leaveActionsBusy.delete(id);
    setLeaveRowProcessing(id, false);
}

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
        ownBtn.style.display = canOwn ? '' : 'none';
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

async function loadPendingLeaves(options = {}) {
    const { soft = false } = options;
    const tbody = document.getElementById('hrmLeavePendingTableBody');
    if (!tbody) return;

    const loadMarker = soft
        ? window.hrmBeginSoftTableLoad?.(tbody) || { end() {} }
        : window.hrmTableLoadingRow?.(tbody, 6, 'Loading pending leaves…') || { end() {} };

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

        tbody.innerHTML = rows.map((leave) => {
            const leaveId = hrmEscapeInline(resolveLeaveRowId(leave));
            return `
            <tr data-hrm-row="1" data-leave-id="${leaveId}">
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
                        <button type="button" class="catalog-action-btn leave-approve-btn" data-permission="approve_leave" data-leave-action="approve" data-leave-id="${leaveId}" title="Approve" style="color:#10b981;">
                            <i class="fa-solid fa-circle-check"></i>
                        </button>
                        <button type="button" class="catalog-action-btn delete leave-reject-btn" data-permission="approve_leave" data-leave-action="reject" data-leave-id="${leaveId}" title="Reject">
                            <i class="fa-solid fa-circle-xmark"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        if (typeof window.applyPermissionGating === 'function') {
            window.applyPermissionGating(document.getElementById('view-hrm-leaves'));
        }
    } catch (err) {
        hrmHandleLoadError(err, { context: 'loadPendingLeaves' });
        tbody.innerHTML = hrmTableErrorRow(6);
    } finally {
        loadMarker.end?.();
    }
}

function approveLeave(id, triggerBtn = null) {
    const leaveId = String(id ?? '').trim();
    if (!leaveId) {
        showToast('Missing leave id — refresh the list and try again.', 'warning');
        endLeaveAction(leaveId);
        resetLeaveActionTriggerButton(triggerBtn);
        return;
    }

    const confirmPromise = showCustomConfirm(
        'Approve Leave',
        'Approve this leave? The days will be marked as holiday on the attendance register.',
        async () => {
            await runLeaveRowMutation(leaveId, triggerBtn, async () => {
                const { result } = await hrmFetchJson(leaveActionPath(leaveId, 'approve'), {
                    method: 'PATCH',
                    headers: window.hrmAuthHeaders(true),
                    body: JSON.stringify({}),
                    timeoutMs: LEAVE_MUTATION_TIMEOUT_MS
                });

                syncPendingLeaveUiAfterMutation(leaveId);

                if (result.attendanceProcessing) {
                    showToast(
                        'Leave approved! Attendance records are processing in the background.',
                        'success',
                        4500
                    );
                } else {
                    showAdminSuccess('Leave Approved', result.message || 'Leave approved.');
                }
            }, 'Failed to approve leave.');
        }
    );

    if (confirmPromise && typeof confirmPromise.then === 'function') {
        confirmPromise.then((confirmed) => {
            if (!confirmed) {
                endLeaveAction(leaveId);
                resetLeaveActionTriggerButton(triggerBtn);
            }
        });
    }
}

async function rejectLeave(id, triggerBtn = null) {
    const leaveId = String(id ?? '').trim();
    if (!leaveId) {
        showToast('Missing leave id — refresh the list and try again.', 'warning');
        endLeaveAction(leaveId);
        resetLeaveActionTriggerButton(triggerBtn);
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
    if (!result.isConfirmed) {
        endLeaveAction(leaveId);
        return;
    }
    const reason = String(result.value || '').trim();

    await runLeaveRowMutation(leaveId, triggerBtn, async () => {
        const { result: apiResult } = await hrmFetchJson(leaveActionPath(leaveId, 'reject'), {
            method: 'PATCH',
            headers: window.hrmAuthHeaders(true),
            body: JSON.stringify({ rejectionReason: reason }),
            timeoutMs: LEAVE_MUTATION_TIMEOUT_MS
        });

        syncPendingLeaveUiAfterMutation(leaveId);
        showAdminSuccess('Leave Rejected', apiResult.message || 'Leave rejected.');
    }, 'Failed to reject leave.');
}

function setupLeaveTableDelegation() {
    const root = document.getElementById('view-hrm-leaves');
    if (!root || root.dataset.leaveActionDeleg) return;
    root.dataset.leaveActionDeleg = '1';

    root.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-leave-action]');
        if (!btn) return;
        e.preventDefault();
        const leaveId = btn.dataset.leaveId || '';
        const action = btn.dataset.leaveAction;
        if (!beginLeaveAction(leaveId)) return;
        if (action === 'approve') {
            approveLeave(leaveId, btn);
        } else if (action === 'reject') {
            rejectLeave(leaveId, btn);
        } else {
            endLeaveAction(leaveId);
        }
    });
}

/* ==================================================================
   ALL LEAVES
   ================================================================== */

function applyLeaveFilters() {
    leavePgState.page = 1;
    leavePg?.resetPage();
    loadAllLeaves();
}

async function loadAllLeaves(options = {}) {
    const { soft = false } = options;
    const tbody = document.getElementById('hrmLeaveAllTableBody');
    if (!tbody) return;

    const loadMarker = soft
        ? window.hrmBeginSoftTableLoad?.(tbody) || { end() {} }
        : window.hrmTableLoadingRow?.(tbody, 7, 'Loading leave applications…') || { end() {} };

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
            <tr data-hrm-row="1">
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
    } finally {
        loadMarker.end?.();
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

function resetApplyLeaveForm() {
    window.hrmResetFormById?.('applyLeaveForm');
    window.hrmClearStaffSearchSelect?.('applyLeaveStaff', {
        placeholder: LEAVE_APPLY_STAFF_SEARCH_PLACEHOLDER
    });
    applyLeaveSelfMode = false;
    const start = document.getElementById('applyLeaveStartDate');
    const end = document.getElementById('applyLeaveEndDate');
    if (start) start.value = window.hrmTodayInputValue();
    if (end) end.value = window.hrmTodayInputValue();
}

function closeApplyLeaveModal() {
    const modal = document.getElementById('applyLeaveModal');
    if (modal) modal.style.display = 'none';
    resetApplyLeaveForm();
}

async function openApplyLeaveModal(isSelf = false, triggerBtn = null) {
    const selfMode = Boolean(isSelf) && canApplyOwnLeave();

    await hrmRunModalOpen({
        triggerBtn,
        modalId: 'applyLeaveModal',
        onReset: () => {
            resetApplyLeaveForm();
            applyLeaveSelfMode = selfMode;
        },
        prepare: async () => {
            applyLeaveSelfMode = selfMode;

            const staffGroup = document.getElementById('applyLeaveStaffGroup');
            const selfInfo = document.getElementById('applyLeaveSelfInfo');
            const selfName = document.getElementById('applyLeaveSelfName');
            const staffSelect = getApplyLeaveNativeSelect();
            const subtitle = document.getElementById('applyLeaveModalSubtitle');

            if (applyLeaveSelfMode) {
                if (staffGroup) staffGroup.style.display = 'none';
                if (selfInfo) selfInfo.style.display = '';
                if (staffSelect) staffSelect.required = false;
                const hiddenStaff = document.getElementById('applyLeaveStaff');
                if (hiddenStaff?.tagName === 'INPUT') hiddenStaff.removeAttribute('required');
                if (subtitle) subtitle.textContent = 'Submit a leave application for yourself';
                const adminName = window.currentAdmin?.name || window.currentAdmin?.username || 'Your account';
                if (selfName) selfName.textContent = adminName;
            } else {
                await ensureLeaveApplyStaffDropdown({
                    force: !leaveStaffPickerReady || !applyLeaveStaffSelectHasOptions()
                });
                if (staffGroup) staffGroup.style.display = '';
                if (selfInfo) selfInfo.style.display = 'none';
                if (staffSelect) staffSelect.required = false;
                const hiddenStaff = document.getElementById('applyLeaveStaff');
                if (hiddenStaff?.tagName === 'INPUT') hiddenStaff.removeAttribute('required');
                if (subtitle) subtitle.textContent = 'Submit a leave application on behalf of a staff member';
            }
        }
    });
}

function readApplyLeaveStaffValue() {
    const fromSearch = typeof window.hrmGetStaffSearchValue === 'function'
        ? window.hrmGetStaffSearchValue('applyLeaveStaff')
        : '';
    if (fromSearch) return fromSearch;

    const native = getApplyLeaveNativeSelect();
    return native?.value || document.getElementById('applyLeaveStaff')?.value || '';
}

function buildApplyLeavePayload() {
    const leaveType = String(document.getElementById('applyLeaveType')?.value || '').trim().toLowerCase();
    const startDate = String(document.getElementById('applyLeaveStartDate')?.value || '').trim();
    const endDate = String(document.getElementById('applyLeaveEndDate')?.value || '').trim();
    const reason = String(document.getElementById('applyLeaveReason')?.value || '').trim();
    const attachmentUrl = String(document.getElementById('applyLeaveAttachment')?.value || '').trim();

    const payload = {
        leaveType,
        startDate,
        endDate,
        reason,
        attachmentUrl
    };

    if (!applyLeaveSelfMode) {
        Object.assign(payload, hrmSanitizeStaffFields({
            staffSelect: readApplyLeaveStaffValue()
        }));
    }

    return payload;
}

function resetApplyLeaveSubmitButton(saveBtn, defaultLabel) {
    if (!saveBtn) return;
    saveBtn.disabled = false;
    saveBtn.dataset.loading = '0';
    saveBtn.classList.remove('is-loading');
    saveBtn.textContent = defaultLabel;
}

function notifyLeaveSubmitError(err, fallback) {
    const message = err?.result?.message || err?.message || fallback;
    if (typeof showToast === 'function') {
        showToast(message, 'error', 5000);
    } else {
        hrmNotifyError(message, 'error');
    }
}

async function submitLeaveApplication() {
    const saveBtn = document.getElementById('applyLeaveSaveBtn');
    const defaultLabel = 'Submit Application';

    const payload = buildApplyLeavePayload();

    const hasStaffTarget = Boolean(payload.staffId || payload.staffUsername || payload.employeeId);
    if ((!applyLeaveSelfMode && !hasStaffTarget) || !payload.startDate || !payload.endDate) {
        showToast(applyLeaveSelfMode
            ? 'Start date and end date are required.'
            : 'Staff, start date, and end date are required.', 'warning');
        return;
    }
    if (!payload.leaveType) {
        showToast('Leave type is required.', 'warning');
        return;
    }
    if (new Date(payload.endDate) < new Date(payload.startDate)) {
        showToast('End date cannot be before the start date.', 'warning');
        return;
    }

    try {
        await hrmWithSubmitButton(saveBtn, defaultLabel, async () => {
            const endpoint = applyLeaveSelfMode
                ? '/api/admin/hrm/leaves/apply-own'
                : '/api/admin/hrm/leaves/apply';
            const { result } = await hrmFetchJson(endpoint, {
                method: 'POST',
                headers: window.hrmAuthHeaders(true),
                body: JSON.stringify(payload),
                timeoutMs: LEAVE_MUTATION_TIMEOUT_MS
            });

            showAdminSuccess('Leave Submitted', result.message || 'Leave application submitted.');
            closeApplyLeaveModal();
            if (!applyLeaveSelfMode) {
                loadPendingLeaves({ soft: true }).catch(() => {});
            }
            loadLeaveBalances().catch(() => {});
        });
    } catch (err) {
        notifyLeaveSubmitError(err, 'Server error while submitting the leave application.');
    } finally {
        resetApplyLeaveSubmitButton(saveBtn, defaultLabel);
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

    prefetchLeaveApplyResources().catch(() => {});

    const canViewRequests = typeof window.hasAdminPermission === 'function'
        && window.hasAdminPermission('view_leave_requests');
    const canViewOwnBalance = canApplyOwnLeave();

    if (canViewRequests) {
        await Promise.all([loadPendingLeaves(), loadLeaveBalances()]);
    } else if (canViewOwnBalance) {
        await loadLeaveBalances();
    }
}

function setupHrmLeavesSection() {
    setupLeaveTableDelegation();

    window.hrmSetupTabs('hrmLeaveTabs', (panelId) => {
        if (panelId === 'hrm-tab-leaves-all') loadAllLeaves();
        if (panelId === 'hrm-tab-leaves-calendar') loadLeaveCalendar();
    });

    const refreshBtn = document.getElementById('leavesRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', async () => {
            if (window.hrmWithButtonElement) {
                await window.hrmWithButtonElement(refreshBtn, async () => {
                    await loadPendingLeaves({ soft: true });
                    await loadLeaveBalances();
                }, { loadingHtml: '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing…' });
            } else {
                await loadPendingLeaves({ soft: true });
                await loadLeaveBalances();
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupHrmLeavesSection();
    prefetchLeaveApplyResources().catch(() => {});
});

window.loadHrmLeavesSection = loadHrmLeavesSection;
window.loadPendingLeaves = loadPendingLeaves;
window.fetchPendingLeaves = fetchPendingLeaves;
window.loadAllLeaves = loadAllLeaves;
window.applyLeaveFilters = applyLeaveFilters;
window.loadLeaveBalances = loadLeaveBalances;
window.loadLeaveCalendar = loadLeaveCalendar;
window.approveLeave = approveLeave;
window.rejectLeave = rejectLeave;
window.openApplyLeaveModal = openApplyLeaveModal;
window.closeApplyLeaveModal = closeApplyLeaveModal;
window.submitLeaveApplication = submitLeaveApplication;
window.hrmInvalidateLeaveStaffPicker = function hrmInvalidateLeaveStaffPicker() {
    leaveStaffPickerReady = false;
};
window.ensureLeaveApplyStaffDropdown = ensureLeaveApplyStaffDropdown;
