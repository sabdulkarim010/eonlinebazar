/********************************************************************
 * Project: EonlineBazar — Chart of Accounts (Phase 3)
 * File: chartOfAccountsService.js
 * Description: Default COA catalog with balances derived from live
 *   commerce data via accountingLedgerService + P&L COGS engine.
 ********************************************************************/

'use strict';

const accountingLedger = require('./accountingLedgerService');
const { computeProfitLoss } = require('../controllers/admin/profitLossController');

const ACCOUNT_TYPES = Object.freeze([
    { key: 'asset', label: 'Assets', codeRange: '1000–1999' },
    { key: 'liability', label: 'Liabilities', codeRange: '2000–2999' },
    { key: 'equity', label: 'Equity', codeRange: '3000–3999' },
    { key: 'revenue', label: 'Revenue', codeRange: '4000–4999' },
    { key: 'expense', label: 'Expenses', codeRange: '5000–5999' }
]);

/** System default GL accounts (read-only seed mapping for Phase 3). */
const DEFAULT_ACCOUNT_DEFINITIONS = Object.freeze([
    { code: '1010', name: 'Cash in Hand', type: 'asset', balanceKey: 'cashInHand' },
    { code: '1020', name: 'Bank Account', type: 'asset', balanceKey: 'bankAccountsBalance' },
    { code: '1200', name: 'Accounts Receivable', type: 'asset', balanceKey: 'accountsReceivable' },
    { code: '2010', name: 'Accounts Payable', type: 'liability', balanceKey: 'accountsPayable' },
    { code: '3010', name: "Owner's Equity", type: 'equity', balanceKey: 'ownersEquity' },
    { code: '4010', name: 'Sales Revenue', type: 'revenue', balanceKey: 'salesRevenue' },
    { code: '5010', name: 'Operating Expenses', type: 'expense', balanceKey: 'operatingExpenses' },
    { code: '5020', name: 'Cost of Goods Sold', type: 'expense', balanceKey: 'cogs' }
]);

function buildProfitLossQuery(dateRange) {
    if (dateRange?.mode !== 'range') return {};
    return {
        startDate: accountingLedger.formatQueryDateOnly(dateRange.dateFrom),
        endDate: accountingLedger.formatQueryDateOnly(dateRange.dateTo)
    };
}

async function resolveDynamicBalances(dateRange, summaryData) {
    const { cashFlow, balances } = summaryData;
    let cogs = 0;
    let salesRevenue = cashFlow?.inflow || 0;

    try {
        const pl = await computeProfitLoss(buildProfitLossQuery(dateRange));
        cogs = pl?.costs?.buying || 0;
        salesRevenue = pl?.revenue?.net ?? pl?.revenue?.gross ?? salesRevenue;
    } catch (err) {
        console.warn('[chartOfAccounts] P&L slice failed, using summary fallbacks:', err.message);
    }

    const cashInHand = balances?.cashInHand || 0;
    const bank = balances?.bankAccountsBalance || 0;
    const ar = balances?.accountsReceivable || 0;
    const ap = balances?.accountsPayable || 0;
    const operatingExpenses = cashFlow?.expensesTotal || 0;

    const assetsTotal = accountingLedger.roundMoney(cashInHand + bank + ar);
    const liabilitiesTotal = accountingLedger.roundMoney(ap);
    const ownersEquity = accountingLedger.roundMoney(assetsTotal - liabilitiesTotal);

    return {
        cashInHand,
        bankAccountsBalance: bank,
        accountsReceivable: ar,
        accountsPayable: ap,
        ownersEquity,
        salesRevenue: accountingLedger.roundMoney(salesRevenue),
        operatingExpenses: accountingLedger.roundMoney(operatingExpenses),
        cogs: accountingLedger.roundMoney(cogs)
    };
}

function mapAccountsWithBalances(balanceMap) {
    return DEFAULT_ACCOUNT_DEFINITIONS.map((def) => ({
        code: def.code,
        name: def.name,
        type: def.type,
        typeLabel: ACCOUNT_TYPES.find((t) => t.key === def.type)?.label || def.type,
        balance: accountingLedger.roundMoney(balanceMap[def.balanceKey] || 0),
        status: 'active',
        isSystemDefault: true
    }));
}

function groupAccountsByType(accounts) {
    return ACCOUNT_TYPES.map((meta) => ({
        type: meta.key,
        label: meta.label,
        codeRange: meta.codeRange,
        accounts: accounts.filter((row) => row.type === meta.key)
    }));
}

/**
 * @param {object} [query] — optional dateFrom/dateTo (same as accounts summary)
 */
async function getChartOfAccounts(query = {}) {
    const dateRange = accountingLedger.parseAccountsSummaryDateRange(query);
    const { data: summaryData } = await accountingLedger.buildAccountsSummaryPayload(query);
    const balanceMap = await resolveDynamicBalances(dateRange, summaryData);
    const accounts = mapAccountsWithBalances(balanceMap);

    const period =
        dateRange.mode === 'range'
            ? {
                mode: 'range',
                dateFrom: dateRange.dateFrom.toISOString(),
                dateTo: dateRange.dateTo.toISOString()
            }
            : { mode: 'all' };

    return {
        currency: 'BDT',
        generatedAt: new Date().toISOString(),
        period,
        typeGroups: groupAccountsByType(accounts),
        accounts
    };
}

module.exports = {
    getChartOfAccounts,
    DEFAULT_ACCOUNT_DEFINITIONS,
    ACCOUNT_TYPES
};
