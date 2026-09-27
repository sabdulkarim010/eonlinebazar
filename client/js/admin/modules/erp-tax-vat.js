/**
 * Project: EOnlineBazar — Tax & VAT Compliance
 * File: js/admin/modules/erp-tax-vat.js
 */
import '../admin-core.js';

/** @type {'today'|'this-month'|'custom'} */
let taxFilterMode = 'this-month';
let taxInitialized = false;

function taxFormatMoney(value) {
    return typeof formatAdminPrice === 'function'
        ? formatAdminPrice(value)
        : `৳ ${Number(value || 0).toLocaleString()}`;
}

function taxToDateInput(date) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function taxMonthBounds(year, monthIndex) {
    const start = new Date(year, monthIndex, 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(year, monthIndex + 1, 0);
    return { start, end };
}

function taxSetPresetActive(mode) {
    document.querySelectorAll('[data-tax-preset]').forEach((btn) => {
        btn.classList.toggle('accounts-filter-preset--active', btn.dataset.taxPreset === mode);
    });
}

function taxApplyPresetDates() {
    const fromEl = document.getElementById('taxDateFrom');
    const toEl = document.getElementById('taxDateTo');
    const now = new Date();

    if (taxFilterMode === 'today') {
        const today = taxToDateInput(now);
        if (fromEl) fromEl.value = today;
        if (toEl) toEl.value = today;
        return;
    }
    if (taxFilterMode === 'this-month') {
        const { start, end } = taxMonthBounds(now.getFullYear(), now.getMonth());
        if (fromEl) fromEl.value = taxToDateInput(start);
        if (toEl) toEl.value = taxToDateInput(end);
    }
}

function taxBuildQueryParams() {
    taxApplyPresetDates();
    const params = new URLSearchParams();
    const fromEl = document.getElementById('taxDateFrom');
    const toEl = document.getElementById('taxDateTo');
    if (fromEl?.value) params.set('dateFrom', fromEl.value);
    if (toEl?.value) params.set('dateTo', toEl.value);
    return params;
}

function taxUpdateFilterHint() {
    const hint = document.getElementById('taxFilterHint');
    if (!hint) return;
    if (taxFilterMode === 'today') {
        hint.textContent = 'Showing orders placed today';
        return;
    }
    if (taxFilterMode === 'this-month') {
        hint.textContent = 'Showing this calendar month';
        return;
    }
    hint.textContent = 'Custom date range applied';
}

function taxEscapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderTaxVatLedger(data) {
    const summary = data?.summary || {};
    const rows = data?.ledger || [];

    const set = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    set('taxKpiTaxable', taxFormatMoney(summary.totalTaxableRevenue));
    set('taxKpiCollected', taxFormatMoney(summary.totalTaxCollected));
    set('taxKpiPayable', taxFormatMoney(summary.netTaxPayable));
    set('taxKpiExempt', taxFormatMoney(summary.exemptSales));

    const body = document.getElementById('taxVatLedgerBody');
    if (!body) return;

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="7" class="taxvat-empty">No orders in this period.</td></tr>';
        return;
    }

    body.innerHTML = rows.map((row) => {
        const dateLabel = row.date ? new Date(row.date).toLocaleDateString() : '—';
        return `<tr>
            <td><code>${taxEscapeHtml(row.orderId)}</code></td>
            <td>${taxEscapeHtml(dateLabel)}</td>
            <td>${taxEscapeHtml(row.customer)}</td>
            <td class="taxvat-num">${taxFormatMoney(row.taxableAmount)}</td>
            <td class="taxvat-num">${taxEscapeHtml(row.vatRate)}%</td>
            <td class="taxvat-num">${taxFormatMoney(row.taxCollected)}</td>
            <td><span class="taxvat-pay taxvat-pay--${taxEscapeHtml(row.paymentStatus)}">${taxEscapeHtml(row.paymentStatus)}</span></td>
        </tr>`;
    }).join('');
}

function initTaxVatFilters() {
    if (taxInitialized) return;
    taxInitialized = true;

    document.querySelectorAll('[data-tax-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
            taxFilterMode = btn.dataset.taxPreset || 'this-month';
            taxSetPresetActive(taxFilterMode);
            taxUpdateFilterHint();
            if (taxFilterMode !== 'custom') loadTaxVatSection();
        });
    });

    const applyBtn = document.getElementById('taxApplyFilterBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            taxFilterMode = 'custom';
            taxSetPresetActive('custom');
            taxUpdateFilterHint();
            loadTaxVatSection();
        });
    }

    taxSetPresetActive(taxFilterMode);
    taxApplyPresetDates();
    taxUpdateFilterHint();
}

async function loadTaxVatSection() {
    if (typeof window.hasAnyAdminPermission === 'function'
        && !window.hasAnyAdminPermission('view_financial_reports', 'manage_settings')) {
        return;
    }

    initTaxVatFilters();

    const loading = document.getElementById('taxVatLoading');
    const error = document.getElementById('taxVatError');
    const content = document.getElementById('taxVatContent');

    if (loading) loading.hidden = false;
    if (error) error.hidden = true;
    if (content) content.hidden = true;

    try {
        const qs = taxBuildQueryParams().toString();
        const url = qs
            ? `/api/admin/finance/tax-vat-ledger?${qs}`
            : '/api/admin/finance/tax-vat-ledger';

        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const result = await res.json();

        if (!res.ok || !result.success) {
            throw new Error(result.message || 'Could not load tax ledger.');
        }

        renderTaxVatLedger(result.data);
        if (content) content.hidden = false;
    } catch (err) {
        console.error('loadTaxVatSection error:', err);
        if (error) {
            error.textContent = err.message || 'Failed to load tax ledger.';
            error.hidden = false;
        }
    } finally {
        if (loading) loading.hidden = true;
    }
}

async function exportTaxVatLedgerCsv() {
    if (typeof window.hasAnyAdminPermission === 'function'
        && !window.hasAnyAdminPermission('view_financial_reports', 'manage_settings')) {
        return;
    }

    initTaxVatFilters();
    const params = taxBuildQueryParams();
    params.set('export', 'csv');
    const url = `/api/admin/finance/tax-vat-ledger?${params.toString()}`;

    try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Export failed.');
        const blob = await res.blob();
        const stamp = new Date().toISOString().slice(0, 10);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `tax-vat-ledger-${stamp}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    } catch (err) {
        console.error('exportTaxVatLedgerCsv error:', err);
        if (typeof Swal !== 'undefined') {
            Swal.fire('Export failed', err.message || 'Could not download CSV.', 'error');
        }
    }
}

window.loadTaxVatSection = loadTaxVatSection;
window.exportTaxVatLedgerCsv = exportTaxVatLedgerCsv;

Object.assign(window, { loadTaxVatSection, exportTaxVatLedgerCsv });
