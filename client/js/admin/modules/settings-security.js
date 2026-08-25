/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/settings-security.js
 * Description: Security logs and fortified sessions/audit/blacklist suite.
 */
import '../admin-core.js';
const COURIER_PROVIDER_LABELS = window.COURIER_PROVIDER_LABELS;

/* ==========================================================================
   SECTION 12: SECURITY LOGS (অ্যাডমিন প্যানেল অ্যাক্টিভিটি এবং লগ ট্র্যাকিং)
   ========================================================================== */

/**
 * ১২.১: সার্ভার থেকে অ্যাডমিন ও সিস্টেমের সিকিউরিটি লগস নিয়ে আসা
 */
async function fetchSecurityLogs(page, limit) {
    initAdminPaginationInstances();
    const pg = securityPg;
    const effectivePage = page ?? pg?.currentPage ?? 1;
    const effectiveLimit = limit ?? pg?.currentLimit ?? 25;

    const logsBody = document.getElementById('securityLogsBody');
    if (!logsBody) return;

    logsBody.innerHTML = `<tr><td colspan="6" class="loading-container"><div class="spinner"></div><p>Fetching security logs...</p></td></tr>`;

    try {
        const params = new URLSearchParams({
            page: String(effectivePage),
            limit: String(effectiveLimit)
        });
        const response = await fetch(`/api/admin/logs?${params}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        const logs = data.success ? data.data : [];
        const total = data.pagination?.total ?? logs.length;

        if (pg) {
            pg.currentPage = effectivePage;
            pg.currentLimit = effectiveLimit;
            pg.setTotal(total);
        }

        const countEl = document.getElementById('securityLogCount');
        if (countEl) countEl.textContent = total;

        if (logs.length === 0) {
            logsBody.innerHTML = `<tr><td colspan="6" class="loading-cell">No security logs recorded yet.</td></tr>`;
            return;
        }

        let logsHTML = '';
        logs.forEach(log => {
            let actionClass = 'status-pending';
            const actionLower = (log.action || '').toLowerCase();
            if (actionLower.includes('fail') || actionLower.includes('block') || actionLower.includes('delete')) actionClass = 'stock-out';
            else if (actionLower.includes('success') || actionLower.includes('login success') || actionLower.includes('activated')) actionClass = 'status-verified';
            else if (actionLower.includes('update') || actionLower.includes('edit') || actionLower.includes('suspend')) actionClass = 'stock-low';

            const actorType = log.actorType || 'system';
            const ts = log.timestamp || log.createdAt;

            logsHTML += `
                <tr>
                    <td><b>#${log._id ? String(log._id).slice(-6).toUpperCase() : 'SYS'}</b></td>
                    <td>${ts ? new Date(ts).toLocaleString('en-GB') : '—'}</td>
                    <td><span class="status-badge ${actionClass}">${log.action || '—'}</span></td>
                    <td><span class="actor-badge ${actorType}">${actorType}</span> ${log.actor || '—'}</td>
                    <td>${log.ipAddress || 'Unknown'}</td>
                    <td>${log.details || '—'}</td>
                </tr>
            `;
        });
        logsBody.innerHTML = logsHTML;
    } catch (error) {
        console.error("Logs Fetch Error:", error);
        logsBody.innerHTML = `<tr><td colspan="6" class="table-status-error">Server connection failed.</td></tr>`;
    }
}
window.fetchSecurityLogs = fetchSecurityLogs;

/* ==========================================================================
   SECTION 12B: FORTIFIED ADMIN SECURITY SUITE
   Active Sessions · Login History · IP Blacklist Manager
   ========================================================================== */

const SEC_AUTH_HEADERS = () => ({ 'Authorization': `Bearer ${token}` });

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function timeAgo(dateStr) {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    return `${Math.floor(hrs / 24)} day(s) ago`;
}

function formatDuration(ms) {
    if (ms == null) return 'Permanent';
    if (ms <= 0) return 'Expired';
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
    return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

function deviceIcon(deviceType = '') {
    const t = deviceType.toLowerCase();
    if (t.includes('mobile') || t.includes('phone')) return 'fa-mobile-screen';
    if (t.includes('tablet')) return 'fa-tablet-screen-button';
    return 'fa-laptop';
}

/* ---------- 12B.1 Active Devices & Sessions ---------- */
function isCurrentSession(session) {
    return !!(session.isCurrentSession || session.isCurrent || session.current);
}

function updateSessionsUI(sessions) {
    const otherSessions = sessions.filter(s => !isCurrentSession(s));

    const logoutAllBtn = document.getElementById('admin-logout-all-btn');
    if (logoutAllBtn) {
        logoutAllBtn.style.display = otherSessions.length > 0 ? 'inline-flex' : 'none';
    }

    renderSessionCards(sessions);
}

function renderSessionCards(sessions) {
    const container = document.getElementById('adminSessionsGrid');
    if (!container) return;

    if (sessions.length === 0) {
        container.innerHTML = `<div class="empty-state">No active sessions found.</div>`;
        return;
    }

    container.innerHTML = sessions.map(session => {
        const isCurrent = isCurrentSession(session);
        const sessionId = session._id || session.sessionId;
        return `
            <div class="session-card ${isCurrent ? 'current-device' : ''}">
                <div class="session-icon"><i class="fa-solid ${deviceIcon(session.deviceType)}"></i></div>
                <div class="session-info">
                    <div class="session-device">
                        ${escapeHtml(session.os || session.deviceType || 'Unknown Device')} · ${escapeHtml(session.browser || 'Browser')}
                        ${isCurrent ? '<span class="current-badge">THIS DEVICE</span>' : ''}
                    </div>
                    <div class="session-details">
                        <i class="fa-solid fa-location-dot"></i> ${escapeHtml(session.location || session.country || 'Unknown')} &nbsp;
                        <i class="fa-solid fa-network-wired"></i> ${escapeHtml(session.ip || '—')} &nbsp;
                        <i class="fa-solid fa-clock"></i> ${isCurrent ? 'Active Just Now' : `Active ${timeAgo(session.lastActive || session.createdAt)}`}
                    </div>
                </div>
                <div class="session-actions">
                    ${!isCurrent ? `<button type="button" class="btn-revoke-session" onclick="revokeSession('${sessionId}')">Revoke Access</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function fetchAdminSessions() {
    const grid = document.getElementById('adminSessionsGrid');
    if (!grid) return;
    grid.innerHTML = `<div class="loading-container"><div class="spinner"></div><p>Loading active sessions...</p></div>`;

    try {
        const res = await fetch('/api/admin/sessions', { headers: SEC_AUTH_HEADERS() });
        const data = await res.json();
        const sessions = data.success ? data.sessions : [];

        const countEl = document.getElementById('activeSessionCount');
        if (countEl) countEl.textContent = sessions.length;

        const current = sessions.find(s => isCurrentSession(s));
        const thisEl = document.getElementById('thisDeviceLabel');
        if (thisEl) thisEl.textContent = current ? `${current.os} · ${current.location}` : 'Unknown';

        updateSessionsUI(sessions);
    } catch (err) {
        console.error('Sessions fetch error:', err);
        grid.innerHTML = `<div class="empty-state error">Failed to load sessions.</div>`;
        const logoutAllBtn = document.getElementById('admin-logout-all-btn');
        if (logoutAllBtn) logoutAllBtn.style.display = 'none';
    }
}
window.fetchAdminSessions = fetchAdminSessions;

function revokeSession(sessionId) {
    logoutAdminSession(sessionId, false);
}
window.revokeSession = revokeSession;

async function logoutAdminSession(sessionId, isCurrent) {
    const confirmMsg = isCurrent
        ? 'Log out this device? You will be returned to the login screen.'
        : 'Log out this device remotely?';

    const proceed = window.Swal
        ? (await Swal.fire({ title: 'Terminate session?', text: confirmMsg, icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes, log out', confirmButtonColor: '#ef4444' })).isConfirmed
        : window.confirm(confirmMsg);
    if (!proceed) return;

    try {
        const res = await fetch(`/api/admin/sessions/logout/${encodeURIComponent(sessionId)}`, {
            method: 'POST', headers: SEC_AUTH_HEADERS()
        });
        const data = await res.json();
        if (!data.success) return showToast(data.message || 'Failed.', 'error');

        if (data.loggedOutCurrent) {
            window.location.replace('/admin/logout');
            return;
        }
        if (typeof showToast === 'function') showToast(data.message, 'success');
        fetchAdminSessions();
    } catch (err) {
        console.error('Logout session error:', err);
        if (typeof showToast === 'function') showToast('Server error.', 'error');
    }
}
window.logoutAdminSession = logoutAdminSession;

async function logoutOtherAdminSessions() {
    const proceed = window.Swal
        ? (await Swal.fire({ title: 'Log out all other devices?', text: 'This keeps you signed in here but revokes every other session.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes, log out others', confirmButtonColor: '#ef4444' })).isConfirmed
        : window.confirm('Log out all other devices?');
    if (!proceed) return;

    try {
        const res = await fetch('/api/admin/sessions/logout-others', { method: 'POST', headers: SEC_AUTH_HEADERS() });
        const data = await res.json();
        if (typeof showToast === 'function') showToast(data.message || 'Done.', data.success ? 'success' : 'error');
        fetchAdminSessions();
    } catch (err) {
        console.error('Logout others error:', err);
        if (typeof showToast === 'function') showToast('Server error.', 'error');
    }
}
window.logoutOtherAdminSessions = logoutOtherAdminSessions;

/* ---------- 12B.2 Security & Audit tabs ---------- */

/* shared state: _auditActiveTab lives on window (admin-core) */

function initAuditView() {
    setupAuditTabs();
    initAdminPaginationInstances();
    fetchRateLimitSettings();
    bindRateLimitSettingsForm();
    refreshAuditActiveTab();
}
window.initAuditView = initAuditView;

function updateRateLimitSettingsPreview(data = {}) {
    const previewEl = document.getElementById('rateLimitSettingsPreviewText');
    if (!previewEl) return;

    const enabled = data.rateLimitEnabled !== false;
    const max = Number(data.rateLimitMaxRequests) || 1000;
    const windowMinutes = Math.round((Number(data.rateLimitWindowMs) || 900000) / 60000);
    const bypass = data.bypassAdminAndLocalhost !== false;

    if (!enabled) {
        previewEl.textContent = 'Rate limiter is OFF — general API throttling disabled.';
        return;
    }

    previewEl.textContent =
        `${max} requests per ${windowMinutes} minute(s)` +
        (bypass ? ' · Admins & localhost bypass enabled' : ' · No bypass rules active');
}

function applyRateLimitSettingsToUI(data = {}) {
    const enabledEl = document.getElementById('rateLimitEnabled');
    const maxEl = document.getElementById('rateLimitMaxRequests');
    const bypassEl = document.getElementById('rateLimitBypassAdmin');

    if (enabledEl) enabledEl.checked = data.rateLimitEnabled !== false;
    if (maxEl && data.rateLimitMaxRequests != null) maxEl.value = data.rateLimitMaxRequests;
    if (bypassEl) bypassEl.checked = data.bypassAdminAndLocalhost !== false;

    updateRateLimitSettingsPreview(data);
}

async function fetchRateLimitSettings() {
    try {
        const res = await fetch('/api/admin/rate-limit-settings', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (res.status === 429) {
            showToast('Rate limited — could not load rate limit settings. Try again shortly.', 'warning');
            return;
        }

        const data = await res.json();
        if (data.success && data.data) {
            applyRateLimitSettingsToUI(data.data);
        } else if (handleAdminApiAuthResponse(res, data) === 'auth_failed') {
            return;
        }
    } catch (err) {
        console.error('Failed to load rate limit settings:', err);
    }
}
window.fetchRateLimitSettings = fetchRateLimitSettings;

function bindRateLimitSettingsForm() {
    const form = document.getElementById('form-rate-limit-settings');
    if (!form || form._rateLimitBound) return;
    form._rateLimitBound = true;

    ['rateLimitEnabled', 'rateLimitMaxRequests', 'rateLimitBypassAdmin'].forEach((id) => {
        document.getElementById(id)?.addEventListener('change', () => {
            updateRateLimitSettingsPreview({
                rateLimitEnabled: document.getElementById('rateLimitEnabled')?.checked,
                rateLimitMaxRequests: Number(document.getElementById('rateLimitMaxRequests')?.value || 1000),
                rateLimitWindowMs: 900000,
                bypassAdminAndLocalhost: document.getElementById('rateLimitBypassAdmin')?.checked
            });
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = form.querySelector('.system-settings-save-btn');
        const restore = setButtonLoading(submitBtn, 'Saving...');

        const payload = {
            rateLimitEnabled: document.getElementById('rateLimitEnabled')?.checked !== false,
            rateLimitMaxRequests: Number(document.getElementById('rateLimitMaxRequests')?.value || 1000),
            rateLimitWindowMs: 900000,
            bypassAdminAndLocalhost: document.getElementById('rateLimitBypassAdmin')?.checked !== false
        };

        try {
            const res = await fetch('/api/admin/rate-limit-settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const result = await res.json();

            if (res.status === 429) {
                showToast('Rate limited — please wait and try again.', 'warning');
                return;
            }

            if (result.success) {
                showToast(result.message || 'Rate limiting settings saved.', 'success');
                if (result.data) applyRateLimitSettingsToUI(result.data);
            } else if (handleAdminApiAuthResponse(res, result) === 'auth_failed') {
                return;
            } else {
                showToast(`Error: ${result.message || 'Failed to save rate limit settings.'}`, 'error');
            }
        } catch (err) {
            console.error('Rate limit settings save error:', err);
            showToast('Error: Could not save rate limit settings.', 'error');
        } finally {
            restore();
        }
    });
}

function setupAuditTabs() {
    const tabs = document.querySelectorAll('.audit-tab');
    tabs.forEach(tab => {
        if (tab._bound) return;
        tab._bound = true;
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-audit-tab');
            _auditActiveTab = target;
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            document.querySelectorAll('.audit-panel').forEach(p => {
                p.style.display = (p.id === target) ? 'block' : 'none';
            });
            refreshAuditActiveTab();
        });
    });
}

function refreshAuditActiveTab() {
    if (_auditActiveTab === 'tab-blacklist') fetchBlacklist();
    else fetchAuditLogs();
}
window.refreshAuditActiveTab = refreshAuditActiveTab;

async function fetchAuditLogs(page, limit) {
    initAdminPaginationInstances();
    const pg = auditPg;
    const effectivePage = page ?? pg?.currentPage ?? 1;
    const effectiveLimit = limit ?? pg?.currentLimit ?? 25;

    const body = document.getElementById('loginHistoryBody');
    if (!body) return;
    body.innerHTML = `<tr><td colspan="6" class="loading-container"><div class="spinner"></div><p>Loading login history...</p></td></tr>`;

    try {
        const params = new URLSearchParams({
            page: String(effectivePage),
            limit: String(effectiveLimit)
        });
        const res = await fetch(`/api/admin/login-history?${params}`, { headers: SEC_AUTH_HEADERS() });
        const data = await res.json();
        const rows = data.success ? data.data : [];
        const summary = data.summary || {};
        const total = data.pagination?.total ?? data.total ?? rows.length;

        if (pg) {
            pg.currentPage = effectivePage;
            pg.currentLimit = effectiveLimit;
            pg.setTotal(total);
        }

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '—'; };
        set('auditSuccessCount', summary.success);
        set('auditFailedCount', summary.failed);
        set('auditBlockedCount', summary.blocked);

        if (rows.length === 0) {
            body.innerHTML = `<tr><td colspan="6" class="loading-cell">No login activity recorded yet.</td></tr>`;
            return;
        }

        const statusBadge = (s) => {
            const map = {
                success: ['status-verified', 'Success'],
                failed: ['stock-out', 'Failed'],
                otp_failed: ['stock-out', 'OTP Failed'],
                otp_sent: ['stock-low', 'OTP Sent'],
                blocked: ['stock-out', 'Blocked']
            };
            const [cls, label] = map[s] || ['status-pending', s];
            return `<span class="status-badge ${cls}">${label}</span>`;
        };

        body.innerHTML = rows.map(r => `
            <tr>
                <td>${r.timestamp ? new Date(r.timestamp).toLocaleString('en-GB') : '—'}</td>
                <td>${escapeHtml(r.username)}</td>
                <td>${escapeHtml(r.ip)}</td>
                <td>${escapeHtml(r.location)}</td>
                <td>${escapeHtml(r.os)} · ${escapeHtml(r.browser)}</td>
                <td>${statusBadge(r.status)}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Login history error:', err);
        body.innerHTML = `<tr><td colspan="6" class="table-status-error">Server connection failed.</td></tr>`;
    }
}
window.fetchAuditLogs = fetchAuditLogs;
window.fetchLoginHistory = fetchAuditLogs;

async function fetchBlacklist() {
    const body = document.getElementById('blacklistBody');
    if (!body) return;
    body.innerHTML = `<tr><td colspan="6" class="loading-container"><div class="spinner"></div><p>Loading blacklist...</p></td></tr>`;

    try {
        const res = await fetch('/api/admin/blacklist', { headers: SEC_AUTH_HEADERS() });
        const data = await res.json();
        const rows = data.success ? data.data : [];

        if (rows.length === 0) {
            body.innerHTML = `<tr><td colspan="6" class="loading-cell">No blocked IP addresses. Your firewall is clear.</td></tr>`;
            return;
        }

        body.innerHTML = rows.map(b => `
            <tr class="${b.active ? '' : 'row-muted'}">
                <td><b>${escapeHtml(b.ip)}</b></td>
                <td>${escapeHtml(b.reason)}</td>
                <td><span class="actor-badge ${b.source === 'auto' ? 'system' : 'admin'}">${b.source === 'auto' ? 'Auto (IDS)' : 'Manual'}</span></td>
                <td>${b.blockedAt ? new Date(b.blockedAt).toLocaleString('en-GB') : '—'}</td>
                <td>${b.permanent ? '<span class="status-badge stock-out">Permanent</span>' : formatDuration(b.expiresInMs)}</td>
                <td>
                    <button class="btn-unblock" onclick="removeBlacklist('${b.id}', '${escapeHtml(b.ip)}')">
                        <i class="fa-solid fa-unlock"></i> Unblock
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Blacklist fetch error:', err);
        body.innerHTML = `<tr><td colspan="6" class="table-status-error">Server connection failed.</td></tr>`;
    }
}
window.fetchBlacklist = fetchBlacklist;

async function submitBlacklist(e) {
    e.preventDefault();
    const ip = document.getElementById('blIpInput').value.trim();
    const reason = document.getElementById('blReasonInput').value.trim();
    const hours = document.getElementById('blDurationInput').value;
    if (!ip) return showToast('Please enter an IP address.', 'error');

    try {
        const res = await fetch('/api/admin/blacklist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...SEC_AUTH_HEADERS() },
            body: JSON.stringify({ ip, reason, hours })
        });
        const data = await res.json();
        if (typeof showToast === 'function') showToast(data.message || (data.success ? 'IP blocked.' : 'Failed.'), data.success ? 'success' : 'error');
        if (data.success) {
            document.getElementById('blacklistAddForm').reset();
            fetchBlacklist();
        }
    } catch (err) {
        console.error('Add blacklist error:', err);
        if (typeof showToast === 'function') showToast('Server error.', 'error');
    }
}

async function removeBlacklist(id, ip) {
    const proceed = window.Swal
        ? (await Swal.fire({ title: `Unblock ${ip}?`, text: 'This IP will be able to reach the admin login again.', icon: 'question', showCancelButton: true, confirmButtonText: 'Yes, unblock' })).isConfirmed
        : window.confirm(`Unblock ${ip}?`);
    if (!proceed) return;

    try {
        const res = await fetch(`/api/admin/blacklist/${encodeURIComponent(id)}`, { method: 'DELETE', headers: SEC_AUTH_HEADERS() });
        const data = await res.json();
        if (typeof showToast === 'function') showToast(data.message || 'Done.', data.success ? 'success' : 'error');
        fetchBlacklist();
    } catch (err) {
        console.error('Remove blacklist error:', err);
        if (typeof showToast === 'function') showToast('Server error.', 'error');
    }
}
window.removeBlacklist = removeBlacklist;

// Bind the manual-blacklist form once the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const blForm = document.getElementById('blacklistAddForm');
    if (blForm) blForm.addEventListener('submit', submitBlacklist);
});

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    fetchSecurityLogs,
    escapeHtml,
    timeAgo,
    formatDuration,
    deviceIcon,
    isCurrentSession,
    updateSessionsUI,
    renderSessionCards,
    fetchAdminSessions,
    revokeSession,
    logoutAdminSession,
    logoutOtherAdminSessions,
    initAuditView,
    updateRateLimitSettingsPreview,
    applyRateLimitSettingsToUI,
    fetchRateLimitSettings,
    bindRateLimitSettingsForm,
    setupAuditTabs,
    refreshAuditActiveTab,
    fetchAuditLogs,
    fetchBlacklist,
    submitBlacklist,
    removeBlacklist
});
