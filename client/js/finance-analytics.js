/********************************************************************
 * Project: EonlineBazar
 * File: js/finance-analytics.js
 * Author: Abdul Karim Sheikh
 * Description: Finance & Analytics dashboard — fetches /admin/api/analytics,
 * updates KPI cards and Chart.js graphs dynamically without page reload.
 ********************************************************************/

(function () {
    'use strict';

    /* =====================================================================
       1. CONFIG & CONSTANTS
       ===================================================================== */
    const API_ANALYTICS = '/admin/api/analytics';
    const API_ANALYTICS_FALLBACK = '/api/finance/analytics';
    const LOGIN_URL = '/finance-login';
    const CURRENCY = '৳';
    const FINANCE_TOKEN_KEY = 'financeToken';

    const PERIOD_LABELS = {
        today: 'Today',
        yesterday: 'Yesterday',
        '7days': 'Last 7 Days',
        thismonth: 'This Month',
        all: 'All Time',
        custom: 'Custom Range'
    };

    const CARD_IDS = [
        'kpiGrossRevenue', 'kpiGrossRevenueMeta', 'kpiNetProfit', 'kpiNetProfitMeta',
        'kpiTotalOrders', 'kpiAvgOrder', 'kpiProfitMargin', 'kpiDiscountsMeta',
        'statCOGS', 'statDiscounts', 'statShipping', 'statOrders'
    ];

    const THEME_KEY = 'financeTheme';

    let currentPeriod = 'thismonth';
    let customStartDate = '';
    let customEndDate = '';

    let revenueProfitChart = null;
    let topCategoriesChart = null;

    /* =====================================================================
       2. DOM HELPERS
       ===================================================================== */
    const $ = (id) => document.getElementById(id);

    function setText(id, value) {
        const el = $(id);
        if (el) {
            el.textContent = value;
            el.classList.remove('fa-skeleton');
        }
    }

    function formatMoney(amount) {
        const n = Number(amount) || 0;
        const abs = Math.abs(n);
        const decimals = abs > 0 && abs < 100 ? 2 : 0;
        return CURRENCY + n.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    function formatPercent(value) {
        const n = Number(value) || 0;
        return n.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + '%';
    }

    function formatNumber(value) {
        const n = Number(value) || 0;
        return n.toLocaleString('en-US');
    }

    function formatShortDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function getAuthToken() {
        return localStorage.getItem(FINANCE_TOKEN_KEY) || localStorage.getItem('adminToken') || '';
    }

    /* =====================================================================
       2b. THEME (dark / light) — persisted in localStorage
       ===================================================================== */
    function readCssVar(name, fallback) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return value || fallback;
    }

    function getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }

    function renderThemeButton(theme) {
        const btn = $('themeToggleBtn');
        const icon = $('themeToggleIcon');
        const label = $('themeToggleLabel');
        const isLight = theme === 'light';

        if (label) label.textContent = isLight ? 'Light' : 'Dark';
        if (icon) {
            icon.classList.toggle('fa-sun', isLight);
            icon.classList.toggle('fa-moon', !isLight);
        }
        if (btn) btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
    }

    /** Re-tint chart axes/grids after a theme switch (colours come from CSS vars) */
    function applyThemeToCharts() {
        const axis = readCssVar('--fa-axis-text', '#94a3b8');
        const grid = readCssVar('--fa-grid-line', 'rgba(255,255,255,0.06)');

        if (revenueProfitChart) {
            const scales = revenueProfitChart.options.scales;
            scales.x.ticks.color = axis;
            scales.y.ticks.color = axis;
            scales.x.grid.color = grid;
            scales.y.grid.color = grid;
            revenueProfitChart.update('none');
        }

        if (topCategoriesChart) {
            topCategoriesChart.options.plugins.legend.labels.color = axis;
            topCategoriesChart.update('none');
        }
    }

    function applyTheme(theme) {
        const next = theme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try {
            localStorage.setItem(THEME_KEY, next);
        } catch (err) {
            console.warn('[Analytics] Unable to persist theme preference:', err.message);
        }
        renderThemeButton(next);
        applyThemeToCharts();
    }

    function initThemeToggle() {
        renderThemeButton(getCurrentTheme());
        const btn = $('themeToggleBtn');
        if (btn) {
            btn.addEventListener('click', () => {
                applyTheme(getCurrentTheme() === 'light' ? 'dark' : 'light');
            });
        }
    }

    /* =====================================================================
       3. LOADING & ERROR STATE
       ===================================================================== */
    function showCardLoading(active) {
        CARD_IDS.forEach((id) => {
            const el = $(id);
            if (el) el.classList.toggle('fa-skeleton', active);
        });
    }

    function showFullLoading(active) {
        const overlay = $('loadingOverlay');
        if (!overlay) return;
        if (active) {
            overlay.classList.remove('fa-hidden');
            overlay.style.display = '';
            overlay.setAttribute('aria-busy', 'true');
        } else {
            overlay.classList.add('fa-hidden');
            overlay.style.display = 'none';
            overlay.setAttribute('aria-busy', 'false');
        }
    }

    function hideErrorBanner() {
        const banner = $('errorBanner');
        if (banner) banner.hidden = true;
    }

    function setRefreshSpinning(spinning) {
        const btn = $('refreshBtn');
        if (!btn) return;
        const icon = btn.querySelector('i');
        btn.disabled = spinning;
        if (icon) icon.classList.toggle('fa-spin-anim', spinning);
    }

    /* =====================================================================
       4. AUTH & FETCH
       ===================================================================== */
    function redirectToLogin(target) {
        localStorage.removeItem(FINANCE_TOKEN_KEY);
        document.cookie = 'financeToken=; path=/; max-age=0; SameSite=Strict';
        window.location.replace(target || LOGIN_URL);
    }

    function buildAnalyticsUrl(base, startDate, endDate, period) {
        const params = new URLSearchParams();
        if (startDate && endDate) {
            params.set('startDate', startDate);
            params.set('endDate', endDate);
        } else if (period && period !== 'custom') {
            params.set('period', period);
        } else {
            params.set('period', 'thismonth');
        }
        return base + '?' + params.toString();
    }

    async function fetchAnalyticsJson(startDate, endDate, period) {
        const token = getAuthToken();
        if (!token) {
            redirectToLogin();
            throw new Error('Unauthorized');
        }

        const urls = [
            buildAnalyticsUrl(API_ANALYTICS, startDate, endDate, period),
            buildAnalyticsUrl(API_ANALYTICS_FALLBACK, startDate, endDate, period)
        ];

        let lastError = null;

        for (const url of urls) {
            try {
                const res = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'Accept': 'application/json'
                    }
                });

                if (res.status === 401 || res.status === 403) {
                    let redirectTarget = LOGIN_URL;
                    try {
                        const body = await res.json();
                        if (body && body.redirect) redirectTarget = body.redirect;
                    } catch (_) { /* use default */ }
                    redirectToLogin(redirectTarget);
                    throw new Error('Unauthorized');
                }

                if (!res.ok) {
                    lastError = new Error('HTTP ' + res.status + ' for ' + url);
                    console.warn('[Analytics]', lastError.message);
                    continue;
                }

                const json = await res.json();
                if (json && json.success === true) {
                    return json;
                }

                lastError = new Error((json && json.message) || 'API returned success:false');
                console.warn('[Analytics]', lastError.message, json);
            } catch (err) {
                if (err.message === 'Unauthorized') throw err;
                lastError = err;
                console.warn('[Analytics] Request failed:', url, err.message);
            }
        }

        throw lastError || new Error('All analytics endpoints failed');
    }

    /**
     * Merge { summary, chartData, data } API shapes into one UI-ready object.
     */
    function normalizeAnalyticsPayload(body) {
        if (!body || body.success !== true) return null;

        const summary = body.summary || {};
        const chartData = Array.isArray(body.chartData) ? body.chartData : [];
        const legacy = body.data || {};

        const grossRevenue = Number(
            summary.grossRevenue ?? summary.revenue ?? summary.sales ??
            legacy.totalRevenue ?? 0
        ) || 0;
        const netProfit = Number(
            summary.netProfit ?? summary.profit ?? legacy.netProfit ?? 0
        ) || 0;
        const totalCOGS = Number(summary.cogs ?? legacy.totalCOGS ?? 0) || 0;
        const totalDiscounts = Number(summary.discounts ?? legacy.totalDiscounts ?? 0) || 0;
        const totalShipping = Number(summary.shipping ?? legacy.totalShipping ?? 0) || 0;
        const totalOrders = Number(summary.orders ?? legacy.totalOrders ?? 0) || 0;
        const profitMargin = Number(summary.profitMargin ?? legacy.profitMargin ?? 0) || 0;
        const avgOrderValue = Number(
            summary.avgOrderValue ?? legacy.avgOrderValue ??
            (totalOrders > 0 ? grossRevenue / totalOrders : 0)
        ) || 0;

        const revenueVsProfit = legacy.revenueVsProfit || {
            labels: chartData.map((row) => row.label || ''),
            revenue: chartData.map((row) => Number(row.revenue) || 0),
            profit: chartData.map((row) => Number(row.profit) || 0),
            cogs: chartData.map((row) => Number(row.cogs) || 0)
        };

        return {
            grossRevenue,
            totalRevenue: grossRevenue,
            netProfit,
            totalCOGS,
            totalDiscounts,
            totalShipping,
            totalOrders,
            profitMargin,
            avgOrderValue,
            revenueVsProfit,
            topCategories: legacy.topCategories || { labels: [], values: [] }
        };
    }

    /* =====================================================================
       5. RENDER KPI CARDS
       ===================================================================== */
    function updatePeriodLabels(dateRange) {
        const label = PERIOD_LABELS[currentPeriod] || 'Selected period';
        setText('kpiSalesLabel', label + ' Sales (Gross Revenue)');

        const chartSub = $('chartPeriodSub');
        if (chartSub && dateRange) {
            const granularity = dateRange.groupBy === 'day' ? 'Daily' : 'Monthly';
            chartSub.textContent = granularity + ' breakdown · ' +
                formatShortDate(dateRange.startDate) + ' – ' +
                formatShortDate(dateRange.endDate);
        }
    }

    function updateDateRangeLabel() {
        const labelEl = $('dateRangeLabel');
        if (!labelEl) return;

        if (currentPeriod === 'custom' && customStartDate && customEndDate) {
            labelEl.textContent = customStartDate + ' – ' + customEndDate;
            return;
        }
        labelEl.textContent = PERIOD_LABELS[currentPeriod] || 'This Month';
    }

    function renderCards(data, dateRange) {
        if (!data) return;

        // Primary KPI row
        setText('kpiGrossRevenue', formatMoney(data.grossRevenue));
        setText('kpiGrossRevenueMeta', formatNumber(data.totalOrders) + ' orders · ' +
            formatMoney(data.avgOrderValue) + ' avg.');
        setText('kpiNetProfit', formatMoney(data.netProfit));
        setText('kpiNetProfitMeta', 'COGS ' + formatMoney(data.totalCOGS) +
            ' · Shipping ' + formatMoney(data.totalShipping));
        setText('kpiTotalOrders', formatNumber(data.totalOrders));
        setText('kpiAvgOrder', formatMoney(data.avgOrderValue) + ' avg. order value');
        setText('kpiProfitMargin', formatPercent(data.profitMargin));
        setText('kpiDiscountsMeta', formatMoney(data.totalDiscounts) +
            ' discounts & redemptions');

        // Itemized breakdown row
        setText('statCOGS', formatMoney(data.totalCOGS));
        setText('statDiscounts', formatMoney(data.totalDiscounts));
        setText('statShipping', formatMoney(data.totalShipping));
        setText('statOrders', formatNumber(data.totalOrders));

        updatePeriodLabels(dateRange);
        updateDateRangeLabel();

        const updated = $('lastUpdated');
        if (updated) {
            updated.textContent = 'Updated ' + new Date().toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    /* =====================================================================
       6. CHART.JS — create once, update in place
       ===================================================================== */
    function buildGradient(ctx, area, colorTop, colorBottom) {
        if (!area) return colorTop;
        const gradient = ctx.createLinearGradient(0, area.top, 0, area.bottom);
        gradient.addColorStop(0, colorTop);
        gradient.addColorStop(1, colorBottom);
        return gradient;
    }

    function updateRevenueProfitChart(chartPayload) {
        const canvas = $('revenueProfitChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const labels = (chartPayload && chartPayload.labels) || [];
        const revenue = (chartPayload && chartPayload.revenue) || [];
        const profit = (chartPayload && chartPayload.profit) || [];

        if (revenueProfitChart) {
            revenueProfitChart.data.labels = labels;
            revenueProfitChart.data.datasets[0].data = revenue;
            revenueProfitChart.data.datasets[1].data = profit;
            revenueProfitChart.data.datasets[0].label = 'Gross Revenue';
            revenueProfitChart.data.datasets[1].label = 'Net Profit';
            revenueProfitChart.update('active');
            return;
        }

        const ctx = canvas.getContext('2d');
        revenueProfitChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Gross Revenue',
                        data: revenue,
                        borderColor: '#38bdf8',
                        backgroundColor: (context) => buildGradient(
                            context.chart.ctx, context.chart.chartArea,
                            'rgba(56, 189, 248, 0.35)', 'rgba(56, 189, 248, 0.02)'
                        ),
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointRadius: 3,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#38bdf8'
                    },
                    {
                        label: 'Net Profit',
                        data: profit,
                        borderColor: '#34d399',
                        backgroundColor: (context) => buildGradient(
                            context.chart.ctx, context.chart.chartArea,
                            'rgba(52, 211, 153, 0.30)', 'rgba(52, 211, 153, 0.02)'
                        ),
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointRadius: 3,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#34d399'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                animation: { duration: 450, easing: 'easeOutQuart' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        titleColor: '#f1f5f9',
                        bodyColor: '#cbd5e1',
                        callbacks: {
                            label: (item) => item.dataset.label + ': ' + CURRENCY +
                                Number(item.parsed.y || 0).toLocaleString('en-US')
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: readCssVar('--fa-grid-line', 'rgba(255,255,255,0.05)') },
                        ticks: {
                            color: readCssVar('--fa-axis-text', '#94a3b8'),
                            maxRotation: 0,
                            autoSkip: true
                        }
                    },
                    y: {
                        grid: { color: readCssVar('--fa-grid-line', 'rgba(255,255,255,0.06)') },
                        ticks: {
                            color: readCssVar('--fa-axis-text', '#94a3b8'),
                            callback: (value) => CURRENCY + Number(value).toLocaleString('en-US')
                        }
                    }
                }
            }
        });
    }

    function updateTopCategoriesChart(chartPayload) {
        const canvas = $('topCategoriesChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const labels = (chartPayload && chartPayload.labels) || [];
        const values = (chartPayload && chartPayload.values) || [];
        const palette = ['#6366f1', '#38bdf8', '#34d399', '#f59e0b', '#a855f7', '#f43f5e', '#94a3b8'];
        const hasData = values.some((v) => Number(v) > 0);
        const finalLabels = hasData ? labels : ['No sales yet'];
        const finalValues = hasData ? values : [1];

        if (topCategoriesChart) {
            topCategoriesChart.data.labels = finalLabels;
            topCategoriesChart.data.datasets[0].data = finalValues;
            topCategoriesChart.data.datasets[0].backgroundColor =
                hasData ? palette.slice(0, finalLabels.length) : ['rgba(148,163,184,0.25)'];
            topCategoriesChart.options.plugins.tooltip.enabled = hasData;
            topCategoriesChart.update('active');
            return;
        }

        const ctx = canvas.getContext('2d');
        topCategoriesChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: finalLabels,
                datasets: [{
                    data: finalValues,
                    backgroundColor: hasData ? palette : ['rgba(148,163,184,0.25)'],
                    borderColor: 'rgba(15, 23, 42, 0.6)',
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                animation: { duration: 450, easing: 'easeOutQuart' },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: readCssVar('--fa-axis-text', '#cbd5e1'),
                            padding: 14,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            font: { size: 12 }
                        }
                    },
                    tooltip: {
                        enabled: hasData,
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: (item) => {
                                const total = finalValues.reduce((s, v) => s + Number(v), 0) || 1;
                                const pct = Math.round((Number(item.parsed) / total) * 100);
                                return item.label + ': ' + CURRENCY +
                                    Number(item.parsed).toLocaleString('en-US') + ' (' + pct + '%)';
                            }
                        }
                    }
                }
            }
        });
    }

    function updateCharts(data) {
        try {
            updateRevenueProfitChart(data.revenueVsProfit);
        } catch (err) {
            console.error('[Analytics] Revenue chart error:', err);
        }
        try {
            updateTopCategoriesChart(data.topCategories);
        } catch (err) {
            console.error('[Analytics] Categories chart error:', err);
        }
    }

    /* =====================================================================
       7. CORE DATA LOADER — loadAnalyticsData(startDate, endDate, period)
       ===================================================================== */
    async function loadAnalyticsData(startDate, endDate, period) {
        showCardLoading(true);
        setRefreshSpinning(true);
        hideErrorBanner();

        try {
            const apiRes = await fetchAnalyticsJson(startDate, endDate, period);
            const data = normalizeAnalyticsPayload(apiRes);

            if (!data) {
                console.error('[Analytics] Invalid response payload:', apiRes);
                return false;
            }

            hideErrorBanner();
            renderCards(data, apiRes.dateRange);
            updateCharts(data);
            return true;
        } catch (err) {
            if (err.message === 'Unauthorized') return false;
            console.error('[Analytics] loadAnalyticsData failed:', {
                startDate,
                endDate,
                period,
                error: err.message
            });
            return false;
        } finally {
            showCardLoading(false);
            setRefreshSpinning(false);
        }
    }

    /** Convenience wrapper using current UI state */
    async function reloadCurrentRange(showOverlay) {
        if (showOverlay) showFullLoading(true);

        const start = currentPeriod === 'custom' ? customStartDate : null;
        const end = currentPeriod === 'custom' ? customEndDate : null;
        const period = currentPeriod === 'custom' ? null : currentPeriod;

        await loadAnalyticsData(start, end, period);
        showFullLoading(false);
    }

    /* =====================================================================
       8. DATE RANGE EVENT LISTENERS
       ===================================================================== */
    function setActivePeriodButton(period) {
        document.querySelectorAll('.fa-date-preset').forEach((btn) => {
            btn.classList.toggle('fa-date-preset--active', btn.dataset.period === period);
        });
    }

    function closeDatePanel() {
        const panel = $('dateRangePanel');
        const control = $('dateRangeControl');
        const trigger = $('dateRangeBtn');
        if (panel) panel.hidden = true;
        if (control) control.classList.remove('is-open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }

    function openDatePanel() {
        const panel = $('dateRangePanel');
        const control = $('dateRangeControl');
        const trigger = $('dateRangeBtn');
        if (panel) panel.hidden = false;
        if (control) control.classList.add('is-open');
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
    }

    function onPresetClick(period) {
        currentPeriod = period;
        setActivePeriodButton(period);
        updateDateRangeLabel();

        if (period === 'custom') {
            openDatePanel();
            return;
        }

        closeDatePanel();
        loadAnalyticsData(null, null, period);
    }

    function onApplyCustomFilter() {
        const startEl = $('startDateInput');
        const endEl = $('endDateInput');
        const start = startEl ? startEl.value.trim() : '';
        const end = endEl ? endEl.value.trim() : '';

        if (!start || !end) {
            console.warn('[Analytics] Custom filter: both Start Date and End Date are required.');
            return;
        }
        if (start > end) {
            console.warn('[Analytics] Custom filter: Start Date must be on or before End Date.');
            return;
        }

        customStartDate = start;
        customEndDate = end;
        currentPeriod = 'custom';
        setActivePeriodButton('custom');
        updateDateRangeLabel();
        closeDatePanel();
        loadAnalyticsData(start, end, null);
    }

    function initDateRangeControls() {
        const trigger = $('dateRangeBtn');
        const panel = $('dateRangePanel');

        if (trigger) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (panel && panel.hidden) openDatePanel();
                else closeDatePanel();
            });
        }

        document.querySelectorAll('.fa-date-preset').forEach((btn) => {
            btn.addEventListener('click', () => {
                const period = btn.dataset.period;
                if (period) onPresetClick(period);
            });
        });

        const applyBtn = $('applyCustomFilterBtn');
        if (applyBtn) {
            applyBtn.addEventListener('click', onApplyCustomFilter);
        }

        ['startDateInput', 'endDateInput'].forEach((id) => {
            const input = $(id);
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') onApplyCustomFilter();
                });
            }
        });

        document.addEventListener('click', (e) => {
            const control = $('dateRangeControl');
            if (!control || !panel || panel.hidden) return;
            if (!control.contains(e.target)) closeDatePanel();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeDatePanel();
        });
    }

    /* =====================================================================
       9. INIT
       ===================================================================== */
    function init() {
        hideErrorBanner();
        showFullLoading(false);
        initThemeToggle();

        if (!getAuthToken()) {
            redirectToLogin();
            return;
        }

        initDateRangeControls();

        const refreshBtn = $('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => reloadCurrentRange(false));
        }

        reloadCurrentRange(true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
