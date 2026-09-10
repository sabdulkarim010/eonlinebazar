/**
 * Project: EOnlineBazar — ERP Warehouses CRUD
 * File: js/admin/modules/erp-warehouses.js
 */
import '../admin-core.js';

function escapeCell(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function closeWarehouseModal() {
    const modal = document.getElementById('warehouseModal');
    if (modal) modal.style.display = 'none';
}

function resetWarehouseForm() {
    document.getElementById('warehouseEditId').value = '';
    document.getElementById('warehouseName').value = '';
    document.getElementById('warehouseLocation').value = '';
    document.getElementById('warehouseAddress').value = '';
    document.getElementById('warehouseManagerName').value = '';
    document.getElementById('warehousePhone').value = '';
    document.getElementById('warehouseIsDefault').checked = false;
    document.getElementById('warehouseStatus').value = 'active';
    const title = document.getElementById('warehouseModalTitle');
    if (title) title.innerHTML = '<i class="fa-solid fa-warehouse"></i> Add Warehouse';
}

async function loadWarehouses() {
    const tbody = document.getElementById('warehousesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="loading-container"><div class="spinner"></div><p>Loading warehouses…</p></td></tr>';

    try {
        const res = await fetch('/api/admin/warehouses?limit=100', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const rows = data.data || [];

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-status-empty">No warehouses configured.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((w) => `
            <tr${w.isDefault ? ' class="warehouse-default-row"' : ''}>
                <td><code>${escapeCell(w.code || '—')}</code></td>
                <td>
                    <strong>${escapeCell(w.name)}</strong>
                    ${w.isDefault ? ' <span class="status-badge status-verified" style="font-size:10px;margin-left:4px;">Default</span>' : ''}
                </td>
                <td>${escapeCell(w.location || '—')}</td>
                <td>${escapeCell(w.managerName || '—')}</td>
                <td>${w.isDefault ? '<i class="fa-solid fa-star" title="Default warehouse"></i>' : '—'}</td>
                <td><span class="status-badge ${w.status === 'active' ? 'status-verified' : 'status-pending'}">${escapeCell(w.status || 'active')}</span></td>
                <td>
                    <div class="catalog-actions">
                        <button type="button" class="catalog-action-btn edit" onclick="openEditWarehouseModal('${w._id}')" title="Edit">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        ${w.isDefault ? '' : `<button type="button" class="catalog-action-btn" onclick="setDefaultWarehouse('${w._id}')" title="Set as Default" style="color:#2563eb;">
                            <i class="fa-solid fa-star"></i>
                        </button>`}
                        <button type="button" class="catalog-action-btn delete" onclick="deleteWarehouse('${w._id}')" title="Delete"${w.isDefault ? ' disabled' : ''}>
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadWarehouses:', err);
        tbody.innerHTML = '<tr><td colspan="7" class="table-status-error">Failed to load warehouses.</td></tr>';
    }
}

async function openAddWarehouseModal() {
    resetWarehouseForm();
    const modal = document.getElementById('warehouseModal');
    if (modal) modal.style.display = 'flex';
}

async function openEditWarehouseModal(id) {
    try {
        const res = await fetch(`/api/admin/warehouses/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();
        if (!result.success || !result.data) {
            showToast(result.message || 'Warehouse not found.', 'error');
            return;
        }

        const w = result.data;
        document.getElementById('warehouseEditId').value = w._id;
        document.getElementById('warehouseName').value = w.name || '';
        document.getElementById('warehouseLocation').value = w.location || '';
        document.getElementById('warehouseAddress').value = w.address || '';
        document.getElementById('warehouseManagerName').value = w.managerName || '';
        document.getElementById('warehousePhone').value = w.phone || '';
        document.getElementById('warehouseIsDefault').checked = !!w.isDefault;
        document.getElementById('warehouseStatus').value = w.status || 'active';

        const title = document.getElementById('warehouseModalTitle');
        if (title) title.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Warehouse';

        const modal = document.getElementById('warehouseModal');
        if (modal) modal.style.display = 'flex';
    } catch (err) {
        console.error('openEditWarehouseModal:', err);
        showToast('Failed to load warehouse.', 'error');
    }
}

async function saveWarehouse() {
    const id = document.getElementById('warehouseEditId')?.value?.trim();
    const payload = {
        name: document.getElementById('warehouseName')?.value?.trim(),
        location: document.getElementById('warehouseLocation')?.value?.trim(),
        address: document.getElementById('warehouseAddress')?.value?.trim(),
        managerName: document.getElementById('warehouseManagerName')?.value?.trim(),
        phone: document.getElementById('warehousePhone')?.value?.trim(),
        isDefault: document.getElementById('warehouseIsDefault')?.checked || false,
        status: document.getElementById('warehouseStatus')?.value || 'active'
    };

    if (!payload.name) {
        showToast('Warehouse name is required.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('warehouseSaveBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const res = await fetch(id ? `/api/admin/warehouses/${id}` : '/api/admin/warehouses', {
            method: id ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            showAdminSuccess(id ? 'Warehouse Updated' : 'Warehouse Created', result.message || 'Saved.');
            closeWarehouseModal();
            await loadWarehouses();
        } else {
            showToast(result.message || 'Failed to save warehouse.', 'error');
        }
    } catch (err) {
        console.error('saveWarehouse:', err);
        showToast('Server error while saving warehouse.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function deleteWarehouse(id) {
    showCustomConfirm('Delete Warehouse', 'Are you sure you want to delete this warehouse?', async () => {
        try {
            const res = await fetch(`/api/admin/warehouses/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                showAdminSuccess('Warehouse Deleted', result.message || 'Warehouse removed.');
                await loadWarehouses();
            } else {
                showToast(result.message || 'Failed to delete warehouse.', 'error');
            }
        } catch (err) {
            console.error('deleteWarehouse:', err);
            showToast('Failed to delete warehouse.', 'error');
        }
    }, 'danger');
}

async function setDefaultWarehouse(id) {
    try {
        const res = await fetch(`/api/admin/warehouses/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ isDefault: true })
        });
        const result = await res.json();
        if (result.success) {
            showAdminSuccess('Default Updated', result.message || 'Default warehouse updated.');
            await loadWarehouses();
        } else {
            showToast(result.message || 'Failed to set default warehouse.', 'error');
        }
    } catch (err) {
        console.error('setDefaultWarehouse:', err);
        showToast('Failed to set default warehouse.', 'error');
    }
}

function setupWarehousesSection() {
    const refreshBtn = document.getElementById('warehousesRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', loadWarehouses);
    }
}

document.addEventListener('DOMContentLoaded', setupWarehousesSection);

window.loadWarehouses = loadWarehouses;
window.loadWarehousesSection = loadWarehouses;
window.openAddWarehouseModal = openAddWarehouseModal;
window.openEditWarehouseModal = openEditWarehouseModal;
window.saveWarehouse = saveWarehouse;
window.deleteWarehouse = deleteWarehouse;
window.setDefaultWarehouse = setDefaultWarehouse;
window.closeWarehouseModal = closeWarehouseModal;
