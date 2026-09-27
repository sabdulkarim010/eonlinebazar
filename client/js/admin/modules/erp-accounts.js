/**
 * Project: EOnlineBazar — Accounts Overview
 * File: js/admin/modules/erp-accounts.js
 * Description: Cash flow, liquidity, and account balance widgets for #view-accounts.
 */
import '../admin-core.js';

const LIQUIDITY_LABELS = {
    positive: { text: 'Surplus — cash positive', className: 'accounts-liquidity-badge--positive' },
    negative: { text: 'Deficit — review outflows', className: 'accounts-liquidity-badge--negative' },
    neutral: { text: 'Break-even', className: 'accounts-liquidity-badge--neutral' }
};

/** @type {'all'|'today'|'this-month'|'last-month'|'custom'} */
let acctFilterMode = 'all';
let acctInitialized = false;

function acctFormatMoney(value) {
    return typeof formatAdminPrice === 'function'
        ? formatAdminPrice(value)
        : `৳ ${Number(value || 0).toLocaleString()}`;
}

function acctSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function acctToDateInput(date) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function acctStartOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function acctEndOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

function acctMonthBounds(year, monthIndex) {
    const start = new Date(year, monthIndex, 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    return { start, end };
}

function acctSetPresetActive(mode) {
    document.querySelectorAll('[data-acct-preset]').forEach((btn) => {
        btn.classList.toggle('accounts-filter-preset--active', btn.dataset.acctPreset === mode);
    });
}

function acctUpdateFilterHint() {
    const hint = document.getElementById('acctFilterHint');
    if (!hint) return;

    const fromEl = document.getElementById('acctDateFrom');
    const toEl = document.getElementById('acctDateTo');

    if (acctFilterMode === 'all') {
        hint.textContent = 'Showing all-time totals · paid inflow sub-line is current calendar month';
        return;
    }
    if (acctFilterMode === 'today') {
        hint.textContent = 'Showing today\'s orders and expenses (by order / PO / expense date)';
        return;
    }
    if (acctFilterMode === 'this-month') {
        hint.textContent = 'Showing this calendar month';
        return;
    }
    if (acctFilterMode === 'last-month') {
        hint.textContent = 'Showing last calendar month';
        return;
    }
    const from = fromEl?.value || '—';
    const to = toEl?.value || '—';
    hint.textContent = `Custom range: ${from} → ${to}`;
}

function acctBuildQueryParams() {
    const params = new URLSearchParams();
    const now = new Date();

    if (acctFilterMode === 'all') {
        return params;
    }

    let from;
    let to;

    if (acctFilterMode === 'today') {
        from = acctStartOfDay(now);
        to = acctEndOfDay(now);
    } else if (acctFilterMode === 'this-month') {
        const b = acctMonthBounds(now.getFullYear(), now.getMonth());
        from = b.start;
        to = b.end;
    } else if (acctFilterMode === 'last-month') {
        const b = acctMonthBounds(now.getFullYear(), now.getMonth() - 1);
        from = b.start;
        to = b.end;
    } else {
        const fromEl = document.getElementById('acctDateFrom');
        const toEl = document.getElementById('acctDateTo');
        if (fromEl?.value) from = acctStartOfDay(new Date(fromEl.value));
        if (toEl?.value) to = acctEndOfDay(new Date(toEl.value));
        if (!from && !to) return params;
        if (!from) from = new Date(0);
        if (!to) to = acctEndOfDay(now);
    }

    params.set('dateFrom', acctToDateInput(from));
    params.set('dateTo', acctToDateInput(to));
    return params;
}

function acctInflowSubLabel(cashFlow) {
    if (acctFilterMode === 'all') {
        return `This month: ${acctFormatMoney(cashFlow.inflowThisMonth)}`;
    }
    return `In selected period: ${acctFormatMoney(cashFlow.inflowThisMonth)}`;
}

function renderAccountsSummary(data) {
    const { cashFlow, balances } = data || {};
    if (!cashFlow || !balances) return;

    acctSetText('acctCashInflow', acctFormatMoney(cashFlow.inflow));
    acctSetText('acctCashInflowMonth', acctInflowSubLabel(cashFlow));
    acctSetText('acctCashOutflow', acctFormatMoney(cashFlow.outflow));
    acctSetText(
        'acctCashOutflowBreakdown',
        `Expenses ${acctFormatMoney(cashFlow.expensesTotal)} · POs ${acctFormatMoney(cashFlow.supplierPayments)}`
    );
    acctSetText('acctNetLiquidity', acctFormatMoney(cashFlow.netLiquidity));

    const statusEl = document.getElementById('acctLiquidityStatus');
    if (statusEl) {
        const meta = LIQUIDITY_LABELS[cashFlow.status] || LIQUIDITY_LABELS.neutral;
        statusEl.textContent = meta.text;
        statusEl.className = `accounts-liquidity-badge ${meta.className}`;
    }

    acctSetText('acctCashInHand', acctFormatMoney(balances.cashInHand));
    acctSetText('acctBankBalance', acctFormatMoney(balances.bankAccountsBalance));
    acctSetText('acctReceivable', acctFormatMoney(balances.accountsReceivable));
    acctSetText('acctPayable', acctFormatMoney(balances.accountsPayable));
    acctSetText('acctPosDrawer', acctFormatMoney(balances.posDrawerCash));
    acctSetText('acctWalletLiability', acctFormatMoney(balances.customerWalletLiability));
}

function acctApplyPreset(mode) {
    acctFilterMode = mode;
    acctSetPresetActive(mode);

    const fromEl = document.getElementById('acctDateFrom');
    const toEl = document.getElementById('acctDateTo');
    const now = new Date();

    if (mode === 'today') {
        const s = acctToDateInput(now);
        if (fromEl) fromEl.value = s;
        if (toEl) toEl.value = s;
    } else if (mode === 'this-month') {
        const b = acctMonthBounds(now.getFullYear(), now.getMonth());
        if (fromEl) fromEl.value = acctToDateInput(b.start);
        if (toEl) toEl.value = acctToDateInput(b.end);
    } else if (mode === 'last-month') {
        const b = acctMonthBounds(now.getFullYear(), now.getMonth() - 1);
        if (fromEl) fromEl.value = acctToDateInput(b.start);
        if (toEl) toEl.value = acctToDateInput(b.end);
    } else if (mode === 'all') {
        if (fromEl) fromEl.value = '';
        if (toEl) toEl.value = '';
    }

    acctUpdateFilterHint();
    loadAccountsSection();
}

function initAccountsFilters() {
    if (acctInitialized) return;
    acctInitialized = true;

    document.querySelectorAll('[data-acct-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
            acctApplyPreset(btn.dataset.acctPreset || 'all');
        });
    });

    const applyBtn = document.getElementById('acctApplyFilterBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            acctFilterMode = 'custom';
            acctSetPresetActive('');
            acctUpdateFilterHint();
            loadAccountsSection();
        });
    }
}

async function loadAccountsSection() {
    if (typeof window.hasAnyAdminPermission === 'function'
        && !window.hasAnyAdminPermission('view_accounts', 'manage_settings', 'view_analytics')) {
        return;
    }

    initAccountsFilters();

    const loading = document.getElementById('accountsLoading');
    const error = document.getElementById('accountsError');
    const content = document.getElementById('accountsContent');

    if (loading) loading.hidden = false;
    if (error) error.hidden = true;
    if (content) content.hidden = true;

    try {
        const qs = acctBuildQueryParams().toString();
        const url = qs
            ? `/api/admin/accounts-summary?${qs}`
            : '/api/admin/accounts-summary';

        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();

        if (!res.ok || !result.success) {
            throw new Error(result.message || 'Could not load accounts summary.');
        }

        renderAccountsSummary(result.data);
        if (content) content.hidden = false;
    } catch (err) {
        console.error('loadAccountsSection error:', err);
        if (error) {
            error.textContent = err.message || 'Failed to load accounts summary.';
            error.hidden = false;
        }
    } finally {
        if (loading) loading.hidden = true;
    }
}

window.loadAccountsSection = loadAccountsSection;

Object.assign(window, { loadAccountsSection });
