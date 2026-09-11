/**
 * Project: EOnlineBazar — ERP Expense Tracking
 * File: js/admin/modules/erp-expenses.js
 */
import '../admin-core.js';

const EXPENSE_CATEGORIES = [
    'office_rent',
    'utilities',
    'staff_salary',
    'marketing',
    'courier_charges',
    'packaging',
    'equipment',
    'other'
];

const EXPENSE_CATEGORY_LABELS = {
    office_rent: 'Office Rent',
    utilities: 'Utilities',
    staff_salary: 'Staff Salary',
    marketing: 'Marketing',
    courier_charges: 'Courier Charges',
    packaging: 'Packaging',
    equipment: 'Equipment',
    other: 'Other'
};

const EXPENSE_BADGE_CLASS = {
    office_rent: 'exp-badge-rent',
    utilities: 'exp-badge-util',
    staff_salary: 'exp-badge-salary',
    marketing: 'exp-badge-marketing',
    courier_charges: 'exp-badge-courier',
    packaging: 'exp-badge-packaging',
    equipment: 'exp-badge-equipment',
    other: 'exp-badge-other'
};

function escapeCell(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function formatMoney(value) {
    return `৳${Number(value || 0).toLocaleString('en-US')}`;
}

function formatDate(value) {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function categoryLabel(slug) {
    return EXPENSE_CATEGORY_LABELS[slug] || slug || 'Other';
}

function populateCategorySelects() {
    const filterSelect = document.getElementById('expFilterCategory');
    const modalSelect = document.getElementById('expenseCategory');
    const optionsHtml = EXPENSE_CATEGORIES.map((cat) =>
        `<option value="${cat}">${categoryLabel(cat)}</option>`
    ).join('');

    if (filterSelect && filterSelect.options.length <= 1) {
        filterSelect.innerHTML = `<option value="">All categories</option>${optionsHtml}`;
    }
    if (modalSelect && !modalSelect.options.length) {
        modalSelect.innerHTML = optionsHtml;
    }
}

function getExpenseFilterParams() {
    const params = new URLSearchParams({ limit: '100' });
    const start = document.getElementById('expFilterStart')?.value;
    const end = document.getElementById('expFilterEnd')?.value;
    const category = document.getElementById('expFilterCategory')?.value;
    if (start) params.set('startDate', start);
    if (end) params.set('endDate', end);
    if (category) params.set('category', category);
    return params;
}

function renderExpenseStats(stats) {
    const thisMonthEl = document.getElementById('expStatThisMonth');
    const topCatEl = document.getElementById('expStatTopCategory');
    const vsEl = document.getElementById('expStatVsLastMonth');

    if (thisMonthEl) thisMonthEl.textContent = formatMoney(stats?.thisMonthTotal || 0);

    if (topCatEl) {
        topCatEl.textContent = stats?.topCategory
            ? `${categoryLabel(stats.topCategory)} (${formatMoney(stats.topCategoryTotal)})`
            : '—';
    }

    if (vsEl) {
        const pct = Number(stats?.vsLastMonth);
        if (!Number.isFinite(pct)) {
            vsEl.textContent = '—';
            vsEl.className = 'exp-stat-value';
        } else if (pct > 0) {
            vsEl.textContent = `+${pct}%`;
            vsEl.className = 'exp-stat-value exp-stat-up';
        } else if (pct < 0) {
            vsEl.textContent = `${pct}%`;
            vsEl.className = 'exp-stat-value exp-stat-down';
        } else {
            vsEl.textContent = '0%';
            vsEl.className = 'exp-stat-value';
        }
    }
}

function renderCategoryTotals(categories) {
    const list = document.getElementById('expCategoryTotalsList');
    if (!list) return;

    const rows = (categories || [])
        .filter((row) => Number(row.total) > 0)
        .sort((a, b) => b.total - a.total);

    if (!rows.length) {
        list.innerHTML = '<li class="exp-category-empty">No expenses in this period.</li>';
        return;
    }

    const max = Math.max(...rows.map((r) => Number(r.total) || 0), 1);
    list.innerHTML = rows.map((row) => {
        const pct = Math.round(((Number(row.total) || 0) / max) * 100);
        return `
            <li class="exp-category-item">
                <div class="exp-category-item-head">
                    <span class="exp-category-badge ${EXPENSE_BADGE_CLASS[row.category] || 'exp-badge-other'}">${escapeCell(categoryLabel(row.category))}</span>
                    <span class="exp-category-amount">${formatMoney(row.total)}</span>
                </div>
                <div class="exp-category-bar"><span style="width:${pct}%"></span></div>
            </li>`;
    }).join('');
}

function renderMonthlyTrend(trend) {
    const chart = document.getElementById('expMonthlyTrendChart');
    if (!chart) return;

    const rows = Array.isArray(trend) ? trend : [];
    if (!rows.length) {
        chart.innerHTML = '<p class="exp-category-empty">No trend data yet.</p>';
        return;
    }

    const max = Math.max(...rows.map((r) => Number(r.total) || 0), 1);
    chart.innerHTML = rows.map((row) => {
        const h = Math.max(8, Math.round(((Number(row.total) || 0) / max) * 100));
        return `
            <div class="exp-trend-bar" title="${escapeCell(row.label)}: ${formatMoney(row.total)}">
                <div class="exp-trend-bar-fill" style="height:${h}%"></div>
                <span class="exp-trend-bar-label">${escapeCell(row.label.split(' ')[0])}</span>
            </div>`;
    }).join('');
}

async function loadExpenseSummary() {
    try {
        const params = getExpenseFilterParams();
        params.delete('limit');
        const res = await fetch(`/api/admin/expenses/summary?${params}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();
        if (!result.success) return;

        renderExpenseStats(result.data?.stats);
        renderCategoryTotals(result.data?.categories);
        renderMonthlyTrend(result.data?.monthlyTrend);
    } catch (err) {
        console.error('loadExpenseSummary:', err);
    }
}

async function loadExpenses() {
    const tbody = document.getElementById('expensesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="loading-container"><div class="spinner"></div><p>Loading expenses…</p></td></tr>';

    try {
        const res = await fetch(`/api/admin/expenses?${getExpenseFilterParams()}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();
        const rows = result.data || [];

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-status-empty">No expenses found for this filter.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((exp) => {
            const receipt = exp.attachmentUrl
                ? `<a href="${escapeCell(exp.attachmentUrl)}" target="_blank" rel="noopener" class="exp-receipt-link" title="View receipt"><i class="fa-solid fa-paperclip"></i></a> `
                : '';
            return `
                <tr>
                    <td>${formatDate(exp.date)}</td>
                    <td><span class="exp-category-badge ${EXPENSE_BADGE_CLASS[exp.category] || 'exp-badge-other'}">${escapeCell(categoryLabel(exp.category))}</span></td>
                    <td>${receipt}${escapeCell(exp.description || '—')}</td>
                    <td>${escapeCell(exp.reference || '—')}</td>
                    <td class="exp-td-amount">${formatMoney(exp.amount)}</td>
                    <td>
                        <div class="catalog-actions">
                            <button type="button" class="catalog-action-btn edit" onclick="openEditExpenseModal('${exp._id}')" title="Edit">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button type="button" class="catalog-action-btn delete" onclick="deleteExpense('${exp._id}')" title="Delete">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }).join('');
    } catch (err) {
        console.error('loadExpenses:', err);
        tbody.innerHTML = '<tr><td colspan="6" class="table-status-error">Failed to load expenses.</td></tr>';
    }
}

async function loadExpensesSection() {
    populateCategorySelects();
    await Promise.all([loadExpenses(), loadExpenseSummary()]);
}

function applyExpenseFilters() {
    loadExpensesSection();
}

function resetExpenseForm() {
    document.getElementById('expenseEditId').value = '';
    document.getElementById('expenseCategory').value = EXPENSE_CATEGORIES[0];
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseDescription').value = '';
    document.getElementById('expenseReference').value = '';
    document.getElementById('expenseAttachmentUrl').value = '';
    document.getElementById('expenseReceiptFile').value = '';
    const preview = document.getElementById('expenseReceiptPreview');
    if (preview) { preview.hidden = true; preview.innerHTML = ''; }
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('expenseDate').value = today;
    const title = document.getElementById('expenseModalTitle');
    if (title) title.innerHTML = '<i class="fa-solid fa-receipt"></i> Add Expense';
}

function closeExpenseModal() {
    const modal = document.getElementById('expenseModal');
    if (modal) modal.style.display = 'none';
}

function openAddExpenseModal() {
    resetExpenseForm();
    populateCategorySelects();
    const modal = document.getElementById('expenseModal');
    if (modal) modal.style.display = 'flex';
}

async function openEditExpenseModal(id) {
    try {
        const res = await fetch(`/api/admin/expenses?limit=200`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();
        const exp = (result.data || []).find((row) => String(row._id) === String(id));
        if (!exp) {
            showToast('Expense not found.', 'error');
            return;
        }

        populateCategorySelects();
        document.getElementById('expenseEditId').value = exp._id;
        document.getElementById('expenseCategory').value = exp.category || 'other';
        document.getElementById('expenseAmount').value = exp.amount ?? '';
        document.getElementById('expenseDescription').value = exp.description || '';
        document.getElementById('expenseReference').value = exp.reference || '';
        document.getElementById('expenseAttachmentUrl').value = exp.attachmentUrl || '';
        document.getElementById('expenseDate').value = exp.date
            ? new Date(exp.date).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10);

        const preview = document.getElementById('expenseReceiptPreview');
        if (preview && exp.attachmentUrl) {
            preview.hidden = false;
            preview.innerHTML = `<a href="${escapeCell(exp.attachmentUrl)}" target="_blank" rel="noopener">View current receipt</a>`;
        }

        const title = document.getElementById('expenseModalTitle');
        if (title) title.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Expense';

        const modal = document.getElementById('expenseModal');
        if (modal) modal.style.display = 'flex';
    } catch (err) {
        console.error('openEditExpenseModal:', err);
        showToast('Failed to load expense.', 'error');
    }
}

async function uploadExpenseReceiptIfNeeded() {
    const fileInput = document.getElementById('expenseReceiptFile');
    const existingUrl = document.getElementById('expenseAttachmentUrl')?.value?.trim();
    const file = fileInput?.files?.[0];
    if (!file) return existingUrl || '';

    const formData = new FormData();
    formData.append('receipt', file);

    const res = await fetch('/api/admin/expenses/upload-receipt', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
    });
    const result = await res.json();
    if (!result.success) {
        throw new Error(result.message || 'Receipt upload failed.');
    }
    return result.data?.url || existingUrl || '';
}

async function saveExpense() {
    const id = document.getElementById('expenseEditId')?.value?.trim();
    const saveBtn = document.getElementById('expenseSaveBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const attachmentUrl = await uploadExpenseReceiptIfNeeded();
        const payload = {
            category: document.getElementById('expenseCategory')?.value,
            amount: Number(document.getElementById('expenseAmount')?.value),
            description: document.getElementById('expenseDescription')?.value?.trim(),
            date: document.getElementById('expenseDate')?.value,
            reference: document.getElementById('expenseReference')?.value?.trim(),
            attachmentUrl
        };

        if (!payload.category || !Number.isFinite(payload.amount) || payload.amount < 0) {
            showToast('Category and a valid amount are required.', 'warning');
            return;
        }

        const res = await fetch(id ? `/api/admin/expenses/${id}` : '/api/admin/expenses', {
            method: id ? 'PATCH' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess(id ? 'Expense Updated' : 'Expense Recorded', result.message || 'Saved.');
            closeExpenseModal();
            await loadExpensesSection();
        } else {
            showToast(result.message || 'Failed to save expense.', 'error');
        }
    } catch (err) {
        console.error('saveExpense:', err);
        showToast(err.message || 'Failed to save expense.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function deleteExpense(id) {
    showCustomConfirm('Delete Expense', 'Remove this expense record permanently?', async () => {
        try {
            const res = await fetch(`/api/admin/expenses/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                showAdminSuccess('Expense Deleted', result.message || 'Removed.');
                await loadExpensesSection();
            } else {
                showToast(result.message || 'Failed to delete expense.', 'error');
            }
        } catch (err) {
            console.error('deleteExpense:', err);
            showToast('Failed to delete expense.', 'error');
        }
    }, 'danger');
}

function initExpenseTrackingSection() {
    populateCategorySelects();

    const fileInput = document.getElementById('expenseReceiptFile');
    if (fileInput && !fileInput.dataset.bound) {
        fileInput.dataset.bound = '1';
        fileInput.addEventListener('change', () => {
            const preview = document.getElementById('expenseReceiptPreview');
            const file = fileInput.files?.[0];
            if (!preview) return;
            if (!file) {
                preview.hidden = true;
                preview.textContent = '';
                return;
            }
            preview.hidden = false;
            preview.textContent = `Selected: ${file.name}`;
        });
    }
}

document.addEventListener('DOMContentLoaded', initExpenseTrackingSection);

window.loadExpenses = loadExpenses;
window.loadExpensesSection = loadExpensesSection;
window.loadExpenseSummary = loadExpenseSummary;
window.applyExpenseFilters = applyExpenseFilters;
window.openAddExpenseModal = openAddExpenseModal;
window.openEditExpenseModal = openEditExpenseModal;
window.closeExpenseModal = closeExpenseModal;
window.saveExpense = saveExpense;
window.deleteExpense = deleteExpense;
window.initExpenseTrackingSection = initExpenseTrackingSection;
