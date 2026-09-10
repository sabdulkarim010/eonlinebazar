/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/settings-staff-audit.js
 * Description: Staff activity audit dashboard — grouped SecurityLog by admin actor.
 */
import '../admin-core.js';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function renderResourceBreakdown(breakdown = {}) {
    const entries = Object.entries(breakdown).filter(([, count]) => count > 0);
    if (!entries.length) return '<span class="order-expanded-muted">—</span>';
    return entries.map(([type, count]) =>
        `<span class="status-badge status-pending staff-audit-resource-tag">${escapeHtml(type)}: ${count}</span>`
    ).join(' ');
}

async function fetchStaffAuditSummary(page, limit) {
    initAdminPaginationInstances();
    const pg = window.staffAuditPg;
    const effectivePage = page ?? pg?.currentPage ?? 1;
    const effectiveLimit = limit ?? pg?.currentLimit ?? 25;
    const body = document.getElementById('staffAuditBody');
    if (!body) return;

    body.innerHTML = '<tr><td colspan="5" class="loading-container"><div class="spinner"></div><p>Loading staff activity...</p></td></tr>';

    try {
        const params = new URLSearchParams({
            page: String(effectivePage),
            limit: String(effectiveLimit)
        });
        const response = await fetch(`/api/admin/staff-audit?${params}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        const rows = data.success ? data.data : [];
        const total = data.pagination?.total ?? rows.length;

        if (pg) {
            pg.currentPage = effectivePage;
            pg.currentLimit = effectiveLimit;
            pg.setTotal(total);
        }

        const totalEl = document.getElementById('staff-audit-total-count');
        if (totalEl) totalEl.textContent = String(total);

        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="5" class="loading-cell">No admin activity recorded yet.</td></tr>';
            return;
        }

        body.innerHTML = rows.map((row) => `
            <tr>
                <td><strong>${escapeHtml(row.username)}</strong></td>
                <td>${Number(row.totalActions) || 0}</td>
                <td>${formatDateTime(row.lastActivityAt)}</td>
                <td class="staff-audit-breakdown-cell">${renderResourceBreakdown(row.resourceBreakdown)}</td>
                <td>
                    <button type="button" class="btn-secondary btn-sm staff-audit-detail-btn" data-username="${escapeHtml(row.username)}">
                        View Log
                    </button>
                </td>
            </tr>
        `).join('');

        body.querySelectorAll('.staff-audit-detail-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                viewStaffAuditDetail(btn.getAttribute('data-username'));
            });
        });
    } catch (error) {
        console.error('Staff audit fetch error:', error);
        body.innerHTML = '<tr><td colspan="5" class="table-status-error">Failed to load staff activity.</td></tr>';
    }
}
window.fetchStaffAuditSummary = fetchStaffAuditSummary;

async function viewStaffAuditDetail(username) {
    const panel = document.getElementById('staffAuditDetailPanel');
    const title = document.getElementById('staffAuditDetailTitle');
    const subtitle = document.getElementById('staffAuditDetailSubtitle');
    const body = document.getElementById('staffAuditDetailBody');
    if (!panel || !body) return;

    panel.style.display = 'block';
    if (title) title.textContent = `Activity: ${username}`;
    if (subtitle) subtitle.textContent = 'Recent actions logged for this admin account.';
    body.innerHTML = '<tr><td colspan="5" class="loading-container"><div class="spinner"></div></td></tr>';

    try {
        const response = await fetch(`/api/admin/staff-audit/${encodeURIComponent(username)}?limit=50`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        const logs = data.success ? data.data : [];

        if (!logs.length) {
            body.innerHTML = '<tr><td colspan="5" class="loading-cell">No log entries for this user.</td></tr>';
            return;
        }

        body.innerHTML = logs.map((log) => {
            const resource = log.resourceType
                ? `${log.resourceType}${log.resourceId ? ` #${String(log.resourceId).slice(-6)}` : ''}`
                : '—';
            return `
                <tr>
                    <td>${formatDateTime(log.timestamp || log.createdAt)}</td>
                    <td><span class="status-badge status-pending">${escapeHtml(log.action || '—')}</span></td>
                    <td>${escapeHtml(resource)}</td>
                    <td>${escapeHtml(log.ipAddress || 'Unknown')}</td>
                    <td>${escapeHtml(log.details || '—')}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Staff audit detail error:', error);
        body.innerHTML = '<tr><td colspan="5" class="table-status-error">Failed to load detail log.</td></tr>';
    }
}
window.viewStaffAuditDetail = viewStaffAuditDetail;

function closeStaffAuditDetail() {
    const panel = document.getElementById('staffAuditDetailPanel');
    if (panel) panel.style.display = 'none';
}
window.closeStaffAuditDetail = closeStaffAuditDetail;
