/**
 * Project: EOnlineBazar — HRM Payroll & Salary
 * File: js/admin/modules/hrm-payroll.js
 * Description: Monthly salary ledger, generation from attendance, approval
 * and payment actions, plus PDF pay slip download. Shared helpers come from
 * hrm-attendance.js via window.
 */
// STANDARD: Use Swal.fire() for ALL confirmations.
// Never use confirm(), alert(), or window.confirm().
import '../admin-core.js';
import {
    hrmFetchJson,
    hrmFetchBlob,
    hrmHandleLoadError,
    hrmTableErrorRow,
    hrmSanitizeStaffFields,
    hrmParseStaffSelect,
    hrmWithSubmitButton,
    hrmRunModalOpen,
    hrmEscapeInline
} from './hrm-api.js';

const PAYROLL_STATUS_CLASSES = {
    draft: 'status-pending',
    approved: 'status-verified',
    paid: 'status-verified'
};

let payrollPg = null;
const payrollPgState = { page: 1, limit: 10 };

function initPayrollPg() {
    if (!payrollPg && typeof AdminPagination !== 'undefined') {
        payrollPg = AdminPagination.ensure('payrollPaginationContainer', {
            defaultLimit: 10,
            onPageChange: (page, limit) => {
                payrollPgState.page = page;
                payrollPgState.limit = limit;
                loadPayrollList();
            }
        });
    }
    return payrollPg;
}

function currentMonth() {
    return new Date().getMonth() + 1;
}

function currentYear() {
    return new Date().getFullYear();
}

function renderPayrollSummary(summary) {
    const totalEl = document.getElementById('hrmPayrollTotalAmount');
    if (totalEl) totalEl.textContent = window.hrmFormatMoney(summary?.totalAmount);

    const paidEl = document.getElementById('hrmPayrollPaidCount');
    if (paidEl) paidEl.textContent = summary?.paidCount ?? 0;

    const pendingEl = document.getElementById('hrmPayrollPendingCount');
    if (pendingEl) pendingEl.textContent = summary?.pendingCount ?? 0;
}

/** Only a draft can be approved, and only an approved run can be paid. */
function payrollRowActions(row) {
    const rowId = hrmEscapeInline(String(row._id ?? ''));
    const buttons = [`
        <button type="button" class="catalog-action-btn" data-payroll-action="payslip" data-payroll-id="${rowId}" title="View Pay Slip">
            <i class="fa-solid fa-file-pdf"></i>
        </button>
    `];

    const canProcess = typeof window.hasAdminPermission === 'function'
        && (window.hasAdminPermission('process_payroll')
            || window.hasAdminPermission('manage_payroll')
            || window.hasAdminPermission('manage_staff'));

    if (canProcess && row.status === 'draft') {
        buttons.push(`
            <button type="button" class="catalog-action-btn" data-payroll-action="approve" data-payroll-id="${rowId}" title="Approve" style="color:#2563eb;">
                <i class="fa-solid fa-circle-check"></i>
            </button>
        `);
    }

    if (canProcess && row.status === 'approved') {
        buttons.push(`
            <button type="button" class="catalog-action-btn" data-payroll-action="paid" data-payroll-id="${rowId}" title="Mark Paid" style="color:#10b981;">
                <i class="fa-solid fa-money-bill-wave"></i>
            </button>
        `);
    }

    return `<div class="catalog-actions">${buttons.join('')}</div>`;
}

function applyPayrollFilters() {
    payrollPgState.page = 1;
    payrollPg?.resetPage();
    loadPayrollList();
}

async function loadPayrollList(options = {}) {
    const { soft = false } = options;
    const tbody = document.getElementById('hrmPayrollTableBody');
    if (!tbody) return;

    const loadMarker = soft
        ? window.hrmBeginSoftTableLoad?.(tbody) || { end() {} }
        : window.hrmTableLoadingRow?.(tbody, 10, 'Loading payroll…') || { end() {} };

    const params = new URLSearchParams();
    params.set('page', String(payrollPgState.page));
    params.set('limit', String(payrollPgState.limit));
    const month = document.getElementById('hrmPayrollMonth')?.value;
    const year = document.getElementById('hrmPayrollYear')?.value;
    const status = document.getElementById('hrmPayrollStatusFilter')?.value;
    if (month) params.set('month', month);
    if (year) params.set('year', year);
    if (status) params.set('status', status);

    const selfOnly = typeof window.hasAdminPermission === 'function'
        && window.hasAdminPermission('view_own_payslip')
        && !window.hasAdminPermission('view_payroll')
        && !window.hasAdminPermission('manage_staff');
    const payrollBase = selfOnly ? '/api/admin/hrm/payroll/my-payslips' : '/api/admin/hrm/payroll';

    try {
        const { result } = await hrmFetchJson(`${payrollBase}?${params.toString()}`, {
            headers: window.hrmAuthHeaders()
        });

        renderPayrollSummary(result.summary);

        const rows = result.data || [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="table-status-empty">No payroll runs for this period.</td></tr>';
            initPayrollPg()?.setTotal(result.pagination?.total ?? 0);
            return;
        }

        tbody.innerHTML = rows.map((row) => `
            <tr data-hrm-row="1">
                <td>
                    <strong>${window.hrmEscape(row.staffName || row.staffUsername || '—')}</strong>
                    <div class="table-subtext">${window.hrmEscape(row.staffUsername || '')}</div>
                </td>
                <td>${row.designation ? window.hrmEscape(row.designation) : '<span class="table-status-empty">—</span>'}</td>
                <td>${window.hrmEscape(window.HRM_MONTHS[row.month - 1] || row.month)} ${row.year}</td>
                <td>${window.hrmFormatMoney(row.baseSalary)}</td>
                <td>${window.hrmFormatMoney(row.bonus)}</td>
                <td>${Number(row.overtime) || 0}h · ${window.hrmFormatMoney(row.overtimeAmount)}</td>
                <td>${window.hrmFormatMoney(row.deductions)}</td>
                <td><strong>${window.hrmFormatMoney(row.totalSalary)}</strong></td>
                <td><span class="status-badge ${PAYROLL_STATUS_CLASSES[row.status] || 'status-pending'}">${window.hrmEscape(row.status)}</span></td>
                <td>${payrollRowActions(row)}</td>
            </tr>
        `).join('');
        initPayrollPg()?.setTotal(result.pagination?.total ?? 0);
    } catch (err) {
        hrmHandleLoadError(err, { context: 'loadPayrollList' });
        tbody.innerHTML = hrmTableErrorRow(10);
    } finally {
        loadMarker.end?.();
    }
}

/* ==================================================================
   GENERATE PAYROLL
   ================================================================== */

function resetGeneratePayrollForm() {
    window.hrmResetFormById?.('generatePayrollForm');
    window.hrmClearStaffSearchSelect?.('generatePayrollStaff', { placeholder: 'Select staff member' });
    window.hrmFillMonthSelect('generatePayrollMonth', currentMonth());
    const yearInput = document.getElementById('generatePayrollYear');
    if (yearInput) yearInput.value = currentYear();
}

function closeGeneratePayrollModal() {
    const modal = document.getElementById('generatePayrollModal');
    if (modal) modal.style.display = 'none';
    resetGeneratePayrollForm();
}

async function openGeneratePayrollModal(triggerBtn = null) {
    await hrmRunModalOpen({
        triggerBtn,
        modalId: 'generatePayrollModal',
        onReset: resetGeneratePayrollForm,
        prepare: async () => {
            await window.hrmLoadStaffOptions(['generatePayrollStaff'], {
                placeholder: 'Select staff member',
                forStaffPicker: true
            });
            window.hrmMountStaffSearchSelect('generatePayrollStaff', { placeholder: 'Search staff by name or ID…' });
            window.hrmFillMonthSelect('generatePayrollMonth', currentMonth());
            const yearInput = document.getElementById('generatePayrollYear');
            if (yearInput) yearInput.value = currentYear();
        }
    });
}

function readGeneratePayrollPayload() {
    const staffValue = window.hrmGetStaffSearchValue('generatePayrollStaff');
    return hrmSanitizeStaffFields({
        staffSelect: staffValue,
        staffValue,
        month: Number(document.getElementById('generatePayrollMonth')?.value),
        year: Number(document.getElementById('generatePayrollYear')?.value),
        bonus: Number(document.getElementById('generatePayrollBonus')?.value) || 0,
        deductions: Number(document.getElementById('generatePayrollDeductions')?.value) || 0,
        paymentMethod: document.getElementById('generatePayrollPaymentMethod')?.value?.trim() || '',
        notes: document.getElementById('generatePayrollNotes')?.value?.trim() || ''
    });
}

function closePayrollBreakdownModal() {
    const modal = document.getElementById('payrollBreakdownModal');
    if (modal) modal.style.display = 'none';
}

function renderPayrollBreakdown(preview) {
    const body = document.getElementById('payrollBreakdownBody');
    if (!body || !preview) return;

    const b = preview.breakdown || {};
    body.innerHTML = `
        <table class="data-table">
            <tbody>
                <tr><td>Days Present</td><td><strong>${b.presentDays ?? 0}</strong></td><td>Absent</td><td><strong>${b.absentDays ?? 0}</strong></td></tr>
                <tr><td>Late Days</td><td><strong>${b.lateDays ?? 0}</strong></td><td>Working Days</td><td><strong>${b.workingDays ?? 0}</strong></td></tr>
                <tr><td>Base Salary</td><td colspan="3"><strong>${window.hrmFormatMoney(preview.baseSalary)}</strong></td></tr>
                <tr><td>Earned Salary</td><td colspan="3"><strong>${window.hrmFormatMoney(preview.earnedSalary)}</strong></td></tr>
                <tr><td>Deductions</td><td colspan="3"><strong>${window.hrmFormatMoney(preview.deductions)}</strong></td></tr>
                <tr><td>Net Salary</td><td colspan="3"><strong style="color:#2563eb;">${window.hrmFormatMoney(preview.netSalary)}</strong></td></tr>
            </tbody>
        </table>
        <p class="hrm-modal-hint">Absent deduction: ${window.hrmFormatMoney(b.absentDeduction)} · Late deduction: ${window.hrmFormatMoney(b.lateDeduction)}</p>
    `;
}

async function calculatePayrollFromAttendance() {
    const payload = readGeneratePayrollPayload();
    if (!payload.staffValue || !payload.month || !payload.year) {
        showToast('Staff, month, and year are required.', 'warning');
        return;
    }

    const btn = document.getElementById('calculatePayrollBtn');

    try {
        await window.hrmWithButtonElement(btn, async () => {
        const params = new URLSearchParams({
            employeeId: payload.staffId || payload.employeeId || payload.staffUsername || hrmParseStaffSelect(payload.staffValue).employeeId,
            month: String(payload.month),
            year: String(payload.year),
            bonus: String(payload.bonus),
            deductions: String(payload.deductions)
        });

        const { result } = await hrmFetchJson(`/api/admin/hrm/payroll/calculate?${params.toString()}`, {
            headers: window.hrmAuthHeaders()
        });

        window.__payrollPreviewPayload = payload;
        renderPayrollBreakdown(result.data);
        const modal = document.getElementById('payrollBreakdownModal');
        if (modal) modal.style.display = 'flex';
        }, { loadingHtml: '<i class="fa-solid fa-spinner fa-spin"></i> Calculating…' });
    } catch (err) {
        showToast(err.message || 'Server error while calculating payroll.', 'error');
    }
}

async function confirmGeneratePayrollFromBreakdown() {
    const confirmBtn = document.getElementById('confirmPayrollSaveBtn');
    try {
        await hrmWithSubmitButton(confirmBtn, 'Confirm & Save', async () => {
            closePayrollBreakdownModal();
            await submitGeneratePayroll({ skipButtonUi: true });
        });
    } catch (err) {
        showToast(err.message || 'Server error while generating payroll.', 'error');
    }
}

async function submitGeneratePayroll({ skipButtonUi = false } = {}) {
    const payload = readGeneratePayrollPayload();

    if (!payload.staffValue || !payload.month || !payload.year) {
        showToast('Staff, month, and year are required.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('generatePayrollSaveBtn');
    const run = async () => {
        const { staffValue: _omit, ...generateBody } = payload;
        const { result } = await hrmFetchJson('/api/admin/hrm/payroll/generate', {
            method: 'POST',
            headers: window.hrmAuthHeaders(true),
            body: JSON.stringify(generateBody)
        });

        showAdminSuccess(
            'Payroll Generated',
            `Net payable ${window.hrmFormatMoney(result.data?.totalSalary)} from ${result.attendanceRecords || 0} attendance record(s).`
        );
        closeGeneratePayrollModal();
        await loadPayrollList({ soft: true });
    };

    try {
        if (skipButtonUi) {
            await run();
        } else {
            await hrmWithSubmitButton(saveBtn, 'Generate', run);
        }
    } catch (err) {
        showToast(err.message || 'Server error while generating payroll.', 'error');
    }
}

/* ==================================================================
   APPROVE / PAY / PAY SLIP
   ================================================================== */

function approvePayroll(id, triggerBtn = null) {
    showCustomConfirm('Approve Payroll', 'Approve this salary run? It can no longer be regenerated afterwards.', async () => {
        const run = async () => {
            const { result } = await hrmFetchJson(`/api/admin/hrm/payroll/${id}/approve`, {
                method: 'PATCH',
                headers: window.hrmAuthHeaders(true),
                body: JSON.stringify({})
            });

            showAdminSuccess('Payroll Approved', result.message || 'Approved.');
            await loadPayrollList({ soft: true });
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
            showToast(err.message || 'Failed to approve payroll.', 'error');
        }
    });
}

function markPayrollPaid(id, triggerBtn = null) {
    showCustomConfirm('Mark as Paid', 'Confirm that this salary has been paid out?', async () => {
        const run = async () => {
            const { result } = await hrmFetchJson(`/api/admin/hrm/payroll/${id}/paid`, {
                method: 'PATCH',
                headers: window.hrmAuthHeaders(true),
                body: JSON.stringify({})
            });

            showAdminSuccess('Payroll Paid', result.message || 'Marked paid.');
            await loadPayrollList({ soft: true });
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
            showToast(err.message || 'Failed to mark payroll paid.', 'error');
        }
    });
}

/**
 * The pay slip route is token-authenticated, so it cannot be opened as a
 * plain link — fetch the PDF and hand the browser a blob download instead.
 */
async function downloadPaySlip(id, triggerBtn = null) {
    const run = async () => {
        const blob = await hrmFetchBlob(`/api/admin/hrm/payroll/${id}/payslip`, {
            headers: window.hrmAuthHeaders()
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `payslip-${id}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
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
        showToast(err.message || 'Failed to download pay slip.', 'error');
    }
}

function setupPayrollTableDelegation() {
    const root = document.getElementById('view-hrm-payroll');
    if (!root || root.dataset.payrollActionDeleg) return;
    root.dataset.payrollActionDeleg = '1';

    root.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-payroll-action]');
        if (!btn) return;
        e.preventDefault();
        const id = btn.dataset.payrollId || '';
        const action = btn.dataset.payrollAction;
        if (action === 'approve') approvePayroll(id, btn);
        else if (action === 'paid') markPayrollPaid(id, btn);
        else if (action === 'payslip') downloadPaySlip(id, btn);
    });
}

/* ==================================================================
   SALARY CONFIG
   ================================================================== */

function resetSalaryConfigForm() {
    window.hrmResetFormById?.('salaryConfigForm');
    window.hrmClearStaffSearchSelect?.('salaryConfigStaff', { placeholder: 'Select staff member' });
}

function closeSalaryConfigModal() {
    const modal = document.getElementById('salaryConfigModal');
    if (modal) modal.style.display = 'none';
    resetSalaryConfigForm();
}

async function openSalaryConfigModal(triggerBtn = null) {
    await hrmRunModalOpen({
        triggerBtn,
        modalId: 'salaryConfigModal',
        onReset: resetSalaryConfigForm,
        prepare: async () => {
            await window.hrmLoadStaffOptions(['salaryConfigStaff'], {
                placeholder: 'Select staff member',
                forStaffPicker: true
            });
            window.hrmMountStaffSearchSelect('salaryConfigStaff', { placeholder: 'Search staff by name or ID…' });
        }
    });
}

/** Fill the form from the cached roster so the current values are visible. */
function prefillSalaryConfig() {
    const username = window.hrmGetStaffSearchValue('salaryConfigStaff');
    const staff = username ? window.hrmFindStaff(username) : null;

    const salary = document.getElementById('salaryConfigBaseSalary');
    const department = document.getElementById('salaryConfigDepartment');
    const employeeId = document.getElementById('salaryConfigEmployeeId');
    const joiningDate = document.getElementById('salaryConfigJoiningDate');

    if (salary) salary.value = staff?.baseSalary ?? '';
    if (department) department.value = staff?.department || '';
    if (employeeId) employeeId.value = staff?.employeeId || '';
    if (joiningDate) {
        joiningDate.value = staff?.joiningDate
            ? new Date(staff.joiningDate).toISOString().slice(0, 10)
            : '';
    }
}

async function saveSalaryConfig() {
    const payload = hrmSanitizeStaffFields({
        staffSelect: window.hrmGetStaffSearchValue('salaryConfigStaff'),
        baseSalary: Number(document.getElementById('salaryConfigBaseSalary')?.value),
        department: document.getElementById('salaryConfigDepartment')?.value?.trim() || '',
        employeeId: document.getElementById('salaryConfigEmployeeId')?.value?.trim() || ''
    });

    const joiningDate = document.getElementById('salaryConfigJoiningDate')?.value;
    if (joiningDate) payload.joiningDate = joiningDate;

    if (!payload.staffUsername && !payload.staffId) {
        showToast('Select a staff member first.', 'warning');
        return;
    }
    if (!Number.isFinite(payload.baseSalary) || payload.baseSalary < 0) {
        showToast('Base salary must be a positive number.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('salaryConfigSaveBtn');

    try {
        await hrmWithSubmitButton(saveBtn, 'Save Configuration', async () => {
            const { result } = await hrmFetchJson('/api/admin/hrm/payroll/salary-config', {
                method: 'POST',
                headers: window.hrmAuthHeaders(true),
                body: JSON.stringify(payload)
            });

            showAdminSuccess('Salary Saved', result.message || 'Salary configuration saved.');

            const cached = window.hrmFindStaff(payload.staffUsername || payload.staffId);
            if (cached) Object.assign(cached, result.data || {});

            closeSalaryConfigModal();
        });
    } catch (err) {
        showToast(err.message || 'Server error while saving salary configuration.', 'error');
    }
}

/* ==================================================================
   SECTION BOOTSTRAP
   ================================================================== */

/** Called by core-nav when the Payroll & Salary section opens. */
async function loadHrmPayrollSection() {
    if (typeof window.waitForAdminPermissions === 'function') {
        await window.waitForAdminPermissions();
    }

    if (typeof window.applyPermissionGating === 'function') {
        window.applyPermissionGating(document.getElementById('view-hrm-payroll'));
    }

    window.hrmFillMonthSelect('hrmPayrollMonth', currentMonth());
    window.hrmFillYearInput('hrmPayrollYear', currentYear());

    if (typeof window.hrmLoadStaffOptions === 'function') {
        window.hrmLoadStaffOptions([]).catch(() => {});
    }

    const canViewPayroll = typeof window.hasAdminPermission === 'function'
        && (window.hasAdminPermission('view_payroll')
            || window.hasAdminPermission('view_own_payslip')
            || window.hasAdminPermission('manage_staff'));
    if (canViewPayroll) {
        await loadPayrollList();
    }
}

function setupHrmPayrollSection() {
    setupPayrollTableDelegation();

    const refreshBtn = document.getElementById('payrollRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', () => {
            if (window.hrmWithButtonElement) {
                window.hrmWithButtonElement(refreshBtn, () => loadPayrollList({ soft: true }), {
                    loadingHtml: '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing…'
                });
            } else {
                loadPayrollList({ soft: true });
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', setupHrmPayrollSection);

window.loadHrmPayrollSection = loadHrmPayrollSection;
window.loadPayrollList = loadPayrollList;
window.applyPayrollFilters = applyPayrollFilters;
window.openGeneratePayrollModal = openGeneratePayrollModal;
window.closeGeneratePayrollModal = closeGeneratePayrollModal;
window.submitGeneratePayroll = submitGeneratePayroll;
window.calculatePayrollFromAttendance = calculatePayrollFromAttendance;
window.closePayrollBreakdownModal = closePayrollBreakdownModal;
window.confirmGeneratePayrollFromBreakdown = confirmGeneratePayrollFromBreakdown;
window.approvePayroll = approvePayroll;
window.markPayrollPaid = markPayrollPaid;
window.downloadPaySlip = downloadPaySlip;
window.openSalaryConfigModal = openSalaryConfigModal;
window.closeSalaryConfigModal = closeSalaryConfigModal;
window.prefillSalaryConfig = prefillSalaryConfig;
window.saveSalaryConfig = saveSalaryConfig;
