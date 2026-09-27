/**
 * System Health — live diagnostics from GET /api/admin/system/health
 */
import '../admin-core.js';
import { settingsFetchJson, isSettingsFetchFailure } from './settings-utils.js';

const AUTO_REFRESH_MS = 30_000;
let autoRefreshTimer = null;

function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUptime(seconds) {
    const s = Math.max(0, Number(seconds) || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

function applyHealthBadge(el, status) {
    if (!el) return;
    const normalized = String(status || 'offline').toLowerCase();
    el.className = `health-status-badge health-status-badge--${normalized}`;
    const labels = {
        healthy: 'Healthy',
        degraded: 'Degraded',
        offline: 'Offline',
        loading: 'Checking…'
    };
    el.textContent = labels[normalized] || normalized;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

async function loadStoreBuildVersion() {
    try {
        const response = await settingsFetchJson('/api/store/health', {}, { showToast: false });
        if (isSettingsFetchFailure(response)) {
            setText('settingsHealthCacheVersion', 'unknown');
            return;
        }
        const data = response.data;
        setText('settingsHealthCacheVersion', 'v' + (data?.buildTime || Date.now()));
    } catch (_) {
        setText('settingsHealthCacheVersion', 'unavailable');
    }
}

function renderHealthPayload(payload) {
    if (!payload) return;

    setText(
        'settingsHealthGeneratedAt',
        payload.generatedAt
            ? `Last updated: ${new Date(payload.generatedAt).toLocaleString()}`
            : 'Metrics loaded'
    );

    applyHealthBadge(document.getElementById('settingsHealthOverallBadge'), payload.overallStatus);

    const mongo = payload.databases?.mongodb || {};
    const pg = payload.databases?.postgresql || {};
    applyHealthBadge(document.getElementById('settingsHealthMongoBadge'), mongo.status);
    applyHealthBadge(document.getElementById('settingsHealthPgBadge'), pg.status);
    setText(
        'settingsHealthMongoLatency',
        mongo.latencyMs != null ? `${mongo.latencyMs} ms` : '—'
    );
    setText(
        'settingsHealthPgLatency',
        pg.latencyMs != null ? `${pg.latencyMs} ms` : '—'
    );

    const redis = payload.cache?.redis || {};
    applyHealthBadge(
        document.getElementById('settingsHealthRedisBadge'),
        payload.cache?.inMemoryFallback ? 'degraded' : redis.status
    );
    setText('settingsHealthCacheDriver', redis.driver || (payload.cache?.inMemoryFallback ? 'in-memory fallback' : '—'));
    setText(
        'settingsHealthRedisLatency',
        redis.latencyMs != null ? `${redis.latencyMs} ms` : '—'
    );
    setText(
        'settingsHealthRedisKeys',
        redis.keyCount != null ? String(redis.keyCount) : '—'
    );

    const sync = payload.syncQueue || {};
    setText('settingsHealthSyncFailures', String(sync.unresolvedDualWriteFailures ?? '—'));
    setText('settingsHealthPendingPgSync', String(sync.settingsPendingPgSync ?? '—'));
    setText('settingsHealthRateLimitHits', String(sync.rateLimitHits24h ?? '—'));

    const server = payload.server || {};
    const mem = server.memory || {};
    applyHealthBadge(document.getElementById('settingsHealthMemoryBadge'), mem.status);
    setText('settingsHealthUptime', formatUptime(server.uptimeSeconds));
    setText('settingsHealthHeapUsed', formatBytes(mem.heapUsedBytes));
    setText('settingsHealthRss', formatBytes(mem.rssBytes));
    setText(
        'settingsHealthLoad1',
        server.loadAverage?.['1m'] != null ? Number(server.loadAverage['1m']).toFixed(2) : '—'
    );
}

async function fetchSystemHealthMetrics() {
    const fetchResponse = await settingsFetchJson('/api/admin/system/health', {
        headers: { Authorization: `Bearer ${token}` }
    }, { showToast: false });

    if (fetchResponse.res?.status === 403) {
        if (typeof window.showToast === 'function') {
            window.showToast('You do not have permission to view system health.', 'error');
        }
        return null;
    }

    if (isSettingsFetchFailure(fetchResponse) || !fetchResponse.data?.success) {
        applyHealthBadge(document.getElementById('settingsHealthOverallBadge'), 'offline');
        setText('settingsHealthGeneratedAt', 'Could not load health metrics.');
        return null;
    }

    renderHealthPayload(fetchResponse.data.data);
    return fetchResponse.data.data;
}

async function loadSettingsHealthSection() {
    if (typeof window.applySuperAdminOnlyVisibility === 'function') {
        window.applySuperAdminOnlyVisibility();
    }
    await Promise.all([
        fetchSystemHealthMetrics(),
        loadStoreBuildVersion()
    ]);
}

function stopAutoRefresh() {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
}

function startAutoRefresh() {
    stopAutoRefresh();
    const toggle = document.getElementById('settingsHealthAutoRefresh');
    if (!toggle?.checked) return;
    autoRefreshTimer = setInterval(() => {
        const section = document.getElementById('view-settings-health');
        if (section?.classList.contains('active')) {
            fetchSystemHealthMetrics();
        }
    }, AUTO_REFRESH_MS);
}

async function confirmHealthAction(title, text) {
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title,
            text,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Proceed',
            cancelButtonText: 'Cancel',
            reverseButtons: true
        });
        return result.isConfirmed === true;
    }
    return window.confirm(`${title}\n\n${text}`);
}

async function purgeSystemCacheAction() {
    const ok = await confirmHealthAction(
        'Purge system cache?',
        'This clears Redis application cache keys (store, catalog, CMS). Storefront may briefly read fresh from the database.'
    );
    if (!ok) return;

    const fetchResponse = await settingsFetchJson('/api/admin/system/purge-cache', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    }, { showToast: false });

    if (fetchResponse.res?.status === 403) {
        window.showToast?.('Forbidden — manage_security required.', 'error');
        return;
    }

    const body = fetchResponse.data;
    if (body?.success) {
        window.showToast?.(body.message || 'Cache purged.', 'success');
        await fetchSystemHealthMetrics();
    } else {
        window.showToast?.(body?.message || 'Cache purge failed.', 'error');
    }
}

async function triggerManualSyncAction() {
    const ok = await confirmHealthAction(
        'Run manual sync reconciliation?',
        'Pending dual-write failures will be retried (supported entity handlers only).'
    );
    if (!ok) return;

    const fetchResponse = await settingsFetchJson('/api/admin/system/trigger-sync', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    }, { showToast: false });

    if (fetchResponse.res?.status === 403) {
        window.showToast?.('Forbidden — manage_security required.', 'error');
        return;
    }

    const body = fetchResponse.data;
    if (body?.success) {
        const d = body.data || {};
        window.showToast?.(
            `Sync complete — resolved ${d.resolved ?? 0} of ${d.attempted ?? 0} attempt(s).`,
            'success'
        );
        await fetchSystemHealthMetrics();
    } else {
        window.showToast?.(body?.message || 'Manual sync failed.', 'error');
    }
}

function bindSettingsHealthControls() {
    const refreshBtn = document.getElementById('settingsHealthRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = '1';
        refreshBtn.addEventListener('click', () => loadSettingsHealthSection());
    }

    const autoToggle = document.getElementById('settingsHealthAutoRefresh');
    if (autoToggle && !autoToggle.dataset.bound) {
        autoToggle.dataset.bound = '1';
        autoToggle.addEventListener('change', () => {
            if (autoToggle.checked) startAutoRefresh();
            else stopAutoRefresh();
        });
    }

    const purgeBtn = document.getElementById('settingsHealthPurgeCacheBtn');
    if (purgeBtn && !purgeBtn.dataset.bound) {
        purgeBtn.dataset.bound = '1';
        purgeBtn.addEventListener('click', () => purgeSystemCacheAction());
    }

    const syncBtn = document.getElementById('settingsHealthTriggerSyncBtn');
    if (syncBtn && !syncBtn.dataset.bound) {
        syncBtn.dataset.bound = '1';
        syncBtn.addEventListener('click', () => triggerManualSyncAction());
    }

    startAutoRefresh();
}

document.addEventListener('DOMContentLoaded', bindSettingsHealthControls);

window.loadSettingsHealthSection = loadSettingsHealthSection;
window.fetchSystemHealthMetrics = fetchSystemHealthMetrics;

export { loadSettingsHealthSection, fetchSystemHealthMetrics };
