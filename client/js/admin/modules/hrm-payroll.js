/**
 * Project: EOnlineBazar — HRM Payroll & Salary
 * File: js/admin/modules/hrm-payroll.js
 * Description: Monthly salary ledger, generation from attendance, approval
 * and payment actions, plus PDF pay slip download. Shared helpers come from
 * hrm-attendance.js via window.
 */
import '../admin-core.js';

const PAYROLL_STATUS_CLASSES = {
    draft: 'status-pending',
    approved: 'status-verified',
    paid: 'status-verified'
};

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
    const buttons = [`
        <button type="button" class="catalog-action-btn" onclick="downloadPaySlip('${row._id}')" title="View Pay Slip">
            <i class="fa-solid fa-file-pdf"></i>
        </button>
    `];

    if (row.status === 'draft') {
        buttons.push(`
            <button type="button" class="catalog-action-btn" onclick="approvePayroll('${row._id}')" title="Approve" style="color:#2563eb;">
                <i class="fa-solid fa-circle-check"></i>
            </button>
        `);
    }

    if (row.status === 'approved') {
        buttons.push(`
            <button type="button" class="catalog-action-btn" onclick="markPayrollPaid('${row._id}')" title="Mark Paid" style="color:#10b981;">
                <i class="fa-solid fa-money-bill-wave"></i>
            </button>
        `);
    }

    return `<div class="catalog-actions">${buttons.join('')}</div>`;
}

async function loadPayrollList() {
    const tbody = document.getElementById('hrmPayrollTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" class="loading-container"><div class="spinner"></div><p>Loading payroll…</p></td></tr>';

    const params = new URLSearchParams({ limit: '100' });
    const month = document.getElementById('hrmPayrollMonth')?.value;
    const year = document.getElementById('hrmPayrollYear')?.value;
    const status = document.getElementById('hrmPayrollStatusFilter')?.value;
    if (month) params.set('month', month);
    if (year) params.set('year', year);
    if (status) params.set('status', status);

    try {
        const res = await fetch(`/api/admin/hrm/payroll?${params.toString()}`, {
            headers: window.hrmAuthHeaders()
        });
        const result = await res.json();

        renderPayrollSummary(result.summary);

        const rows = result.data || [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="table-status-empty">No payroll runs for this period.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((row) => `
            <tr>
                <td>
                    <strong>${window.hrmEscape(row.staffName || row.staffUsername || '—')}</strong>
                    <div class="table-subtext">${window.hrmEscape(row.staffUsername || '')}</div>
                </td>
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
    } catch (err) {
        console.error('loadPayrollList:', err);
        tbody.innerHTML = '<tr><td colspan="9" class="table-status-error">Failed to load payroll.</td></tr>';
    }
}

/* ==================================================================
   GENERATE PAYROLL
   ================================================================== */

function closeGeneratePayrollModal() {
    const modal = document.getElementById('generatePayrollModal');
    if (modal) modal.style.display = 'none';
}

async function openGeneratePayrollModal() {
    await window.hrmLoadStaffOptions(['generatePayrollStaff'], { placeholder: 'Select staff member' });
    window.hrmFillMonthSelect('generatePayrollMonth', currentMonth());

    const yearInput = document.getElementById('generatePayrollYear');
    if (yearInput) yearInput.value = currentYear();

    const modal = document.getElementById('generatePayrollModal');
    if (modal) modal.style.display = 'flex';
}

async function submitGeneratePayroll() {
    const payload = {
        staffUsername: document.getElementById('generatePayrollStaff')?.value,
        month: Number(document.getElementById('generatePayrollMonth')?.value),
        year: Number(document.getElementById('generatePayrollYear')?.value),
        bonus: Number(document.getElementById('generatePayrollBonus')?.value) || 0,
        deductions: Number(document.getElementById('generatePayrollDeductions')?.value) || 0,
        paymentMethod: document.getElementById('generatePayrollPaymentMethod')?.value?.trim() || '',
        notes: document.getElementById('generatePayrollNotes')?.value?.trim() || ''
    };

    if (!payload.staffUsername || !payload.month || !payload.year) {
        showToast('Staff, month, and year are required.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('generatePayrollSaveBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const res = await fetch('/api/admin/hrm/payroll/generate', {
            method: 'POST',
            headers: window.hrmAuthHeaders(true),
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess(
                'Payroll Generated',
                `Net payable ${window.hrmFormatMoney(result.data?.totalSalary)} from ${result.attendanceRecords || 0} attendance record(s).`
            );
            closeGeneratePayrollModal();
            await loadPayrollList();
        } else {
            showToast(result.message || 'Failed to generate payroll.', 'error');
        }
    } catch (err) {
        console.error('submitGeneratePayroll:', err);
        showToast('Server error while generating payroll.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

/* ==================================================================
   APPROVE / PAY / PAY SLIP
   ================================================================== */

function approvePayroll(id) {
    showCustomConfirm('Approve Payroll', 'Approve this salary run? It can no longer be regenerated afterwards.', async () => {
        try {
            const res = await fetch(`/api/admin/hrm/payroll/${id}/approve`, {
                method: 'PATCH',
                headers: window.hrmAuthHeaders(true),
                body: JSON.stringify({})
            });
            const result = await res.json();

            if (result.success) {
                showAdminSuccess('Payroll Approved', result.message || 'Approved.');
                await loadPayrollList();
            } else {
                showToast(result.message || 'Failed to approve payroll.', 'error');
            }
        } catch (err) {
            console.error('approvePayroll:', err);
            showToast('Failed to approve payroll.', 'error');
        }
    });
}

function markPayrollPaid(id) {
    showCustomConfirm('Mark as Paid', 'Confirm that this salary has been paid out?', async () => {
        try {
            const res = await fetch(`/api/admin/hrm/payroll/${id}/paid`, {
                method: 'PATCH',
                headers: window.hrmAuthHeaders(true),
                body: JSON.stringify({})
            });
            const result = await res.json();

            if (result.success) {
                showAdminSuccess('Payroll Paid', result.message || 'Marked paid.');
                await loadPayrollList();
            } else {
                showToast(result.message || 'Failed to mark payroll paid.', 'error');
            }
        } catch (err) {
            console.error('markPayrollPaid:', err);
            showToast('Failed to mark payroll paid.', 'error');
        }
    });
}

/**
 * The pay slip route is token-authenticated, so it cannot be opened as a
 * plain link — fetch the PDF and hand the browser a blob download instead.
 */
async function downloadPaySlip(id) {
    try {
        const res = await fetch(`/api/admin/hrm/payroll/${id}/payslip`, {
            headers: window.hrmAuthHeaders()
        });

        if (!res.ok) {
            const result = await res.json().catch(() => ({}));
            showToast(result.message || 'Failed to generate pay slip.', 'error');
            return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `payslip-${id}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('downloadPaySlip:', err);
        showToast('Failed to download pay slip.', 'error');
    }
}

/* ==================================================================
   SALARY CONFIG
   ================================================================== */

function closeSalaryConfigModal() {
    const modal = document.getElementById('salaryConfigModal');
    if (modal) modal.style.display = 'none';
}

async function openSalaryConfigModal() {
    await window.hrmLoadStaffOptions(['salaryConfigStaff'], { placeholder: 'Select staff member' });

    const modal = document.getElementById('salaryConfigModal');
    if (modal) modal.style.display = 'flex';
}

/** Fill the form from the cached roster so the current values are visible. */
function prefillSalaryConfig() {
    const username = document.getElementById('salaryConfigStaff')?.value;
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
    const payload = {
        staffUsername: document.getElementById('salaryConfigStaff')?.value,
        baseSalary: Number(document.getElementById('salaryConfigBaseSalary')?.value),
        department: document.getElementById('salaryConfigDepartment')?.value?.trim() || '',
        employeeId: document.getElementById('salaryConfigEmployeeId')?.value?.trim() || ''
    };

    const joiningDate = document.getElementById('salaryConfigJoiningDate')?.value;
    if (joiningDate) payload.joiningDate = joiningDate;

    if (!payload.staffUsername) {
        showToast('Select a staff member first.', 'warning');
        return;
    }
    if (!Number.isFinite(payload.baseSalary) || payload.baseSalary < 0) {
        showToast('Base salary must be a positive number.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('salaryConfigSaveBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const res = await fetch('/api/admin/hrm/payroll/salary-config', {
            method: 'POST',
            headers: window.hrmAuthHeaders(true),
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess('Salary Saved', result.message || 'Salary configuration saved.');

            // Keep the cached roster in step so reopening the modal shows the new value.
            const cached = window.hrmFindStaff(payload.staffUsername);
            if (cached) Object.assign(cached, result.data || {});

            closeSalaryConfigModal();
        } else {
            showToast(result.message || 'Failed to save salary configuration.', 'error');
        }
    } catch (err) {
        console.error('saveSalaryConfig:', err);
        showToast('Server error while saving salary configuration.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

/* ==================================================================
   SECTION BOOTSTRAP
   ================================================================== */

/** Called by core-nav when the Payroll & Salary section opens. */
async function loadHrmPayrollSection() {
    window.hrmFillMonthSelect('hrmPayrollMonth', currentMonth());
    window.hrmFillYearInput('hrmPayrollYear', currentYear());
    await loadPayrollList();
}

function setupHrmPayrollSection() {
    const refreshBtn = document.getElementById('payrollRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', loadPayrollList);
    }
}

document.addEventListener('DOMContentLoaded', setupHrmPayrollSection);

window.loadHrmPayrollSection = loadHrmPayrollSection;
window.loadPayrollList = loadPayrollList;
window.openGeneratePayrollModal = openGeneratePayrollModal;
window.closeGeneratePayrollModal = closeGeneratePayrollModal;
window.submitGeneratePayroll = submitGeneratePayroll;
window.approvePayroll = approvePayroll;
window.markPayrollPaid = markPayrollPaid;
window.downloadPaySlip = downloadPaySlip;
window.openSalaryConfigModal = openSalaryConfigModal;
window.closeSalaryConfigModal = closeSalaryConfigModal;
window.prefillSalaryConfig = prefillSalaryConfig;
window.saveSalaryConfig = saveSalaryConfig;
