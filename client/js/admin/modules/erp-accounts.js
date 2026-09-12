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

function acctFormatMoney(value) {
    return typeof formatAdminPrice === 'function'
        ? formatAdminPrice(value)
        : `৳ ${Number(value || 0).toLocaleString()}`;
}

function acctSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function renderAccountsSummary(data) {
    const { cashFlow, balances } = data || {};
    if (!cashFlow || !balances) return;

    acctSetText('acctCashInflow', acctFormatMoney(cashFlow.inflow));
    acctSetText('acctCashInflowMonth', `This month: ${acctFormatMoney(cashFlow.inflowThisMonth)}`);
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
}

async function loadAccountsSection() {
    const loading = document.getElementById('accountsLoading');
    const error = document.getElementById('accountsError');
    const content = document.getElementById('accountsContent');

    if (loading) loading.hidden = false;
    if (error) error.hidden = true;
    if (content) content.hidden = true;

    try {
        const res = await fetch('/api/admin/accounts-summary', {
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
