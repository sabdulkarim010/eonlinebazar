/**
 * Project: EOnlineBazar — ERP Advanced Profit & Loss (finance dashboard)
 * File: js/admin/modules/erp-profit-loss.js
 *
 * Renders the P&L report inside #view-finance: summary cards, an inline-SVG
 * cost-breakdown donut, a revenue-vs-cost bar chart, and product/expense
 * tables. Talks to GET /api/admin/finance/profit-loss and the PDF/CSV
 * export endpoints (superadmin only).
 *
 * Chart.js is NOT loaded in the admin bundle, so all charts are hand-drawn
 * as inline SVG to avoid adding a dependency.
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

function plRenderCards(report) {
    const els = plGetEls();
    if (!els.cards) return;

    const margin = report.profit.marginPercent;
    const marginTone = report.profit.net >= 0 ? 'pl-card--good' : 'pl-card--bad';

    const cards = [
        { label: 'Net Revenue', value: plFormatMoney(report.revenue.net), sub: `Gross ${plFormatMoney(report.revenue.gross)}`, tone: '' },
        { label: 'Total Cost', value: plFormatMoney(report.costs.total), sub: `COGS ${plFormatMoney(report.costs.buying)}`, tone: '' },
        { label: 'Gross Profit', value: plFormatMoney(report.profit.gross), sub: 'Net revenue − COGS', tone: '' },
        { label: 'Net Profit', value: plFormatMoney(report.profit.net), sub: `Margin ${margin}%`, tone: marginTone },
        { label: 'Delivered Orders', value: String(report.orders.delivered), sub: `Returns ${plFormatMoney(report.revenue.returns)}`, tone: '' }
    ];

    els.cards.innerHTML = cards.map((c) => `
        <div class="pl-card ${c.tone}">
            <span class="pl-card-label">${plEscape(c.label)}</span>
            <span class="pl-card-value">${plEscape(c.value)}</span>
            <span class="pl-card-sub">${plEscape(c.sub)}</span>
        </div>
    `).join('');
}

function plRenderDonut(report) {
    const els = plGetEls();
    if (!els.donut) return;

    const slices = PL_COST_SLICES
        .map((s) => ({ ...s, value: Number(report.costs[s.key] || 0) }))
        .filter((s) => s.value > 0);

    const total = slices.reduce((sum, s) => sum + s.value, 0);

    if (total <= 0) {
        els.donut.innerHTML = '<p class="pl-empty">No cost data for this period.</p>';
        return;
    }

    const cx = 90;
    const cy = 90;
    const r = 70;
    const strokeW = 34;
    const circumference = 2 * Math.PI * r;
    let offset = 0;

    const segments = slices.map((s) => {
        const fraction = s.value / total;
        const dash = fraction * circumference;
        const seg = `
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
                stroke="${s.color}" stroke-width="${strokeW}"
                stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}"
                stroke-dashoffset="${(-offset).toFixed(2)}"
                transform="rotate(-90 ${cx} ${cy})">
                <title>${plEscape(s.label)}: ${plEscape(plFormatMoney(s.value))} (${(fraction * 100).toFixed(1)}%)</title>
            </circle>`;
        offset += dash;
        return seg;
    }).join('');

    const legend = slices.map((s) => `
        <li class="pl-legend-item">
            <span class="pl-legend-dot" style="background:${s.color};"></span>
            <span class="pl-legend-label">${plEscape(s.label)}</span>
            <span class="pl-legend-value">${plEscape(plFormatMoney(s.value))}</span>
        </li>
    `).join('');

    els.donut.innerHTML = `
        <div class="pl-donut-chart">
            <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="Cost breakdown donut chart">
                ${segments}
                <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="pl-donut-total-label">Total</text>
                <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="pl-donut-total-value">${plEscape(plFormatMoney(total))}</text>
            </svg>
            <ul class="pl-legend">${legend}</ul>
        </div>`;
}

function plRenderBar(report) {
    const els = plGetEls();
    if (!els.bar) return;

    const series = Array.isArray(report.series) ? report.series : [];
    if (!series.length) {
        els.bar.innerHTML = '<p class="pl-empty">No time-series data for this period.</p>';
        return;
    }

    const maxVal = Math.max(1, ...series.map((s) => Math.max(s.revenue, s.cost)));
    const chartH = 200;
    const chartW = Math.max(320, series.length * 70);
    const barGroupW = chartW / series.length;
    const barW = Math.min(20, barGroupW / 3);
    const baseY = chartH - 24;
    const usableH = baseY - 10;

    const bars = series.map((s, i) => {
        const groupX = i * barGroupW + barGroupW / 2;
        const revH = (s.revenue / maxVal) * usableH;
        const costH = (s.cost / maxVal) * usableH;
        const revX = groupX - barW - 2;
        const costX = groupX + 2;
        return `
            <rect x="${revX.toFixed(1)}" y="${(baseY - revH).toFixed(1)}" width="${barW}" height="${revH.toFixed(1)}" fill="#2563eb" rx="2">
                <title>${plEscape(s.label)} revenue: ${plEscape(plFormatMoney(s.revenue))}</title>
            </rect>
            <rect x="${costX.toFixed(1)}" y="${(baseY - costH).toFixed(1)}" width="${barW}" height="${costH.toFixed(1)}" fill="#f59e0b" rx="2">
                <title>${plEscape(s.label)} cost: ${plEscape(plFormatMoney(s.cost))}</title>
            </rect>
            <text x="${groupX.toFixed(1)}" y="${chartH - 6}" text-anchor="middle" class="pl-bar-label">${plEscape(s.label)}</text>`;
    }).join('');

    els.bar.innerHTML = `
        <div class="pl-bar-legend">
            <span><i class="pl-legend-dot" style="background:#2563eb;"></i> Revenue</span>
            <span><i class="pl-legend-dot" style="background:#f59e0b;"></i> Cost</span>
        </div>
        <div class="pl-bar-scroll">
            <svg viewBox="0 0 ${chartW} ${chartH}" width="${chartW}" height="${chartH}" role="img" aria-label="Revenue versus cost bar chart">
                <line x1="0" y1="${baseY}" x2="${chartW}" y2="${baseY}" stroke="#e2e8f0" stroke-width="1"/>
                ${bars}
            </svg>
        </div>`;
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

function plRenderCharts(report) {
    plRenderDonut(report);
    plRenderBar(report);
}

function plRenderReport(report) {
    const els = plGetEls();
    plLastReport = report;

    if (els.period) {
        const start = new Date(report.period.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const end = new Date(report.period.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        els.period.textContent = `Period: ${start} → ${end} · grouped by ${report.period.groupBy}`;
    }

    plRenderCards(report);
    plRenderCharts(report);
    plRenderProductRows(report.topProducts, els.topBody);
    plRenderProductRows(report.worstProducts, els.worstBody, { worst: true });
    plRenderExpenses(report);

    if (els.result) els.result.hidden = false;
    plSetExportsEnabled(true);
}

/* ------------------------------------------------------------------ */
/* Data + exports                                                     */
/* ------------------------------------------------------------------ */

async function loadPLReport() {
    const els = plGetEls();
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
window.exportPLReportPDF = exportPDF;
window.exportPLReportCSV = exportCSV;
