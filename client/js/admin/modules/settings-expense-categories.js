/**
 * Project: EOnlineBazar — System Settings · Finance
 * File: js/admin/modules/settings-expense-categories.js
 * Description: Expense category manager — CRUD, active toggles, and
 * the master "Other" custom input switch under System Settings.
 */
import '../admin-core.js';

function expCatEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function expenseCategoryAuthHeaders() {
    return { Authorization: `Bearer ${token}` };
}

async function loadExpenseCategorySettings() {
    const tbody = document.getElementById('expenseCategoryTableBody');
    const otherToggle = document.getElementById('expenseOtherCustomToggle');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="loading-container"><div class="spinner"></div><p>Loading categories…</p></td></tr>';

    try {
        const res = await fetch('/api/admin/expense-categories/admin', {
            headers: expenseCategoryAuthHeaders()
        });
        const result = await res.json();
        if (!result.success) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-status-error">Failed to load categories.</td></tr>';
            return;
        }

        const rows = result.data || [];
        if (otherToggle) {
            otherToggle.checked = result.otherCustomInputEnabled !== false;
        }

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-status-empty">No expense categories configured.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((row) => {
            const statusBadge = row.isActive
                ? '<span class="exp-cat-badge exp-cat-badge--active">Active</span>'
                : '<span class="exp-cat-badge exp-cat-badge--inactive">Inactive</span>';
            const typeBadge = row.isSystemDefault
                ? '<span class="exp-cat-badge exp-cat-badge--system">System</span>'
                : '<span class="exp-cat-badge exp-cat-badge--custom">Custom</span>';
            const canDelete = !row.isSystemDefault && (row.expenseCount || 0) === 0;

            return `
                <tr data-expense-category-id="${expCatEscape(row._id)}">
                    <td>
                        <strong>${expCatEscape(row.name)}</strong>
                        <div class="exp-cat-slug">${expCatEscape(row.slug)}</div>
                    </td>
                    <td>${statusBadge}</td>
                    <td>${typeBadge}</td>
                    <td>
                        <label class="toggle-switch" title="${row.isActive ? 'Disable in dropdowns' : 'Enable in dropdowns'}">
                            <input type="checkbox" ${row.isActive ? 'checked' : ''}
                                   onchange="toggleExpenseCategoryActive('${expCatEscape(row._id)}', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </td>
                    <td>
                        <div class="catalog-actions">
                            ${canDelete
                                ? `<button type="button" class="catalog-action-btn delete" onclick="deleteExpenseCategory('${expCatEscape(row._id)}', '${expCatEscape(row.name)}')" title="Delete">
                                        <i class="fa-solid fa-trash-can"></i>
                                   </button>`
                                : `<button type="button" class="catalog-action-btn delete" disabled title="Cannot delete — system default or in use">
                                        <i class="fa-solid fa-trash-can"></i>
                                   </button>`}
                        </div>
                    </td>
                </tr>`;
        }).join('');
    } catch (err) {
        console.error('loadExpenseCategorySettings:', err);
        tbody.innerHTML = '<tr><td colspan="5" class="table-status-error">Failed to load categories.</td></tr>';
    }
}

async function saveNewExpenseCategory() {
    const nameInput = document.getElementById('newExpenseCategoryName');
    const name = nameInput?.value?.trim();
    if (!name) {
        showToast('Category name is required.', 'warning');
        return;
    }

    try {
        const res = await fetch('/api/admin/expense-categories', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...expenseCategoryAuthHeaders()
            },
            body: JSON.stringify({ name })
        });
        const result = await res.json();

        if (result.success) {
            if (nameInput) nameInput.value = '';
            showAdminSuccess('Category Added', result.message || 'Expense category created.');
            await loadExpenseCategorySettings();
            if (typeof window.fetchExpenseCategories === 'function') {
                await window.fetchExpenseCategories();
            }
        } else {
            showToast(result.message || 'Failed to add category.', 'error');
        }
    } catch (err) {
        console.error('saveNewExpenseCategory:', err);
        showToast('Failed to add category.', 'error');
    }
}

async function toggleExpenseCategoryActive(id, shouldBeActive) {
    try {
        const res = await fetch(`/api/admin/expense-categories/${id}/toggle`, {
            method: 'PATCH',
            headers: expenseCategoryAuthHeaders()
        });
        const result = await res.json();

        if (result.success) {
            showToast(result.message || 'Category updated.', 'success');
            await loadExpenseCategorySettings();
            if (typeof window.fetchExpenseCategories === 'function') {
                await window.fetchExpenseCategories();
            }
        } else {
            showToast(result.message || 'Failed to toggle category.', 'error');
            await loadExpenseCategorySettings();
        }
    } catch (err) {
        console.error('toggleExpenseCategoryActive:', err);
        showToast('Failed to toggle category.', 'error');
        await loadExpenseCategorySettings();
    }
}

async function toggleExpenseOtherCustomInput(enabled) {
    try {
        const res = await fetch('/api/admin/expense-categories/other-custom-toggle', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...expenseCategoryAuthHeaders()
            },
            body: JSON.stringify({ enabled })
        });
        const result = await res.json();

        if (result.success) {
            showToast(result.message || 'Setting saved.', 'success');
            if (typeof window.fetchExpenseCategories === 'function') {
                await window.fetchExpenseCategories();
            }
        } else {
            showToast(result.message || 'Failed to update setting.', 'error');
            const toggle = document.getElementById('expenseOtherCustomToggle');
            if (toggle) toggle.checked = !enabled;
        }
    } catch (err) {
        console.error('toggleExpenseOtherCustomInput:', err);
        showToast('Failed to update setting.', 'error');
        const toggle = document.getElementById('expenseOtherCustomToggle');
        if (toggle) toggle.checked = !enabled;
    }
}

function deleteExpenseCategory(id, name) {
    showCustomConfirm(
        'Delete Expense Category',
        `Remove "${name}" permanently? This cannot be undone.`,
        async () => {
            try {
                const res = await fetch(`/api/admin/expense-categories/${id}`, {
                    method: 'DELETE',
                    headers: expenseCategoryAuthHeaders()
                });
                const result = await res.json();

                if (result.success) {
                    showAdminSuccess('Category Deleted', result.message || 'Removed.');
                    await loadExpenseCategorySettings();
                    if (typeof window.fetchExpenseCategories === 'function') {
                        await window.fetchExpenseCategories();
                    }
                } else {
                    showToast(result.message || 'Cannot delete category.', 'error');
                }
            } catch (err) {
                console.error('deleteExpenseCategory:', err);
                showToast('Failed to delete category.', 'error');
            }
        },
        'danger'
    );
}

window.loadExpenseCategorySettings = loadExpenseCategorySettings;
window.saveNewExpenseCategory = saveNewExpenseCategory;
window.toggleExpenseCategoryActive = toggleExpenseCategoryActive;
window.toggleExpenseOtherCustomInput = toggleExpenseOtherCustomInput;
window.deleteExpenseCategory = deleteExpenseCategory;
