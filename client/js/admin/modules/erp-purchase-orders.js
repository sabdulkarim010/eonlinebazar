/**
 * Project: EOnlineBazar — ERP Purchase Orders list
 * File: js/admin/modules/erp-purchase-orders.js
 */
import '../admin-core.js';

function escapeCell(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function formatMoney(n) {
    return typeof formatAdminPrice === 'function' ? formatAdminPrice(n) : `৳ ${Number(n || 0).toLocaleString()}`;
}

async function loadPurchaseOrdersSection() {
    const tbody = document.getElementById('purchaseOrdersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="loading-container"><div class="spinner"></div><p>Loading purchase orders…</p></td></tr>';

    try {
        const res = await fetch('/api/admin/purchase-orders?limit=50', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const rows = data.data || [];

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-status-empty">No purchase orders yet.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((po) => {
            const supplierName = po.supplierId?.name || '—';
            const warehouseName = po.warehouseId?.name || '—';
            const expected = po.expectedDate
                ? new Date(po.expectedDate).toLocaleDateString('en-GB')
                : '—';
            return `
            <tr>
                <td><strong>${escapeCell(po.poNumber || po._id)}</strong></td>
                <td>${escapeCell(supplierName)}</td>
                <td>${escapeCell(warehouseName)}</td>
                <td><span class="status-badge status-pending">${escapeCell(po.status)}</span></td>
                <td>${formatMoney(po.totalCost)}</td>
                <td>${expected}</td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error('loadPurchaseOrdersSection:', err);
        tbody.innerHTML = '<tr><td colspan="6" class="table-status-error">Failed to load purchase orders.</td></tr>';
    }
}

function setupPurchaseOrdersSection() {
    const refreshBtn = document.getElementById('purchaseOrdersRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', loadPurchaseOrdersSection);
    }
}

document.addEventListener('DOMContentLoaded', setupPurchaseOrdersSection);

window.loadPurchaseOrdersSection = loadPurchaseOrdersSection;
