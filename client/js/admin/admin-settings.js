/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/admin-settings.js
 * Description: Store settings, payment/courier config, CMS, security suite, and 2FA.
 */

import './admin-core.js';

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

/* ==========================================================================
   SECTION 13: ADMIN SETTINGS & SYSTEM INITIALIZATION (সেটিংস ও সিস্টেম বুট)
   ========================================================================== */

/**
 * ১৩.১ক: অ্যাডমিন সেটিংস লোড ও UI-তে প্রয়োগ
 */
function applyAdminSettingsToUI(settings) {
    if (!settings) return;

    adminPlatformTimezone = settings.timezone || 'Asia/Dhaka';
    adminCurrencySymbol = settings.currencySymbol || '৳';

    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== null) el.value = val; };
    setVal('settingsDisplayName', settings.displayName);
    setVal('settingsUsername', settings.username);
    const emailEl = document.getElementById('settingsAdminEmail');
    if (emailEl) emailEl.value = settings.email || '';
    setVal('settingsStoreName', settings.storeName);
    setVal('settingsCurrency', settings.currency);
    setVal('settingsCurrencySymbol', settings.currencySymbol);
    setVal('settingsTimezone', settings.timezone);

    const storeNameEl = document.getElementById('sidebarStoreName');
    if (storeNameEl) storeNameEl.textContent = settings.storeName || 'EonlineBazar';

    const sidebarName = document.querySelector('.admin-profile .info h4');
    if (sidebarName && settings.displayName) sidebarName.textContent = settings.displayName;

    applyBrandingPreviewFromSettings(settings);
    startLiveClock();
}

const brandingPreviewObjectUrls = { logo: null, favicon: null };

function normalizeBrandingUrl(url) {
    if (!url) return '';
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    return url.replace(/^\/images\/branding\//, '/uploads/branding/');
}

function cacheBustBrandingUrl(url) {
    const resolved = normalizeBrandingUrl(url);
    if (!resolved || resolved.startsWith('blob:') || resolved.startsWith('data:')) return resolved;
    return resolved.includes('?') ? `${resolved}&t=${Date.now()}` : `${resolved}?t=${Date.now()}`;
}

function revokeBrandingObjectUrl(assetType) {
    if (brandingPreviewObjectUrls[assetType]) {
        URL.revokeObjectURL(brandingPreviewObjectUrls[assetType]);
        brandingPreviewObjectUrls[assetType] = null;
    }
}

function setBrandingPreviewImage(assetType, url) {
    const isLogo = assetType === 'logo';
    const img = document.getElementById(isLogo ? 'settingsLogoPreview' : 'settingsFaviconPreview');
    const ph = document.getElementById(isLogo ? 'settingsLogoPlaceholder' : 'settingsFaviconPlaceholder');
    const dropzone = document.getElementById(isLogo ? 'logoPreviewBox' : 'faviconPreviewBox');
    if (!img) return;

    if (!url) {
        img.removeAttribute('src');
        img.style.display = 'none';
        if (ph) ph.style.display = 'flex';
        if (dropzone) dropzone.classList.remove('has-preview');
        if (isLogo) updateSidebarStoreLogo(null);
        return;
    }

    if (dropzone) dropzone.classList.add('has-preview');

    const resolved = (url.startsWith('blob:') || url.startsWith('data:'))
        ? url
        : cacheBustBrandingUrl(url);

    img.onerror = () => {
        img.style.display = 'none';
        if (ph) ph.style.display = 'flex';
        if (isLogo) updateSidebarStoreLogo(null);
    };
    img.onload = () => {
        img.style.display = 'block';
        if (ph) ph.style.display = 'none';
    };
    if (isLogo) updateSidebarStoreLogo(resolved);
    img.src = resolved;
}

function updateSidebarStoreLogo(url) {
    const sidebarLogo = document.getElementById('sidebarStoreLogo');
    const sidebarDefault = document.getElementById('sidebarDefaultLogo');
    const sidebarIcon = document.getElementById('sidebarStoreIcon');
    const sidebarName = document.getElementById('sidebarStoreName');
    const brandLogo = document.getElementById('sidebarBrandLogo');

    if (url) {
        const bust = cacheBustBrandingUrl(url);
        if (sidebarLogo) {
            sidebarLogo.src = bust;
            sidebarLogo.style.display = 'block';
        }
        if (sidebarDefault) sidebarDefault.style.display = 'none';
        if (sidebarIcon) sidebarIcon.style.display = 'none';
        if (sidebarName) sidebarName.style.display = '';
        if (brandLogo) brandLogo.classList.add('has-custom-logo');
        return;
    }

    if (sidebarLogo) {
        sidebarLogo.removeAttribute('src');
        sidebarLogo.style.display = 'none';
    }
    if (sidebarDefault) sidebarDefault.style.display = 'block';
    if (sidebarIcon) sidebarIcon.style.display = 'none';
    if (sidebarName) sidebarName.style.display = 'none';
    if (brandLogo) brandLogo.classList.remove('has-custom-logo');
}

function updateSiteFaviconLink(url) {
    const href = cacheBustBrandingUrl(url || '/images/favicon.png');
    let faviconLink = document.getElementById('adminFavicon')
        || document.getElementById('siteFavicon')
        || document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');

    if (!faviconLink) {
        faviconLink = document.createElement('link');
        faviconLink.id = 'adminFavicon';
        faviconLink.rel = 'icon';
        document.head.appendChild(faviconLink);
    }

    faviconLink.href = href;
    faviconLink.type = href.endsWith('.ico') ? 'image/x-icon' : 'image/png';
}

function applyBrandingPreviewFromSettings(settings) {
    if (settings.logoUrl) {
        setBrandingPreviewImage('logo', settings.logoUrl);
    } else {
        setBrandingPreviewImage('logo', null);
    }

    if (settings.faviconUrl) {
        setBrandingPreviewImage('favicon', settings.faviconUrl);
        updateSiteFaviconLink(settings.faviconUrl);
    } else {
        setBrandingPreviewImage('favicon', null);
    }
}

/* ============================================================
   🧪 SANDBOX MODE (Super Admin)
   ============================================================ */

async function loadSandboxStatus() {
    if (typeof window.applySuperAdminOnlyVisibility === 'function') {
        window.applySuperAdminOnlyVisibility();
    }

    if (typeof window.isAdminSuperAdmin === 'function' && !window.isAdminSuperAdmin()) {
        return;
    }

    try {
        const res = await fetch('/api/admin/sandbox/status', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.status === 403) return;
        const data = await res.json();
        if (!data.success) return;

        const toggle = document.getElementById('sandbox-toggle');
        const statusText = document.getElementById('sandbox-status-text');
        const card = document.querySelector('.sandbox-card');

        if (toggle) toggle.checked = data.sandboxMode;
        if (statusText) {
            statusText.textContent = data.sandboxMode
                ? '🧪 ON — Sandbox Mode Active'
                : 'OFF — Live Mode';
            statusText.className = data.sandboxMode
                ? 'sandbox-status-on'
                : 'sandbox-status-off';
        }
        if (card) {
            card.classList.toggle('active-mode', data.sandboxMode);
        }

        const sandboxCount = document.getElementById('sandbox-order-count');
        const realCount = document.getElementById('real-order-count');
        if (sandboxCount) sandboxCount.textContent = data.sandboxOrderCount || 0;
        if (realCount) realCount.textContent = data.realOrderCount || 0;

        const banner = document.getElementById('sandbox-banner');
        if (banner) banner.style.display = data.sandboxMode ? 'block' : 'none';
    } catch (err) {
        console.warn('Could not load sandbox status:', err);
    }
}

window.loadSandboxStatus = loadSandboxStatus;

window.toggleSandboxMode = async function(enabled) {
    try {
        const res = await fetch('/api/admin/sandbox/toggle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.success) {
            showToast(
                enabled
                    ? '🧪 Sandbox Mode ON — Orders are now test orders'
                    : '✅ Live Mode — Real orders active',
                enabled ? 'warning' : 'success'
            );
            loadSandboxStatus();
        } else {
            showToast(data.message || 'Failed to toggle sandbox mode', 'error');
        }
    } catch (err) {
        showToast('Failed to toggle sandbox mode', 'error');
    }
};

window.resetTestData = async function() {
    await showEnterpriseActionModal({
        title: 'Clear Test Orders?',
        message: 'Delete ALL sandbox/test orders.\n\nReal orders will NOT be affected.\nThis action cannot be undone.',
        variant: 'warning',
        confirmText: 'Clear Test Orders',
        cancelText: 'Cancel',
        onConfirm: async () => {
            const res = await fetch('/api/admin/sandbox/reset-test-data', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await res.json();
            if (!data.success) {
                throw new Error(data.message || 'Reset failed');
            }
            showToast(`✅ Cleared ${data.deleted.orders} test orders`, 'success');
            loadSandboxStatus();
            if (typeof fetchLiveOrders === 'function') fetchLiveOrders();
        }
    });
};

window.resetRealData = async function() {
    const keyInput = document.getElementById('real-reset-key');
    const key = keyInput?.value?.trim();
    if (!key) {
        showToast('Please enter the confirmation key', 'error');
        return;
    }

    await showEnterpriseActionModal({
        title: '⚠️ Danger: Reset Real Data',
        message: 'This will permanently DELETE all REAL orders.\n\nCustomer accounts are kept, but every live order record will be wiped.\nThis cannot be undone.',
        variant: 'danger',
        confirmText: 'Delete Real Orders',
        cancelText: 'Keep Orders',
        requireTypedPhrase: 'DELETE REAL ORDERS',
        onConfirm: async () => {
            const res = await fetch('/api/admin/sandbox/reset-real-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ confirmationKey: key })
            });
            const data = await res.json();
            if (!data.success) {
                throw new Error(data.message || 'Invalid key or reset failed');
            }
            showToast(`Deleted ${data.deleted.orders} real orders`, 'success');
            if (keyInput) keyInput.value = '';
            loadSandboxStatus();
            if (typeof fetchLiveOrders === 'function') fetchLiveOrders();
        }
    });
};

async function toggleServiceWorkerSetting(enabled) {
    const text = document.getElementById('sw-setting-text');
    if (text) {
        text.textContent = enabled ? 'Cache Enabled' : 'Cache Disabled';
    }

    try {
        await fetch('/api/admin/settings/cache', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ serviceWorkerEnabled: enabled })
        });
        showToast(
            enabled ? '✅ Cache enabled' : '⚠️ Cache disabled',
            enabled ? 'success' : 'warning'
        );
    } catch (err) {
        showToast('Could not save cache setting', 'error');
    }
}
window.toggleServiceWorkerSetting = toggleServiceWorkerSetting;

async function loadCacheVersionDisplay() {
    const versionEl = document.getElementById('cache-version-display');
    try {
        const res = await fetch('/api/store/health');
        const data = await res.json();
        if (versionEl) {
            versionEl.textContent = 'v' + (data.buildTime || Date.now());
        }
        return data;
    } catch (err) {
        if (versionEl) versionEl.textContent = 'unknown';
        return null;
    }
}

async function restartCacheBuster() {
    const data = await loadCacheVersionDisplay();
    if (data) {
        showToast('✅ Cache version is current. Deploy to force a full refresh.', 'info');
    } else {
        showToast('Could not check cache version', 'error');
    }
}
window.restartCacheBuster = restartCacheBuster;

async function loadCacheSettings() {
    try {
        const res = await fetch('/api/store/cache-settings');
        const data = await res.json();
        const enabled = data.serviceWorkerEnabled !== false;
        const toggle = document.getElementById('sw-enabled-toggle');
        const text = document.getElementById('sw-setting-text');
        if (toggle) toggle.checked = enabled;
        if (text) text.textContent = enabled ? 'Cache Enabled' : 'Cache Disabled';
    } catch (e) {
        // ignore — defaults to enabled
    }
}

async function checkGAStatus() {
    try {
        const res = await fetch('/api/admin/analytics/status', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        const badge = document.getElementById('ga-status-badge');
        if (!badge) return;
        if (data.enabled && data.measurementId) {
            badge.style.background = '#d1fae5';
            badge.style.color = '#065f46';
            badge.innerHTML = '✅ Active — ' + data.measurementId;
        } else {
            badge.style.background = '#fee2e2';
            badge.style.color = '#991b1b';
            badge.innerHTML = '❌ Not configured — add GOOGLE_ANALYTICS_ID to .env';
        }
    } catch (e) {
        // ignore
    }
}

async function fetchAdminSettings() {
    if (typeof window.applySuperAdminOnlyVisibility === 'function') {
        window.applySuperAdminOnlyVisibility();
    }

    try {
        const [platformRes, deliveryRes] = await Promise.all([
            fetch('/api/admin/platform-settings', {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch('/api/admin/settings', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        const platformData = await platformRes.json();
        if (platformData.success && platformData.data) applyAdminSettingsToUI(platformData.data);

        const deliveryData = await deliveryRes.json();
        if (deliveryData.success && deliveryData.data) applyDeliverySettingsToUI(deliveryData.data);
    } catch (err) {
        console.error('Failed to load admin settings:', err);
    }
    checkGAStatus();
    loadCacheSettings();
    loadCacheVersionDisplay();
    // Load 2FA status/config for the settings panel
    if (typeof window.refreshTwoFactorSettings === 'function') window.refreshTwoFactorSettings();
    if (typeof loadSandboxStatus === 'function') loadSandboxStatus();
}

async function saveAdminProfile(payload) {
    const res = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    return res.json();
}

async function saveAdminSettings(payload) {
    const res = await fetch('/api/admin/platform-settings', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    return res.json();
}

function populateDistrictSelect(selectEl, selectedValue = '') {
    if (!selectEl || !Array.isArray(window.BANGLADESH_DISTRICTS)) return;

    const current = String(selectedValue || selectEl.value || '').trim();
    selectEl.innerHTML = '<option value="">Select district</option>';
    window.BANGLADESH_DISTRICTS.forEach((district) => {
        const option = document.createElement('option');
        option.value = district;
        option.textContent = district;
        selectEl.appendChild(option);
    });

    if (current) selectEl.value = current;
}

function populateShopHomeCityOptions(selectedValue = '') {
    populateDistrictSelect(document.getElementById('settingsShopHomeCity'), selectedValue);
}

function applyDeliverySettingsToUI(settings) {
    if (!settings) return;

    populateShopHomeCityOptions(settings.shopHomeCity || 'Dhaka');

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.value = val;
    };

    setVal('settingsShopHomeCity', settings.shopHomeCity || 'Dhaka');
    setVal('settingsDeliveryInsideCity', settings.deliveryInsideCity);
    setVal('settingsDeliveryOutsideCity', settings.deliveryOutsideCity);
    setVal('settingsFreeShippingMinAmount', settings.freeShippingMinAmount);
}

async function saveDeliverySettings(payload) {
    const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    return res.json();
}

function applyMasterSettingsToUI(settings) {
    if (!settings) return;

    cacheAdminRewardSettings(settings);

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.value = val;
    };

    setVal('masterCashbackPercentage', settings.cashbackPercentage);
    setVal('masterTakaToPointsRatio', settings.takaToPointsRatio);
    setVal('masterPointsConversionRate', settings.pointsToTakaConversionRate);
    setVal('masterRefundUndoWindow', settings.refundUndoWindowHours);
    setVal('masterFreeShippingThreshold', settings.freeShippingThreshold);
    setVal('vipMinTotalSpent', settings.vipMinTotalSpent);
    setVal('vipMinOrderCount', settings.vipMinOrderCount);
    setVal('frequentBuyerMinOrders', settings.frequentBuyerMinOrders);
    setVal('defaultProductsPerPage', settings.defaultProductsPerPage ?? settings.productsPerPage ?? 24);

    applyFlashSaleSettingsToUI(settings);
    applyAnnouncementSettingsToUI(settings);
    applySmsSettingsToUI(settings);
    applyCourierSettingsToUI(settings);
    refreshAdminCourierStatus();
    applyWhatsAppSettingsToUI(settings);
    updateMasterSettingsPreview();
}

/* ==========================================================================
   PAYMENT METHODS CATALOG (dynamic CRUD → /api/admin/payment-methods)
   ========================================================================== */

/* shared state: adminPaymentMethodsCache lives on window (admin-core) */

/* shared state: pmRemoveLogoFlag lives on window (admin-core) */

/* shared state: pmDragSourceId lives on window (admin-core) */

function formatProcessingFeeBadge(method) {
    const fee = Number(method?.processingFee) || 0;
    if (fee <= 0) return 'No fee';
    return method?.feeType === 'flat' ? `৳${fee} fee` : `${fee}% fee`;
}

function paymentMethodFallbackIcon(method) {
    const code = String(method?.code || method?.name || '').toLowerCase();
    if (code.includes('bkash')) return 'fa-mobile-screen-button';
    if (code.includes('nagad')) return 'fa-bolt';
    if (code.includes('bank')) return 'fa-building-columns';
    if (code.includes('cod') || code.includes('cash')) return 'fa-truck-ramp-box';
    if (code.includes('visa') || code.includes('master') || code.includes('card')) return 'fa-credit-card';
    return method?.type === 'automated' ? 'fa-shield-halved' : 'fa-wallet';
}

function updatePaymentMethodsPreview() {
    const previewEl = document.getElementById('paymentGatewaySettingsPreviewText');
    const previewRow = document.getElementById('paymentGatewayPreviewRow');
    if (!previewEl) return;

    const active = adminPaymentMethodsCache.filter((m) => m.isActive);
    const badgeSettings = {
        enabledPaymentMethods: active.map((m) => ({
            id: m.code,
            name: m.name,
            logoUrl: m.logoUrl || ''
        })),
        paymentGateways: Object.fromEntries(active.map((m) => [m.code, {
            enabled: true,
            name: m.name,
            logoUrl: m.logoUrl || ''
        }]))
    };

    previewEl.textContent = active.length
        ? `${active.length} active on checkout · ${adminPaymentMethodsCache.length} total in catalog.`
        : 'No payment methods are enabled — customers cannot complete checkout.';

    if (previewRow && window.PaymentBrandLogos) {
        const ids = active.map((m) => m.code);
        previewRow.innerHTML = window.PaymentBrandLogos.renderPaymentLogoRow(ids, 'admin', badgeSettings);
        previewRow.style.display = ids.length ? 'flex' : 'none';
        previewRow.setAttribute('aria-hidden', ids.length ? 'false' : 'true');
    }
}

function renderPaymentMethodsGrid(methods = adminPaymentMethodsCache) {
    const grid = document.getElementById('paymentMethodsGrid');
    const addFooter = document.getElementById('paymentMethodsAddFooter');
    if (!grid) return;

    adminPaymentMethodsCache = Array.isArray(methods) ? methods.slice() : [];

    if (!adminPaymentMethodsCache.length) {
        if (addFooter) addFooter.hidden = true;
        grid.innerHTML = `
            <div class="pm-empty-state md:col-span-2 lg:col-span-3">
                <i class="fa-solid fa-credit-card"></i>
                <h5>No payment methods yet</h5>
                <p>Add bKash, Nagad, bank transfer, COD, or an automated gateway like SSLCommerz.</p>
                <button type="button" class="pm-add-btn" onclick="openPaymentMethodModal()">
                    <i class="fa-solid fa-plus"></i> Add New Payment Method
                </button>
            </div>`;
        updatePaymentMethodsPreview();
        return;
    }

    if (addFooter) addFooter.hidden = false;

    grid.innerHTML = adminPaymentMethodsCache.map((method) => {
        const id = escapeHtml(method.id || method._id);
        const name = escapeHtml(method.name || 'Untitled');
        const typeLabel = method.type === 'automated' ? 'Automated' : 'Manual';
        const feeLabel = escapeHtml(formatProcessingFeeBadge(method));
        const logo = method.logoUrl
            ? `<img src="${escapeHtml(method.logoUrl)}" alt="${name}" class="pm-card-logo" loading="lazy">`
            : `<span class="pm-card-logo-fallback"><i class="fa-solid ${paymentMethodFallbackIcon(method)}"></i></span>`;
        const providerChip = method.type === 'automated' && method.provider
            ? `<span class="pm-chip pm-chip--provider">${escapeHtml(method.provider)}</span>`
            : '';
        const readyChip = method.type === 'automated' && method.checkoutReady === false
            ? `<span class="pm-chip pm-chip--warn">Credentials incomplete</span>`
            : '';

        return `
            <article class="pm-method-card ${method.isActive ? 'is-active' : 'is-inactive'}" data-id="${id}" draggable="true" role="listitem">
                <div class="pm-card-top">
                    <div class="pm-card-drag" title="Drag to reorder" aria-hidden="true">
                        <i class="fa-solid fa-grip-vertical"></i>
                    </div>
                    <label class="pm-switch-label pm-card-toggle" title="${method.isActive ? 'Disable' : 'Enable'}">
                        <input type="checkbox" class="pm-switch-input pm-toggle-input" data-id="${id}" ${method.isActive ? 'checked' : ''}>
                        <span class="pm-switch-ui" aria-hidden="true"></span>
                    </label>
                </div>
                <div class="pm-card-body">
                    <div class="pm-card-logo-wrap">${logo}</div>
                    <div class="pm-card-meta">
                        <h5 class="pm-card-name">${name}</h5>
                        <div class="pm-card-chips">
                            <span class="pm-chip pm-chip--${method.type === 'automated' ? 'auto' : 'manual'}">${typeLabel}</span>
                            <span class="pm-chip pm-chip--fee">${feeLabel}</span>
                            ${providerChip}
                            ${readyChip}
                        </div>
                    </div>
                </div>
                <div class="pm-card-footer">
                    <label class="pm-sort-label">
                        <span>Order</span>
                        <input type="number" class="pm-sort-input" data-id="${id}" min="0" max="9999" value="${Number(method.sortOrder) || 0}">
                    </label>
                    <div class="pm-card-actions">
                        <button type="button" class="pm-icon-btn" data-action="edit" data-id="${id}" title="Edit">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button type="button" class="pm-icon-btn pm-icon-btn--danger" data-action="delete" data-id="${id}" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </article>`;
    }).join('');

    bindPaymentMethodCardEvents();
    updatePaymentMethodsPreview();
}

window.fetchPaymentMethodsCatalog = async function fetchPaymentMethodsCatalog() {
    const grid = document.getElementById('paymentMethodsGrid');
    if (!grid) return;

    try {
        const res = await fetch('/api/admin/payment-methods', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) {
            throw new Error(data.message || 'Failed to load payment methods.');
        }
        renderPaymentMethodsGrid(data.data || []);
    } catch (err) {
        console.error('Payment methods load error:', err);
        const addFooter = document.getElementById('paymentMethodsAddFooter');
        if (addFooter) addFooter.hidden = true;
        grid.innerHTML = `
            <div class="pm-empty-state md:col-span-2 lg:col-span-3">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <h5>Could not load payment methods</h5>
                <p>${escapeHtml(err.message || 'Please try again.')}</p>
                <button type="button" class="pm-add-btn" onclick="fetchPaymentMethodsCatalog()">
                    <i class="fa-solid fa-rotate-right"></i> Retry
                </button>
            </div>`;
    }
}

function togglePaymentMethodTypeFields() {
    const type = document.getElementById('pmType')?.value || 'manual';
    const manual = document.getElementById('pmManualFields');
    const automated = document.getElementById('pmAutomatedFields');
    if (manual) manual.style.display = type === 'manual' ? '' : 'none';
    if (automated) automated.style.display = type === 'automated' ? '' : 'none';
}

function setPaymentMethodLogoPreview(url) {
    const img = document.getElementById('pmLogoPreview');
    const placeholder = document.getElementById('pmLogoPlaceholder');
    const removeBtn = document.getElementById('pmRemoveLogoBtn');
    if (!img) return;

    if (url) {
        img.src = url;
        img.classList.remove('hidden');
        placeholder?.classList.add('hidden');
        if (removeBtn) removeBtn.style.display = '';
    } else {
        img.removeAttribute('src');
        img.classList.add('hidden');
        placeholder?.classList.remove('hidden');
        if (removeBtn) removeBtn.style.display = 'none';
    }
}

function resetPaymentMethodForm() {
    const form = document.getElementById('paymentMethodForm');
    if (form) form.reset();
    document.getElementById('pmFormId').value = '';
    document.getElementById('pmType').value = 'manual';
    document.getElementById('pmFeeType').value = 'percentage';
    document.getElementById('pmProcessingFee').value = '0';
    document.getElementById('pmSortOrder').value = String(
        adminPaymentMethodsCache.reduce((max, m) => Math.max(max, Number(m.sortOrder) || 0), 0) + 1
    );
    document.getElementById('pmIsActive').checked = true;
    document.getElementById('pmIsSandbox').checked = true;
    document.getElementById('pmProvider').value = 'sslcommerz';
    document.getElementById('pmWebhookUrl').value = '';
    document.getElementById('pmStorePasswordHint').textContent = '';
    document.getElementById('pmApiKeyHint').textContent = '';
    const logoInput = document.getElementById('logoInput');
    if (logoInput) logoInput.value = '';
    pmRemoveLogoFlag = false;
    setPaymentMethodLogoPreview('');
    togglePaymentMethodTypeFields();
}

window.openPaymentMethodModal = function openPaymentMethodModal(method = null) {
    const modal = document.getElementById('paymentMethodModal');
    if (!modal) return;

    resetPaymentMethodForm();

    const title = document.getElementById('paymentMethodModalTitle');
    const subtitle = document.getElementById('paymentMethodModalSubtitle');

    if (method) {
        if (title) title.textContent = 'Edit Payment Method';
        if (subtitle) subtitle.textContent = `Updating ${method.name} · code ${method.code}`;
        document.getElementById('pmFormId').value = method.id || method._id || '';
        document.getElementById('pmName').value = method.name || '';
        document.getElementById('pmType').value = method.type || 'manual';
        document.getElementById('pmDescription').value = method.description || '';
        document.getElementById('pmSortOrder').value = String(Number(method.sortOrder) || 0);
        document.getElementById('pmProcessingFee').value = String(Number(method.processingFee) || 0);
        document.getElementById('pmFeeType').value = method.feeType || 'percentage';
        document.getElementById('pmAccountNumber').value = method.accountNumber || '';
        document.getElementById('pmInstructions').value = method.instructions || '';
        document.getElementById('pmIsActive').checked = method.isActive !== false;
        document.getElementById('pmProvider').value = method.provider || 'sslcommerz';
        document.getElementById('pmStoreId').value = method.apiConfig?.storeId || '';
        document.getElementById('pmIsSandbox').checked = method.apiConfig?.isSandbox !== false;
        document.getElementById('pmWebhookUrl').value =
            method.resolvedWebhookUrl || method.apiConfig?.webhookUrl || '';
        document.getElementById('pmStorePasswordHint').textContent = method.apiConfig?.hasStorePassword
            ? `Configured: ${method.apiConfig.storePasswordMasked || '••••'}`
            : 'Not set yet';
        document.getElementById('pmApiKeyHint').textContent = method.apiConfig?.hasApiKey
            ? `Configured: ${method.apiConfig.apiKeyMasked || '••••'}`
            : 'Not set yet';
        setPaymentMethodLogoPreview(method.logoUrl || '');
        togglePaymentMethodTypeFields();
    } else {
        if (title) title.textContent = 'Add Payment Method';
        if (subtitle) subtitle.textContent = 'Configure a manual wallet or an automated gateway.';
    }

    modal.classList.remove('pm-modal-closing');
    modal.querySelector('.pm-modal-box')?.classList.remove('pm-modal-box-closing');
    modal.style.display = 'flex';
};

window.closePaymentMethodModal = function closePaymentMethodModal() {
    const modal = document.getElementById('paymentMethodModal');
    if (!modal || modal.style.display === 'none') return;

    const box = modal.querySelector('.pm-modal-box');
    modal.classList.add('pm-modal-closing');
    box?.classList.add('pm-modal-box-closing');

    window.setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('pm-modal-closing');
        box?.classList.remove('pm-modal-box-closing');
        resetPaymentMethodForm();
    }, 220);
};

async function savePaymentMethodForm(event) {
    event.preventDefault();

    const id = document.getElementById('pmFormId')?.value?.trim() || '';
    const type = document.getElementById('pmType')?.value || 'manual';
    const formData = new FormData();

    formData.append('name', document.getElementById('pmName')?.value?.trim() || '');
    formData.append('type', type);
    formData.append('description', document.getElementById('pmDescription')?.value?.trim() || '');
    formData.append('sortOrder', document.getElementById('pmSortOrder')?.value || '0');
    formData.append('processingFee', document.getElementById('pmProcessingFee')?.value || '0');
    formData.append('feeType', document.getElementById('pmFeeType')?.value || 'percentage');
    formData.append('isActive', document.getElementById('pmIsActive')?.checked ? 'true' : 'false');

    if (type === 'manual') {
        formData.append('accountNumber', document.getElementById('pmAccountNumber')?.value?.trim() || '');
        formData.append('instructions', document.getElementById('pmInstructions')?.value?.trim() || '');
    } else {
        formData.append('provider', document.getElementById('pmProvider')?.value || 'custom');
        formData.append('storeId', document.getElementById('pmStoreId')?.value?.trim() || '');
        formData.append('isSandbox', document.getElementById('pmIsSandbox')?.checked ? 'true' : 'false');
        const storePassword = document.getElementById('pmStorePassword')?.value || '';
        const apiKey = document.getElementById('pmApiKey')?.value || '';
        if (storePassword) formData.append('storePassword', storePassword);
        if (apiKey) formData.append('apiKey', apiKey);
    }

    const logoFile = document.getElementById('logoInput')?.files?.[0];
    if (logoFile) formData.append('logo', logoFile);
    if (pmRemoveLogoFlag && !logoFile) formData.append('removeLogo', 'true');

    const submitBtn = document.getElementById('pmFormSubmitBtn');
    const restore = setButtonLoading(submitBtn, 'Saving...');

    try {
        const res = await fetch(id ? `/api/admin/payment-methods/${id}` : '/api/admin/payment-methods', {
            method: id ? 'PUT' : 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData
        });
        const result = await res.json();
        if (!result.success) {
            throw new Error(result.message || 'Failed to save payment method.');
        }
        showToast(result.message || 'Payment method saved.', 'success');
        closePaymentMethodModal();
        await fetchPaymentMethodsCatalog();
    } catch (err) {
        console.error('Save payment method error:', err);
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        restore();
    }
}

async function togglePaymentMethodActive(id, isActive) {
    try {
        const res = await fetch(`/api/admin/payment-methods/${id}/toggle`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ isActive })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Toggle failed.');
        showToast(result.message || 'Updated.', result.warning ? 'warning' : 'success');
        if (result.warning) showToast(result.warning, 'warning');
        await fetchPaymentMethodsCatalog();
    } catch (err) {
        console.error('Toggle payment method error:', err);
        showToast(`Error: ${err.message}`, 'error');
        await fetchPaymentMethodsCatalog();
    }
}

function deletePaymentMethod(id) {
    const method = adminPaymentMethodsCache.find((m) => (m.id || m._id) === id);
    showCustomConfirm(
        'Delete payment method?',
        method
            ? `"${method.name}" will be removed from checkout. Existing orders keep their payment records.`
            : 'This method will be removed from checkout. Existing orders keep their payment records.',
        async () => {
            try {
                const res = await fetch(`/api/admin/payment-methods/${id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` }
                });
                const result = await res.json();
                if (!result.success) throw new Error(result.message || 'Delete failed.');
                showToast(result.message || 'Deleted.', 'success');
                await fetchPaymentMethodsCatalog();
            } catch (err) {
                console.error('Delete payment method error:', err);
                showToast(`Error: ${err.message}`, 'error');
            }
        },
        'danger'
    );
}

async function persistPaymentMethodOrder(order) {
    try {
        const res = await fetch('/api/admin/payment-methods/reorder', {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ order })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Reorder failed.');
        renderPaymentMethodsGrid(result.data || []);
        showToast('Display order updated.', 'success');
    } catch (err) {
        console.error('Reorder payment methods error:', err);
        showToast(`Error: ${err.message}`, 'error');
        await fetchPaymentMethodsCatalog();
    }
}

function collectPaymentMethodOrderFromDom() {
    return Array.from(document.querySelectorAll('#paymentMethodsGrid .pm-method-card')).map((card, index) => {
        const id = card.dataset.id;
        const input = card.querySelector('.pm-sort-input');
        const sortOrder = input && input.value !== ''
            ? Number(input.value)
            : index;
        return { id, sortOrder: Number.isFinite(sortOrder) ? sortOrder : index };
    });
}

function bindPaymentMethodCardEvents() {
    const grid = document.getElementById('paymentMethodsGrid');
    if (!grid) return;

    grid.querySelectorAll('.pm-toggle-input').forEach((input) => {
        input.addEventListener('change', () => {
            togglePaymentMethodActive(input.dataset.id, input.checked);
        });
    });

    grid.querySelectorAll('[data-action="edit"]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const method = adminPaymentMethodsCache.find((m) => (m.id || m._id) === btn.dataset.id);
            if (method) openPaymentMethodModal(method);
        });
    });

    grid.querySelectorAll('[data-action="delete"]').forEach((btn) => {
        btn.addEventListener('click', () => deletePaymentMethod(btn.dataset.id));
    });

    let sortTimer = null;
    grid.querySelectorAll('.pm-sort-input').forEach((input) => {
        input.addEventListener('change', () => {
            clearTimeout(sortTimer);
            sortTimer = setTimeout(() => {
                persistPaymentMethodOrder(collectPaymentMethodOrderFromDom());
            }, 250);
        });
    });

    grid.querySelectorAll('.pm-method-card').forEach((card) => {
        card.addEventListener('dragstart', (e) => {
            pmDragSourceId = card.dataset.id;
            card.classList.add('is-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', pmDragSourceId);
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('is-dragging');
            grid.querySelectorAll('.pm-method-card').forEach((c) => c.classList.remove('is-drag-over'));
            pmDragSourceId = null;
        });
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            card.classList.add('is-drag-over');
        });
        card.addEventListener('dragleave', () => card.classList.remove('is-drag-over'));
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.classList.remove('is-drag-over');
            const sourceId = e.dataTransfer.getData('text/plain') || pmDragSourceId;
            const targetId = card.dataset.id;
            if (!sourceId || sourceId === targetId) return;

            const cards = Array.from(grid.querySelectorAll('.pm-method-card'));
            const sourceCard = cards.find((c) => c.dataset.id === sourceId);
            if (!sourceCard) return;

            const sourceIndex = cards.indexOf(sourceCard);
            const targetIndex = cards.indexOf(card);
            if (sourceIndex < targetIndex) {
                card.after(sourceCard);
            } else {
                card.before(sourceCard);
            }

            Array.from(grid.querySelectorAll('.pm-method-card')).forEach((c, index) => {
                const sortInput = c.querySelector('.pm-sort-input');
                if (sortInput) sortInput.value = String(index + 1);
            });

            persistPaymentMethodOrder(collectPaymentMethodOrderFromDom());
        });
    });
}

function setupPaymentMethodsManager() {
    document.getElementById('addPaymentMethodBtn')?.addEventListener('click', () => openPaymentMethodModal());
    document.getElementById('pmType')?.addEventListener('change', togglePaymentMethodTypeFields);
    document.getElementById('pmModalCloseBtn')?.addEventListener('click', closePaymentMethodModal);

    document.getElementById('logoInput')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        pmRemoveLogoFlag = false;
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (typeof ev.target?.result === 'string') {
                setPaymentMethodLogoPreview(ev.target.result);
            }
        };
        reader.onerror = () => {
            showToast('Could not preview the selected logo.', 'error');
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('pmRemoveLogoBtn')?.addEventListener('click', () => {
        const logoInput = document.getElementById('logoInput');
        if (logoInput) logoInput.value = '';
        pmRemoveLogoFlag = true;
        setPaymentMethodLogoPreview('');
    });

    document.getElementById('pmCopyWebhookBtn')?.addEventListener('click', async () => {
        const value = document.getElementById('pmWebhookUrl')?.value?.trim();
        if (!value) {
            showToast('Webhook URL will appear after the method is saved.', 'warning');
            return;
        }
        try {
            await navigator.clipboard.writeText(value);
            showToast('Webhook URL copied.', 'success');
        } catch (_) {
            showToast('Could not copy webhook URL.', 'error');
        }
    });

    document.getElementById('paymentMethodForm')?.addEventListener('submit', savePaymentMethodForm);
}

/* ==========================================================================
   FOOTER SETTINGS MANAGER (dynamic → /api/admin/footer-settings)
   ========================================================================== */

const FOOTER_SOCIAL_PRESETS = [
    { platform: 'Facebook', iconName: 'facebook' },
    { platform: 'Instagram', iconName: 'instagram' },
    { platform: 'TikTok', iconName: 'tiktok' },
    { platform: 'X (Twitter)', iconName: 'x-twitter' },
    { platform: 'YouTube', iconName: 'youtube' },
    { platform: 'LinkedIn', iconName: 'linkedin' },
    { platform: 'WhatsApp', iconName: 'whatsapp' },
    { platform: 'Telegram', iconName: 'telegram' }
];

const FOOTER_PAYMENT_PRESETS = [
    { name: 'bKash', iconName: 'bkash' },
    { name: 'Nagad', iconName: 'nagad' },
    { name: 'Rocket', iconName: 'rocket' },
    { name: 'Visa', iconName: 'visa' },
    { name: 'Mastercard', iconName: 'mastercard' },
    { name: 'COD', iconName: 'cod' }
];

/* shared state: footerSettingsState lives on window (admin-core) */

/** Shared with Page Content Manager — listed here so Footer CMS auto-link can use it early. */

/* shared state: pageContentCatalog lives on window (admin-core) */

/* shared state: pageContentQuill lives on window (admin-core) */

/* shared state: activePageSlug lives on window (admin-core) */

/* shared state: createPageSlugManual lives on window (admin-core) */

/** Common label → CMS slug aliases when page title text differs slightly. */
const FOOTER_CMS_LABEL_ALIASES = {
    'privacy policy': 'privacy-policy',
    'terms': 'terms',
    'terms conditions': 'terms',
    'terms and conditions': 'terms',
    'terms of service': 'terms',
    'terms of use': 'terms',
    'about': 'about',
    'about us': 'about',
    'who we are': 'about',
    'contact': 'contact',
    'contact us': 'contact',
    'careers': 'careers'
};

function footerTempId(prefix = 'tmp') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isFooterPlaceholderUrl(url = '') {
    const raw = String(url || '').trim();
    return !raw || raw === '#' || raw === '/#' || raw === 'javascript:void(0)';
}

function normalizeFooterMatchKey(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Resolve a CMS page from Page Content Manager by footer link label. */
function findFooterCmsPageByLabel(label = '') {
    const pages = Array.isArray(pageContentCatalog) ? pageContentCatalog : [];
    const key = normalizeFooterMatchKey(label);
    if (!key || !pages.length) return null;

    const byTitle = pages.find((p) => normalizeFooterMatchKey(p.title) === key);
    if (byTitle) return byTitle;

    const slugFromLabel = typeof titleToPageSlug === 'function'
        ? titleToPageSlug(label)
        : normalizeFooterMatchKey(label).replace(/\s+/g, '-');
    if (slugFromLabel) {
        const bySlug = pages.find((p) => p.slug === slugFromLabel);
        if (bySlug) return bySlug;
    }

    const aliasSlug = FOOTER_CMS_LABEL_ALIASES[key];
    if (aliasSlug) {
        const byAlias = pages.find((p) => p.slug === aliasSlug);
        if (byAlias) return byAlias;
    }

    return pages.find((p) => {
        const titleKey = normalizeFooterMatchKey(p.title);
        return titleKey && (key.includes(titleKey) || titleKey.includes(key));
    }) || null;
}

function footerCmsPageOptionsHtml(selectedUrl = '') {
    const pages = Array.isArray(pageContentCatalog) ? pageContentCatalog : [];
    const selectedSlug = String(selectedUrl || '').trim().replace(/^\/+/, '').split('/')[0];
    const options = pages.map((page) => {
        const selected = page.slug === selectedSlug ? ' selected' : '';
        return `<option value="${escapeHtml(page.slug)}"${selected}>${escapeHtml(page.title)} (/${escapeHtml(page.slug)})</option>`;
    }).join('');
    return `<option value="">Link CMS page…</option>${options}`;
}

/** Auto-fill '#' / empty URLs from CMS page titles when rendering or typing. */
function autoLinkFooterCmsRoutes(mutateState = true) {
    const pages = Array.isArray(pageContentCatalog) ? pageContentCatalog : [];
    if (!pages.length) return false;

    let changed = false;
    footerSettingsState.columns.forEach((col) => {
        (col.links || []).forEach((link) => {
            if (link.isExternal === true) return;
            if (!isFooterPlaceholderUrl(link.url)) return;
            const page = findFooterCmsPageByLabel(link.label);
            if (!page?.slug) return;
            if (mutateState) {
                link.url = `/${page.slug}`;
                link.isExternal = false;
            }
            changed = true;
        });
    });
    return changed;
}

/** Interactive toggle switch — hidden input, smooth CSS knob (no visible native checkbox). */
function footerToggleHtml({ checked = true, inputClass = '', dataAttrs = {}, variant = 'green', label = 'Active' } = {}) {
    const dataStr = Object.entries(dataAttrs)
        .map(([key, val]) => `data-${key}="${escapeHtml(String(val))}"`)
        .join(' ');
    return `
        <label class="relative inline-flex items-center cursor-pointer footer-toggle-switch footer-toggle-switch--${variant}" title="${escapeHtml(label)}">
            <input type="checkbox" class="footer-toggle-input sr-only ${inputClass}" ${dataStr} ${checked ? 'checked' : ''} aria-label="${escapeHtml(label)}">
            <span class="footer-toggle-track" aria-hidden="true"><span class="footer-toggle-knob"></span></span>
        </label>`;
}

function renderFooterColumnsEditor() {
    const container = document.getElementById('footerColumnsEditor');
    if (!container) return;

    if (!footerSettingsState.columns.length) {
        container.innerHTML = `
            <div class="footer-settings-empty">
                <p>No footer columns yet. Add COMPANY, SUPPORT, or QUICK LINKS sections.</p>
            </div>`;
        return;
    }

    container.innerHTML = footerSettingsState.columns.map((col, colIndex) => `
        <article class="footer-column-card" data-col-index="${colIndex}">
            <div class="footer-column-head">
                <input type="text" class="footer-col-title-input" data-col-index="${colIndex}" value="${escapeHtml(col.columnTitle || '')}" placeholder="Column title (e.g. COMPANY)">
                ${footerToggleHtml({
                    checked: col.isActive !== false,
                    inputClass: 'footer-col-active',
                    dataAttrs: { 'col-index': colIndex },
                    variant: 'blue',
                    label: 'Column active'
                })}
                <button type="button" class="footer-settings-remove-btn" data-action="remove-column" data-col-index="${colIndex}" title="Delete column">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <div class="footer-links-list">
                ${(col.links || []).map((link, linkIndex) => `
                    <div class="footer-link-row" data-col-index="${colIndex}" data-link-index="${linkIndex}">
                        <input type="text" class="footer-link-label" data-col-index="${colIndex}" data-link-index="${linkIndex}" value="${escapeHtml(link.label || '')}" placeholder="Label (e.g. Privacy Policy)" list="footerCmsLabelSuggestions" autocomplete="off">
                        <select class="footer-link-cms-page" data-col-index="${colIndex}" data-link-index="${linkIndex}" title="Pick a Dynamic CMS page to auto-fill the route" aria-label="CMS page">
                            ${footerCmsPageOptionsHtml(link.url || '')}
                        </select>
                        <input type="text" class="footer-link-url" data-col-index="${colIndex}" data-link-index="${linkIndex}" value="${escapeHtml(link.url || '')}" placeholder="/privacy-policy or https://..." list="footerCmsRouteSuggestions">
                        <button type="button" class="footer-ext-pill ${link.isExternal ? 'is-active' : ''}" data-action="toggle-external" data-col-index="${colIndex}" data-link-index="${linkIndex}" title="External link">Ext</button>
                        ${footerToggleHtml({
                            checked: link.isActive !== false,
                            inputClass: 'footer-link-active',
                            dataAttrs: { 'col-index': colIndex, 'link-index': linkIndex },
                            variant: 'blue',
                            label: 'Link active'
                        })}
                        <button type="button" class="footer-settings-remove-btn" data-action="remove-link" data-col-index="${colIndex}" data-link-index="${linkIndex}">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
            <button type="button" class="footer-settings-inline-add" data-action="add-link" data-col-index="${colIndex}">
                <i class="fa-solid fa-plus"></i> Add Link
            </button>
        </article>
    `).join('');

    // Datalist suggestions from Page Content Manager (label + route autocomplete).
    const pages = Array.isArray(pageContentCatalog) ? pageContentCatalog : [];
    const labelOpts = pages.map((p) => `<option value="${escapeHtml(p.title || '')}"></option>`).join('');
    const routeOpts = pages.map((p) => `<option value="/${escapeHtml(p.slug)}"></option>`).join('');
    container.insertAdjacentHTML('beforeend', `
        <datalist id="footerCmsLabelSuggestions">${labelOpts}</datalist>
        <datalist id="footerCmsRouteSuggestions">${routeOpts}</datalist>
    `);
}

function renderFooterSocialEditor() {
    const container = document.getElementById('footerSocialEditor');
    if (!container) return;

    if (!footerSettingsState.socialLinks.length) {
        container.innerHTML = `
            <div class="footer-settings-empty">
                <p>No social links yet. Add Facebook, Instagram, TikTok, and more.</p>
            </div>`;
        return;
    }

    const presetOptions = FOOTER_SOCIAL_PRESETS.map((preset) =>
        `<option value="${escapeHtml(preset.iconName)}">${escapeHtml(preset.platform)}</option>`
    ).join('');

    container.innerHTML = footerSettingsState.socialLinks.map((item, index) => `
        <article class="footer-social-card" data-social-index="${index}">
            <div class="footer-social-grid">
                <input type="text" class="footer-social-platform" data-social-index="${index}" value="${escapeHtml(item.platform || '')}" placeholder="Name" aria-label="Platform name">
                <select class="footer-social-icon-preset" data-social-index="${index}" aria-label="Icon preset">
                    <option value="">Custom / uploaded</option>
                    ${presetOptions}
                </select>
                <input type="text" class="footer-social-icon-name" data-social-index="${index}" value="${escapeHtml(item.iconName || '')}" placeholder="Key" aria-label="Icon key">
                <input type="url" class="footer-social-url" data-social-index="${index}" value="${escapeHtml(item.linkUrl || '')}" placeholder="URL" aria-label="Profile URL">
                <div class="footer-icon-upload-wrap">
                    <input type="file" class="footer-social-icon-file" data-social-index="${index}" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
                    <button type="button" class="footer-settings-inline-add" data-action="upload-social-icon" data-social-index="${index}">
                        <i class="fa-solid fa-upload"></i> Upload
                    </button>
                    ${item.iconUrl ? `<img src="${escapeHtml(item.iconUrl)}" alt="" class="footer-icon-preview" data-social-preview="${index}">` : `<img src="" alt="" class="footer-icon-preview footer-icon-preview--empty" data-social-preview="${index}" hidden>`}
                </div>
                ${footerToggleHtml({
                    checked: item.isActive !== false,
                    inputClass: 'footer-social-active',
                    dataAttrs: { 'social-index': index },
                    variant: 'green',
                    label: 'Social link active'
                })}
                <button type="button" class="footer-settings-remove-btn" data-action="remove-social" data-social-index="${index}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </article>
    `).join('');

    container.querySelectorAll('.footer-social-icon-preset').forEach((select) => {
        const index = Number(select.dataset.socialIndex);
        const current = footerSettingsState.socialLinks[index];
        if (current?.iconName) select.value = current.iconName;
        select.addEventListener('change', () => {
            const preset = FOOTER_SOCIAL_PRESETS.find((p) => p.iconName === select.value);
            if (!preset) return;
            footerSettingsState.socialLinks[index].iconName = preset.iconName;
            footerSettingsState.socialLinks[index].platform = preset.platform;
            renderFooterSocialEditor();
            updateFooterSettingsPreview();
        });
    });
}

function renderFooterPaymentEditor() {
    const container = document.getElementById('footerPaymentEditor');
    if (!container) return;

    if (!footerSettingsState.paymentGateways.length) {
        container.innerHTML = `
            <div class="footer-settings-empty">
                <p>No payment badges yet. Add bKash, Nagad, Visa, Mastercard, or COD.</p>
            </div>`;
        return;
    }

    const presetOptions = FOOTER_PAYMENT_PRESETS.map((preset) =>
        `<option value="${escapeHtml(preset.iconName)}">${escapeHtml(preset.name)}</option>`
    ).join('');

    container.innerHTML = footerSettingsState.paymentGateways.map((item, index) => `
        <article class="footer-payment-card" data-payment-index="${index}">
            <div class="footer-payment-grid">
                <input type="text" class="footer-payment-name" data-payment-index="${index}" value="${escapeHtml(item.name || '')}" placeholder="Name" aria-label="Badge name">
                <select class="footer-payment-preset" data-payment-index="${index}" aria-label="Preset">
                    <option value="">Custom</option>
                    ${presetOptions}
                </select>
                <input type="text" class="footer-payment-icon-name" data-payment-index="${index}" value="${escapeHtml(item.iconName || '')}" placeholder="Key" aria-label="Icon key">
                <div class="footer-icon-upload-wrap">
                    <input type="file" class="footer-payment-icon-file" data-payment-index="${index}" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
                    <button type="button" class="footer-settings-inline-add" data-action="upload-payment-icon" data-payment-index="${index}">
                        <i class="fa-solid fa-upload"></i> Upload
                    </button>
                    ${item.iconUrl
                        ? `<img src="${escapeHtml(item.iconUrl)}" alt="" class="footer-icon-preview" data-payment-preview="${index}">`
                        : `<img src="" alt="" class="footer-icon-preview footer-icon-preview--empty" data-payment-preview="${index}" hidden>`}
                </div>
                ${footerToggleHtml({
                    checked: item.isActive !== false,
                    inputClass: 'footer-payment-active',
                    dataAttrs: { 'payment-index': index },
                    variant: 'green',
                    label: 'Payment badge active'
                })}
                <button type="button" class="footer-settings-remove-btn" data-action="remove-payment" data-payment-index="${index}" title="Delete badge">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </article>
    `).join('');

    container.querySelectorAll('.footer-payment-preset').forEach((select) => {
        const index = Number(select.dataset.paymentIndex);
        const current = footerSettingsState.paymentGateways[index];
        if (current?.iconName) select.value = current.iconName;
        select.addEventListener('change', () => {
            const preset = FOOTER_PAYMENT_PRESETS.find((p) => p.iconName === select.value);
            if (!preset) return;
            footerSettingsState.paymentGateways[index].iconName = preset.iconName;
            footerSettingsState.paymentGateways[index].name = preset.name;
            renderFooterPaymentEditor();
            updateFooterSettingsPreview();
        });
    });
}

function updatePaymentFormVisibilityUI() {
    const enabled = footerSettingsState.paymentBadgesEnabled !== false;
    const card = document.getElementById('footerPaymentBadgesCard');
    const body = document.getElementById('footerPaymentFormBody');
    const toggleBtn = document.getElementById('footerTogglePaymentFormBtn');
    const label = toggleBtn?.querySelector('span');
    const icon = toggleBtn?.querySelector('i');

    card?.classList.toggle('is-payment-form-hidden', !enabled);
    body?.classList.toggle('is-collapsed', !enabled);
    toggleBtn?.classList.toggle('is-hidden-mode', !enabled);

    if (label) label.textContent = enabled ? 'Hide Payment Form' : 'Show Payment Form';
    if (icon) {
        icon.className = enabled ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    }
}

async function toggleEntirePaymentForm() {
    footerSettingsState.paymentBadgesEnabled = !(footerSettingsState.paymentBadgesEnabled !== false);
    updatePaymentFormVisibilityUI();
    updateFooterSettingsPreview();
    await saveFooterSettings();
}

async function clearAllPaymentBadges() {
    if (!footerSettingsState.paymentGateways.length && footerSettingsState.paymentBadgesEnabled === false) {
        showToast('Payment badges form is already empty/hidden.', 'warning');
        return;
    }
    if (!confirm('Wipe the entire payment badges section from the storefront now?')) return;

    footerSettingsState.paymentGateways = [];
    footerSettingsState.paymentBadgesEnabled = false;
    renderFooterPaymentEditor();
    updatePaymentFormVisibilityUI();
    updateFooterSettingsPreview();
    await saveFooterSettings();
}

function updateFooterSettingsPreview() {
    const previewInner = document.getElementById('footerLivePreviewInner');
    if (!previewInner || !window.FooterRenderer?.buildFooterHtml) return;

    syncFooterStateFromDom();
    previewInner.innerHTML = window.FooterRenderer.buildFooterHtml(footerSettingsState);
}

function applyFooterSettingsToUI(data) {
    if (!data) return;
    footerSettingsState = {
        copyrightText: data.copyrightText || '',
        columns: Array.isArray(data.columns) ? JSON.parse(JSON.stringify(data.columns)) : [],
        socialLinks: Array.isArray(data.socialLinks) ? JSON.parse(JSON.stringify(data.socialLinks)) : [],
        paymentGateways: Array.isArray(data.paymentGateways) ? JSON.parse(JSON.stringify(data.paymentGateways)) : [],
        paymentBadgesEnabled: data.paymentBadgesEnabled !== false
    };

    // Migrate legacy name-only paymentBadges if gateways empty
    if (!footerSettingsState.paymentGateways.length && Array.isArray(data.paymentBadges) && data.paymentBadges.length) {
        footerSettingsState.paymentGateways = data.paymentBadges.map((badge, index) => {
            const name = typeof badge === 'string' ? badge : (badge?.name || '');
            return {
                name,
                iconName: String(name).toLowerCase().replace(/[^a-z0-9]+/g, ''),
                iconUrl: typeof badge === 'object' ? (badge.iconUrl || '') : '',
                isActive: true,
                sortOrder: index
            };
        }).filter((item) => item.name);
    }

    const copyrightEl = document.getElementById('footerCopyrightText');
    if (copyrightEl) copyrightEl.value = footerSettingsState.copyrightText;

    // Replace leftover '#' routes with matching CMS page slugs (e.g. Privacy Policy → /privacy-policy).
    autoLinkFooterCmsRoutes(true);

    renderFooterColumnsEditor();
    renderFooterSocialEditor();
    renderFooterPaymentEditor();
    updatePaymentFormVisibilityUI();
    updateFooterSettingsPreview();
}

function syncFooterStateFromDom() {
    const copyrightEl = document.getElementById('footerCopyrightText');
    if (copyrightEl) footerSettingsState.copyrightText = copyrightEl.value.trim();

    document.querySelectorAll('.footer-col-title-input').forEach((input) => {
        const index = Number(input.dataset.colIndex);
        if (footerSettingsState.columns[index]) {
            footerSettingsState.columns[index].columnTitle = input.value.trim();
        }
    });
    document.querySelectorAll('.footer-col-active').forEach((input) => {
        const index = Number(input.dataset.colIndex);
        if (footerSettingsState.columns[index]) {
            footerSettingsState.columns[index].isActive = input.checked;
        }
    });
    document.querySelectorAll('.footer-link-label').forEach((input) => {
        const colIndex = Number(input.dataset.colIndex);
        const linkIndex = Number(input.dataset.linkIndex);
        if (footerSettingsState.columns[colIndex]?.links?.[linkIndex]) {
            footerSettingsState.columns[colIndex].links[linkIndex].label = input.value.trim();
        }
    });
    document.querySelectorAll('.footer-link-url').forEach((input) => {
        const colIndex = Number(input.dataset.colIndex);
        const linkIndex = Number(input.dataset.linkIndex);
        if (footerSettingsState.columns[colIndex]?.links?.[linkIndex]) {
            footerSettingsState.columns[colIndex].links[linkIndex].url = input.value.trim();
        }
    });
    document.querySelectorAll('.footer-link-active').forEach((input) => {
        const colIndex = Number(input.dataset.colIndex);
        const linkIndex = Number(input.dataset.linkIndex);
        if (footerSettingsState.columns[colIndex]?.links?.[linkIndex]) {
            footerSettingsState.columns[colIndex].links[linkIndex].isActive = input.checked;
        }
    });

    document.querySelectorAll('.footer-social-platform').forEach((input) => {
        const index = Number(input.dataset.socialIndex);
        if (footerSettingsState.socialLinks[index]) footerSettingsState.socialLinks[index].platform = input.value.trim();
    });
    document.querySelectorAll('.footer-social-icon-name').forEach((input) => {
        const index = Number(input.dataset.socialIndex);
        if (footerSettingsState.socialLinks[index]) footerSettingsState.socialLinks[index].iconName = input.value.trim();
    });
    document.querySelectorAll('.footer-social-url').forEach((input) => {
        const index = Number(input.dataset.socialIndex);
        if (footerSettingsState.socialLinks[index]) footerSettingsState.socialLinks[index].linkUrl = input.value.trim();
    });
    document.querySelectorAll('.footer-social-active').forEach((input) => {
        const index = Number(input.dataset.socialIndex);
        if (footerSettingsState.socialLinks[index]) footerSettingsState.socialLinks[index].isActive = input.checked;
    });

    document.querySelectorAll('.footer-payment-name').forEach((input) => {
        const index = Number(input.dataset.paymentIndex);
        if (footerSettingsState.paymentGateways[index]) footerSettingsState.paymentGateways[index].name = input.value.trim();
    });
    document.querySelectorAll('.footer-payment-icon-name').forEach((input) => {
        const index = Number(input.dataset.paymentIndex);
        if (footerSettingsState.paymentGateways[index]) footerSettingsState.paymentGateways[index].iconName = input.value.trim();
    });
    document.querySelectorAll('.footer-payment-active').forEach((input) => {
        const index = Number(input.dataset.paymentIndex);
        if (footerSettingsState.paymentGateways[index]) footerSettingsState.paymentGateways[index].isActive = input.checked;
    });
}

function collectFooterSettingsPayload() {
    syncFooterStateFromDom();
    autoLinkFooterCmsRoutes(true);
    return {
        copyrightText: footerSettingsState.copyrightText,
        columns: footerSettingsState.columns.map((col, index) => ({
            columnTitle: col.columnTitle,
            isActive: col.isActive !== false,
            sortOrder: index,
            links: (col.links || []).map((link) => ({
                label: link.label,
                url: link.url || '#',
                isExternal: link.isExternal === true,
                isActive: link.isActive !== false
            }))
        })),
        socialLinks: footerSettingsState.socialLinks.map((item, index) => ({
            platform: item.platform,
            iconName: item.iconName || '',
            iconUrl: item.iconUrl || '',
            linkUrl: item.linkUrl || '#',
            isActive: item.isActive !== false,
            sortOrder: index
        })),
        paymentBadgesEnabled: footerSettingsState.paymentBadgesEnabled !== false,
        paymentGateways: footerSettingsState.paymentGateways.map((item, index) => ({
            name: item.name,
            iconName: item.iconName || '',
            iconUrl: item.iconUrl || '',
            isActive: item.isActive !== false,
            sortOrder: index
        })),
        paymentBadges: footerSettingsState.paymentGateways
            .filter((item) => item.isActive !== false && item.name)
            .map((item) => ({ name: item.name }))
    };
}

async function uploadFooterIcon(file, meta = {}) {
    const formData = new FormData();
    formData.append('icon', file);
    if (meta.platform) formData.append('platform', meta.platform);
    if (meta.name) formData.append('name', meta.name);
    if (meta.iconName) formData.append('iconName', meta.iconName);

    const res = await fetch('/api/admin/footer-settings/upload-icon', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Icon upload failed.');
    return result.data?.iconUrl || '';
}

window.fetchFooterSettings = async function fetchFooterSettings() {
    const manager = document.getElementById('footerSettingsManager');
    if (!manager) return;

    try {
        // Ensure CMS page catalog is available for route auto-suggest / auto-fill.
        if ((!Array.isArray(pageContentCatalog) || !pageContentCatalog.length)
            && typeof fetchPageContentCatalog === 'function') {
            try {
                await fetchPageContentCatalog();
            } catch (_) { /* catalog optional for load */ }
        }

        const res = await fetch('/api/admin/footer-settings', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to load footer settings.');
        applyFooterSettingsToUI(data.data);
    } catch (err) {
        console.error('Footer settings load error:', err);
        showToast(`Footer settings: ${err.message}`, 'error');
    }
};

async function saveFooterSettings() {
    const btn = document.getElementById('footerSettingsSaveBtn');
    const restore = setButtonLoading(btn, 'Saving...');

    try {
        const payload = collectFooterSettingsPayload();
        const res = await fetch('/api/admin/footer-settings', {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Failed to save footer settings.');
        showToast(result.message || 'Footer settings saved.', 'success');
        applyFooterSettingsToUI(result.data);

        // Sync Page Content Manager when footer links auto-create CMS pages
        const created = Array.isArray(result.createdPages) ? result.createdPages : [];
        if (created.length && typeof fetchPageContentCatalog === 'function') {
            const firstSlug = created[0]?.slug;
            if (firstSlug) activePageSlug = firstSlug;
            await fetchPageContentCatalog();
        } else if (typeof fetchPageContentCatalog === 'function') {
            await fetchPageContentCatalog();
        }
    } catch (err) {
        console.error('Save footer settings error:', err);
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        restore();
    }
}

function setupFooterSettingsManager() {
    document.getElementById('footerAddColumnBtn')?.addEventListener('click', () => {
        footerSettingsState.columns.push({
            id: footerTempId('col'),
            columnTitle: 'NEW COLUMN',
            isActive: true,
            sortOrder: footerSettingsState.columns.length,
            links: [{ label: 'New Link', url: '#', isExternal: false, isActive: true }]
        });
        renderFooterColumnsEditor();
        updateFooterSettingsPreview();
    });

    document.getElementById('footerAddSocialBtn')?.addEventListener('click', () => {
        footerSettingsState.socialLinks.push({
            id: footerTempId('social'),
            platform: 'Facebook',
            iconName: 'facebook',
            iconUrl: '',
            linkUrl: 'https://facebook.com/',
            isActive: true,
            sortOrder: footerSettingsState.socialLinks.length
        });
        renderFooterSocialEditor();
        updateFooterSettingsPreview();
    });

    document.getElementById('footerAddPaymentBtn')?.addEventListener('click', () => {
        if (footerSettingsState.paymentBadgesEnabled === false) {
            footerSettingsState.paymentBadgesEnabled = true;
            updatePaymentFormVisibilityUI();
        }
        footerSettingsState.paymentGateways.push({
            id: footerTempId('pay'),
            name: 'bKash',
            iconName: 'bkash',
            iconUrl: '',
            isActive: true,
            sortOrder: footerSettingsState.paymentGateways.length
        });
        renderFooterPaymentEditor();
        updateFooterSettingsPreview();
    });

    document.getElementById('footerTogglePaymentFormBtn')?.addEventListener('click', toggleEntirePaymentForm);
    document.getElementById('footerClearPaymentBadgesBtn')?.addEventListener('click', clearAllPaymentBadges);

    document.getElementById('footerSettingsSaveBtn')?.addEventListener('click', saveFooterSettings);
    document.getElementById('footerCopyrightText')?.addEventListener('input', updateFooterSettingsPreview);

    document.getElementById('footerColumnsEditor')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const colIndex = Number(btn.dataset.colIndex);

        if (btn.dataset.action === 'add-link') {
            footerSettingsState.columns[colIndex].links.push({
                label: 'New Link', url: '#', isExternal: false, isActive: true
            });
            renderFooterColumnsEditor();
            updateFooterSettingsPreview();
        } else if (btn.dataset.action === 'toggle-external') {
            const linkIndex = Number(btn.dataset.linkIndex);
            const link = footerSettingsState.columns[colIndex]?.links?.[linkIndex];
            if (link) {
                link.isExternal = !link.isExternal;
                btn.classList.toggle('is-active', link.isExternal);
                updateFooterSettingsPreview();
            }
        } else if (btn.dataset.action === 'remove-column') {
            footerSettingsState.columns.splice(colIndex, 1);
            renderFooterColumnsEditor();
            updateFooterSettingsPreview();
        } else if (btn.dataset.action === 'remove-link') {
            const linkIndex = Number(btn.dataset.linkIndex);
            footerSettingsState.columns[colIndex].links.splice(linkIndex, 1);
            renderFooterColumnsEditor();
            updateFooterSettingsPreview();
        }
    });

    document.getElementById('footerColumnsEditor')?.addEventListener('input', (e) => {
        const target = e.target;
        if (target?.classList?.contains('footer-link-label')) {
            const colIndex = Number(target.dataset.colIndex);
            const linkIndex = Number(target.dataset.linkIndex);
            const link = footerSettingsState.columns[colIndex]?.links?.[linkIndex];
            if (link && !link.isExternal) {
                link.label = target.value.trim();
                // Typing "Privacy Policy" auto-replaces empty/'#' with /privacy-policy.
                if (isFooterPlaceholderUrl(link.url) || isFooterPlaceholderUrl(
                    document.querySelector(
                        `.footer-link-url[data-col-index="${colIndex}"][data-link-index="${linkIndex}"]`
                    )?.value
                )) {
                    const page = findFooterCmsPageByLabel(link.label);
                    if (page?.slug) {
                        link.url = `/${page.slug}`;
                        link.isExternal = false;
                        const urlInput = document.querySelector(
                            `.footer-link-url[data-col-index="${colIndex}"][data-link-index="${linkIndex}"]`
                        );
                        const cmsSelect = document.querySelector(
                            `.footer-link-cms-page[data-col-index="${colIndex}"][data-link-index="${linkIndex}"]`
                        );
                        if (urlInput) urlInput.value = link.url;
                        if (cmsSelect) cmsSelect.value = page.slug;
                    }
                }
            }
        }
        updateFooterSettingsPreview();
    });

    document.getElementById('footerColumnsEditor')?.addEventListener('change', (e) => {
        const target = e.target;
        if (target?.classList?.contains('footer-link-cms-page')) {
            const colIndex = Number(target.dataset.colIndex);
            const linkIndex = Number(target.dataset.linkIndex);
            const link = footerSettingsState.columns[colIndex]?.links?.[linkIndex];
            const slug = String(target.value || '').trim();
            if (link && slug) {
                const page = (pageContentCatalog || []).find((p) => p.slug === slug);
                link.url = `/${slug}`;
                link.isExternal = false;
                if (!link.label || link.label === 'New Link' || isFooterPlaceholderUrl(link.label)) {
                    link.label = page?.title || slug;
                }
                const labelInput = document.querySelector(
                    `.footer-link-label[data-col-index="${colIndex}"][data-link-index="${linkIndex}"]`
                );
                const urlInput = document.querySelector(
                    `.footer-link-url[data-col-index="${colIndex}"][data-link-index="${linkIndex}"]`
                );
                if (labelInput && link.label) labelInput.value = link.label;
                if (urlInput) urlInput.value = link.url;
                const extBtn = document.querySelector(
                    `[data-action="toggle-external"][data-col-index="${colIndex}"][data-link-index="${linkIndex}"]`
                );
                extBtn?.classList.remove('is-active');
            }
        }
        updateFooterSettingsPreview();
    });

    document.getElementById('footerSocialEditor')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const index = Number(btn.dataset.socialIndex);

        if (btn.dataset.action === 'remove-social') {
            footerSettingsState.socialLinks.splice(index, 1);
            renderFooterSocialEditor();
            updateFooterSettingsPreview();
            return;
        }

        if (btn.dataset.action === 'upload-social-icon') {
            const fileInput = document.querySelector(`.footer-social-icon-file[data-social-index="${index}"]`);
            fileInput?.click();
        }
    });

    document.getElementById('footerSocialEditor')?.addEventListener('change', async (e) => {
        if (e.target.classList.contains('footer-social-icon-file')) {
            const index = Number(e.target.dataset.socialIndex);
            const file = e.target.files?.[0];
            if (!file) return;

            const previewImg = document.querySelector(`img[data-social-preview="${index}"]`);
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (typeof ev.target?.result === 'string') {
                    footerSettingsState.socialLinks[index].iconUrl = ev.target.result;
                    if (previewImg) {
                        previewImg.src = ev.target.result;
                        previewImg.hidden = false;
                    }
                    updateFooterSettingsPreview();
                }
            };
            reader.readAsDataURL(file);

            try {
                const item = footerSettingsState.socialLinks[index];
                const iconUrl = await uploadFooterIcon(file, {
                    platform: item?.platform,
                    iconName: item?.iconName
                });
                footerSettingsState.socialLinks[index].iconUrl = iconUrl;
                if (previewImg) previewImg.src = iconUrl;
                updateFooterSettingsPreview();
                showToast('Social icon uploaded.', 'success');
            } catch (err) {
                showToast(`Upload failed: ${err.message}`, 'error');
            } finally {
                e.target.value = '';
            }
            return;
        }
        updateFooterSettingsPreview();
    });

    document.getElementById('footerSocialEditor')?.addEventListener('input', updateFooterSettingsPreview);

    document.getElementById('footerPaymentEditor')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const index = Number(btn.dataset.paymentIndex);

        if (btn.dataset.action === 'remove-payment') {
            footerSettingsState.paymentGateways.splice(index, 1);
            renderFooterPaymentEditor();
            updateFooterSettingsPreview();
            return;
        }

        if (btn.dataset.action === 'upload-payment-icon') {
            const fileInput = document.querySelector(`.footer-payment-icon-file[data-payment-index="${index}"]`);
            fileInput?.click();
        }
    });

    document.getElementById('footerPaymentEditor')?.addEventListener('change', async (e) => {
        if (e.target.classList.contains('footer-payment-icon-file')) {
            const index = Number(e.target.dataset.paymentIndex);
            const file = e.target.files?.[0];
            if (!file) return;

            const previewImg = document.querySelector(`img[data-payment-preview="${index}"]`);
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (typeof ev.target?.result === 'string') {
                    footerSettingsState.paymentGateways[index].iconUrl = ev.target.result;
                    if (previewImg) {
                        previewImg.src = ev.target.result;
                        previewImg.hidden = false;
                    }
                    updateFooterSettingsPreview();
                }
            };
            reader.readAsDataURL(file);

            try {
                const item = footerSettingsState.paymentGateways[index];
                const iconUrl = await uploadFooterIcon(file, {
                    name: item?.name,
                    iconName: item?.iconName
                });
                footerSettingsState.paymentGateways[index].iconUrl = iconUrl;
                if (previewImg) previewImg.src = iconUrl;
                updateFooterSettingsPreview();
                showToast('Payment badge uploaded.', 'success');
            } catch (err) {
                showToast(`Upload failed: ${err.message}`, 'error');
            } finally {
                e.target.value = '';
            }
            return;
        }
        updateFooterSettingsPreview();
    });

    document.getElementById('footerPaymentEditor')?.addEventListener('input', updateFooterSettingsPreview);

    document.getElementById('footerSettingsManager')?.addEventListener('change', (e) => {
        if (e.target.classList.contains('footer-toggle-input')) {
            updateFooterSettingsPreview();
        }
    });
}

/* ==========================================================================
   PAGE CONTENT MANAGER (CMS → /api/admin/pages) — fully dynamic from DB
   ========================================================================== */

function titleToPageSlug(title = '') {
    return String(title || '')
        .trim()
        .toLowerCase()
        .replace(/^\/+/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function getPageContentTabLabel(page) {
    if (!page) return 'Page';
    return page.title || page.slug || 'Page';
}

function updatePageContentFooterActions() {
    const addBtn = document.getElementById('pageContentAddToFooterBtn');
    const saveBtn = document.getElementById('pageContentSaveBtn');
    const hasPage = Boolean(getActivePageState());
    if (addBtn) addBtn.style.display = hasPage ? '' : 'none';
    if (saveBtn) saveBtn.style.display = hasPage ? '' : 'none';
}

function renderPageContentTabs() {
    const tabs = document.getElementById('pageContentTabs');
    if (!tabs) return;

    if (!pageContentCatalog.length) {
        tabs.innerHTML = `
            <p class="page-content-empty-hint">
                No pages in the database yet. Click <strong>+ Create New Page</strong>,
                or save an internal footer link (e.g. <code>/return-policy</code>) under Footer Columns &amp; Links.
            </p>`;
        updatePageContentFooterActions();
        return;
    }

    tabs.innerHTML = pageContentCatalog.map((page) => `
        <button type="button" class="page-content-tab ${page.slug === activePageSlug ? 'is-active' : ''}" data-slug="${escapeHtml(page.slug)}" role="tab" title="/${escapeHtml(page.slug)}">
            ${escapeHtml(getPageContentTabLabel(page))}
        </button>
    `).join('');

    tabs.querySelectorAll('.page-content-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            syncPageContentFromDom();
            activePageSlug = btn.dataset.slug;
            renderPageContentTabs();
            renderPageContentEditor();
        });
    });
    updatePageContentFooterActions();
}

function getActivePageState() {
    return pageContentCatalog.find((p) => p.slug === activePageSlug) || null;
}

function destroyPageContentQuill() {
    pageContentQuill = null;
}

function buildPageContentQuillToolbarHtml() {
    return `
        <div id="pageContentQuillToolbar" class="navbar-link-quill-toolbar page-content-quill-toolbar">
            <span class="ql-formats">
                <select class="ql-font">
                    <option selected></option>
                    <option value="serif">Serif</option>
                    <option value="monospace">Monospace</option>
                    <option value="arial">Arial</option>
                    <option value="georgia">Georgia</option>
                    <option value="tahoma">Tahoma</option>
                    <option value="verdana">Verdana</option>
                    <option value="poppins">Poppins</option>
                    <option value="hind-siliguri">Hind Siliguri</option>
                </select>
                <select class="ql-size">
                    <option value="12px">12px</option>
                    <option value="14px">14px</option>
                    <option value="16px" selected></option>
                    <option value="18px">18px</option>
                    <option value="24px">24px</option>
                    <option value="32px">32px</option>
                    <option value="48px">48px</option>
                </select>
            </span>
            <span class="ql-formats">
                <button class="ql-bold" type="button"></button>
                <button class="ql-italic" type="button"></button>
                <button class="ql-underline" type="button"></button>
                <button class="ql-strike" type="button"></button>
            </span>
            <span class="ql-formats">
                <select class="ql-color"></select>
                <select class="ql-background"></select>
            </span>
            <span class="ql-formats">
                <button class="ql-list" value="ordered" type="button"></button>
                <button class="ql-list" value="bullet" type="button"></button>
                <select class="ql-align">
                    <option selected></option>
                    <option value="center"></option>
                    <option value="right"></option>
                    <option value="justify"></option>
                </select>
            </span>
            <span class="ql-formats">
                <button class="ql-link" type="button"></button>
                <button class="ql-image" type="button"></button>
                <button id="pageContentHtmlEmbedBtn" type="button" class="ql-html-embed" title="Insert HTML">HTML</button>
                <button class="ql-clean" type="button"></button>
            </span>
        </div>`;
}

function resolvePageContentEditorHtml(page) {
    if (!page) return '<p><br></p>';
    let html = '';
    if (page.contentFormat === 'html' && page.bodyHtml) {
        html = page.bodyHtml;
    } else if (page.bodyHtml && /<[a-z][\s\S]*>/i.test(page.bodyHtml) && !/&lt;\/?[a-z]/i.test(page.bodyHtml)) {
        html = page.bodyHtml;
    } else if (page.bodyMarkdown) {
        if (typeof window.MarkdownToHtml?.markdownToHtml === 'function') {
            html = window.MarkdownToHtml.markdownToHtml(page.bodyMarkdown);
        } else {
            html = page.bodyMarkdown;
        }
    } else if (page.bodyHtml) {
        html = page.bodyHtml;
    }
    html = decodeHtmlEntities(html);
    return html.trim() || '<p><br></p>';
}

function setPageContentQuillHtml(html) {
    const quill = pageContentQuill || ensurePageContentQuill();
    const safe = decodeHtmlEntities(String(html || '').trim()) || '<p><br></p>';
    if (!quill) {
        const hidden = document.getElementById('pageContentBodyHtml');
        if (hidden) hidden.value = safe === '<p><br></p>' ? '' : safe;
        return;
    }
    quill.setContents([]);
    quill.clipboard.dangerouslyPasteHTML(0, safe, 'silent');
    const hidden = document.getElementById('pageContentBodyHtml');
    if (hidden) hidden.value = decodeHtmlEntities(quill.root.innerHTML);
}

function getPageContentQuillHtml() {
    if (pageContentQuill) {
        const text = pageContentQuill.getText().replace(/\n/g, '').trim();
        if (!text && !pageContentQuill.root.querySelector('img,iframe')) return '';
        return decodeHtmlEntities(pageContentQuill.root.innerHTML);
    }
    return decodeHtmlEntities(document.getElementById('pageContentBodyHtml')?.value || '');
}

function ensurePageContentQuill() {
    if (pageContentQuill) return pageContentQuill;
    if (typeof Quill === 'undefined') {
        console.warn('Quill.js not loaded — page content rich editor unavailable.');
        return null;
    }
    const editorEl = document.getElementById('pageContentQuillEditor');
    const toolbarEl = document.getElementById('pageContentQuillToolbar');
    if (!editorEl || !toolbarEl) return null;

    registerNavbarLinkQuillFormats();
    pageContentQuill = new Quill(editorEl, {
        theme: 'snow',
        modules: {
            toolbar: {
                container: toolbarEl,
                handlers: {
                    image() {
                        pickNavbarLinkImage(this.quill);
                    }
                }
            }
        },
        placeholder: 'Write page content…'
    });

    document.getElementById('pageContentHtmlEmbedBtn')?.addEventListener('click', () => {
        insertNavbarLinkHtmlEmbed(pageContentQuill);
    });

    pageContentQuill.on('text-change', () => {
        const hidden = document.getElementById('pageContentBodyHtml');
        if (hidden) hidden.value = decodeHtmlEntities(pageContentQuill.root.innerHTML);
    });

    return pageContentQuill;
}

function renderPageContentEditor() {
    const editor = document.getElementById('pageContentEditor');
    if (!editor) return;

    destroyPageContentQuill();

    const page = getActivePageState();
    if (!page) {
        editor.innerHTML = `
            <div class="page-content-empty-state">
                <i class="fa-solid fa-file-circle-plus"></i>
                <p>No page selected. Create a page to start editing rich content.</p>
                <button type="button" class="page-content-create-btn" id="pageContentEmptyCreateBtn">
                    <i class="fa-solid fa-plus"></i> Create New Page
                </button>
            </div>`;
        document.getElementById('pageContentEmptyCreateBtn')?.addEventListener('click', openCreatePageModal);
        updatePageContentFooterActions();
        return;
    }

    const meta = page.contactMeta || {};
    const contactMetaFields = page.slug === 'contact' ? `
            <div class="page-content-contact-meta">
                <h5><i class="fa-solid fa-store"></i> Contact Page — Store Details</h5>
                <div class="page-content-form">
                    <div class="form-group form-group-full">
                        <label for="contactMetaAddress">Store Address</label>
                        <input type="text" id="contactMetaAddress" value="${escapeHtml(meta.address || '')}">
                    </div>
                    <div class="form-group">
                        <label for="contactMetaPhone">Phone</label>
                        <input type="text" id="contactMetaPhone" value="${escapeHtml(meta.phone || '')}">
                    </div>
                    <div class="form-group">
                        <label for="contactMetaEmail">Support Email</label>
                        <input type="email" id="contactMetaEmail" value="${escapeHtml(meta.email || '')}">
                    </div>
                    <div class="form-group form-group-full">
                        <label for="contactMetaHours">Operating Hours</label>
                        <textarea id="contactMetaHours" rows="3">${escapeHtml(meta.hours || '')}</textarea>
                    </div>
                    <div class="form-group form-group-full">
                        <label for="contactMetaMap">Google Maps Embed URL</label>
                        <input type="url" id="contactMetaMap" value="${escapeHtml(meta.mapEmbedUrl || '')}" placeholder="https://www.google.com/maps/embed?pb=...">
                    </div>
                </div>
            </div>` : '';

    editor.innerHTML = `
        <div class="page-content-form">
            <div class="form-group">
                <label for="pageContentTitle">Page Title</label>
                <input type="text" id="pageContentTitle" maxlength="120" value="${escapeHtml(page.title || '')}">
            </div>
            <div class="form-group">
                <label for="pageContentSubtitle">Subtitle (optional)</label>
                <input type="text" id="pageContentSubtitle" maxlength="240" value="${escapeHtml(page.subtitle || '')}">
            </div>
            <div class="form-group form-group-full">
                <label>Content (Rich Text)</label>
                <div class="navbar-link-quill-shell page-content-quill-shell">
                    ${buildPageContentQuillToolbarHtml()}
                    <div id="pageContentQuillEditor" class="navbar-link-quill-editor page-content-quill-editor" aria-label="Page content rich text editor"></div>
                </div>
                <textarea id="pageContentBodyHtml" class="sr-only" hidden aria-hidden="true"></textarea>
                <small class="field-hint">Styles (font size, color, etc.) are saved as raw HTML and rendered on the storefront.</small>
            </div>
            ${contactMetaFields}
            <div class="page-content-publish-row">
                ${footerToggleHtml({
                    checked: page.isPublished !== false,
                    inputClass: 'page-content-published',
                    variant: 'green',
                    label: 'Published on storefront'
                })}
                <div class="page-content-publish-copy">
                    <span class="page-content-publish-label">Published on storefront</span>
                    <small class="field-hint">When <strong>OFF</strong>: footer links to this page are hidden and direct visits show a 404 unavailable page.</small>
                </div>
                <span class="page-content-route-hint">Route: <code>/${escapeHtml(page.slug)}</code> · <code>/pages/${escapeHtml(page.slug)}</code></span>
            </div>
        </div>`;

    requestAnimationFrame(() => {
        ensurePageContentQuill();
        setPageContentQuillHtml(resolvePageContentEditorHtml(page));
    });
    updatePageContentFooterActions();
}

function syncPageContentFromDom() {
    const page = getActivePageState();
    if (!page) return;

    page.title = document.getElementById('pageContentTitle')?.value?.trim() || page.title;
    page.subtitle = document.getElementById('pageContentSubtitle')?.value?.trim() || '';
    page.bodyHtml = getPageContentQuillHtml();
    page.contentFormat = 'html';
    page.bodyMarkdown = '';
    page.isPublished = document.querySelector('.page-content-published')?.checked !== false;
    page.isActive = page.isPublished;

    if (page.slug === 'contact') {
        page.contactMeta = {
            address: document.getElementById('contactMetaAddress')?.value?.trim() || '',
            phone: document.getElementById('contactMetaPhone')?.value?.trim() || '',
            email: document.getElementById('contactMetaEmail')?.value?.trim() || '',
            hours: document.getElementById('contactMetaHours')?.value?.trim() || '',
            mapEmbedUrl: document.getElementById('contactMetaMap')?.value?.trim() || ''
        };
    }
}

function populateFooterColumnSelects() {
    const columns = Array.isArray(footerSettingsState?.columns) ? footerSettingsState.columns : [];
    const options = columns.length
        ? columns.map((col, idx) =>
            `<option value="${idx}">${escapeHtml(col.columnTitle || `Column ${idx + 1}`)}</option>`
        ).join('')
        : '<option value="0">No columns — add one under Footer Settings</option>';

    const createSelect = document.getElementById('createPageFooterColumn');
    const addSelect = document.getElementById('addPageToFooterColumn');
    if (createSelect) createSelect.innerHTML = options;
    if (addSelect) addSelect.innerHTML = options;
}

function syncCreatePageSlugPreview() {
    const slugInput = document.getElementById('createPageSlug');
    const preview = document.getElementById('createPageSlugPreview');
    if (!slugInput || !preview) return;
    const slug = titleToPageSlug(slugInput.value) || 'page-slug';
    preview.textContent = `/${slug}`;
}

function openCreatePageModal() {
    createPageSlugManual = false;
    const modal = document.getElementById('createPageModal');
    if (!modal) return;

    populateFooterColumnSelects();
    const titleEl = document.getElementById('createPageTitle');
    const slugEl = document.getElementById('createPageSlug');
    const subtitleEl = document.getElementById('createPageSubtitle');
    const mdEl = document.getElementById('createPageMarkdown');
    const addFooterEl = document.getElementById('createPageAddToFooter');
    if (titleEl) titleEl.value = '';
    if (slugEl) slugEl.value = '';
    if (subtitleEl) subtitleEl.value = '';
    if (mdEl) mdEl.value = '';
    if (addFooterEl) addFooterEl.checked = true;
    syncCreatePageSlugPreview();
    updateCreatePageFooterColumnVisibility();

    modal.style.display = 'flex';
    titleEl?.focus();
}

window.closeCreatePageModal = function closeCreatePageModal() {
    const modal = document.getElementById('createPageModal');
    if (modal) modal.style.display = 'none';
};

function updateCreatePageFooterColumnVisibility() {
    const checked = document.getElementById('createPageAddToFooter')?.checked;
    const select = document.getElementById('createPageFooterColumn');
    if (select) select.disabled = !checked;
}

async function submitCreatePage() {
    const title = document.getElementById('createPageTitle')?.value?.trim() || '';
    const slugRaw = document.getElementById('createPageSlug')?.value?.trim() || '';
    const slug = titleToPageSlug(slugRaw || title);
    const subtitle = document.getElementById('createPageSubtitle')?.value?.trim() || '';
    const bodyMarkdown = document.getElementById('createPageMarkdown')?.value || '';
    const addToFooter = document.getElementById('createPageAddToFooter')?.checked === true;
    const footerColumnIndex = Number(document.getElementById('createPageFooterColumn')?.value || 0);

    if (!title) {
        showToast('Page title is required.', 'error');
        return;
    }
    if (!slug) {
        showToast('A valid route / slug is required.', 'error');
        return;
    }

    const btn = document.getElementById('createPageSubmitBtn');
    const restore = setButtonLoading(btn, 'Creating...');

    try {
        const res = await fetch('/api/admin/pages', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title,
                slug,
                subtitle,
                bodyMarkdown: bodyMarkdown || `## ${title}\n\nWrite details here...`,
                isPublished: true,
                addToFooter,
                footerColumnIndex: addToFooter ? footerColumnIndex : undefined
            })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Failed to create page.');

        if (result.footer && typeof applyFooterSettingsToUI === 'function') {
            applyFooterSettingsToUI(result.footer);
        }

        activePageSlug = result.data?.slug || slug;
        closeCreatePageModal();
        await fetchPageContentCatalog();
        showToast(result.message || 'Page created.', 'success');
    } catch (err) {
        console.error('Create page error:', err);
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        restore();
    }
}

function openAddPageToFooterModal() {
    const page = getActivePageState();
    if (!page) return;
    populateFooterColumnSelects();
    const hint = document.getElementById('addPageToFooterHint');
    if (hint) {
        hint.innerHTML = `Add <strong>${escapeHtml(page.title)}</strong> (<code>/${escapeHtml(page.slug)}</code>) to a footer column.`;
    }
    const modal = document.getElementById('addPageToFooterModal');
    if (modal) modal.style.display = 'flex';
}

window.closeAddPageToFooterModal = function closeAddPageToFooterModal() {
    const modal = document.getElementById('addPageToFooterModal');
    if (modal) modal.style.display = 'none';
};

async function confirmAddPageToFooter() {
    const page = getActivePageState();
    if (!page) return;

    const columnIndex = Number(document.getElementById('addPageToFooterColumn')?.value || 0);
    const btn = document.getElementById('addPageToFooterConfirmBtn');
    const restore = setButtonLoading(btn, 'Adding...');

    try {
        const res = await fetch(`/api/admin/pages/${encodeURIComponent(page.slug)}/footer-link`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                columnIndex,
                label: page.title
            })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Failed to add footer link.');

        if (result.footer && typeof applyFooterSettingsToUI === 'function') {
            applyFooterSettingsToUI(result.footer);
        }

        closeAddPageToFooterModal();
        showToast(result.message || 'Linked to footer.', 'success');
    } catch (err) {
        console.error('Add page to footer error:', err);
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        restore();
    }
}

window.fetchPageContentCatalog = async function fetchPageContentCatalog() {
    const manager = document.getElementById('pageContentManager');
    if (!manager) return;

    try {
        const res = await fetch('/api/admin/pages', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to load pages.');

        // Only DB pages — never inject hardcoded default tabs
        pageContentCatalog = Array.isArray(data.data) ? data.data : [];
        if (!pageContentCatalog.find((p) => p.slug === activePageSlug)) {
            activePageSlug = pageContentCatalog[0]?.slug || '';
        }

        renderPageContentTabs();
        renderPageContentEditor();

        // Keep Footer Columns CMS dropdowns / '#' auto-links in sync with catalog.
        if (document.getElementById('footerColumnsEditor') && footerSettingsState.columns?.length) {
            const healed = autoLinkFooterCmsRoutes(true);
            renderFooterColumnsEditor();
            if (healed) updateFooterSettingsPreview();
        }
    } catch (err) {
        console.error('Page content load error:', err);
        const editor = document.getElementById('pageContentEditor');
        if (editor) editor.innerHTML = `<p class="page-content-loading">${escapeHtml(err.message)}</p>`;
        updatePageContentFooterActions();
    }
};

async function savePageContent() {
    syncPageContentFromDom();
    const page = getActivePageState();
    if (!page) return;

    const btn = document.getElementById('pageContentSaveBtn');
    const restore = setButtonLoading(btn, 'Saving...');

    try {
        const res = await fetch(`/api/admin/pages/${encodeURIComponent(page.slug)}`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: page.title,
                subtitle: page.subtitle,
                bodyHtml: decodeHtmlEntities(page.bodyHtml || ''),
                contentFormat: 'html',
                isPublished: page.isPublished !== false,
                isActive: page.isPublished !== false,
                contactMeta: page.slug === 'contact' ? page.contactMeta : undefined
            })
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Failed to save page.');

        const idx = pageContentCatalog.findIndex((p) => p.slug === page.slug);
        if (idx >= 0) pageContentCatalog[idx] = result.data;

        showToast(result.message || 'Page content saved.', 'success');
        renderPageContentTabs();
        renderPageContentEditor();
    } catch (err) {
        console.error('Save page content error:', err);
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        restore();
    }
}

function setupPageContentManager() {
    document.getElementById('pageContentSaveBtn')?.addEventListener('click', savePageContent);
    document.getElementById('pageContentCreateBtn')?.addEventListener('click', openCreatePageModal);
    document.getElementById('pageContentAddToFooterBtn')?.addEventListener('click', openAddPageToFooterModal);

    document.getElementById('createPageModalCloseBtn')?.addEventListener('click', closeCreatePageModal);
    document.getElementById('createPageCancelBtn')?.addEventListener('click', closeCreatePageModal);
    document.getElementById('createPageSubmitBtn')?.addEventListener('click', submitCreatePage);
    document.getElementById('createPageAddToFooter')?.addEventListener('change', updateCreatePageFooterColumnVisibility);

    document.getElementById('createPageTitle')?.addEventListener('input', (e) => {
        if (createPageSlugManual) return;
        const slugEl = document.getElementById('createPageSlug');
        if (slugEl) slugEl.value = titleToPageSlug(e.target.value);
        syncCreatePageSlugPreview();
    });
    document.getElementById('createPageSlug')?.addEventListener('input', () => {
        createPageSlugManual = true;
        syncCreatePageSlugPreview();
    });

    document.getElementById('addPageToFooterCloseBtn')?.addEventListener('click', closeAddPageToFooterModal);
    document.getElementById('addPageToFooterCancelBtn')?.addEventListener('click', closeAddPageToFooterModal);
    document.getElementById('addPageToFooterConfirmBtn')?.addEventListener('click', confirmAddPageToFooter);
}


function applyWhatsAppSettingsToUI(settings) {
    if (!settings) return;

    const publicEl = document.getElementById('publicSupportWhatsApp');
    if (publicEl && settings.publicSupportWhatsApp !== undefined) {
        publicEl.value = settings.publicSupportWhatsApp || '';
    }

    const privateEl = document.getElementById('privateAdminAlertWhatsApp');
    if (privateEl && settings.privateAdminAlertWhatsApp !== undefined) {
        privateEl.value = settings.privateAdminAlertWhatsApp || '';
    }

    const alertsToggle = document.getElementById('enableWhatsAppOrderAlerts');
    if (alertsToggle && settings.enableWhatsAppOrderAlerts !== undefined) {
        alertsToggle.checked = settings.enableWhatsAppOrderAlerts === true;
    }

    const providerEl = document.getElementById('whatsAppAlertProvider');
    if (providerEl && settings.whatsAppAlertProvider !== undefined) {
        providerEl.value = settings.whatsAppAlertProvider || '';
    }

    const apiKeyEl = document.getElementById('whatsAppAlertApiKey');
    if (apiKeyEl && settings.whatsAppAlertApiKey !== undefined) {
        apiKeyEl.value = settings.whatsAppAlertApiKey || '';
    }

    const instanceEl = document.getElementById('whatsAppAlertInstanceId');
    if (instanceEl && settings.whatsAppAlertInstanceId !== undefined) {
        instanceEl.value = settings.whatsAppAlertInstanceId || '';
    }

    updateWhatsAppSettingsPreview();
}

function updateWhatsAppSettingsPreview() {
    const previewEl = document.getElementById('whatsappSettingsPreviewText');
    if (!previewEl) return;

    const publicNumber = document.getElementById('publicSupportWhatsApp')?.value?.trim() || '';
    const privateNumber = document.getElementById('privateAdminAlertWhatsApp')?.value?.trim() || '';
    const alertsEnabled = document.getElementById('enableWhatsAppOrderAlerts')?.checked === true;
    const provider = document.getElementById('whatsAppAlertProvider')?.value || '';
    const hasApiKey = Boolean(document.getElementById('whatsAppAlertApiKey')?.value?.trim());

    if (!publicNumber && !privateNumber) {
        previewEl.textContent = 'Add a public customer number for storefront chat and a private admin number for order alerts.';
        return;
    }

    const publicLabel = publicNumber
        ? `Public chat: +${publicNumber.replace(/^88?/, '')} (live on storefront)`
        : 'Public chat: not set — storefront button will use the default fallback';
    const gatewayLabel = provider && hasApiKey
        ? `Auto-send via ${provider}`
        : 'No gateway — wa.me fallback badge in admin header when orders arrive';
    const alertLabel = alertsEnabled
        ? (privateNumber
            ? `Order alerts ON → private line …${privateNumber.slice(-4)} · ${gatewayLabel}`
            : 'Order alerts ON — add the private admin number to receive alerts')
        : 'Order alerts OFF';

    previewEl.textContent = `${publicLabel} · ${alertLabel}`;
}

function applyCourierSettingsToUI(settings) {
    if (!settings) return;

    cacheAdminCourierSettings(settings);

    const providerEl = document.getElementById('defaultCourierProvider');
    if (providerEl && settings.defaultCourierProvider !== undefined) {
        providerEl.value = normalizeAdminCourierSlug(settings.defaultCourierProvider || '');
    }

    const apiKeyEl = document.getElementById('courierApiKey');
    if (apiKeyEl && settings.courierApiKey !== undefined) {
        apiKeyEl.value = settings.courierApiKey || '';
    }

    const secretKeyEl = document.getElementById('courierSecretKey');
    if (secretKeyEl && settings.courierSecretKey !== undefined) {
        secretKeyEl.value = settings.courierSecretKey || '';
    }

    updateCourierSettingsPreview();
}

function updateCourierSettingsPreview() {
    const previewEl = document.getElementById('courierSettingsPreviewText');
    if (!previewEl) return;

    const provider = normalizeAdminCourierSlug(document.getElementById('defaultCourierProvider')?.value || '');
    const hasApiKey = Boolean(document.getElementById('courierApiKey')?.value?.trim());
    const hasSecretKey = Boolean(document.getElementById('courierSecretKey')?.value?.trim());

    toggleCourierCredentialPanels(provider);

    if (!provider) {
        previewEl.textContent = 'No provider selected — pick one to label the booking button in Live Orders.';
        return;
    }

    const providerLabel = COURIER_PROVIDER_LABELS[provider] || provider;

    if (provider === 'steadfast' && (!hasApiKey || !hasSecretKey)) {
        const missing = !hasApiKey && !hasSecretKey
            ? 'API key and secret key'
            : (!hasApiKey ? 'API key' : 'secret key');
        previewEl.textContent = `${providerLabel} selected — add the ${missing} to enable one-click booking.`;
        return;
    }

    if (provider === 'pathao') {
        previewEl.textContent = `${providerLabel} selected — configure PATHAO_* keys and PATHAO_STORE_ID in .env for live booking.`;
        return;
    }

    if (provider === 'redx') {
        previewEl.textContent = `${providerLabel} selected — configure REDX_API_TOKEN in .env for live booking.`;
        return;
    }

    previewEl.textContent = `${providerLabel} ready — "Send to Courier" is live on every unbooked order in Live Orders.`;
}

function toggleCourierCredentialPanels(provider = '') {
    const slug = normalizeAdminCourierSlug(provider || document.getElementById('defaultCourierProvider')?.value || '');
    const steadfastFields = document.getElementById('courierSteadfastFields');
    const steadfastSecret = document.getElementById('courierSteadfastSecretField');
    const pathaoPanel = document.getElementById('courierPathaoEnvPanel');
    const redxPanel = document.getElementById('courierRedxEnvPanel');
    const showSteadfast = !slug || slug === 'steadfast';

    if (steadfastFields) steadfastFields.style.display = showSteadfast ? '' : 'none';
    if (steadfastSecret) steadfastSecret.style.display = showSteadfast ? '' : 'none';
    if (pathaoPanel) pathaoPanel.style.display = slug === 'pathao' ? '' : 'none';
    if (redxPanel) redxPanel.style.display = slug === 'redx' ? '' : 'none';
}

function applySmsSettingsToUI(settings) {
    if (!settings) return;

    const smsToggle = document.getElementById('enableSmsNotifications');
    if (smsToggle && settings.enableSmsNotifications !== undefined) {
        smsToggle.checked = settings.enableSmsNotifications === true;
    }

    const providerEl = document.getElementById('smsGatewayProvider');
    if (providerEl && settings.smsGatewayProvider !== undefined) {
        providerEl.value = settings.smsGatewayProvider || '';
    }

    const apiKeyEl = document.getElementById('smsApiKey');
    if (apiKeyEl && settings.smsApiKey !== undefined) {
        apiKeyEl.value = settings.smsApiKey || '';
    }

    const senderEl = document.getElementById('smsSenderId');
    if (senderEl && settings.smsSenderId !== undefined) {
        senderEl.value = settings.smsSenderId || '';
    }

    updateSmsSettingsPreview();
}

function updateSmsSettingsPreview() {
    const previewEl = document.getElementById('smsSettingsPreviewText');
    if (!previewEl) return;

    const enabled = document.getElementById('enableSmsNotifications')?.checked === true;
    const provider = document.getElementById('smsGatewayProvider')?.value || '';
    const hasKey = Boolean(document.getElementById('smsApiKey')?.value?.trim());
    const senderId = document.getElementById('smsSenderId')?.value?.trim() || 'EOBAZAR';

    if (!enabled) {
        previewEl.textContent = 'Disabled — enable the toggle to send order and status SMS.';
        return;
    }

    if (!provider || !hasKey) {
        previewEl.textContent = 'Enabled — select a gateway provider and enter your API key to go live.';
        return;
    }

    previewEl.textContent = `Enabled — ${provider} · Sender: ${senderId} · credentials loaded from System Settings.`;
}

function applyFlashSaleSettingsToUI(settings) {
    if (!settings) return;

    const enabledEl = document.getElementById('flashSaleEnabled');
    if (enabledEl) enabledEl.checked = settings.flashSaleEnabled === true;

    const titleEl = document.getElementById('flashSaleTitle');
    if (titleEl && settings.flashSaleTitle !== undefined) titleEl.value = settings.flashSaleTitle || '';

    const discountEl = document.getElementById('flashSaleDiscountPercent');
    if (discountEl && settings.flashSaleDiscountPercent !== undefined) {
        discountEl.value = settings.flashSaleDiscountPercent;
    }

    const productsEl = document.getElementById('flashSaleProductIds');
    if (productsEl && Array.isArray(settings.flashSaleProductIds)) {
        productsEl.value = settings.flashSaleProductIds.join(', ');
    }

    const endDateEl = document.getElementById('flashSaleEndDate');
    const endTimeEl = document.getElementById('flashSaleEndTime');
    if (settings.flashSaleEndDate || settings.endsAt) {
        const end = new Date(settings.flashSaleEndDate || settings.endsAt);
        if (!Number.isNaN(end.getTime())) {
            if (endDateEl) endDateEl.value = end.toISOString().slice(0, 10);
            if (endTimeEl) endTimeEl.value = end.toTimeString().slice(0, 5);
        }
    }

    updateFlashSaleSettingsPreview();
}

function updateFlashSaleSettingsPreview() {
    const previewEl = document.getElementById('flashSaleSettingsPreviewText');
    if (!previewEl) return;

    const enabled = document.getElementById('flashSaleEnabled')?.checked === true;
    const title = document.getElementById('flashSaleTitle')?.value?.trim() || 'Flash Sale';
    const discount = Number(document.getElementById('flashSaleDiscountPercent')?.value || 0);
    const endDate = document.getElementById('flashSaleEndDate')?.value;
    const endTime = document.getElementById('flashSaleEndTime')?.value || '23:59';
    const productCount = (document.getElementById('flashSaleProductIds')?.value || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean).length;

    if (!enabled) {
        previewEl.textContent = 'Flash sale is currently inactive.';
        return;
    }

    if (!endDate || discount <= 0 || productCount === 0) {
        previewEl.textContent = `${title} enabled — add end date, discount, and at least one product ID to go live.`;
        return;
    }

    previewEl.textContent = `${title} · ${discount}% off · ${productCount} product(s) · ends ${endDate} ${endTime}`;
}

function applyAnnouncementSettingsToUI(settings) {
    if (!settings) return;

    const textEl = document.getElementById('announcementText');
    const activeEl = document.getElementById('isAnnouncementActive');

    if (textEl && settings.announcementText !== undefined) {
        textEl.value = settings.announcementText || '';
    }
    if (activeEl && settings.isAnnouncementActive !== undefined) {
        activeEl.checked = settings.isAnnouncementActive !== false;
    }

    updateAnnouncementSettingsPreview();
}

/**
 * Mirrors the server's announcement builder so the admin sees the exact
 * sentence customers will get before saving.
 */
function buildAnnouncementPreviewText() {
    const threshold = Number(document.getElementById('masterFreeShippingThreshold')?.value || 0);
    const cashback = Number(document.getElementById('masterCashbackPercentage')?.value || 0);
    const takaPerPoint = Number(document.getElementById('masterTakaToPointsRatio')?.value || 0);

    const shippingSentence = threshold > 0
        ? `Enjoy Free Shipping on orders over ৳${threshold.toLocaleString('en-US')}!`
        : 'Enjoy Free Shipping on every order!';

    const perks = [];
    if (cashback > 0) perks.push(`${cashback}% cashback straight to your wallet`);
    if (takaPerPoint > 0) perks.push(`1 loyalty point for every ৳${takaPerPoint.toLocaleString('en-US')} you spend`);

    return perks.length === 0
        ? shippingSentence
        : `${shippingSentence} Earn ${perks.join(' and ')}.`;
}

function updateAnnouncementSettingsPreview() {
    const previewEl = document.getElementById('announcementSettingsPreviewText');
    if (!previewEl) return;

    const isActive = document.getElementById('isAnnouncementActive')?.checked !== false;
    const customText = document.getElementById('announcementText')?.value?.trim() || '';

    if (!isActive) {
        previewEl.textContent = 'Announcement hidden from customer dashboard.';
        return;
    }

    previewEl.textContent = customText || buildAnnouncementPreviewText();
}

function updateMasterSettingsPreview() {
    const previewEl = document.getElementById('masterSettingsPreviewText');

    // The announcement copy quotes the cashback and points rates, so it has to
    // refresh whenever the rewards fields change too.
    updateAnnouncementSettingsPreview();
    updateSmsSettingsPreview();
    updateCourierSettingsPreview();
    updateWhatsAppSettingsPreview();
    if (!previewEl) return;

    const cashback = Number(document.getElementById('masterCashbackPercentage')?.value || 0);
    const takaRatio = Number(document.getElementById('masterTakaToPointsRatio')?.value || 100);
    const conversion = Number(document.getElementById('masterPointsConversionRate')?.value || 0);
    const refundHours = Number(document.getElementById('masterRefundUndoWindow')?.value || 0);
    const threshold = Number(document.getElementById('masterFreeShippingThreshold')?.value || 0);

    const pointsPerThousand = takaRatio > 0 ? (1000 / takaRatio).toFixed(2) : '0';
    let shippingNote = 'free shipping on every order';
    if (threshold > 0) {
        const thresholdLabel = `৳${threshold.toLocaleString('en-US')}`;
        shippingNote = 1000 >= threshold
            ? `free shipping (meets ${thresholdLabel} threshold)`
            : `shipping charged (${thresholdLabel} threshold not met)`;
    }
    previewEl.textContent =
        `৳1,000 order → ${cashback}% cashback (৳${(1000 * cashback / 100).toFixed(0)}) + ~${pointsPerThousand} pts · 100 pts → ৳${conversion} · Refund undo: ${refundHours}h · ${shippingNote}`;
}

async function fetchMasterSettings() {
    try {
        const res = await fetch('/api/admin/master-settings', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.data) {
            applyMasterSettingsToUI(data.data);
        } else {
            showToast(data.message || 'Failed to load system settings.', 'error');
        }
    } catch (err) {
        console.error('Failed to load system settings:', err);
        showToast('Error: Could not load system settings.', 'error');
    }

    // Payment catalog lives on its own endpoints — keep it in sync with System Settings.
    await fetchPaymentMethodsCatalog();
    await fetchFooterSettings();
    await fetchPageContentCatalog();
}

async function saveMasterSettings(payload) {
    const res = await fetch('/api/admin/master-settings/update', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    return res.json();
}

/**
 * Binds an isolated System Settings card form — only its fields are POSTed,
 * with a section-specific loading state and toast on success.
 */
function bindSystemSettingsSectionForm(formId, { getPayload, successMessage, onSuccess } = {}) {
    const form = document.getElementById(formId);
    if (!form || typeof getPayload !== 'function') return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = form.querySelector('.system-settings-save-btn');
        const restore = setButtonLoading(submitBtn, 'Saving...');

        try {
            const payload = getPayload();
            const result = await saveMasterSettings(payload);

            if (result.success) {
                showToast(successMessage || 'Settings updated successfully!', 'success');
                if (result.data) applyMasterSettingsToUI(result.data);
                if (typeof onSuccess === 'function') onSuccess(result);
            } else {
                showToast(`Error: ${result.message || 'Failed to save settings.'}`, 'error');
            }
        } catch (err) {
            console.error(`Save ${formId} error:`, err);
            showToast('Error: Could not reach the server. Please try again.', 'error');
        } finally {
            restore();
        }
    });
}

function setupSystemSettingsSectionForms() {
    bindSystemSettingsSectionForm('form-system-announcement', {
        successMessage: 'Announcement & shipping settings updated successfully!',
        getPayload: () => ({
            announcementText: document.getElementById('announcementText')?.value?.trim() || '',
            isAnnouncementActive: document.getElementById('isAnnouncementActive')?.checked !== false,
            freeShippingThreshold: document.getElementById('masterFreeShippingThreshold')?.value
        }),
        onSuccess: () => fetchAdminSettings()
    });

    bindSystemSettingsSectionForm('form-system-sms', {
        successMessage: 'SMS gateway settings updated successfully!',
        getPayload: () => ({
            enableSmsNotifications: document.getElementById('enableSmsNotifications')?.checked === true,
            smsGatewayProvider: document.getElementById('smsGatewayProvider')?.value || '',
            smsApiKey: document.getElementById('smsApiKey')?.value?.trim() || '',
            smsSenderId: document.getElementById('smsSenderId')?.value?.trim() || ''
        })
    });

    bindSystemSettingsSectionForm('form-system-courier', {
        successMessage: 'Courier booking settings updated successfully!',
        getPayload: () => ({
            defaultCourierProvider: document.getElementById('defaultCourierProvider')?.value || '',
            courierApiKey: document.getElementById('courierApiKey')?.value?.trim() || '',
            courierSecretKey: document.getElementById('courierSecretKey')?.value?.trim() || ''
        })
    });

    bindSystemSettingsSectionForm('form-system-whatsapp', {
        successMessage: 'WhatsApp configuration updated successfully!',
        getPayload: () => ({
            publicSupportWhatsApp: document.getElementById('publicSupportWhatsApp')?.value?.trim() || '',
            privateAdminAlertWhatsApp: document.getElementById('privateAdminAlertWhatsApp')?.value?.trim() || '',
            enableWhatsAppOrderAlerts: document.getElementById('enableWhatsAppOrderAlerts')?.checked === true,
            whatsAppAlertProvider: document.getElementById('whatsAppAlertProvider')?.value || '',
            whatsAppAlertApiKey: document.getElementById('whatsAppAlertApiKey')?.value?.trim() || '',
            whatsAppAlertInstanceId: document.getElementById('whatsAppAlertInstanceId')?.value?.trim() || ''
        })
    });

    setupPaymentMethodsManager();
    setupFooterSettingsManager();
    setupPageContentManager();
    setupMessagesInbox();

    bindSystemSettingsSectionForm('form-system-flash-sale', {
        successMessage: 'Flash sale settings updated successfully!',
        getPayload: () => ({
            flashSaleEnabled: document.getElementById('flashSaleEnabled')?.checked === true,
            flashSaleTitle: document.getElementById('flashSaleTitle')?.value?.trim() || 'Flash Sale',
            flashSaleEndDate: document.getElementById('flashSaleEndDate')?.value || '',
            flashSaleEndTime: document.getElementById('flashSaleEndTime')?.value || '23:59',
            flashSaleDiscountPercent: document.getElementById('flashSaleDiscountPercent')?.value,
            flashSaleProductIds: document.getElementById('flashSaleProductIds')?.value || ''
        })
    });

    bindSystemSettingsSectionForm('form-system-vip', {
        successMessage: 'VIP segmentation thresholds updated successfully!',
        getPayload: () => ({
            vipMinTotalSpent: document.getElementById('vipMinTotalSpent')?.value,
            vipMinOrderCount: document.getElementById('vipMinOrderCount')?.value,
            frequentBuyerMinOrders: document.getElementById('frequentBuyerMinOrders')?.value
        })
    });

    bindSystemSettingsSectionForm('form-system-catalog', {
        successMessage: 'Catalog pagination settings updated successfully!',
        getPayload: () => ({
            defaultProductsPerPage: document.getElementById('defaultProductsPerPage')?.value
        })
    });

    bindSystemSettingsSectionForm('form-system-rewards', {
        successMessage: 'Rewards & refund settings updated successfully!',
        getPayload: () => ({
            cashbackPercentage: document.getElementById('masterCashbackPercentage')?.value,
            takaToPointsRatio: document.getElementById('masterTakaToPointsRatio')?.value,
            pointsToTakaConversionRate: document.getElementById('masterPointsConversionRate')?.value,
            refundUndoWindowHours: document.getElementById('masterRefundUndoWindow')?.value
        })
    });
}

async function saveStoreBrandingForm(form) {
    const formData = new FormData(form);
    const logoFile = formData.get('logo');
    const faviconFile = formData.get('favicon');
    const hasLogo = logoFile instanceof File && logoFile.size > 0;
    const hasFavicon = faviconFile instanceof File && faviconFile.size > 0;

    if (!hasLogo && !hasFavicon) {
        showToast('Please choose a logo or favicon before saving.', 'warning');
        return;
    }

    const saveBtn = form.querySelector('button[type="submit"]');
    const restore = setButtonLoading(saveBtn, 'Saving...');

    try {
        const res = await fetch('/api/admin/upload-branding', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        let result;
        try {
            result = await res.json();
        } catch (parseErr) {
            throw new Error('Invalid server response.');
        }

        if (result.success) {
            showToast('Success: Store Branding updated successfully!', 'success');
            if (result.logoUrl) applyBrandingAsset('logo', result.logoUrl);
            if (result.faviconUrl) applyBrandingAsset('favicon', result.faviconUrl);
            window.__STORE_SETTINGS__ = {
                ...(window.__STORE_SETTINGS__ || {}),
                storeName: document.getElementById('settingsStoreName')?.value?.trim() || window.__STORE_SETTINGS__?.storeName || 'EonlineBazar',
                logoPath: result.logoUrl || window.__STORE_SETTINGS__?.logoPath || '',
                faviconPath: result.faviconUrl || window.__STORE_SETTINGS__?.faviconPath || '/images/favicon.png',
                logoUrl: result.logoUrl || window.__STORE_SETTINGS__?.logoUrl || '',
                faviconUrl: result.faviconUrl || window.__STORE_SETTINGS__?.faviconUrl || '/images/favicon.png',
                storeLogo: result.logoUrl || window.__STORE_SETTINGS__?.storeLogo || '',
                v: Date.now()
            };
            if (typeof window.notifyStoreBrandingUpdated === 'function') {
                window.notifyStoreBrandingUpdated();
            }
            if (typeof window.refreshStoreBranding === 'function') window.refreshStoreBranding();
            form.reset();
        } else {
            showToast(`Error: ${result.message || 'Failed to upload store branding.'}`, 'error');
            fetchAdminSettings();
        }
    } catch (err) {
        console.error('Store branding upload error:', err);
        showToast('Error: Could not reach the server. Please try again.', 'error');
        fetchAdminSettings();
    } finally {
        restore();
    }
}
window.saveStoreBranding = () => {
    const form = document.getElementById('storeBrandingForm');
    if (form) saveStoreBrandingForm(form);
};

/**
 * Handles a logo/favicon file selection: validates it and shows an instant local preview.
 */
function previewBrandingFile(input, assetType, label) {
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast(`Error: Please choose a valid image file for the ${label}.`, 'error');
        input.value = '';
        return;
    }

    showLocalBrandingPreview(assetType, file);

    const dropzone = document.getElementById(assetType === 'logo' ? 'logoPreviewBox' : 'faviconPreviewBox');
    if (dropzone) dropzone.classList.add('has-preview');

    showToast(`${label} ready — click "Save Store Branding" to publish it.`, 'info');
}

/**
 * বাটনকে সাময়িকভাবে লোডিং অবস্থায় নিয়ে যায় ("Saving..." + স্পিনার + disabled)
 * @returns {Function} restore() — বাটনকে আগের অবস্থায় ফিরিয়ে আনে
 */
function setButtonLoading(btn, loadingText = 'Saving...') {
    if (!btn) return () => {};
    const originalHTML = btn.innerHTML;
    const wasDisabled = btn.disabled;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${loadingText}`;
    return () => {
        btn.disabled = wasDisabled;
        btn.classList.remove('is-loading');
        btn.innerHTML = originalHTML;
    };
}

/**
 * নতুন লোগো/ফ্যাভিকন URL সঙ্গে সঙ্গে পুরো DOM-এ প্রয়োগ করে (রিফ্রেশ ছাড়াই)
 */
function applyBrandingAsset(assetType, url) {
    if (!url) return;

    if (assetType === 'logo') {
        setBrandingPreviewImage('logo', url);
    } else if (assetType === 'favicon') {
        setBrandingPreviewImage('favicon', url);
        updateSiteFaviconLink(url);
    }
}

/**
 * ফাইল সিলেক্ট করার সঙ্গে সঙ্গে লোকাল প্রিভিউ দেখায় (আপলোডের আগেই)
 */
function showLocalBrandingPreview(assetType, file) {
    revokeBrandingObjectUrl(assetType);
    const objectUrl = URL.createObjectURL(file);
    brandingPreviewObjectUrls[assetType] = objectUrl;
    setBrandingPreviewImage(assetType, objectUrl);
}

function setupAdminSettingsTabs() {
    const tabs = document.querySelectorAll('.admin-settings-tab');
    const panels = document.querySelectorAll('.admin-settings-panel');
    if (!tabs.length || !panels.length) return;

    const activateTab = (tab) => {
        const target = tab.dataset.tab;
        if (!target) return;

        tabs.forEach((t) => {
            const isActive = t === tab;
            t.classList.toggle('is-active', isActive);
            t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        panels.forEach((panel) => {
            const isActive = panel.dataset.panel === target;
            panel.classList.toggle('is-active', isActive);
            panel.hidden = !isActive;
        });

        if (target === 'profile' && typeof loadSandboxStatus === 'function') {
            loadSandboxStatus();
        }
    };

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => activateTab(tab));
    });
}

function assignBrandingFile(input, file, assetType, label) {
    if (!input || !file) return;
    if (!file.type.startsWith('image/')) {
        showToast(`Error: Please choose a valid image file for the ${label}.`, 'error');
        return;
    }

    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    showLocalBrandingPreview(assetType, file);

    const dropzone = document.getElementById(assetType === 'logo' ? 'logoPreviewBox' : 'faviconPreviewBox');
    if (dropzone) dropzone.classList.add('has-preview');

    showToast(`${label} ready — click "Save Store Branding" to publish it.`, 'info');
}

function setupBrandingDropzones() {
    const zones = document.querySelectorAll('.branding-dropzone[data-asset]');
    zones.forEach((zone) => {
        const assetType = zone.dataset.asset;
        const inputId = assetType === 'logo' ? 'settingsLogoInput' : 'settingsFaviconInput';
        const input = document.getElementById(inputId);
        const label = assetType === 'logo' ? 'Store logo' : 'Favicon';
        if (!input) return;

        const openPicker = () => input.click();

        zone.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            openPicker();
        });

        zone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPicker();
            }
        });

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('is-dragover');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('is-dragover');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('is-dragover');
            const file = e.dataTransfer?.files?.[0];
            if (file) assignBrandingFile(input, file, assetType, label);
        });
    });
}

function setupAdminSettingsForms() {
    populateShopHomeCityOptions();

    [
        'masterCashbackPercentage',
        'masterTakaToPointsRatio',
        'masterPointsConversionRate',
        'masterRefundUndoWindow',
        'masterFreeShippingThreshold',
        'announcementText',
        'isAnnouncementActive',
        'enableSmsNotifications',
        'smsGatewayProvider',
        'smsApiKey',
        'smsSenderId',
        'defaultCourierProvider',
        'courierApiKey',
        'courierSecretKey',
        'publicSupportWhatsApp',
        'privateAdminAlertWhatsApp',
        'enableWhatsAppOrderAlerts',
        'whatsAppAlertProvider',
        'whatsAppAlertApiKey',
        'whatsAppAlertInstanceId',
        'flashSaleTitle',
        'flashSaleEndDate',
        'flashSaleEndTime',
        'flashSaleDiscountPercent',
        'flashSaleProductIds',
        'vipMinTotalSpent',
        'vipMinOrderCount',
        'frequentBuyerMinOrders'
    ].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', updateMasterSettingsPreview);
        if (el.type === 'checkbox' || el.tagName === 'SELECT') {
            el.addEventListener('change', updateMasterSettingsPreview);
        }
    });

    const flashEnabledEl = document.getElementById('flashSaleEnabled');
    if (flashEnabledEl) {
        flashEnabledEl.addEventListener('change', updateFlashSaleSettingsPreview);
    }

    setupSystemSettingsSectionForms();

    const profileForm = document.getElementById('adminProfileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const displayName = document.getElementById('settingsDisplayName')?.value?.trim();
            const username = document.getElementById('settingsUsername')?.value?.trim();
            const email = document.getElementById('settingsAdminEmail')?.value?.trim() || '';
            const currentPassword = document.getElementById('settingsCurrentPassword')?.value;
            const newPassword = document.getElementById('settingsNewPassword')?.value;

            if (!currentPassword) {
                return showToast('Error: Current password is required to save changes.', 'warning');
            }

            const submitBtn = profileForm.querySelector('button[type="submit"]');
            const restore = setButtonLoading(submitBtn, 'Saving...');
            try {
                const result = await saveAdminProfile({
                    displayName,
                    username,
                    email,
                    currentPassword,
                    ...(newPassword ? { newPassword } : {})
                });

                if (result.success) {
                    showToast('Success: Admin Profile updated successfully!', 'success');
                    if (result.data) applyAdminSettingsToUI(result.data);
                    document.getElementById('settingsCurrentPassword').value = '';
                    document.getElementById('settingsNewPassword').value = '';
                    if (typeof window.refreshTwoFactorSettings === 'function') window.refreshTwoFactorSettings();

                    // Changing the username or password invalidates this token —
                    // the server already revoked every session, so sign back in.
                    if (result.requireRelogin) {
                        showToast(result.message || 'Please sign in again with your new credentials.', 'info');
                        setTimeout(() => { window.location.href = '/admin/logout'; }, 1800);
                    }
                } else {
                    showToast(`Error: ${result.message || 'Failed to update profile.'}`, 'error');
                }
            } catch (err) {
                console.error('Save profile error:', err);
                showToast('Error: Could not reach the server. Please try again.', 'error');
            } finally {
                restore();
            }
        });
    }

    const platformForm = document.getElementById('platformSettingsForm');
    if (platformForm) {
        platformForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('platformCurrentPassword')?.value;
            if (!currentPassword) return showToast('Error: Current password is required to save changes.', 'warning');

            const submitBtn = platformForm.querySelector('button[type="submit"]');
            const restore = setButtonLoading(submitBtn, 'Saving...');
            try {
                const result = await saveAdminSettings({
                    currentPassword,
                    storeName: document.getElementById('settingsStoreName')?.value?.trim(),
                    currency: document.getElementById('settingsCurrency')?.value?.trim(),
                    currencySymbol: document.getElementById('settingsCurrencySymbol')?.value?.trim(),
                    timezone: document.getElementById('settingsTimezone')?.value
                });

                if (result.success) {
                    showToast('Success: Platform preferences saved!', 'success');
                    applyAdminSettingsToUI(result.data);
                    document.getElementById('platformCurrentPassword').value = '';

                    if (result.requireRelogin) {
                        showToast(result.message || 'Please sign in again with your new credentials.', 'info');
                        setTimeout(() => { window.location.href = '/admin/logout'; }, 1800);
                    }
                } else {
                    showToast(`Error: ${result.message || 'Failed to save platform settings.'}`, 'error');
                }
            } catch (err) {
                console.error('Save platform settings error:', err);
                showToast('Error: Could not reach the server. Please try again.', 'error');
            } finally {
                restore();
            }
        });
    }

    const deliveryForm = document.getElementById('deliverySettingsForm');
    if (deliveryForm) {
        deliveryForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const shopHomeCity = document.getElementById('settingsShopHomeCity')?.value;
            const deliveryInsideCity = document.getElementById('settingsDeliveryInsideCity')?.value;
            const deliveryOutsideCity = document.getElementById('settingsDeliveryOutsideCity')?.value;
            const freeShippingMinAmount = document.getElementById('settingsFreeShippingMinAmount')?.value;

            const submitBtn = deliveryForm.querySelector('button[type="submit"]');
            const restore = setButtonLoading(submitBtn, 'Saving...');
            try {
                const result = await saveDeliverySettings({
                    shopHomeCity,
                    deliveryInsideCity,
                    deliveryOutsideCity,
                    freeShippingMinAmount
                });

                if (result.success) {
                    showToast('Success: Delivery settings saved successfully!', 'success');
                    if (result.data) applyDeliverySettingsToUI(result.data);
                    // System Settings shares the free-shipping threshold.
                    fetchMasterSettings();
                } else {
                    showToast(`Error: ${result.message || 'Failed to save delivery settings.'}`, 'error');
                }
            } catch (err) {
                console.error('Save delivery settings error:', err);
                showToast('Error: Could not reach the server. Please try again.', 'error');
            } finally {
                restore();
            }
        });
    }

    const brandingForm = document.getElementById('storeBrandingForm');
    if (brandingForm) {
        brandingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveStoreBrandingForm(brandingForm);
        });
    }

    const logoInput = document.getElementById('settingsLogoInput');
    if (logoInput) {
        logoInput.addEventListener('change', () => previewBrandingFile(logoInput, 'logo', 'Store logo'));
    }

    const favInput = document.getElementById('settingsFaviconInput');
    if (favInput) {
        favInput.addEventListener('change', () => previewBrandingFile(favInput, 'favicon', 'Favicon'));
    }

    setupAdminSettingsTabs();
    setupBrandingDropzones();
}

/**
 * ১৩.১: অ্যাডমিন প্রোফাইল পিকচার লাইভ প্রিভিউ ও সার্ভারে আপলোড
 * @param {Event} event - ফাইল ইনপুট ইভেন্ট
 */

/* ==========================================================================
   TWO-FACTOR AUTHENTICATION (2FA) — Admin self-service manager
   Email · Google Authenticator (TOTP) · SMS
========================================================================== */
(function () {
    const AUTH = () => ({ 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` });
    const toast = (m, t = 'success') => showToast(m, t);
    const $ = (id) => document.getElementById(id);

    let state = {
        method: 'email', twoFactorEnabled: true,
        totpConfigured: false, totpPending: false,
        phone: '', maskedPhone: '', maskedEmail: '', smsConfigured: false
    };

    /* ---- Small helpers ---- */

    function maskEmailFE(email) {
        if (!email) return 'Not set';
        const [user, domain] = String(email).split('@');
        if (!domain) return email;
        return user.slice(0, 2) + '***@' + domain;
    }

    const TWOFA_METHOD_LABELS = {
        email: 'Email OTP',
        totp: 'Google Authenticator',
        sms: 'SMS OTP'
    };

    async function confirmSwitchAuthMethod({
        title = 'Switch Authentication Method?',
        text = 'Are you sure you want to disable Google Authenticator and switch to Email OTP?'
    } = {}) {
        if (typeof window.showCustomConfirm === 'function') {
            return !!(await window.showCustomConfirm(title, text, null, 'danger'));
        }
        return window.confirm(`${title}\n\n${text}`);
    }

    // Put a button into a loading state; returns a restore() that reverses it.
    function setBusy(btn, label) {
        if (!btn) return () => {};
        if (btn.dataset.loading === '1') return () => {}; // already busy → ignore double clicks
        const html = btn.innerHTML;
        const wasDisabled = btn.disabled;
        btn.dataset.loading = '1';
        btn.disabled = true;
        btn.classList.add('is-loading');
        btn.innerHTML = `<span class="twofa-spinner" aria-hidden="true"></span> ${label || 'Please wait…'}`;
        return () => {
            btn.dataset.loading = '0';
            btn.disabled = wasDisabled;
            btn.classList.remove('is-loading');
            btn.innerHTML = html;
        };
    }

    // Unified JSON fetch. Never throws on non-2xx — returns { ok, status, data }.
    async function api(url, method = 'GET', body) {
        const opts = { method, headers: { ...AUTH() } };
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        const res = await fetch(url, opts);
        let data = {};
        try { data = await res.json(); } catch (_) { /* empty / non-JSON body */ }
        return { ok: res.ok, status: res.status, data };
    }

    async function loadStatus() {
        if (!$('twofaMethods')) return; // settings section not mounted yet
        try {
            const { data } = await api('/api/admin/2fa/status');
            if (data && data.success) { state = { ...state, ...data.data }; render(); }
        } catch (err) {
            console.error('2FA status load failed:', err);
        }
    }

    function setBadge(el, text, kind) {
        if (!el) return;
        el.textContent = text;
        el.dataset.state = kind; // off | ready | active
    }

    function render() {
        // Active-method highlight (drives the check icon + border via CSS)
        document.querySelectorAll('.twofa-method').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.method === state.method);
        });

        if ($('twofaEmailTarget')) {
            const masked = state.email ? maskEmailFE(state.email) : (state.maskedEmail || 'SMTP default');
            $('twofaEmailTarget').textContent = `OTP will be sent to: ${masked}`;
        }
        if ($('twofaEmailHint')) {
            const masked = state.email ? maskEmailFE(state.email) : (state.maskedEmail || 'SMTP default');
            $('twofaEmailHint').textContent = `OTP will be sent to: ${masked}`;
        }
        if ($('twofaTotpState')) $('twofaTotpState').textContent = state.totpConfigured ? 'Active & verified' : (state.totpPending ? 'Setup in progress' : 'Not configured');
        if ($('twofaSmsTarget')) $('twofaSmsTarget').textContent = state.maskedPhone ? `Code texted to ${state.maskedPhone}` : 'Add a phone number';

        // Status badges
        setBadge($('twofaEmailBadge'), state.method === 'email' ? 'Active' : 'Ready', state.method === 'email' ? 'active' : 'ready');
        setBadge($('twofaTotpBadge'),
            state.totpConfigured ? (state.method === 'totp' ? 'Active' : 'Configured') : 'Not set up',
            state.totpConfigured ? (state.method === 'totp' ? 'active' : 'ready') : 'off');
        setBadge($('twofaSmsBadge'),
            state.smsConfigured ? (state.method === 'sms' ? 'Active' : 'Configured') : 'Not set up',
            state.smsConfigured ? (state.method === 'sms' ? 'active' : 'ready') : 'off');

        // SMS panel visible when SMS selected OR a phone is already on file
        const showSms = state.method === 'sms' || state.smsConfigured;
        if ($('twofaPhoneGroup')) $('twofaPhoneGroup').style.display = showSms ? 'block' : 'none';
        if ($('twofaPhoneInput') && document.activeElement !== $('twofaPhoneInput')) $('twofaPhoneInput').value = state.phone || '';

        // TOTP panel visible when Authenticator selected OR already configured
        const showTotp = state.method === 'totp' || state.totpConfigured;
        if ($('twofaTotpPanel')) $('twofaTotpPanel').style.display = showTotp ? 'block' : 'none';
        if ($('twofaSetupTotpBtn') && $('twofaSetupTotpBtn').dataset.loading !== '1') {
            $('twofaSetupTotpBtn').innerHTML = state.totpConfigured
                ? '<i class="fa-solid fa-rotate"></i> Re-configure'
                : '<i class="fa-solid fa-qrcode"></i> Set up Google Authenticator';
        }
        if ($('twofaDisableTotpBtn')) $('twofaDisableTotpBtn').style.display = state.totpConfigured ? 'inline-flex' : 'none';
    }

    /* ---- Actions ---- */

    async function updateMethod(method, extra, srcBtn) {
        const restore = setBusy(srcBtn, 'Saving…');
        try {
            const { data } = await api('/api/admin/2fa/method', 'PUT', { method, ...(extra || {}) });
            if (!data.success) { toast(data.message || 'Failed to update 2FA method.', 'error'); return false; }
            state.method = data.data.method;
            state.phone = data.data.phone || state.phone;
            state.maskedPhone = data.data.maskedPhone || state.maskedPhone;
            if (state.phone) state.smsConfigured = true;
            toast(data.message, 'success');
            render();
            return true;
        } catch (err) {
            console.error('2FA method update failed:', err);
            toast('Server error updating 2FA method.', 'error');
            return false;
        } finally { restore(); }
    }

    async function onMethodClick(btn) {
        const method = btn.dataset.method;
        if (!method || method === state.method) return;

        // Authenticator not yet configured → reveal setup instead of switching.
        if (method === 'totp' && !state.totpConfigured) {
            document.querySelectorAll('.twofa-method').forEach(b => b.classList.toggle('active', b === btn));
            if ($('twofaTotpPanel')) $('twofaTotpPanel').style.display = 'block';
            toast('Set up Google Authenticator, then verify to activate it.', 'info');
            return;
        }
        // SMS not yet verified → reveal the phone + test-code panel.
        if (method === 'sms' && !state.smsConfigured) {
            document.querySelectorAll('.twofa-method').forEach(b => b.classList.toggle('active', b === btn));
            if ($('twofaPhoneGroup')) $('twofaPhoneGroup').style.display = 'block';
            if ($('twofaPhoneInput')) $('twofaPhoneInput').focus();
            toast('Add your phone number and verify it to enable SMS 2FA.', 'info');
            return;
        }

        const fromLabel = TWOFA_METHOD_LABELS[state.method] || 'the current method';
        const toLabel = TWOFA_METHOD_LABELS[method] || method;
        const switchText = state.method === 'totp' && method === 'email'
            ? 'Are you sure you want to disable Google Authenticator and switch to Email OTP?'
            : `Are you sure you want to switch from ${fromLabel} to ${toLabel}?`;

        const confirmed = await confirmSwitchAuthMethod({ text: switchText });
        if (!confirmed) return;

        await updateMethod(method, {}, btn);
    }

    async function onEditEmail(btn) {
        const current = String(state.email || '').trim();
        let nextEmail = current;

        if (typeof Swal !== 'undefined') {
            const result = await Swal.fire({
                title: 'Email for OTP Delivery',
                text: 'OTP codes will be sent to this address.',
                input: 'email',
                inputValue: current,
                inputPlaceholder: 'your@email.com',
                showCancelButton: true,
                confirmButtonText: 'Save Email',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#3b82f6',
                cancelButtonColor: '#94a3b8',
                inputValidator: (value) => {
                    const email = String(value || '').trim();
                    if (!email) return 'Enter an email address.';
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email address format.';
                    return null;
                }
            });
            if (!result.isConfirmed) return;
            nextEmail = String(result.value || '').trim().toLowerCase();
        } else {
            const typed = window.prompt('Email for OTP Delivery', current);
            if (typed == null) return;
            nextEmail = String(typed).trim().toLowerCase();
            if (!nextEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
                return toast('Invalid email address format.', 'error');
            }
        }

        const restore = setBusy(btn, 'Saving…');
        try {
            const { data } = await api('/api/admin/2fa/method', 'PUT', { email: nextEmail });
            if (!data.success) { toast(data.message || 'Failed to save email.', 'error'); return; }
            state.email = (data.data && data.data.email) || nextEmail;
            state.maskedEmail = (data.data && data.data.maskedEmail) || maskEmailFE(state.email);
            const profileEmail = document.getElementById('settingsAdminEmail');
            if (profileEmail) profileEmail.value = state.email || '';
            toast('OTP email updated.', 'success');
            render();
        } catch (err) {
            console.error('Save OTP email failed:', err);
            toast('Server error saving email.', 'error');
        } finally { restore(); }
    }

    async function onSavePhone(btn) {
        const phone = ($('twofaPhoneInput').value || '').trim();
        if (!phone) return toast('Please enter a phone number.', 'error');
        const restore = setBusy(btn, 'Saving…');
        try {
            // Save the phone WITHOUT forcing the method (empty method = keep current).
            const { data } = await api('/api/admin/2fa/method', 'PUT', { phone });
            if (!data.success) { toast(data.message || 'Failed to save phone number.', 'error'); return; }
            state.phone = (data.data && data.data.phone) || phone;
            state.maskedPhone = (data.data && data.data.maskedPhone) || state.maskedPhone;
            state.smsConfigured = !!state.phone;
            toast('Phone number saved. Send a test code to verify it.', 'success');
            render();
        } catch (err) {
            console.error('Save phone failed:', err);
            toast('Server error saving phone number.', 'error');
        } finally { restore(); }
    }

    async function onSendSms(btn) {
        const phone = ($('twofaPhoneInput').value || '').trim();
        if (!phone) return toast('Enter a phone number first.', 'error');
        const restore = setBusy(btn, 'Sending…');
        try {
            const { data } = await api('/api/admin/2fa/sms/send', 'POST', { phone });
            if (!data.success) { toast(data.message || 'Failed to send test code.', 'error'); return; }
            state.phone = phone;
            state.smsConfigured = true;
            if (data.maskedPhone) state.maskedPhone = data.maskedPhone;
            if ($('twofaSmsVerifyRow')) $('twofaSmsVerifyRow').style.display = 'block';
            if ($('twofaSmsHint')) $('twofaSmsHint').textContent = data.delivered
                ? `We texted a 6-digit code to ${data.maskedPhone}. It expires in ${data.expiresInMinutes || 5} minutes.`
                : 'Code generated. SMS is in console mode — check the server terminal for the 6-digit code.';
            if ($('twofaSmsCode')) { $('twofaSmsCode').value = ''; $('twofaSmsCode').focus(); }
            toast(data.delivered ? 'Test code sent via SMS.' : 'Code generated — check the server console.', data.delivered ? 'success' : 'info');
        } catch (err) {
            console.error('Send SMS code failed:', err);
            toast('Server error sending test code.', 'error');
        } finally { restore(); }
    }

    async function onVerifySms(btn) {
        const code = ($('twofaSmsCode').value || '').replace(/\D/g, '').trim();
        if (code.length !== 6) return toast('Enter the 6-digit code sent to your phone.', 'error');
        const restore = setBusy(btn, 'Verifying…');
        try {
            const { data } = await api('/api/admin/2fa/sms/verify', 'POST', { token: code });
            if (!data.success) { toast(data.message || 'Invalid code, please try again.', 'error'); return; }
            state.method = 'sms';
            state.smsConfigured = true;
            if (data.maskedPhone) state.maskedPhone = data.maskedPhone;
            toast('SMS OTP Activated Successfully', 'success');
            if ($('twofaSmsVerifyRow')) $('twofaSmsVerifyRow').style.display = 'none';
            render();
        } catch (err) {
            console.error('Verify SMS code failed:', err);
            toast('Server error verifying code.', 'error');
        } finally { restore(); }
    }

    async function onSetupTotp(btn) {
        const restore = setBusy(btn, 'Generating…');
        try {
            const { data } = await api('/api/admin/2fa/totp/setup', 'POST');
            if (!data.success) { toast(data.message || 'Failed to start setup.', 'error'); return; }
            if ($('twofaQrImg')) $('twofaQrImg').src = data.qrCode;
            if ($('twofaManualKey')) $('twofaManualKey').textContent = data.manualKey;
            if ($('twofaQrWrap')) $('twofaQrWrap').style.display = 'flex';
            if ($('twofaVerifyCode')) { $('twofaVerifyCode').value = ''; $('twofaVerifyCode').focus(); }
            state.totpPending = true;
        } catch (err) {
            console.error('TOTP setup failed:', err);
            toast('Server error during setup.', 'error');
        } finally { restore(); }
    }

    async function onVerifyTotp(btn) {
        const code = ($('twofaVerifyCode') && $('twofaVerifyCode').value || '').replace(/\D/g, '').trim();
        if (code.length !== 6) return toast('Enter the 6-digit code from your authenticator app.', 'error');
        const restore = setBusy(btn, 'Verifying…');
        try {
            const { data } = await api('/api/admin/2fa/totp/verify', 'POST', { token: code });
            if (!data.success) { toast(data.message || 'Invalid Code, please try again.', 'error'); return; }
            state.totpConfigured = true;
            state.method = 'totp';
            state.totpPending = false;
            toast('Google Authenticator Activated Successfully', 'success');
            if ($('twofaQrWrap')) $('twofaQrWrap').style.display = 'none';
            render();
        } catch (err) {
            console.error('TOTP verify failed:', err);
            toast('Server error during verification.', 'error');
        } finally { restore(); }
    }

    async function onDisableTotp(btn) {
        const confirmed = await confirmSwitchAuthMethod({
            text: 'Are you sure you want to disable Google Authenticator and switch to Email OTP?'
        });
        if (!confirmed) return;
        const restore = setBusy(btn, 'Disabling…');
        try {
            const { data } = await api('/api/admin/2fa/totp/disable', 'POST');
            if (!data.success) { toast(data.message || 'Failed to disable.', 'error'); return; }
            state.totpConfigured = false;
            state.method = 'email';
            state.totpPending = false;
            toast(data.message || 'Google Authenticator disabled.', 'success');
            if ($('twofaQrWrap')) $('twofaQrWrap').style.display = 'none';
            render();
        } catch (err) {
            console.error('TOTP disable failed:', err);
            toast('Server error.', 'error');
        } finally { restore(); }
    }

    /* ---- Event delegation (robust: works no matter when the DOM mounts) ---- */

    document.addEventListener('click', (e) => {
        if (!e.target || !e.target.closest) return;

        // Method tiles (spans inside the button also resolve to the tile)
        const tile = e.target.closest('.twofa-method');
        if (tile && $('twofaMethods') && $('twofaMethods').contains(tile)) {
            onMethodClick(tile);
            return;
        }

        const btn = e.target.closest('button');
        if (!btn || !btn.id) return;
        switch (btn.id) {
            case 'twofaEditEmailBtn':   onEditEmail(btn); break;
            case 'twofaSavePhoneBtn':   onSavePhone(btn); break;
            case 'twofaSendSmsBtn':     onSendSms(btn); break;
            case 'twofaVerifySmsBtn':   onVerifySms(btn); break;
            case 'twofaSetupTotpBtn':   onSetupTotp(btn); break;
            case 'twofaVerifyTotpBtn':  onVerifyTotp(btn); break;
            case 'twofaDisableTotpBtn': onDisableTotp(btn); break;
        }
    });

    // Enter key submits the code fields
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !e.target) return;
        if (e.target.id === 'twofaVerifyCode') { e.preventDefault(); onVerifyTotp($('twofaVerifyTotpBtn')); }
        else if (e.target.id === 'twofaSmsCode') { e.preventDefault(); onVerifySms($('twofaVerifySmsBtn')); }
    });

    // Public hook: called whenever the Settings view is opened
    window.refreshTwoFactorSettings = loadStatus;

    document.addEventListener('DOMContentLoaded', loadStatus);
    // If the module evaluates after DOMContentLoaded already fired, load now too.
    if (document.readyState !== 'loading') loadStatus();
})();

/* Hero banner management lives in js/admin-banner.js */



/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    applyAdminSettingsToUI,
    applyAnnouncementSettingsToUI,
    applyBrandingAsset,
    applyBrandingPreviewFromSettings,
    applyCourierSettingsToUI,
    applyDeliverySettingsToUI,
    applyFlashSaleSettingsToUI,
    applyFooterSettingsToUI,
    applyMasterSettingsToUI,
    applyRateLimitSettingsToUI,
    applySmsSettingsToUI,
    applyWhatsAppSettingsToUI,
    assignBrandingFile,
    autoLinkFooterCmsRoutes,
    bindPaymentMethodCardEvents,
    bindRateLimitSettingsForm,
    bindSystemSettingsSectionForm,
    buildAnnouncementPreviewText,
    buildPageContentQuillToolbarHtml,
    cacheBustBrandingUrl,
    checkGAStatus,
    clearAllPaymentBadges,
    collectFooterSettingsPayload,
    collectPaymentMethodOrderFromDom,
    confirmAddPageToFooter,
    deletePaymentMethod,
    destroyPageContentQuill,
    deviceIcon,
    ensurePageContentQuill,
    escapeHtml,
    fetchAdminSessions,
    fetchAdminSettings,
    fetchAuditLogs,
    fetchBlacklist,
    fetchMasterSettings,
    fetchRateLimitSettings,
    fetchSecurityLogs,
    findFooterCmsPageByLabel,
    footerCmsPageOptionsHtml,
    footerTempId,
    footerToggleHtml,
    formatDuration,
    formatProcessingFeeBadge,
    getActivePageState,
    getPageContentQuillHtml,
    getPageContentTabLabel,
    initAuditView,
    isCurrentSession,
    isFooterPlaceholderUrl,
    loadCacheSettings,
    loadCacheVersionDisplay,
    loadSandboxStatus,
    logoutAdminSession,
    logoutOtherAdminSessions,
    normalizeBrandingUrl,
    normalizeFooterMatchKey,
    openAddPageToFooterModal,
    openCreatePageModal,
    paymentMethodFallbackIcon,
    persistPaymentMethodOrder,
    populateDistrictSelect,
    populateFooterColumnSelects,
    populateShopHomeCityOptions,
    previewBrandingFile,
    refreshAuditActiveTab,
    removeBlacklist,
    renderFooterColumnsEditor,
    renderFooterPaymentEditor,
    renderFooterSocialEditor,
    renderPageContentEditor,
    renderPageContentTabs,
    renderPaymentMethodsGrid,
    renderSessionCards,
    resetPaymentMethodForm,
    resolvePageContentEditorHtml,
    restartCacheBuster,
    revokeBrandingObjectUrl,
    revokeSession,
    saveAdminProfile,
    saveAdminSettings,
    saveDeliverySettings,
    saveFooterSettings,
    saveMasterSettings,
    savePageContent,
    savePaymentMethodForm,
    saveStoreBrandingForm,
    setBrandingPreviewImage,
    setButtonLoading,
    setPageContentQuillHtml,
    setPaymentMethodLogoPreview,
    setupAdminSettingsForms,
    setupAdminSettingsTabs,
    setupAuditTabs,
    setupBrandingDropzones,
    setupFooterSettingsManager,
    setupPageContentManager,
    setupPaymentMethodsManager,
    setupSystemSettingsSectionForms,
    showLocalBrandingPreview,
    submitBlacklist,
    submitCreatePage,
    syncCreatePageSlugPreview,
    syncFooterStateFromDom,
    syncPageContentFromDom,
    timeAgo,
    titleToPageSlug,
    toggleCourierCredentialPanels,
    toggleEntirePaymentForm,
    togglePaymentMethodActive,
    togglePaymentMethodTypeFields,
    toggleServiceWorkerSetting,
    updateAnnouncementSettingsPreview,
    updateCourierSettingsPreview,
    updateCreatePageFooterColumnVisibility,
    updateFlashSaleSettingsPreview,
    updateFooterSettingsPreview,
    updateMasterSettingsPreview,
    updatePageContentFooterActions,
    updatePaymentFormVisibilityUI,
    updatePaymentMethodsPreview,
    updateRateLimitSettingsPreview,
    updateSessionsUI,
    updateSidebarStoreLogo,
    updateSiteFaviconLink,
    updateSmsSettingsPreview,
    updateWhatsAppSettingsPreview,
    uploadFooterIcon
});

