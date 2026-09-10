/**
 * Project: EOnlineBazar — ERP Warehouses list
 * File: js/admin/modules/erp-warehouses.js
 */
import '../admin-core.js';

function escapeCell(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

async function loadWarehousesSection() {
    const tbody = document.getElementById('warehousesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="loading-container"><div class="spinner"></div><p>Loading warehouses…</p></td></tr>';

    try {
        const res = await fetch('/api/admin/warehouses', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const rows = data.data || [];

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-status-empty">No warehouses configured.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((w) => `
            <tr>
                <td><code>${escapeCell(w.code || '—')}</code></td>
                <td><strong>${escapeCell(w.name)}</strong></td>
                <td>${escapeCell(w.address || '—')}</td>
                <td>${w.isDefault ? '<i class="fa-solid fa-star" title="Default"></i>' : '—'}</td>
                <td><span class="status-badge ${w.status === 'active' ? 'status-verified' : 'status-pending'}">${escapeCell(w.status || 'active')}</span></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadWarehousesSection:', err);
        tbody.innerHTML = '<tr><td colspan="5" class="table-status-error">Failed to load warehouses.</td></tr>';
    }
}

function setupWarehousesSection() {
    const refreshBtn = document.getElementById('warehousesRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', loadWarehousesSection);
    }
}

document.addEventListener('DOMContentLoaded', setupWarehousesSection);

window.loadWarehousesSection = loadWarehousesSection;
