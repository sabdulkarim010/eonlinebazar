/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/crm-abandoned.js
 * Description: CRM → Abandoned Cart Recovery stats dashboard.
 * Reads GET /api/admin/crm/abandoned-carts and renders the KPI cards.
 */
import '../admin-core.js';

function formatBdt(value) {
    const n = Number(value) || 0;
    return `৳${n.toLocaleString('en-US')}`;
}

async function loadAbandonedCartStats() {
    const countEl = document.getElementById('abandonedCartCount');
    const valueEl = document.getElementById('abandonedCartValue');
    const rateEl = document.getElementById('abandonedCartRecoveryRate');
    const notifiedEl = document.getElementById('abandonedCartNotified');
    const recoveredEl = document.getElementById('abandonedCartRecovered');

    if (!countEl) return;

    countEl.textContent = '…';
    if (valueEl) valueEl.textContent = '…';
    if (rateEl) rateEl.textContent = '…';

    try {
        const res = await fetch('/api/admin/crm/abandoned-carts', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();

        if (!result.success) {
            throw new Error(result.message || 'Failed to load stats');
        }

        const data = result.data || {};
        countEl.textContent = Number(data.count || 0).toLocaleString('en-US');
        if (valueEl) valueEl.textContent = formatBdt(data.value);
        if (rateEl) rateEl.textContent = `${Number(data.recoveryRate || 0)}%`;
        if (notifiedEl) notifiedEl.textContent = Number(data.notified || 0).toLocaleString('en-US');
        if (recoveredEl) recoveredEl.textContent = Number(data.recovered || 0).toLocaleString('en-US');
    } catch (err) {
        console.error('Abandoned cart stats error:', err);
        countEl.textContent = '—';
        if (valueEl) valueEl.textContent = '—';
        if (rateEl) rateEl.textContent = '—';
        if (typeof showToast === 'function') {
            showToast('Failed to load abandoned cart stats.', 'error');
        }
    }
}

window.loadAbandonedCartStats = loadAbandonedCartStats;

document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('abandonedCartRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', loadAbandonedCartStats);
    }
});
