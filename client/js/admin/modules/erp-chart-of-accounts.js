/**
 * Project: EOnlineBazar — Chart of Accounts
 * File: js/admin/modules/erp-chart-of-accounts.js
 * Description: GL account tree/table for #view-chart-of-accounts.
 */
import '../admin-core.js';

const COA_TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'expense'];

const COA_TYPE_META = {
    asset: { icon: 'fa-vault', prefix: '1' },
    liability: { icon: 'fa-hand-holding-dollar', prefix: '2' },
    equity: { icon: 'fa-scale-balanced', prefix: '3' },
    revenue: { icon: 'fa-arrow-trend-up', prefix: '4' },
    expense: { icon: 'fa-receipt', prefix: '5' }
};

/** @type {object[]} */
let coaAllAccounts = [];
/** @type {object[]} */
let coaTypeGroupsCache = [];
let coaSearchTerm = '';
let coaInitialized = false;

function coaFormatMoney(value) {
    return typeof formatAdminPrice === 'function'
        ? formatAdminPrice(value)
        : `৳ ${Number(value || 0).toLocaleString()}`;
}

function coaEscapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function coaMatchesSearch(row, term) {
    if (!term) return true;
    const hay = `${row.code} ${row.name} ${row.typeLabel || row.type}`.toLowerCase();
    return hay.includes(term);
}

function coaBuildTableRows(accounts) {
    if (!accounts.length) {
        return '<tr><td colspan="5" class="coa-empty-row">No accounts match your search.</td></tr>';
    }

    return accounts
        .map((row) => {
            const statusClass = row.status === 'active' ? 'coa-status--active' : 'coa-status--inactive';
            return `<tr data-coa-code="${coaEscapeHtml(row.code)}">
                <td class="coa-col-code"><code>${coaEscapeHtml(row.code)}</code></td>
                <td class="coa-col-name">${coaEscapeHtml(row.name)}</td>
                <td class="coa-col-type">${coaEscapeHtml(row.typeLabel || row.type)}</td>
                <td class="coa-col-balance">${coaFormatMoney(row.balance)}</td>
                <td class="coa-col-status"><span class="coa-status ${statusClass}">${coaEscapeHtml(row.status || 'active')}</span></td>
            </tr>`;
        })
        .join('');
}

function coaRenderGroups(typeGroups) {
    const container = document.getElementById('coaTypeGroups');
    if (!container) return;

    const term = coaSearchTerm.trim().toLowerCase();
    const groups = typeGroups && typeGroups.length
        ? typeGroups
        : COA_TYPE_ORDER.map((type) => ({ type, label: type, codeRange: '', accounts: [] }));

    container.innerHTML = groups
        .map((group) => {
            const meta = COA_TYPE_META[group.type] || { icon: 'fa-folder', prefix: '' };
            const accounts = (group.accounts || []).filter((row) => coaMatchesSearch(row, term));
            const subtotal = accounts.reduce((sum, row) => sum + Number(row.balance || 0), 0);

            return `<article class="coa-type-block" data-coa-type="${coaEscapeHtml(group.type)}">
                <header class="coa-type-header">
                    <div>
                        <h4><i class="fa-solid ${meta.icon}"></i> ${coaEscapeHtml(group.label || group.type)}</h4>
                        <span class="coa-type-range">${coaEscapeHtml(group.codeRange || '')}</span>
                    </div>
                    <strong class="coa-type-subtotal">${coaFormatMoney(subtotal)}</strong>
                </header>
                <div class="coa-table-wrap">
                    <table class="coa-table">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Account Name</th>
                                <th>Type</th>
                                <th>Balance</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>${coaBuildTableRows(accounts)}</tbody>
                    </table>
                </div>
            </article>`;
        })
        .join('');
}

function coaUpdatePeriodHint(period) {
    const hint = document.getElementById('coaPeriodHint');
    if (!hint) return;

    if (period?.mode === 'range' && period.dateFrom && period.dateTo) {
        const from = new Date(period.dateFrom).toLocaleDateString();
        const to = new Date(period.dateTo).toLocaleDateString();
        hint.textContent = `Balances for ${from} – ${to}`;
        return;
    }
    hint.textContent = 'All-time balances (aligned with Accounts Overview metrics)';
}

function initCoaFilters() {
    if (coaInitialized) return;
    coaInitialized = true;

    const search = document.getElementById('coaSearchInput');
    if (search) {
        search.addEventListener('input', () => {
            coaSearchTerm = search.value || '';
            coaRenderGroupsFromCache();
        });
    }
}

function coaRenderGroupsFromCache() {
    if (coaTypeGroupsCache.length) {
        coaRenderGroups(coaTypeGroupsCache);
        return;
    }
    const byType = COA_TYPE_ORDER.map((type) => ({
        type,
        label: coaAllAccounts.find((a) => a.type === type)?.typeLabel || type,
        codeRange: '',
        accounts: coaAllAccounts.filter((a) => a.type === type)
    }));
    coaRenderGroups(byType);
}

function openCoaAddAccountModal() {
    const modal = document.getElementById('coaAddAccountModal');
    if (modal) modal.hidden = false;
}

function closeCoaAddAccountModal() {
    const modal = document.getElementById('coaAddAccountModal');
    if (modal) modal.hidden = true;
}

async function loadChartOfAccountsSection() {
    if (typeof window.hasAnyAdminPermission === 'function'
        && !window.hasAnyAdminPermission('view_accounts', 'manage_settings')) {
        return;
    }

    initCoaFilters();

    const loading = document.getElementById('coaLoading');
    const error = document.getElementById('coaError');
    const content = document.getElementById('coaContent');

    if (loading) loading.hidden = false;
    if (error) error.hidden = true;
    if (content) content.hidden = true;

    try {
        const res = await fetch('/api/admin/finance/chart-of-accounts', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await res.json();

        if (!res.ok || !result.success) {
            throw new Error(result.message || 'Could not load chart of accounts.');
        }

        coaAllAccounts = result.data?.accounts || [];
        coaTypeGroupsCache = result.data?.typeGroups || [];
        coaUpdatePeriodHint(result.data?.period);
        coaRenderGroups(coaTypeGroupsCache);
        if (content) content.hidden = false;
    } catch (err) {
        console.error('loadChartOfAccountsSection error:', err);
        if (error) {
            error.textContent = err.message || 'Failed to load chart of accounts.';
            error.hidden = false;
        }
    } finally {
        if (loading) loading.hidden = true;
    }
}

window.loadChartOfAccountsSection = loadChartOfAccountsSection;
window.openCoaAddAccountModal = openCoaAddAccountModal;
window.closeCoaAddAccountModal = closeCoaAddAccountModal;

Object.assign(window, {
    loadChartOfAccountsSection,
    openCoaAddAccountModal,
    closeCoaAddAccountModal
});
