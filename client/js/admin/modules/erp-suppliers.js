/**
 * Project: EOnlineBazar — ERP Suppliers list
 * File: js/admin/modules/erp-suppliers.js
 */
import '../admin-core.js';

function escapeCell(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

async function loadSuppliersSection() {
    const tbody = document.getElementById('suppliersTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="loading-container"><div class="spinner"></div><p>Loading suppliers…</p></td></tr>';

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
            tbody.innerHTML = '<tr><td colspan="5" class="table-status-empty">No suppliers found.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((s) => `
            <tr>
                <td><strong>${escapeCell(s.name)}</strong></td>
                <td>${escapeCell(s.contactPerson || '—')}</td>
                <td>${escapeCell(s.phone || '—')}</td>
                <td>${escapeCell(s.email || '—')}</td>
                <td><span class="status-badge ${s.status === 'active' ? 'status-verified' : 'status-pending'}">${escapeCell(s.status || 'active')}</span></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadSuppliersSection:', err);
        tbody.innerHTML = '<tr><td colspan="5" class="table-status-error">Failed to load suppliers.</td></tr>';
    }
}

function setupSuppliersSection() {
    const refreshBtn = document.getElementById('suppliersRefreshBtn');
    const searchInput = document.getElementById('suppliersSearchInput');

    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', loadSuppliersSection);
    }

    if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = '1';
        let timer;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(loadSuppliersSection, 350);
        });
    }
}

document.addEventListener('DOMContentLoaded', setupSuppliersSection);

window.loadSuppliersSection = loadSuppliersSection;
