/**
 * Project: EOnlineBazar — ERP Advanced Profit & Loss (finance dashboard)
 * File: js/admin/modules/erp-profit-loss.js
 *
 * Renders the P&L report inside #view-finance: summary cards, an inline-SVG
 * cost-breakdown donut, a revenue-vs-cost bar chart, and product/expense
 * tables. Talks to GET /api/admin/finance/profit-loss and the PDF/CSV
 * export endpoints (superadmin only).
 *
 * Charts use Chart.js (loaded in admin/partials/head.html).
 */
import '../admin-core.js';

const PL_COST_SLICES = [
    { key: 'buying', label: 'Buying (COGS)', color: '#2563eb' },
    { key: 'courier', label: 'Courier', color: '#0ea5e9' },
    { key: 'returnLoss', label: 'Return Loss', color: '#ef4444' },
    { key: 'expensesTotal', label: 'Expenses', color: '#f59e0b' },
    { key: 'cashback', label: 'Cashback', color: '#8b5cf6' },
    { key: 'discounts', label: 'Discounts', color: '#14b8a6' }
];

const PL_EXPENSE_LABELS = {
    office_rent: 'Office Rent',
    utilities: 'Utilities',
    staff_salary: 'Staff Salary',
    marketing: 'Marketing',
    courier_charges: 'Courier Charges',
    packaging: 'Packaging',
    equipment: 'Equipment',
    other: 'Other'
};

let plLastReport = null;
let plDonutChart = null;
let plBarChart = null;
let plTrendChart = null;

function plFormatMoney(n) {
    return typeof formatAdminPrice === 'function'
        ? formatAdminPrice(n)
        : `৳ ${Number(n || 0).toLocaleString()}`;
}

function plEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function plToDateInput(date) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function plGetEls() {
    return {
        start: document.getElementById('plStartDate'),
        end: document.getElementById('plEndDate'),
        groupBy: document.getElementById('plGroupBy'),
        generateBtn: document.getElementById('plGenerateBtn'),
        pdfBtn: document.getElementById('plExportPdfBtn'),
        csvBtn: document.getElementById('plExportCsvBtn'),
        spinner: document.getElementById('plSpinner'),
        error: document.getElementById('plError'),
        result: document.getElementById('plResult'),
        period: document.getElementById('plPeriodLabel'),
        cards: document.getElementById('plSummaryCards'),
        donut: document.getElementById('plCostsDonut'),
        bar: document.getElementById('plRevenueCostBar'),
        trend: document.getElementById('plTrendChart'),
        topBody: document.getElementById('plTopProductsBody'),
        worstBody: document.getElementById('plWorstProductsBody'),
        expenseBody: document.getElementById('plExpenseBreakdownBody')
    };
}

function plCurrentQuery() {
    const els = plGetEls();
    const params = new URLSearchParams();
    if (els.start?.value) params.set('startDate', els.start.value);
    if (els.end?.value) params.set('endDate', els.end.value);
    if (els.groupBy?.value) params.set('groupBy', els.groupBy.value);
    return params.toString();
}

function plSetExportsEnabled(enabled) {
    const els = plGetEls();
    if (els.pdfBtn) els.pdfBtn.disabled = !enabled;
    if (els.csvBtn) els.csvBtn.disabled = !enabled;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                          */
/* ------------------------------------------------------------------ */

function renderSummaryCards(report) {
    const els = plGetEls();
    if (!els.cards) return;

    const margin = report.profit.marginPercent;
    const profitPositive = report.profit.net >= 0;

    const cards = [
        { label: 'Gross Revenue', value: plFormatMoney(report.revenue.gross), sub: `Returns ${plFormatMoney(report.revenue.returns)}`, tone: '' },
        { label: 'Net Revenue', value: plFormatMoney(report.revenue.net), sub: 'After return deductions', tone: '' },
        { label: 'Total Costs', value: plFormatMoney(report.costs.total), sub: `COGS ${plFormatMoney(report.costs.buying)}`, tone: '' },
        { label: 'Net Profit', value: plFormatMoney(report.profit.net), sub: `Gross profit ${plFormatMoney(report.profit.gross)}`, tone: profitPositive ? 'pl-card--good' : 'pl-card--bad' },
        { label: 'Margin %', value: `${margin}%`, sub: profitPositive ? 'Profitable period' : 'Loss period', tone: profitPositive ? 'pl-card--good' : 'pl-card--bad' }
    ];

    els.cards.innerHTML = cards.map((c) => `
        <div class="pl-card ${c.tone}">
            <span class="pl-card-label">${plEscape(c.label)}</span>
            <span class="pl-card-value">${plEscape(c.value)}</span>
            <span class="pl-card-sub">${plEscape(c.sub)}</span>
        </div>
    `).join('');
}

function plDestroyCharts() {
    if (plDonutChart) { plDonutChart.destroy(); plDonutChart = null; }
    if (plBarChart) { plBarChart.destroy(); plBarChart = null; }
    if (plTrendChart) { plTrendChart.destroy(); plTrendChart = null; }
}

function renderCharts(report) {
    if (typeof Chart === 'undefined') return;
    const els = plGetEls();
    plDestroyCharts();

    const expenseSlices = Object.entries(report.costs.expenses || {})
        .map(([key, value]) => ({
            label: PL_EXPENSE_LABELS[key] || key,
            value: Number(value || 0),
            color: {
                office_rent: '#8b5cf6',
                utilities: '#3b82f6',
                staff_salary: '#ec4899',
                marketing: '#f97316',
                courier_charges: '#0ea5e9',
                packaging: '#eab308',
                equipment: '#64748b',
                other: '#94a3b8'
            }[key] || '#cbd5e1'
        }))
        .filter((s) => s.value > 0);

    if (els.donut) {
        const donutData = expenseSlices.length
            ? expenseSlices
            : PL_COST_SLICES
                .map((s) => ({ label: s.label, value: Number(report.costs[s.key] || 0), color: s.color }))
                .filter((s) => s.value > 0);

        if (!donutData.length) {
            plDonutChart = null;
        } else {
            plDonutChart = new Chart(els.donut, {
                type: 'doughnut',
                data: {
                    labels: donutData.map((s) => s.label),
                    datasets: [{
                        data: donutData.map((s) => s.value),
                        backgroundColor: donutData.map((s) => s.color),
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }
    }

    const series = Array.isArray(report.trend) ? report.trend
        : (Array.isArray(report.series) ? report.series.map((s) => ({
            period: s.label,
            revenue: s.revenue,
            cost: s.cost,
            profit: s.profit
        })) : []);

    if (els.bar && series.length) {
        plBarChart = new Chart(els.bar, {
            type: 'bar',
            data: {
                labels: series.map((s) => s.period),
                datasets: [
                    {
                        label: 'Revenue',
                        data: series.map((s) => s.revenue),
                        backgroundColor: '#2563eb',
                        borderRadius: 4
                    },
                    {
                        label: 'Cost',
                        data: series.map((s) => s.cost),
                        backgroundColor: '#f59e0b',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    if (els.trend && series.length) {
        plTrendChart = new Chart(els.trend, {
            type: 'line',
            data: {
                labels: series.map((s) => s.period),
                datasets: [
                    {
                        label: 'Revenue',
                        data: series.map((s) => s.revenue),
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        tension: 0.3,
                        fill: false
                    },
                    {
                        label: 'Cost',
                        data: series.map((s) => s.cost),
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.08)',
                        tension: 0.3,
                        fill: false
                    },
                    {
                        label: 'Profit',
                        data: series.map((s) => s.profit),
                        borderColor: '#16a34a',
                        backgroundColor: 'rgba(22, 163, 74, 0.08)',
                        tension: 0.3,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

function renderTopProducts(report) {
    const els = plGetEls();
    plRenderProductRows(report.topProducts, els.topBody);
    plRenderProductRows(report.worstProducts, els.worstBody, { worst: true });
    plRenderExpenses(report);
}

function plRenderProductRows(products, tbody, { worst = false } = {}) {
    if (!tbody) return;
    if (!Array.isArray(products) || !products.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="pl-empty">No products in this period.</td></tr>';
        return;
    }
    tbody.innerHTML = products.map((p) => {
        const margin = p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) : '0.0';
        const profitClass = p.profit >= 0 ? 'pl-pos' : 'pl-neg';
        return `
            <tr>
                <td>${plEscape(p.name)}</td>
                <td class="pl-num">${plEscape(String(p.qty || 0))}</td>
                <td class="pl-num">${plEscape(plFormatMoney(p.revenue))}</td>
                <td class="pl-num ${profitClass}">${plEscape(plFormatMoney(p.profit))}</td>
                <td class="pl-num ${profitClass}">${margin}%</td>
            </tr>`;
    }).join('');
}

function plRenderExpenses(report) {
    const els = plGetEls();
    if (!els.expenseBody) return;

    const byCategory = report.costs.expenses || {};
    const total = Number(report.costs.expensesTotal || 0);
    const rows = Object.entries(byCategory)
        .map(([key, value]) => ({ key, value: Number(value || 0) }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value);

    if (!rows.length) {
        els.expenseBody.innerHTML = '<tr><td colspan="3" class="pl-empty">No operating expenses recorded.</td></tr>';
        return;
    }

    els.expenseBody.innerHTML = rows.map((r) => {
        const share = total > 0 ? ((r.value / total) * 100).toFixed(1) : '0.0';
        return `
            <tr>
                <td>${plEscape(PL_EXPENSE_LABELS[r.key] || r.key)}</td>
                <td class="pl-num">${plEscape(plFormatMoney(r.value))}</td>
                <td class="pl-num">${share}%</td>
            </tr>`;
    }).join('') + `
        <tr class="pl-table-total">
            <td>Total Expenses</td>
            <td class="pl-num">${plEscape(plFormatMoney(total))}</td>
            <td class="pl-num">100%</td>
        </tr>`;
}

function plRenderReport(report) {
    const els = plGetEls();
    plLastReport = report;

    if (els.period) {
        const start = new Date(report.period.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const end = new Date(report.period.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        els.period.textContent = `Period: ${start} → ${end} · grouped by ${report.period.groupBy}`;
    }

    renderSummaryCards(report);
    renderCharts(report);
    renderTopProducts(report);

    if (els.result) els.result.hidden = false;
    plSetExportsEnabled(true);
}

/* ------------------------------------------------------------------ */
/* Data + exports                                                     */
/* ------------------------------------------------------------------ */

async function loadPLReport(startDate, endDate, groupBy) {
    const els = plGetEls();
    if (startDate && els.start) els.start.value = startDate;
    if (endDate && els.end) els.end.value = endDate;
    if (groupBy && els.groupBy) els.groupBy.value = groupBy;
    if (!els.result) return;

    if (els.error) els.error.hidden = true;
    if (els.spinner) els.spinner.hidden = false;
    els.result.hidden = true;
    plSetExportsEnabled(false);

    try {
        const res = await fetch(`/api/admin/finance/profit-loss?${plCurrentQuery()}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
            throw new Error(data.message || 'Failed to load the Profit & Loss report.');
        }

        plRenderReport(data.data);
    } catch (err) {
        console.error('P&L report error:', err);
        if (els.error) {
            els.error.textContent = err.message || 'Failed to load the Profit & Loss report.';
            els.error.hidden = false;
        }
        if (typeof showToast === 'function') showToast(err.message || 'Failed to load P&L report.', 'error');
    } finally {
        if (els.spinner) els.spinner.hidden = true;
    }
}

async function plDownloadExport(kind) {
    const path = kind === 'csv' ? 'export-csv' : 'export-pdf';
    const ext = kind === 'csv' ? 'csv' : 'pdf';
    const btn = kind === 'csv' ? plGetEls().csvBtn : plGetEls().pdfBtn;
    const original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exporting…'; }

    try {
        const res = await fetch(`/api/admin/finance/profit-loss/${path}?${plCurrentQuery()}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
            let message = `Export failed (${res.status}).`;
            try { const j = await res.json(); message = j.message || message; } catch { /* binary */ }
            throw new Error(message);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `profit-loss-${new Date().toISOString().slice(0, 10)}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        if (typeof showToast === 'function') showToast(`P&L ${ext.toUpperCase()} downloaded.`, 'success');
    } catch (err) {
        console.error('P&L export error:', err);
        if (typeof showToast === 'function') showToast(err.message || 'Export failed.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
}

function exportPDF() { return plDownloadExport('pdf'); }
function exportCSV() { return plDownloadExport('csv'); }

/* ------------------------------------------------------------------ */
/* Init                                                               */
/* ------------------------------------------------------------------ */

let plInitialized = false;

function initProfitLossReport() {
    const els = plGetEls();
    if (!els.generateBtn) return; // finance partial not mounted (non-superadmin)

    // Default the range to the current month on first mount.
    if (!plInitialized) {
        const now = new Date();
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        if (els.start && !els.start.value) els.start.value = plToDateInput(firstOfMonth);
        if (els.end && !els.end.value) els.end.value = plToDateInput(now);

        els.generateBtn.addEventListener('click', loadPLReport);
        if (els.pdfBtn) els.pdfBtn.addEventListener('click', exportPDF);
        if (els.csvBtn) els.csvBtn.addEventListener('click', exportCSV);

        plInitialized = true;
    }

    // Auto-run the report the first time (and every time the finance view opens
    // if no report is on screen yet).
    if (!plLastReport) loadPLReport();
}

window.initProfitLossReport = initProfitLossReport;
window.loadPLReport = loadPLReport;
window.renderSummaryCards = renderSummaryCards;
window.renderCharts = renderCharts;
window.renderTopProducts = renderTopProducts;
window.exportPDF = exportPDF;
window.exportCSV = exportCSV;
window.exportPLReportPDF = exportPDF;
window.exportPLReportCSV = exportCSV;
