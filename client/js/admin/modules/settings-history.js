/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/settings-history.js
 * Description: Settings change history table (Security tab).
 */
import '../admin-core.js';
import { settingsFetchJson, isSettingsFetchFailure } from './settings-utils.js';

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatHistoryTimestamp(ts) {
    if (!ts) return '—';
    try {
        return new Date(ts).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return '—';
    }
}

function actionBadgeClass(action) {
    const lower = String(action || '').toLowerCase();
    if (lower.includes('fail') || lower.includes('delete') || lower.includes('removed')) return 'stock-out';
    if (lower.includes('created') || lower.includes('added') || lower.includes('restored')) return 'status-verified';
    return 'stock-low';
}

async function loadSettingsHistory() {
    const body = document.getElementById('settingsHistoryBody');
    if (!body) return;

    body.innerHTML = `<tr><td colspan="4" class="loading-container"><div class="spinner"></div><p>Loading settings history…</p></td></tr>`;

    try {
        const fetchResponse = await settingsFetchJson('/api/admin/settings-history?limit=50', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        }, { showToast: false });

        if (isSettingsFetchFailure(fetchResponse)) {
            body.innerHTML = `<tr><td colspan="4" class="table-status-error">${escapeHtml(fetchResponse.error || 'Could not load settings history.')}</td></tr>`;
            return;
        }

        const payload = fetchResponse.data;
        const rows = payload?.success ? payload.data : [];

        const countEl = document.getElementById('settingsHistoryCount');
        if (countEl) {
            countEl.textContent = String(payload?.pagination?.total ?? rows.length);
        }

        if (!rows.length) {
            body.innerHTML = `<tr><td colspan="4" class="loading-cell">No recent settings changes recorded.</td></tr>`;
            return;
        }

        body.innerHTML = rows.map((row) => {
            const action = row.action || '—';
            const actor = row.actor || '—';
            const summary = row.details || '—';
            const ts = row.timestamp || row.createdAt;

            return `
                <tr>
                    <td class="settings-history-date">${formatHistoryTimestamp(ts)}</td>
                    <td><span class="actor-badge ${escapeHtml(row.actorType || 'admin')}">${escapeHtml(actor)}</span></td>
                    <td><span class="status-badge ${actionBadgeClass(action)}">${escapeHtml(action)}</span></td>
                    <td class="settings-history-summary">${escapeHtml(summary)}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Settings history fetch error:', err);
        body.innerHTML = `<tr><td colspan="4" class="table-status-error">Could not load settings history.</td></tr>`;
    }
}

function bindSettingsHistoryControls() {
    const refreshBtn = document.getElementById('settingsHistoryRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', () => loadSettingsHistory());
    }
}

function initSettingsHistory() {
    bindSettingsHistoryControls();
}

initSettingsHistory();

window.loadSettingsHistory = loadSettingsHistory;
