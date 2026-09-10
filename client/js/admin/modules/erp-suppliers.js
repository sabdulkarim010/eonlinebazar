/**
 * Project: EOnlineBazar — ERP Suppliers CRUD
 * File: js/admin/modules/erp-suppliers.js
 */
import '../admin-core.js';

function escapeCell(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function closeSupplierModal() {
    const modal = document.getElementById('supplierModal');
    if (modal) modal.style.display = 'none';
}

function resetSupplierForm() {
    document.getElementById('supplierEditId').value = '';
    document.getElementById('supplierName').value = '';
    document.getElementById('supplierContactPerson').value = '';
    document.getElementById('supplierPhone').value = '';
    document.getElementById('supplierEmail').value = '';
    document.getElementById('supplierAddress').value = '';
    document.getElementById('supplierNotes').value = '';
    document.getElementById('supplierStatus').value = 'active';
    const title = document.getElementById('supplierModalTitle');
    if (title) title.innerHTML = '<i class="fa-solid fa-truck-field"></i> Add Supplier';
}

async function loadSuppliers() {
    const tbody = document.getElementById('suppliersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="loading-container"><div class="spinner"></div><p>Loading suppliers…</p></td></tr>';

    try {
        const search = document.getElementById('suppliersSearchInput')?.value?.trim() || '';
        const qs = new URLSearchParams({ limit: '100' });
        if (search) qs.set('search', search);

        const res = await fetch(`/api/admin/suppliers?${qs}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const rows = data.data || [];

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-status-empty">No suppliers found.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((s) => `
            <tr>
                <td><strong>${escapeCell(s.name)}</strong></td>
                <td>${escapeCell(s.contactPerson || '—')}</td>
                <td>${escapeCell(s.phone || '—')}</td>
                <td>${escapeCell(s.email || '—')}</td>
                <td><span class="status-badge ${s.status === 'active' ? 'status-verified' : 'status-pending'}">${escapeCell(s.status || 'active')}</span></td>
                <td>
                    <div class="catalog-actions">
                        <button type="button" class="catalog-action-btn edit" onclick="openEditSupplierModal('${s._id}')" title="Edit">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button type="button" class="catalog-action-btn delete" onclick="deleteSupplier('${s._id}')" title="Delete">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadSuppliers:', err);
        tbody.innerHTML = '<tr><td colspan="6" class="table-status-error">Failed to load suppliers.</td></tr>';
    }
}

async function openAddSupplierModal() {
    resetSupplierForm();
    const modal = document.getElementById('supplierModal');
    if (modal) modal.style.display = 'flex';
}

async function openEditSupplierModal(id) {
    try {
        const res = await fetch(`/api/admin/suppliers/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();
        if (!result.success || !result.data) {
            showToast(result.message || 'Supplier not found.', 'error');
            return;
        }

        const s = result.data;
        document.getElementById('supplierEditId').value = s._id;
        document.getElementById('supplierName').value = s.name || '';
        document.getElementById('supplierContactPerson').value = s.contactPerson || '';
        document.getElementById('supplierPhone').value = s.phone || '';
        document.getElementById('supplierEmail').value = s.email || '';
        document.getElementById('supplierAddress').value = s.address || '';
        document.getElementById('supplierNotes').value = s.notes || '';
        document.getElementById('supplierStatus').value = s.status || 'active';

        const title = document.getElementById('supplierModalTitle');
        if (title) title.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Supplier';

        const modal = document.getElementById('supplierModal');
        if (modal) modal.style.display = 'flex';
    } catch (err) {
        console.error('openEditSupplierModal:', err);
        showToast('Failed to load supplier.', 'error');
    }
}

async function saveSupplier() {
    const id = document.getElementById('supplierEditId')?.value?.trim();
    const payload = {
        name: document.getElementById('supplierName')?.value?.trim(),
        contactPerson: document.getElementById('supplierContactPerson')?.value?.trim(),
        phone: document.getElementById('supplierPhone')?.value?.trim(),
        email: document.getElementById('supplierEmail')?.value?.trim(),
        address: document.getElementById('supplierAddress')?.value?.trim(),
        notes: document.getElementById('supplierNotes')?.value?.trim(),
        status: document.getElementById('supplierStatus')?.value || 'active'
    };

    if (!payload.name) {
        showToast('Supplier name is required.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('supplierSaveBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const res = await fetch(id ? `/api/admin/suppliers/${id}` : '/api/admin/suppliers', {
            method: id ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess(id ? 'Supplier Updated' : 'Supplier Created', result.message || 'Saved.');
            closeSupplierModal();
            await loadSuppliers();
        } else {
            showToast(result.message || 'Failed to save supplier.', 'error');
        }
    } catch (err) {
        console.error('saveSupplier:', err);
        showToast('Server error while saving supplier.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function deleteSupplier(id) {
    showCustomConfirm('Delete Supplier', 'Are you sure you want to delete this supplier?', async () => {
        try {
            const res = await fetch(`/api/admin/suppliers/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                showAdminSuccess('Supplier Deleted', result.message || 'Supplier removed.');
                await loadSuppliers();
            } else {
                showToast(result.message || 'Failed to delete supplier.', 'error');
            }
        } catch (err) {
            console.error('deleteSupplier:', err);
            showToast('Failed to delete supplier.', 'error');
        }
    }, 'danger');
}

function setupSuppliersSection() {
    const refreshBtn = document.getElementById('suppliersRefreshBtn');
    const searchInput = document.getElementById('suppliersSearchInput');

    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', loadSuppliers);
    }

    if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = '1';
        let timer;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(loadSuppliers, 350);
        });
    }
}

document.addEventListener('DOMContentLoaded', setupSuppliersSection);

window.loadSuppliers = loadSuppliers;
window.loadSuppliersSection = loadSuppliers;
window.openAddSupplierModal = openAddSupplierModal;
window.openEditSupplierModal = openEditSupplierModal;
window.saveSupplier = saveSupplier;
window.deleteSupplier = deleteSupplier;
window.closeSupplierModal = closeSupplierModal;
