/********************************************************************
 * Project: EonlineBazar
 * File: js/finance-analytics.js
 * Author: Abdul Karim Sheikh
 * Description: Frontend logic for the Finance & Analytics admin panel.
 * Fetches data from /api/finance/overview & /api/finance/chart-data,
 * renders KPI cards and Chart.js graphs, handles loading states and
 * redirects to the admin login on 401 Unauthorized. JavaScript only.
 ********************************************************************/

(function () {
    'use strict';

    /* =====================================================================
       1. CONFIG & CONSTANTS
       ===================================================================== */
    const ENDPOINTS = {
        overview: '/api/finance/overview',
        chartData: '/api/finance/chart-data'
    };
    const LOGIN_URL = '/finance-login';
    const CURRENCY = '৳';

    // ফাইন্যান্স ড্যাশবোর্ড সেশন টোকেন (ডেডিকেটেড পাসওয়ার্ড লগইন থেকে)।
    // ব্যাকওয়ার্ড কম্প্যাটিবিলিটি: পুরোনো অ্যাডমিন প্যানেল টোকেন থাকলে সেটিও গ্রহণ।
    const FINANCE_TOKEN_KEY = 'financeToken';
    const adminToken = localStorage.getItem(FINANCE_TOKEN_KEY) || localStorage.getItem('adminToken');

    // Chart ইনস্ট্যান্স রেফারেন্স (রি-রেন্ডারে আগেরটি ধ্বংস করার জন্য)
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
        return CURRENCY + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    function formatNumber(value) {
        const n = Number(value) || 0;
        return n.toLocaleString('en-US');
    }

    /* =====================================================================
       3. LOADING & ERROR STATE MANAGEMENT
       ===================================================================== */
    function showLoading() {
        const overlay = $('loadingOverlay');
        if (overlay) overlay.classList.remove('fa-hidden');

        // KPI ও মিনি ভ্যালুতে স্কেলিটন শিমার যোগ করা
        [
            'kpiDailySales', 'kpiDailyOrders', 'kpiMonthlyProfit', 'kpiMonthlyRevenue',
            'kpiTotalOrders', 'kpiAvgOrder', 'kpiNetProfit', 'kpiProfitMargin',
            'statTotalRevenue', 'statDailyProfit', 'statMonthlyOrders', 'statProfitMargin'
        ].forEach((id) => {
            const el = $(id);
            if (el) el.classList.add('fa-skeleton');
        });
    }

    function hideLoading() {
        const overlay = $('loadingOverlay');
        if (overlay) {
            overlay.classList.add('fa-hidden');
            overlay.setAttribute('aria-busy', 'false');
        }
    }

    function showError(message) {
        const banner = $('errorBanner');
        const text = $('errorBannerText');
        if (text) text.textContent = message;
        if (banner) banner.hidden = false;
    }

    function clearError() {
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
       4. SECURE FETCH WRAPPER (401 → redirect to login)
       ===================================================================== */
    function redirectToLogin(target) {
        // টোকেন অবৈধ/মেয়াদোত্তীর্ণ হলে সেশন ক্লিয়ার করে লগইন পেজে পাঠানো
        // localStorage + সার্ভার গার্ডের কুকি — দুটোই মুছে ফেলা হয় (স্টেল এড়াতে)
        localStorage.removeItem(FINANCE_TOKEN_KEY);
        document.cookie = 'financeToken=; path=/; max-age=0; SameSite=Strict';
        const dest = target || LOGIN_URL;
        // replace() ব্যবহার করা হলো যাতে ব্যাক বাটনে আবার ব্লকড পেজে ফিরে না আসে
        window.location.replace(dest);
    }

    async function secureFetch(url) {
        let res;
        try {
            res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + adminToken,
                    'Content-Type': 'application/json'
                }
            });
        } catch (networkErr) {
            // নেটওয়ার্ক/সার্ভার ডাউন — রিডাইরেক্ট নয়, এরর ব্যানার দেখাবে
            throw new Error('Network error');
        }

        // 🌟 401 (Unauthorized) বা 403 (Forbidden / অ্যাডমিন নয়) ইন্টারসেপ্ট করে
        // সরাসরি লগইন পেজে পাঠানো — কখনোই ব্ল্যাঙ্ক স্ক্রিন বা র-JSON দেখাবে না।
        if (res.status === 401 || res.status === 403) {
            let redirectTarget = LOGIN_URL;
            try {
                const body = await res.json();
                if (body && body.redirect) redirectTarget = body.redirect;
            } catch (_) { /* বডি পার্স না হলে ডিফল্ট টার্গেট */ }
            redirectToLogin(redirectTarget);
            throw new Error('Unauthorized');
        }

        if (!res.ok) {
            throw new Error('Request failed with status ' + res.status);
        }

        return res.json();
    }

    /* =====================================================================
       5. RENDER: KPI CARDS & STATS
       ===================================================================== */
    function renderOverview(data) {
        if (!data) return;

        setText('kpiDailySales', formatMoney(data.dailyRevenue));
        setText('kpiDailyOrders', formatNumber(data.dailyOrders) + ' orders today');

        setText('kpiMonthlyProfit', formatMoney(data.monthlyProfit));
        setText('kpiMonthlyRevenue', formatMoney(data.monthlyRevenue) + ' revenue this month');

        setText('kpiTotalOrders', formatNumber(data.totalOrders));
        setText('kpiAvgOrder', formatMoney(data.avgOrderValue) + ' avg. order value');

        setText('kpiNetProfit', formatMoney(data.netProfit));
        setText('kpiProfitMargin', (Number(data.profitMargin) || 0) + '% margin');

        setText('statTotalRevenue', formatMoney(data.totalRevenue));
        setText('statDailyProfit', formatMoney(data.dailyProfit));
        setText('statMonthlyOrders', formatNumber(data.monthlyOrders));
        setText('statProfitMargin', (Number(data.profitMargin) || 0) + '%');

        const updated = $('lastUpdated');
        if (updated) {
            updated.textContent = 'Updated ' + new Date().toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit'
            });
        }
    }

    /* =====================================================================
       6. RENDER: CHARTS (Chart.js)
       ===================================================================== */
    function buildGradient(ctx, area, colorTop, colorBottom) {
        if (!area) return colorTop;
        const gradient = ctx.createLinearGradient(0, area.top, 0, area.bottom);
        gradient.addColorStop(0, colorTop);
        gradient.addColorStop(1, colorBottom);
        return gradient;
    }

    function renderRevenueProfitChart(chart) {
        const canvas = $('revenueProfitChart');
        if (!canvas || typeof Chart === 'undefined' || !chart) return;

        const ctx = canvas.getContext('2d');
        const labels = chart.labels || [];
        const revenue = chart.revenue || [];
        const profit = chart.profit || [];

        if (revenueProfitChart) revenueProfitChart.destroy();

        revenueProfitChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Revenue',
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
                        label: 'Profit',
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
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.06)' },
                        ticks: {
                            color: '#94a3b8',
                            callback: (value) => CURRENCY + Number(value).toLocaleString('en-US')
                        }
                    }
                }
            }
        });
    }

    function renderTopCategoriesChart(chart) {
        const canvas = $('topCategoriesChart');
        if (!canvas || typeof Chart === 'undefined' || !chart) return;

        const ctx = canvas.getContext('2d');
        const labels = chart.labels || [];
        const values = chart.values || [];

        const palette = ['#6366f1', '#38bdf8', '#34d399', '#f59e0b', '#a855f7', '#f43f5e', '#94a3b8'];

        if (topCategoriesChart) topCategoriesChart.destroy();

        // ডাটা না থাকলে একটি প্লেসহোল্ডার স্লাইস দেখানো
        const hasData = values.some((v) => Number(v) > 0);
        const finalLabels = hasData ? labels : ['No sales yet'];
        const finalValues = hasData ? values : [1];

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
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#cbd5e1',
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

    /* =====================================================================
       7. ORCHESTRATION: LOAD ALL DATA
       ===================================================================== */
    async function loadAnalytics() {
        clearError();
        showLoading();
        setRefreshSpinning(true);

        try {
            const [overviewRes, chartRes] = await Promise.all([
                secureFetch(ENDPOINTS.overview),
                secureFetch(ENDPOINTS.chartData)
            ]);

            if (overviewRes && overviewRes.success) {
                renderOverview(overviewRes.data);
            } else {
                showError((overviewRes && overviewRes.message) || 'Failed to load overview data.');
            }

            if (chartRes && chartRes.success && chartRes.data) {
                renderRevenueProfitChart(chartRes.data.revenueVsProfit);
                renderTopCategoriesChart(chartRes.data.topCategories);
            } else {
                showError((chartRes && chartRes.message) || 'Failed to load chart data.');
            }
        } catch (err) {
            if (err && err.message === 'Unauthorized') return; // রিডাইরেক্ট চলছে
            console.error('Finance analytics load error:', err);
            showError('Unable to load analytics. Please check your connection and try again.');
        } finally {
            hideLoading();
            setRefreshSpinning(false);
        }
    }

    /* =====================================================================
       8. INIT (DOMContentLoaded)
       ===================================================================== */
    function init() {
        // টোকেন না থাকলে সরাসরি লগইন পেজে (সিকিউরিটি গেটওয়ে)
        if (!adminToken) {
            redirectToLogin();
            return;
        }

        const refreshBtn = $('refreshBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', loadAnalytics);

        loadAnalytics();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();








