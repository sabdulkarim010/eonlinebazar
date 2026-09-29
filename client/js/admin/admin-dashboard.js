/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/admin-dashboard.js
 * Description: Analytics widgets, revenue charts, and dashboard metrics.
 */

import './admin-core.js';
import { renderInventoryAlertsList } from './modules/admin-stock-alerts.js';
import {
    initDashboardQuickActions,
    applyDynamicQuickActionPermissions,
    updateDynamicMaintenanceLabel
} from './modules/dashboard-quick-actions.js';

/* ==========================================================================
   SECTION 5: OVERVIEW & ANALYTICS (ড্যাশবোর্ড ওভারভিউ এবং স্ট্যাটিস্টিকস)
   ========================================================================== */

let dashboardFetchController = null;
/** @type {'today'|'yesterday'|'7d'|'30d'|'this_month'|'custom'} */
let currentOverviewPeriod = '30d';
const OVERVIEW_AUTO_PULSE_MS = 60000;
let overviewAutoPulseTimer = null;
let overviewLastUpdatedLabelTimer = null;
let overviewLastUpdatedAt = null;
let overviewAutoPulsePaused = false;
let overviewLivePulseBound = false;
let customDateFrom = '';
let customDateTo = '';

window.currentOverviewPeriod = currentOverviewPeriod;
window.customDateFrom = customDateFrom;
window.customDateTo = customDateTo;

function isDashboardAbortError(error) {
    return error?.name === 'AbortError' || error?.name === 'TimeoutError';
}

function dashboardCan(permission) {
    if (typeof window.isAdminSuperAdmin === 'function' && window.isAdminSuperAdmin()) return true;
    if (typeof window.hasAdminPermission === 'function') return window.hasAdminPermission(permission);
    return true;
}

function dashboardFinancialsCan() {
    if (typeof window.isAdminSuperAdmin === 'function' && window.isAdminSuperAdmin()) return true;
    if (typeof window.hasAnyAdminPermission === 'function') {
        return window.hasAnyAdminPermission('view_financial_reports', 'view_accounts');
    }
    return dashboardCan('view_financial_reports') || dashboardCan('view_accounts');
}

function isDashboardFinancialsMasked(meta, permissions) {
    if (permissions?.canViewFinancials === false) return true;
    if (Array.isArray(meta?.maskedZones) && meta.maskedZones.includes('financials')) return true;
    return !dashboardFinancialsCan();
}

function applyDashboardFinancialZoneLocks(meta, permissions) {
    const masked = isDashboardFinancialsMasked(meta, permissions);

    document.querySelectorAll('#view-overview [data-permission="view_financial_reports"].zone-sensitive').forEach((el) => {
        el.classList.toggle('zone-locked', masked);
        const overlay = el.querySelector('.restricted-overlay');
        if (overlay) {
            overlay.hidden = !masked;
        }
    });

    const salesTrendTitle = document.getElementById('chart-sales-trend-title');
    if (salesTrendTitle) {
        salesTrendTitle.textContent = masked
            ? 'Sales Trend — Orders'
            : 'Sales Trend — Revenue vs Orders';
    }

    const topProductsSubtitle = document.getElementById('chart-top-products-subtitle');
    if (topProductsSubtitle) {
        topProductsSubtitle.textContent = masked ? 'By units sold' : 'By revenue & units';
    }
}

/**
 * Show dashboard widgets only when the signed-in admin has the matching permission.
 * Superadmin always sees everything (handled inside dashboardCan / hasAdminPermission).
 */
function applyDashboardWidgetPermissions() {
    const overview = document.getElementById('view-overview');
    if (!overview) return;

    const zoneAccess = {
        erp: dashboardCan('manage_orders') || dashboardCan('manage_inventory') || dashboardCan('view_orders'),
        crm: dashboardCan('manage_customers') || dashboardCan('view_customers'),
        analytics: dashboardCan('view_analytics'),
        finance: dashboardFinancialsCan(),
        hrm: dashboardCan('manage_staff') || dashboardCan('view_payroll')
    };

    overview.querySelectorAll('[data-dashboard-zone]').forEach((el) => {
        const zones = String(el.dataset.dashboardZone || '')
            .split(',')
            .map((zone) => zone.trim())
            .filter(Boolean);

        const allowed = zones.some((zone) => zoneAccess[zone]);
        el.style.display = allowed ? '' : 'none';
    });

    overview.querySelectorAll('.dashboard-section-label[data-dashboard-zone]').forEach((label) => {
        const zones = String(label.dataset.dashboardZone || '')
            .split(',')
            .map((zone) => zone.trim())
            .filter(Boolean);
        const allowed = zones.some((zone) => zoneAccess[zone]);
        label.style.display = allowed ? '' : 'none';
    });

    overview.querySelectorAll('.enterprise-widgets-grid').forEach((grid) => {
        const visibleCards = [...grid.querySelectorAll('[data-dashboard-zone]')]
            .filter((card) => card.style.display !== 'none');
        grid.style.display = visibleCards.length ? '' : 'none';
    });

    overview.querySelectorAll('.dashboard-charts-grid').forEach((grid) => {
        const visibleSections = [...grid.children].filter((child) => child.style.display !== 'none');
        grid.style.display = visibleSections.length ? '' : 'none';
    });

    overview.querySelectorAll('.metrics-grid').forEach((grid) => {
        const visibleCards = [...grid.querySelectorAll('.metric-card')]
            .filter((card) => card.style.display !== 'none');
        if (visibleCards.length === 0 && grid.dataset.dashboardZone) {
            grid.style.display = 'none';
        }
    });
}

/**
 * ৫.১: ড্যাশবোর্ডে বর্তমান তারিখ প্রদর্শন
 */
function updateDashboardDate(dateObj) {
    const textEl = document.getElementById('dateText');
    const d = dateObj instanceof Date && !isNaN(dateObj) ? dateObj : new Date();
    if (textEl) {
        const options = { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' };
        textEl.textContent = d.toLocaleDateString('en-US', options);
    }
}

/**
 * ৫.১ক: রিয়েল-টাইম লাইভ ঘড়ি (সেকেন্ড সহ) তারিখের ঠিক নিচে দেখানো
 */

/* shared state: __liveClockTimer lives on window (admin-core) */

function startLiveClock() {
    const clockEl = document.getElementById('clockText');
    if (!clockEl) return;

    const tick = () => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
            timeZone: adminPlatformTimezone || undefined
        });
    };

    tick();
    if (__liveClockTimer) clearInterval(__liveClockTimer);
    __liveClockTimer = setInterval(tick, 1000);
}

/**
 * ৫.১খ: হেডারের তারিখ ক্লিক করলে ক্যালেন্ডার পিকার খোলা, এবং তারিখ
 * নির্বাচন করলে তা হেডারে প্রদর্শন করা।
 */
function setupHeaderDatePicker() {
    const dateBtn = document.getElementById('current-date');
    const picker = document.getElementById('hiddenDatePicker');
    if (!dateBtn || !picker) return;

    // আজকের তারিখ পিকারে প্রি-ফিল করা
    const today = new Date();
    picker.value = today.toISOString().slice(0, 10);

    dateBtn.addEventListener('click', () => {
        // আধুনিক ব্রাউজারে নেটিভ ক্যালেন্ডার পপআপ খোলা; না পারলে ফোকাস ফলব্যাক
        if (typeof picker.showPicker === 'function') {
            try { picker.showPicker(); return; } catch (_) { /* fallback below */ }
        }
        picker.focus();
        picker.click();
    });

    picker.addEventListener('change', () => {
        if (picker.value) {
            updateDashboardDate(new Date(picker.value + 'T00:00:00'));
        }
    });

    setupDashboardOverviewPeriodControls();
    setupDashboardQuickActions();
    setupOverviewLivePulseEngine();
}

function isOverviewSectionActive() {
    const section = document.getElementById('view-overview');
    if (!section) return false;
    return section.classList.contains('active') || section.style.display !== 'none';
}

function formatOverviewLastUpdatedLabel(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return 'Updated —';
    }
    const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (diffSec < 15) return 'Updated just now';
    if (diffSec < 60) return `Updated ${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Updated ${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `Updated ${diffHr} hr ago`;
}

function refreshOverviewLastUpdatedLabel() {
    const label = document.getElementById('lbl-last-updated');
    if (!label) return;
    label.textContent = formatOverviewLastUpdatedLabel(overviewLastUpdatedAt);
}

function setOverviewPulseState(state) {
    const pulse = document.getElementById('dashboard-live-pulse');
    if (!pulse) return;

    pulse.classList.remove('is-refreshing', 'is-error', 'is-paused');
    if (state === 'refreshing') pulse.classList.add('is-refreshing');
    if (state === 'error') pulse.classList.add('is-error');
    if (state === 'paused') pulse.classList.add('is-paused');
}

function touchOverviewLastUpdated(success = true) {
    if (success) {
        overviewLastUpdatedAt = new Date();
        setOverviewPulseState('live');
        refreshOverviewLastUpdatedLabel();
        return;
    }
    setOverviewPulseState('error');
}

function stopOverviewAutoPulse() {
    if (overviewAutoPulseTimer) {
        clearInterval(overviewAutoPulseTimer);
        overviewAutoPulseTimer = null;
    }
}

function shouldRunOverviewAutoPulse() {
    if (overviewAutoPulsePaused) return false;
    if (document.hidden) return false;
    if (!isOverviewSectionActive()) return false;
    if (typeof window.hasAdminPermission === 'function' && !window.hasAdminPermission('view_analytics')) {
        return false;
    }
    return true;
}

async function runOverviewBackgroundRefresh() {
    if (!shouldRunOverviewAutoPulse()) return;
    await fetchDashboardData(undefined, undefined, undefined, { silent: true, source: 'auto' });
}

function startOverviewAutoPulse() {
    stopOverviewAutoPulse();
    if (!shouldRunOverviewAutoPulse()) return;

    overviewAutoPulseTimer = setInterval(() => {
        runOverviewBackgroundRefresh();
    }, OVERVIEW_AUTO_PULSE_MS);
}

function pauseOverviewAutoPulse(reason) {
    overviewAutoPulsePaused = reason !== false;
    stopOverviewAutoPulse();
    if (overviewAutoPulsePaused) {
        setOverviewPulseState('paused');
        const label = document.getElementById('lbl-last-updated');
        if (label) label.textContent = 'Auto-refresh paused';
    }
}

function resumeOverviewAutoPulse() {
    overviewAutoPulsePaused = false;
    if (typeof resetAdminPollErrors === 'function') {
        resetAdminPollErrors('dashboardOverviewBff');
        resetAdminPollErrors('dashboardAnalytics');
    }
    setOverviewPulseState('live');
    refreshOverviewLastUpdatedLabel();
    startOverviewAutoPulse();
}

function setupOverviewLivePulseEngine() {
    if (overviewLivePulseBound) return;
    overviewLivePulseBound = true;

    const refreshBtn = document.getElementById('btn-manual-refresh-overview');
    const spinIcon = document.getElementById('icon-refresh-spinner');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            if (spinIcon) spinIcon.classList.add('fa-spin');
            setOverviewPulseState('refreshing');
            try {
                await fetchDashboardData(undefined, undefined, undefined, {
                    silent: true,
                    source: 'manual'
                });
            } finally {
                if (spinIcon) spinIcon.classList.remove('fa-spin');
            }
        });
    }

    if (!overviewLastUpdatedLabelTimer) {
        overviewLastUpdatedLabelTimer = setInterval(refreshOverviewLastUpdatedLabel, 15000);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopOverviewAutoPulse();
            return;
        }
        if (isOverviewSectionActive()) {
            startOverviewAutoPulse();
            runOverviewBackgroundRefresh();
        }
    });

    window.addEventListener('admin:section-changed', (event) => {
        const sectionId = event?.detail?.sectionId;
        if (sectionId === 'view-overview') {
            resumeOverviewAutoPulse();
            return;
        }
        stopOverviewAutoPulse();
    });

    touchOverviewLastUpdated(true);
    startOverviewAutoPulse();
}

function quickActionCan(permissionKey) {
    if (typeof window.isAdminSuperAdmin === 'function' && window.isAdminSuperAdmin()) return true;
    if (typeof window.hasAdminPermission === 'function') {
        return window.hasAdminPermission(permissionKey);
    }
    return true;
}

function applyDashboardQuickActionPermissions() {
    applyDynamicQuickActionPermissions();
}

function updateMaintenanceQuickActionLabel(enabled) {
    updateDynamicMaintenanceLabel(enabled);
}

async function fetchQuickActionsStatus(fetchSignal) {
    if (!quickActionCan('manage_settings')) return null;

    try {
        const response = await fetch('/api/admin/dashboard/quick-actions/status', {
            method: 'GET',
            headers: adminDashboardAuthHeaders(),
            signal: fetchSignal
        });

        if (response.status === 401 || response.status === 403) {
            if (typeof handleAdminApiAuthResponse === 'function') {
                handleAdminApiAuthResponse(response, {});
            }
            return null;
        }

        if (!response.ok) return null;

        const payload = await response.json();
        if (!payload.success || !payload.data) return null;

        updateMaintenanceQuickActionLabel(payload.data.maintenanceMode === true);
        return payload.data;
    } catch (error) {
        if (isDashboardAbortError(error)) return null;
        return null;
    }
}

async function toggleMaintenanceFromQuickAction() {
    if (!quickActionCan('manage_settings')) {
        showToast('You do not have permission to change maintenance mode.', 'warning');
        return;
    }

    const confirmToggle = async () => {
        const token = window.token || window.EOBStorage.get(window.EOBStorageKeys.ADMIN_TOKEN) || '';
        const response = await fetch('/api/admin/dashboard/quick-actions/maintenance-toggle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            }
        });

        if (response.status === 401 || response.status === 403) {
            if (typeof handleAdminApiAuthResponse === 'function') {
                handleAdminApiAuthResponse(response, {});
            }
            return;
        }

        const payload = await response.json();
        if (!response.ok || !payload.success) {
            showToast(payload.message || 'Could not toggle maintenance mode.', 'error');
            return;
        }

        updateMaintenanceQuickActionLabel(payload.data?.maintenanceMode === true);
        showToast(
            payload.data?.maintenanceMode ? 'Maintenance mode is ON.' : 'Maintenance mode is OFF.',
            payload.data?.maintenanceMode ? 'warning' : 'success'
        );
    };

    if (typeof Swal !== 'undefined') {
        const label = document.getElementById('lbl-maintenance-status');
        const maintenanceLabel = document.querySelector('[data-maintenance-label]');
        const turningOn = maintenanceLabel?.textContent?.includes('Off')
            || label?.textContent?.includes('Off');
        const result = await Swal.fire({
            title: turningOn ? 'Enable maintenance mode?' : 'Disable maintenance mode?',
            text: turningOn
                ? 'Customers will see the maintenance page until you turn this off.'
                : 'The storefront will become publicly available again.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: turningOn ? 'Turn ON' : 'Turn OFF',
            confirmButtonColor: turningOn ? '#dc2626' : '#3b82f6'
        });
        if (!result.isConfirmed) return;
    }

    try {
        await confirmToggle();
    } catch (err) {
        showToast('Server error while toggling maintenance.', 'error');
    }
}

function navigateAdminQuickAction(sectionId) {
    const nav = document.querySelector(`[data-target="${sectionId}"]`);
    if (typeof navigateAdminSection === 'function') {
        navigateAdminSection(sectionId, nav || null);
        return true;
    }
    if (nav) {
        nav.click();
        return true;
    }
    return false;
}

async function runQuickActionCreateOrder() {
    if (!quickActionCan('view_orders')) return;
    navigateAdminQuickAction('view-orders');
    if (typeof window.openManualOrderModal === 'function') {
        await window.openManualOrderModal();
    } else {
        navigateAdminQuickAction('view-pos');
    }
}

function bindEnterpriseWidgetLinks() {
    document.querySelectorAll('#view-overview [data-enterprise-nav]').forEach((btn) => {
        if (btn.dataset.boundEnterpriseNav) return;
        btn.dataset.boundEnterpriseNav = '1';
        btn.addEventListener('click', () => {
            const sectionId = btn.getAttribute('data-enterprise-nav');
            if (sectionId) navigateAdminQuickAction(sectionId);
        });
    });
}

function setupDashboardQuickActions() {
    initDashboardQuickActions({
        can: quickActionCan,
        navigate: navigateAdminQuickAction,
        onCreateOrder: runQuickActionCreateOrder,
        onToggleMaintenance: toggleMaintenanceFromQuickAction,
        updateMaintenanceLabel: updateMaintenanceQuickActionLabel,
        authHeaders: adminDashboardAuthHeaders
    });
    bindEnterpriseWidgetLinks();
    applyDashboardQuickActionPermissions();
}

function syncOverviewPeriodStateToWindow() {
    window.currentOverviewPeriod = currentOverviewPeriod;
    window.customDateFrom = customDateFrom;
    window.customDateTo = customDateTo;
}

function buildDashboardOverviewQueryString() {
    if (currentOverviewPeriod === 'custom' && customDateFrom && customDateTo) {
        const params = new URLSearchParams({
            period: 'custom',
            from: customDateFrom,
            to: customDateTo
        });
        return params.toString();
    }

    const params = new URLSearchParams({
        period: currentOverviewPeriod || '30d'
    });
    return params.toString();
}

function syncOverviewPeriodToUrl() {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;

    const url = new URL(window.location.href);
    const onOverview = (url.searchParams.get('view') || 'view-overview') === 'view-overview';
    if (!onOverview) return;

    if (currentOverviewPeriod === 'custom' && customDateFrom && customDateTo) {
        url.searchParams.set('period', 'custom');
        url.searchParams.set('from', customDateFrom);
        url.searchParams.set('to', customDateTo);
    } else {
        url.searchParams.set('period', currentOverviewPeriod || '30d');
        url.searchParams.delete('from');
        url.searchParams.delete('to');
    }

    window.history.replaceState({}, '', url);
}

function hydrateOverviewPeriodFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const period = String(params.get('period') || '').trim().toLowerCase();
    const from = String(params.get('from') || '').trim();
    const to = String(params.get('to') || '').trim();

    const valid = new Set(['today', 'yesterday', '7d', '30d', 'this_month', 'custom']);
    if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to) {
        currentOverviewPeriod = 'custom';
        customDateFrom = from;
        customDateTo = to;
    } else if (valid.has(period) && period !== 'custom') {
        currentOverviewPeriod = period;
        customDateFrom = '';
        customDateTo = '';
    }

    syncOverviewPeriodStateToWindow();
    updateDashboardPeriodSelectUi();
}

function updateDashboardPeriodSelectUi() {
    const select = document.getElementById('dashboard-period-select');
    const customWrap = document.getElementById('custom-date-inputs');
    const fromInput = document.getElementById('dashboard-date-from');
    const toInput = document.getElementById('dashboard-date-to');

    if (select) {
        select.value = currentOverviewPeriod;
    }

    const showCustom = currentOverviewPeriod === 'custom';
    if (customWrap) {
        customWrap.hidden = !showCustom;
    }

    if (fromInput && customDateFrom) fromInput.value = customDateFrom;
    if (toInput && customDateTo) toInput.value = customDateTo;
}

function setDashboardOverviewPeriod(period, fromDate, toDate) {
    currentOverviewPeriod = period || '30d';

    if (currentOverviewPeriod === 'custom') {
        customDateFrom = fromDate || '';
        customDateTo = toDate || '';
    } else {
        customDateFrom = '';
        customDateTo = '';
    }

    syncOverviewPeriodStateToWindow();
    updateDashboardPeriodSelectUi();
    syncOverviewPeriodToUrl();
}

function setupDashboardOverviewPeriodControls() {
    const select = document.getElementById('dashboard-period-select');
    const customWrap = document.getElementById('custom-date-inputs');
    const fromInput = document.getElementById('dashboard-date-from');
    const toInput = document.getElementById('dashboard-date-to');
    const applyBtn = document.getElementById('btn-apply-custom-date');

    if (!select) return;

    hydrateOverviewPeriodFromUrl();

    select.addEventListener('change', () => {
        const selected = select.value || '30d';
        if (selected === 'custom') {
            currentOverviewPeriod = 'custom';
            syncOverviewPeriodStateToWindow();
            if (customWrap) customWrap.hidden = false;
            return;
        }

        setDashboardOverviewPeriod(selected);
        fetchDashboardData();
    });

    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            const from = fromInput?.value?.trim() || '';
            const to = toInput?.value?.trim() || '';

            if (!from || !to) {
                showToast('Select both start and end dates.', 'warning');
                return;
            }
            if (from > to) {
                showToast('Start date must be on or before end date.', 'warning');
                return;
            }

            setDashboardOverviewPeriod('custom', from, to);
            fetchDashboardData();
        });
    }
}

/**
 * ৫.২: সার্ভার থেকে ড্যাশবোর্ডের প্রাথমিক ডাটা (কাস্টমার ও স্ট্যাটস) নিয়ে আসা
 * Overview পেজ এবং All Customers পেজ উভয়ের জন্যই এই ফাংশনটি কাজ করবে
 */
function adminDashboardAuthHeaders() {
    const authToken = window.token || window.EOBStorage.get(window.EOBStorageKeys.ADMIN_TOKEN) || '';
    return { Authorization: `Bearer ${authToken}` };
}

async function fetchEnterpriseSummary(fetchSignal) {
    try {
        const response = await fetch('/api/admin/enterprise-summary', {
            method: 'GET',
            headers: adminDashboardAuthHeaders(),
            signal: fetchSignal
        });

        if (response.status === 401 || response.status === 403) {
            if (typeof handleAdminApiAuthResponse === 'function') {
                handleAdminApiAuthResponse(response, {});
            }
            console.warn('[enterprise-summary] request denied:', response.status);
            return;
        }

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            console.error('[enterprise-summary] HTTP', response.status, errBody.message || response.statusText);
            return;
        }

        const payload = await response.json();
        if (!payload.success || !payload.data) {
            console.warn('[enterprise-summary] invalid payload:', payload);
            return;
        }

        if (payload.partial && Array.isArray(payload.errors)) {
            console.warn('[enterprise-summary] partial metrics — some values may have used Mongo fallback:', payload.errors);
        }

        const { erp, crm, hrm } = payload.data;
        const set = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value ?? 0;
        };

        set('erp-stat-orders-today', erp?.ordersToday);
        set('erp-stat-low-stock', erp?.lowStockCount);
        set('erp-stat-pending-pos', erp?.pendingPoCount);
        set('crm-stat-abandoned', crm?.abandonedCartCount);
        set('crm-stat-tickets', crm?.openTicketCount);
        set('crm-stat-new-customers', crm?.newCustomersToday);
        set('crm-stat-silver', crm?.silverCount);
        set('crm-stat-gold', crm?.goldCount);
        set('crm-stat-platinum', crm?.platinumCount);
        applyHrmEnterpriseWidgetStats(hrm, set);
    } catch (error) {
        if (isDashboardAbortError(error)) return;
        console.error('Enterprise Summary Fetch Error:', error);
    }
}

/**
 * Phase 1 BFF — PostgreSQL overview KPIs (PG-primary metrics).
 * @returns {Promise<object|null>} overview `data` object or null on failure
 */
function applyHrmEnterpriseWidgetStats(hrm, setFn) {
    const set = setFn || ((id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value ?? 0;
    });

    set('hrm-stat-staff', hrm?.staffCount);
    set('hrm-stat-employees', hrm?.employeeCount);
    set('hrm-stat-present', hrm?.presentToday ?? 0);
    set('hrm-stat-absent', hrm?.absentToday ?? 0);
    set('hrm-stat-late', hrm?.lateToday ?? 0);
    set('hrm-stat-pending-leaves', hrm?.pendingLeaveCount);
    set('hrm-stat-payroll-paid', hrm?.payrollPaidThisMonth ?? 0);
    set('hrm-stat-payroll-pending', hrm?.payrollPendingThisMonth ?? 0);
    set('hrm-stat-security', hrm?.recentSecurityEvents);
}

function renderPaymentSplitBreakdown(paymentSplit, gmvTotal) {
    const split = paymentSplit || {};
    const cod = split.cod || {};
    const digital = split.digital || {};
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    const gmv = Number(gmvTotal) || 0;
    const codShare = gmv > 0 ? `${Math.round((Number(cod.total || 0) / gmv) * 1000) / 10}%` : '—';
    const digitalShare = gmv > 0 ? `${Math.round((Number(digital.total || 0) / gmv) * 1000) / 10}%` : '—';

    setText('stat-payment-cod', formatAdminPrice(cod.total ?? 0));
    setText('stat-payment-digital', formatAdminPrice(digital.total ?? 0));
    setText('stat-payment-cod-count', cod.count ?? 0);
    setText('stat-payment-digital-count', digital.count ?? 0);
    setText('stat-payment-cod-share', codShare);
    setText('stat-payment-digital-share', digitalShare);

    const methods = Array.isArray(split.byMethod) ? split.byMethod : [];
    const listEl = document.getElementById('stat-payment-methods-list');
    const totalEl = document.getElementById('stat-payment-methods-total');

    if (totalEl) {
        totalEl.textContent = methods.length ? `${methods.length} methods` : '—';
    }

    if (!listEl) return;

    if (!methods.length) {
        listEl.innerHTML = '<div class="kpi-sub-stat-row"><span>No payment data</span><strong>—</strong></div>';
        return;
    }

    listEl.innerHTML = methods.slice(0, 6).map((row) => {
        const label = String(row.method || 'Unknown').replace(/</g, '&lt;');
        const value = `${formatAdminPrice(row.total ?? 0)} · ${row.count ?? 0}`;
        return `<div class="kpi-sub-stat-row"><span>${label}</span><strong>${value}</strong></div>`;
    }).join('');
}

function formatOverviewGrowthLabel(growth) {
    if (!growth || growth.deltaPercent == null) return '';
    const sign = growth.deltaPercent > 0 ? '+' : '';
    return `${sign}${growth.deltaPercent}% vs prior period`;
}

/**
 * Color-coded period growth pill on KPI cards.
 * @param {string} badgeId
 * @param {{ deltaPercent?: number, isPositive?: boolean }|null|undefined} growth
 */
function applyKpiGrowthBadge(badgeId, growth) {
    const el = document.getElementById(badgeId);
    if (!el) return;

    if (!growth || growth.deltaPercent == null) {
        el.hidden = true;
        el.textContent = '';
        el.className = 'kpi-growth-badge neutral';
        return;
    }

    const delta = Number(growth.deltaPercent) || 0;
    let variant = 'neutral';
    if (delta > 0) variant = 'positive';
    else if (delta < 0) variant = 'negative';

    const sign = delta > 0 ? '+' : '';
    const icon = delta > 0
        ? 'fa-arrow-trend-up'
        : delta < 0
            ? 'fa-arrow-trend-down'
            : 'fa-minus';

    el.className = `kpi-growth-badge ${variant}`;
    el.hidden = false;
    el.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><span>${sign}${delta}%</span>`;
    el.title = `${sign}${delta}% vs prior period`;
}

/** @type {Record<string, import('chart.js').Chart|null>} */
const kpiSparklineInstances = window.kpiSparklineInstances || {};
window.kpiSparklineInstances = kpiSparklineInstances;

/**
 * Mini interactive sparkline for KPI cards.
 * @param {string} canvasId
 * @param {Array<{ date?: string, value?: number, count?: number }>} trend
 * @param {{ color?: string, label?: string }} [options]
 */
function renderKpiSparkline(canvasId, trend, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    if (kpiSparklineInstances[canvasId]) {
        kpiSparklineInstances[canvasId].destroy();
        kpiSparklineInstances[canvasId] = null;
    }

    const series = Array.isArray(trend) ? trend : [];
    const values = series.map((row) => Number(row.value ?? row.count) || 0);
    const labels = series.map((row) => row.date || '');

    const color = options.color || '#8b5cf6';
    const label = options.label || 'Trend';

    kpiSparklineInstances[canvasId] = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label,
                data: values,
                borderColor: color,
                backgroundColor: `${color}22`,
                borderWidth: 2,
                tension: 0.35,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 3,
                pointHitRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400 },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            const raw = items[0]?.label;
                            if (!raw) return '';
                            const d = new Date(`${raw}T12:00:00`);
                            return Number.isNaN(d.getTime())
                                ? raw
                                : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        },
                        label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}`
                    }
                }
            },
            scales: {
                x: { display: false },
                y: { display: false }
            }
        }
    });
}

async function fetchDashboardOverviewBff(fetchSignal) {
    try {
        const query = buildDashboardOverviewQueryString();
        const response = await fetch(`/api/admin/dashboard/overview?${query}`, {
            method: 'GET',
            headers: adminDashboardAuthHeaders(),
            signal: fetchSignal
        });

        if (response.status === 401 || response.status === 403) {
            if (typeof handleAdminApiAuthResponse === 'function') {
                handleAdminApiAuthResponse(response, {});
            }
            return null;
        }

        if (response.status === 429) {
            if (typeof trackAdminPollError === 'function') {
                const paused = trackAdminPollError('dashboardOverviewBff', response);
                if (paused) pauseOverviewAutoPulse(true);
            }
            return null;
        }

        if (!response.ok) {
            console.warn('[dashboard-overview] HTTP', response.status);
            return null;
        }

        const payload = await response.json();
        if (!payload.success || !payload.data) return null;

        if (typeof resetAdminPollErrors === 'function') {
            resetAdminPollErrors('dashboardOverviewBff');
        }

        window.dashboardOverviewBff = payload.data;
        return payload.data;
    } catch (error) {
        if (isDashboardAbortError(error)) return null;
        console.error('Dashboard Overview BFF Fetch Error:', error);
        return null;
    }
}

function applyDashboardOverviewBff(data) {
    if (!data) return;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    const { sales, customers, inventory, financials } = data;

    const financialsMasked = isDashboardFinancialsMasked(data.meta, data.permissions);

    if (financials) {
        if (financialsMasked) {
            setText('stat-gmv', '—');
            setText('stat-net-revenue', '—');
            setText('stat-aov', '—');
            applyKpiGrowthBadge('stat-gmv-growth-badge', null);
        } else {
            setText('stat-gmv', formatAdminPrice(financials.gmv ?? 0));
            applyKpiGrowthBadge('stat-gmv-growth-badge', financials.gmvGrowth);
            setText('stat-net-revenue', formatAdminPrice(financials.netRevenue ?? 0));
            setText('stat-aov', formatAdminPrice(financials.aov ?? 0));
        }
        renderKpiSparkline('sparkline-gmv', financialsMasked ? [] : (financials.gmvTrend || []), {
            color: '#8b5cf6',
            label: 'GMV'
        });
        if (!financialsMasked) {
            renderPaymentSplitBreakdown(financials.paymentSplit, financials.gmv);
        }
    }

    if (sales) {
        if (financialsMasked) {
            setText('stat-alltime-revenue', '—');
            applyKpiGrowthBadge('stat-revenue-growth-badge', null);
        } else {
            setText('stat-alltime-revenue', formatAdminPrice(sales.totalRevenue ?? 0));
            applyKpiGrowthBadge('stat-revenue-growth-badge', sales.revenueGrowth);
        }
        renderKpiSparkline('sparkline-revenue', financialsMasked ? [] : (sales.revenueTrend || []), {
            color: '#10b981',
            label: 'Delivered revenue'
        });
        setText('stat-pending-orders', sales.pendingOrders ?? 0);
        setText('stat-total-orders', sales.totalOrders ?? 0);
        applyKpiGrowthBadge('stat-orders-growth-badge', sales.ordersGrowth);
        renderKpiSparkline('sparkline-orders', sales.ordersTrend || [], {
            color: '#3b82f6',
            label: 'Orders'
        });
        setText('erp-stat-orders-today', sales.ordersToday ?? 0);
    }

    if (customers) {
        setText('stat-total-customers', customers.totalCustomers ?? 0);
        applyKpiGrowthBadge('stat-customers-growth-badge', customers.customersGrowth);
        renderKpiSparkline('sparkline-customers', customers.registrationTrend || [], {
            color: '#f59e0b',
            label: 'New customers'
        });
        setText('stat-total-users', customers.totalCustomers ?? 0);
        setText('crm-stat-new-customers', customers.newCustomersToday ?? 0);
        setText('stat-verified-users', customers.verifiedCount ?? 0);
        setText('stat-pending-users', customers.unverifiedCount ?? 0);
        setText('stat-spam-blocks', customers.blockedCount ?? 0);
        renderRegistrationTrendChart(customers.registrationTrend, customers.totalCustomers);
    }

    if (inventory) {
        setText('erp-stat-low-stock', inventory.lowStockItems ?? 0);
        renderInventoryAlertsList(inventory.alertsList || [], {
            totalAlerts: inventory.lowStockItems
        });
    }

    const pipeline = data.orderPipeline;
    if (pipeline) {
        setText('stat-pipeline-pending', pipeline.pending ?? 0);
        setText('stat-processing-orders', pipeline.processing ?? 0);
        setText('stat-pipeline-shipped', pipeline.shipped ?? 0);
        setText('stat-delivered-orders', pipeline.delivered ?? 0);
        setText('stat-pipeline-cancelled', pipeline.cancelled ?? 0);
        setText('stat-pipeline-refunded', pipeline.refunded ?? 0);
        setText('stat-pipeline-in-flight', pipeline.totalInPipeline ?? 0);
    }

    const crm = data.crm;
    if (crm) {
        setText('stat-repeat-purchase-rate', `${crm.repeatPurchaseRate ?? 0}%`);
        setText(
            'stat-repeat-purchase-detail',
            `${crm.repeatCustomerCount ?? 0} repeat of ${crm.totalPurchasingCustomers ?? 0} purchasers`
        );
        setText('stat-open-support-tickets', crm.openSupportTickets ?? 0);
        setText('crm-stat-tickets', crm.openSupportTickets ?? 0);
        const sla = crm.supportSla || {};
        const responseLabel = sla.avgFirstResponseMinutes != null
            ? `${sla.avgFirstResponseMinutes}m response`
            : 'response —';
        const resolutionLabel = sla.avgResolutionMinutes != null
            ? `${sla.avgResolutionMinutes}m resolution`
            : 'resolution —';
        setText('stat-support-sla', `Avg ${responseLabel} · ${resolutionLabel}`);
    }

    renderDashboardOverviewCharts(data.charts, data.meta, data.permissions);
    applyDashboardFinancialZoneLocks(data.meta, data.permissions);
}

/** @type {Record<string, import('chart.js').Chart|null>} */
const overviewChartInstances = window.overviewChartInstances || {};
window.overviewChartInstances = overviewChartInstances;

function destroyOverviewChart(key) {
    if (overviewChartInstances[key]) {
        overviewChartInstances[key].destroy();
        overviewChartInstances[key] = null;
    }
}

function formatChartDayLabel(dateKey) {
    const d = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(d.getTime())) return dateKey;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Phase 3.3 — BFF-driven overview charts (dual-axis sales, funnel, top products).
 * @param {{ salesTrend?: Array, orderFunnel?: Array, topProducts?: Array }|null|undefined} charts
 * @param {{ period?: string, currentStart?: string, currentEnd?: string }|null|undefined} meta
 */
function renderDashboardOverviewCharts(charts, meta, permissions) {
    if (!charts || typeof Chart === 'undefined') return;

    const hideRevenue = isDashboardFinancialsMasked(meta, permissions);

    renderOverviewSalesTrendChart(charts.salesTrend || [], meta, { hideRevenue });
    renderOverviewOrderFunnelChart(charts.orderFunnel || []);
    renderOverviewTopProductsChart(charts.topProducts || [], { hideRevenue });
}

function renderOverviewSalesTrendChart(salesTrend, meta, options = {}) {
    const hideRevenue = options.hideRevenue === true;
    const canvas = document.getElementById('chart-sales-trend');
    if (!canvas) return;

    destroyOverviewChart('salesTrend');

    const series = Array.isArray(salesTrend) ? salesTrend : [];
    const labels = series.map((row) => formatChartDayLabel(row.date));
    const revenueValues = series.map((row) => Number(row.revenue) || 0);
    const orderValues = series.map((row) => Number(row.ordersCount) || 0);

    const periodLabel = document.getElementById('chart-sales-trend-period');
    if (periodLabel && meta?.period) {
        periodLabel.textContent = `Period: ${meta.period}${series.length ? ` · ${series.length} days` : ''}`;
    }

    const datasets = [];

    if (!hideRevenue) {
        datasets.push({
            label: 'Revenue (delivered)',
            data: revenueValues,
            yAxisID: 'y',
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.18)',
            borderWidth: 2.5,
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointHoverRadius: 5
        });
    }

    datasets.push({
        label: 'Orders',
        data: orderValues,
        yAxisID: hideRevenue ? 'y' : 'y1',
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.12)',
        borderWidth: 2.5,
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 5
    });

    const scales = {
        x: { grid: { display: false } }
    };

    if (hideRevenue) {
        scales.y = {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            ticks: { precision: 0 }
        };
    } else {
        scales.y = {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            ticks: {
                callback: (value) => formatAdminPrice(value)
            }
        };
        scales.y1 = {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            grid: { drawOnChartArea: false },
            ticks: { precision: 0 }
        };
    }

    overviewChartInstances.salesTrend = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.dataset.label?.includes('Revenue')) {
                                return ` ${ctx.dataset.label}: ${formatAdminPrice(ctx.parsed.y)}`;
                            }
                            return ` ${ctx.dataset.label}: ${ctx.parsed.y}`;
                        }
                    }
                }
            },
            scales
        }
    });
}

function renderOverviewOrderFunnelChart(orderFunnel) {
    const canvas = document.getElementById('chart-order-funnel');
    if (!canvas) return;

    destroyOverviewChart('orderFunnel');

    const stages = Array.isArray(orderFunnel) ? orderFunnel : [];
    const labels = stages.map((s) => s.label);
    const counts = stages.map((s) => Number(s.count) || 0);
    const palette = ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444'];

    overviewChartInstances.orderFunnel = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Orders',
                data: counts,
                backgroundColor: palette,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: (ctx) => {
                            const stage = stages[ctx.dataIndex];
                            if (!stage) return '';
                            const lines = [];
                            if (stage.conversionFromPrevious != null) {
                                lines.push(`Conversion: ${stage.conversionFromPrevious}%`);
                            }
                            if (stage.dropOffFromPrevious != null) {
                                lines.push(`Drop-off: ${stage.dropOffFromPrevious}%`);
                            }
                            if (stage.shareOfEntry != null) {
                                lines.push(`Share of pending: ${stage.shareOfEntry}%`);
                            }
                            return lines;
                        }
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, ticks: { precision: 0 } },
                y: { grid: { display: false } }
            }
        }
    });
}

function renderOverviewTopProductsChart(topProducts, options = {}) {
    const hideRevenue = options.hideRevenue === true;
    const canvas = document.getElementById('chart-top-products');
    if (!canvas) return;

    destroyOverviewChart('topProducts');

    const products = Array.isArray(topProducts) ? topProducts : [];
    const labels = products.map((p) => {
        const name = p.name || 'Unknown';
        return name.length > 22 ? `${name.slice(0, 20)}…` : name;
    });
    const quantities = products.map((p) => Number(p.quantity) || 0);
    const revenues = products.map((p) => Number(p.revenue) || 0);

    const productDatasets = [];

    if (!hideRevenue) {
        productDatasets.push({
            label: 'Revenue',
            data: revenues,
            backgroundColor: 'rgba(139, 92, 246, 0.85)',
            borderRadius: 6,
            yAxisID: 'y'
        });
    }

    productDatasets.push({
        label: 'Units sold',
        data: quantities,
        backgroundColor: 'rgba(59, 130, 246, 0.85)',
        borderRadius: 6,
        yAxisID: hideRevenue ? 'y' : 'y1'
    });

    const productScales = {
        x: { grid: { display: false } }
    };

    if (hideRevenue) {
        productScales.y = {
            position: 'left',
            beginAtZero: true,
            ticks: { precision: 0 }
        };
    } else {
        productScales.y = {
            position: 'left',
            beginAtZero: true,
            ticks: {
                callback: (value) => formatAdminPrice(value)
            }
        };
        productScales.y1 = {
            position: 'right',
            beginAtZero: true,
            grid: { drawOnChartArea: false },
            ticks: { precision: 0 }
        };
    }

    overviewChartInstances.topProducts = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: productDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.dataset.label === 'Revenue') {
                                return ` ${ctx.dataset.label}: ${formatAdminPrice(ctx.parsed.y)}`;
                            }
                            return ` ${ctx.dataset.label}: ${ctx.parsed.y}`;
                        }
                    }
                }
            },
            scales: productScales
        }
    });
}

/**
 * @param {string} [periodOverride]
 * @param {string} [fromDate]
 * @param {string} [toDate]
 * @param {{ silent?: boolean, source?: 'manual'|'auto'|'init' }} [options]
 */
async function fetchDashboardData(periodOverride, fromDate, toDate, options = {}) {
    const silent = options.silent === true;
    const source = options.source || 'init';

    if (periodOverride) {
        setDashboardOverviewPeriod(periodOverride, fromDate, toDate);
    } else {
        syncOverviewPeriodToUrl();
    }

    if (source === 'manual' || source === 'init') {
        setOverviewPulseState('refreshing');
    }

    if (dashboardFetchController) {
        dashboardFetchController.abort();
    }
    dashboardFetchController = new AbortController();
    const signal = dashboardFetchController.signal;

    try {
        applyDashboardWidgetPermissions();
        applyDashboardQuickActionPermissions();
        if (window.dashboardOverviewBff) {
            applyDashboardFinancialZoneLocks(
                window.dashboardOverviewBff.meta,
                window.dashboardOverviewBff.permissions
            );
        }

        const customersVisible = document.getElementById('view-customers')?.classList.contains('active')
            || document.getElementById('view-customers')?.style.display === 'block';

        if (customersVisible && typeof fetchCustomers === 'function') {
            await fetchCustomers(true);
        }

        const overviewBffPromise = fetchDashboardOverviewBff(signal);

        const quickActionsPromise = fetchQuickActionsStatus(signal);

        await Promise.all([
            overviewBffPromise,
            fetchDashboardAnalytics(signal),
            fetchEnterpriseSummary(signal),
            quickActionsPromise
        ]);

        const bffData = await overviewBffPromise;
        applyDashboardOverviewBff(bffData);

        if (bffData) {
            touchOverviewLastUpdated(true);
            if (source !== 'init') {
                startOverviewAutoPulse();
            }
        } else if (!silent) {
            touchOverviewLastUpdated(false);
        } else {
            setOverviewPulseState('error');
        }
    } catch (error) {
        if (isDashboardAbortError(error)) return;
        console.error('Dashboard Fetch Error:', error);
        touchOverviewLastUpdated(false);
        if (!silent) {
            showCustomerError('Server connection error.');
        }
    }
}

/**
 * ৫.২ক: Sales & Order Analytics — revenue, order counts, charts & stock alerts
 */
async function fetchDashboardAnalytics(fetchSignal) {
    try {
        const response = await fetch('/api/admin/dashboard-analytics', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
            signal: fetchSignal
        });

        if (response.status === 429) {
            if (trackAdminPollError('dashboardAnalytics', response)) return;
            console.warn('Dashboard analytics rate-limited — skipping auto-retry.');
            return;
        }
        if (response.status === 401) {
            handleAdminApiAuthResponse(response, {});
            return;
        }
        if (response.status === 403) {
            handleAdminApiAuthResponse(response, {});
            return;
        }

        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

        const data = await response.json();
        resetAdminPollErrors('dashboardAnalytics');
        if (!data.success || !data.analytics) return;

        dashboardAnalytics = data.analytics;
        updateSalesMetricsCards(dashboardAnalytics);
        if (!window.dashboardOverviewBff?.charts) {
            renderSalesTrendChart(dashboardAnalytics.salesTrend);
            renderTopProductsChart(dashboardAnalytics.topProducts);
        }
    } catch (error) {
        if (isDashboardAbortError(error)) return;
        console.error('Dashboard Analytics Fetch Error:', error);
    }
}

function updateSalesMetricsCards(analytics) {
    if (!analytics) return;

    const { revenue, orderCounts, totalCustomers } = analytics;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText('stat-alltime-revenue', formatAdminPrice(revenue?.allTime || 0));
    setText('stat-revenue-breakdown', `Today: ${formatAdminPrice(revenue?.daily || 0)} · This Month: ${formatAdminPrice(revenue?.monthly || 0)}`);
    setText('stat-pending-orders', orderCounts?.pending ?? 0);
    setText('stat-return-requests', orderCounts?.returnRequests ?? 0);
    setText('stat-total-customers', totalCustomers ?? 0);
    setText('stat-total-orders', orderCounts?.total ?? 0);
    setText('stat-processing-orders', orderCounts?.processing ?? 0);
    setText('stat-delivered-orders', orderCounts?.delivered ?? 0);
}

function renderSalesTrendChart(salesTrend) {
    const ctx = document.getElementById('salesTrendChart') || document.getElementById('chart-sales-trend');
    if (!ctx || typeof Chart === 'undefined' || !salesTrend) return;

    if (salesTrendChartInstance) salesTrendChartInstance.destroy();

    const series = salesTrendPeriod === 'monthly' ? salesTrend.monthly : salesTrend.daily;
    const labels = series?.labels || [];
    const values = series?.revenue || [];

    salesTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Revenue',
                data: values,
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.12)',
                borderWidth: 2.5,
                tension: 0.35,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => ` Revenue: ${formatAdminPrice(context.parsed.y)}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => formatAdminPrice(value)
                    }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderTopProductsChart(topProducts) {
    const ctx = document.getElementById('topProductsChart') || document.getElementById('chart-top-products');
    if (!ctx || typeof Chart === 'undefined') return;

    if (topProductsChartInstance) topProductsChartInstance.destroy();

    const products = topProducts || [];
    const labels = products.map((p) => p.name || 'Unknown');
    const quantities = products.map((p) => p.quantity || 0);
    const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    if (topProductsChartType === 'pie') {
        topProductsChartInstance = new Chart(ctx, {
            type: 'pie',
            data: {
                labels,
                datasets: [{
                    data: quantities,
                    backgroundColor: palette,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: (context) => ` ${context.label}: ${context.parsed} units sold`
                        }
                    }
                }
            }
        });
        return;
    }

    topProductsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Units Sold',
                data: quantities,
                backgroundColor: palette,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => ` ${context.parsed.y} units sold`
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
                x: { grid: { display: false } }
            }
        }
    });
}

window.quickUpdateStock = async function(productId) {
    let product = globalProducts.find((p) => String(p._id) === String(productId));
    if (!product) {
        await fetchLiveProducts();
        product = globalProducts.find((p) => String(p._id) === String(productId));
    }
    if (!product) {
        showToast('Product not found. Open Manage Products to update stock.', 'warning');
        return;
    }

    if (typeof Swal === 'undefined') {
        editProduct(productId);
        return;
    }

    const { value: newStock, isConfirmed } = await Swal.fire({
        title: 'Update Stock',
        html: `<p style="margin-bottom:8px;font-size:14px;color:#64748b;">${product.name}</p>`,
        input: 'number',
        inputValue: Number(product.stock) || 0,
        inputAttributes: { min: 0, step: 1 },
        showCancelButton: true,
        confirmButtonText: 'Save Stock',
        confirmButtonColor: '#3b82f6'
    });

    if (!isConfirmed || newStock === undefined || newStock === null || newStock === '') return;

    saveProductPaginationState();

    const formData = new FormData();
    formData.append('name', product.name);
    formData.append('price', product.price);
    formData.append('buyingPrice', product.buyingPrice || 0);
    formData.append('stock', newStock);
    formData.append('stockQuantity', newStock);
    formData.append('hasVariants', product.hasVariants ? 'true' : 'false');
    formData.append('category', product.category || 'General');
    formData.append('brand', (product.brand && product.brand._id) ? product.brand._id : (product.brand || ''));
    formData.append('variants', JSON.stringify(product.variants || []));
    formData.append('icon', product.icon || '📦');
    formData.append('description', product.description || '');

    try {
        const res = await fetch(`/api/products/${productId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const result = await res.json();

        if (res.ok && result.success) {
            const updated = result.data || result.product;
            if (updated && updated._id) upsertProductInState(updated);
            showAdminSuccess('Stock Updated', `Stock set to ${newStock} for ${product.name}`);
            fetchDashboardData();
        } else {
            showToast(result.message || 'Stock update failed.', 'error');
        }
    } catch (err) {
        showToast('Server error during stock update.', 'error');
    }
};

function setupAnalyticsChartToggles() {
    const dailyBtn = document.getElementById('salesTrendDailyBtn');
    const monthlyBtn = document.getElementById('salesTrendMonthlyBtn');
    const barBtn = document.getElementById('topProductsBarBtn');
    const pieBtn = document.getElementById('topProductsPieBtn');

    const setActive = (buttons, activeBtn) => {
        buttons.forEach((btn) => {
            if (!btn) return;
            btn.classList.toggle('active', btn === activeBtn);
        });
    };

    if (dailyBtn && monthlyBtn) {
        dailyBtn.addEventListener('click', () => {
            salesTrendPeriod = 'daily';
            setActive([dailyBtn, monthlyBtn], dailyBtn);
            if (dashboardAnalytics?.salesTrend) renderSalesTrendChart(dashboardAnalytics.salesTrend);
        });
        monthlyBtn.addEventListener('click', () => {
            salesTrendPeriod = 'monthly';
            setActive([dailyBtn, monthlyBtn], monthlyBtn);
            if (dashboardAnalytics?.salesTrend) renderSalesTrendChart(dashboardAnalytics.salesTrend);
        });
    }

    if (barBtn && pieBtn) {
        barBtn.addEventListener('click', () => {
            topProductsChartType = 'bar';
            setActive([barBtn, pieBtn], barBtn);
            if (dashboardAnalytics?.topProducts) renderTopProductsChart(dashboardAnalytics.topProducts);
        });
        pieBtn.addEventListener('click', () => {
            topProductsChartType = 'pie';
            setActive([barBtn, pieBtn], pieBtn);
            if (dashboardAnalytics?.topProducts) renderTopProductsChart(dashboardAnalytics.topProducts);
        });
    }
}

/**
 * ৫.৩: টপ অ্যানালিটিক্স কার্ডগুলো (Total Users, Verified, Pending) আপডেট করা
 * @param {Array} customers - ডাটাবেজ থেকে পাওয়া কাস্টমার অ্যারে
 */
function updateMetricsCards(customers, totalOverride) {
    const totalUsers = totalOverride != null ? totalOverride : customers.length;
    const verifiedUsers = customers.filter(user => user.isVerified === true).length;
    const pendingUsers = Math.max(0, totalUsers - verifiedUsers);
    const spamAlerts = customers.filter(user => user.accountStatus === 'blocked').length;

    // DOM এলিমেন্ট আপডেট করা
    if (document.getElementById('stat-total-users')) document.getElementById('stat-total-users').innerText = totalUsers;
    if (document.getElementById('stat-verified-users')) document.getElementById('stat-verified-users').innerText = verifiedUsers;
    if (document.getElementById('stat-pending-users')) document.getElementById('stat-pending-users').innerText = pendingUsers;
    if (document.getElementById('stat-spam-blocks')) document.getElementById('stat-spam-blocks').innerText = spamAlerts;
}

/**
 * গত N মাসের রেজিস্ট্রেশন সিরিজ বিল্ড করা (ডাইনামিক চার্ট ডেটা)
 */
function buildMonthlyRegistrationSeries(customers, months = 6) {
    const now = new Date();
    const labels = [];
    const totals = [];
    const verified = [];

    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = d.getMonth();
        labels.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));

        const inMonth = (customers || []).filter(c => {
            if (!c.createdAt) return false;
            const created = new Date(c.createdAt);
            return created.getFullYear() === year && created.getMonth() === month;
        });
        totals.push(inMonth.length);
        verified.push(inMonth.filter(u => u.isVerified).length);
    }

    return { labels, totals, verified };
}

/**
 * Customer registration trend from BFF (PG daily counts, last 30 days).
 * @param {Array<{ date: string, count: number }>} registrationTrend
 * @param {number} [totalCustomers]
 */
function renderRegistrationTrendChart(registrationTrend, totalCustomers) {
    const ctx = document.getElementById('userGrowthChart');
    if (!ctx || typeof Chart === 'undefined') return;

    if (growthChartInstance) growthChartInstance.destroy();

    const trend = Array.isArray(registrationTrend) ? registrationTrend : [];
    const labels = trend.map((row) => {
        const d = new Date(`${row.date}T12:00:00`);
        if (Number.isNaN(d.getTime())) return row.date;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const totals = trend.map((row) => Number(row.value ?? row.count) || 0);

    const periodLabel = document.getElementById('chartPeriodLabel');
    if (periodLabel) {
        const totalLabel = totalCustomers != null ? totalCustomers : '—';
        periodLabel.textContent = `Last ${trend.length || 30} days · ${totalLabel} total users`;
    }

    growthChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'New Registrations',
                    data: totals,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}` } }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
                x: { grid: { display: false } }
            }
        }
    });
}

/** @deprecated Use renderRegistrationTrendChart with BFF registrationTrend */
function renderGrowthChart(customers) {
    const ctx = document.getElementById('userGrowthChart');
    if (!ctx || typeof Chart === 'undefined') return;

    if (growthChartInstance) growthChartInstance.destroy();

    const { labels, totals } = buildMonthlyRegistrationSeries(customers || [], 6);
    renderRegistrationTrendChart(
        labels.map((label, i) => ({ date: label, count: totals[i] })),
        (customers || []).length
    );
}



/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    applyHrmEnterpriseWidgetStats,
    applyKpiGrowthBadge,
    applyDashboardOverviewBff,
    applyDashboardWidgetPermissions,
    applyDashboardFinancialZoneLocks,
    dashboardFinancialsCan,
    isDashboardFinancialsMasked,
    buildMonthlyRegistrationSeries,
    fetchDashboardAnalytics,
    fetchDashboardOverviewBff,
    fetchEnterpriseSummary,
    fetchDashboardData,
    renderGrowthChart,
    renderRegistrationTrendChart,
    renderPaymentSplitBreakdown,
    renderKpiSparkline,
    renderInventoryAlertsList,
    renderDashboardOverviewCharts,
    renderOverviewSalesTrendChart,
    renderOverviewOrderFunnelChart,
    renderOverviewTopProductsChart,
    renderSalesTrendChart,
    renderTopProductsChart,
    setupAnalyticsChartToggles,
    setupHeaderDatePicker,
    setupDashboardOverviewPeriodControls,
    setupDashboardQuickActions,
    setupOverviewLivePulseEngine,
    startOverviewAutoPulse,
    stopOverviewAutoPulse,
    pauseOverviewAutoPulse,
    resumeOverviewAutoPulse,
    applyDashboardQuickActionPermissions,
    fetchQuickActionsStatus,
    toggleMaintenanceFromQuickAction,
    setDashboardOverviewPeriod,
    buildDashboardOverviewQueryString,
    hydrateOverviewPeriodFromUrl,
    startLiveClock,
    updateDashboardDate,
    updateMetricsCards,
    updateSalesMetricsCards
});

