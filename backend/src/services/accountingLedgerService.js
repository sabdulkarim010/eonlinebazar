/********************************************************************
 * Project: EonlineBazar — Accounts & Finance (Phase 2)
 * File: accountingLedgerService.js
 * Description: Unified accounting definitions and read helpers for
 *   revenue, paid inflow, COGS, and operating expense aggregates.
 *   Controllers delegate calculations here so P&L, accounts overview,
 *   and expense APIs stay aligned.
 ********************************************************************/

'use strict';

const Order = require('../models/order');
const Expense = require('../models/expense');
const ExpenseCategory = require('../models/expenseCategory');
const PurchaseOrder = require('../models/purchaseOrder');
const { isPgReadEnabled } = require('../config/readCutoverFlags');
const prisma = require('../config/prismaClient');
const {
    fromOrderStatusEnum,
    fromOrderPaymentStatusEnum
} = require('../repositories/orderRepository');
const { sumOpenPurchaseOrderTotalFromPG } = require('../repositories/purchaseOrderRepository');
const { getAggregatePosDrawerCashBalance } = require('./posShiftService');
const { getOutstandingCustomerWalletLiability } = require('./walletService');

const OPEN_PO_STATUSES = ['draft', 'sent', 'partial'];
const ACCOUNTS_SUMMARY_PG_BATCH = 250;
const ZERO_SUMMARY_DATA = Object.freeze({
    orders: [],
    expensesTotal: 0,
    supplierPayable: 0
});
const expenseRepo = require('../repositories/expenseRepository');
const expenseCategoryRepository = require('../repositories/expenseCategoryRepository');

/** Orders excluded from cash-flow / receivable views. */
const CANCELLED_ORDER_STATUSES = Object.freeze(['cancelled', 'refunded', 'returned']);
/** P&L recognizes revenue when fulfillment status is delivered. */
const DELIVERED_STATUSES = Object.freeze(['delivered']);
/** P&L return deductions. */
const RETURNED_STATUSES = Object.freeze(['returned', 'refunded']);
const RECEIVABLE_PAYMENT_STATUSES = Object.freeze(['unpaid', 'pending']);

const DEFAULT_EXPENSE_SLUGS = Object.freeze([
    'office_rent',
    'utilities',
    'staff_salary',
    'marketing',
    'courier_charges',
    'packaging',
    'equipment',
    'other'
]);

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function roundMoney(n) {
    return Math.round((toNumber(n, 0) + Number.EPSILON) * 100) / 100;
}

function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function parseDateQueryParam(str) {
    if (!str) return null;
    const m = String(str).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Accounts summary date window from ?dateFrom=&dateTo= (YYYY-MM-DD).
 * @returns {{ mode: 'all'|'range', dateFrom: Date|null, dateTo: Date|null }}
 */
function parseAccountsSummaryDateRange(query = {}) {
    let from = parseDateQueryParam(query.dateFrom);
    let to = parseDateQueryParam(query.dateTo);

    if (!from && !to) {
        return { mode: 'all', dateFrom: null, dateTo: null };
    }

    const now = new Date();
    if (!from) from = new Date(0);
    if (!to) to = now;

    from = startOfDay(from);
    to = endOfDay(to);

    if (from > to) {
        const tmp = from;
        from = startOfDay(to);
        to = endOfDay(tmp);
    }

    return { mode: 'range', dateFrom: from, dateTo: to };
}

function getOrderCreatedAt(order) {
    if (!order?.createdAt) return null;
    const d = new Date(order.createdAt);
    return Number.isNaN(d.getTime()) ? null : d;
}

function isOrderInDateRange(order, dateFrom, dateTo) {
    if (!dateFrom || !dateTo) return true;
    const created = getOrderCreatedAt(order);
    if (!created) return false;
    return created >= dateFrom && created <= dateTo;
}

function normalizeOrderStatus(order) {
    return String(order?.status || '').trim().toLowerCase();
}

/**
 * Charge amount used for paid inflow and receivables (grandTotal preferred).
 */
function getOrderTotal(order) {
    return toNumber(order?.grandTotal ?? order?.totalAmount, 0);
}

/**
 * P&L / accrual revenue basis (same monetary fields, documented separately).
 */
function resolveOrderRevenue(order) {
    return toNumber(order?.grandTotal, 0) || toNumber(order?.totalAmount, 0);
}

/**
 * COGS: order-level buying snapshot, else sum of line buyingPrice × qty.
 */
function resolveOrderBuyingCost(order) {
    const snapshot = toNumber(order?.totalBuyingPrice, 0);
    if (snapshot > 0) return snapshot;

    const items = Array.isArray(order?.items) ? order.items : [];
    let cogs = 0;
    for (const item of items) {
        const qty = Math.max(1, toNumber(item?.quantity, 1));
        cogs += toNumber(item?.buyingPrice, 0) * qty;
    }
    return cogs;
}

function isCancelledOrder(order) {
    return CANCELLED_ORDER_STATUSES.includes(normalizeOrderStatus(order));
}

function isDeliveredOrder(order) {
    return DELIVERED_STATUSES.includes(normalizeOrderStatus(order));
}

function isReturnedOrder(order) {
    return RETURNED_STATUSES.includes(normalizeOrderStatus(order));
}

function paymentCode(order) {
    return String(order?.payment?.code || order?.paymentMethod || '').trim().toLowerCase();
}

function paymentStatus(order) {
    return String(order?.payment?.status || 'unpaid').trim().toLowerCase();
}

function isPaidOrder(order) {
    return paymentStatus(order) === 'paid';
}

function isExpensePgReadEnabled() {
    return isPgReadEnabled('expense');
}

function isExpenseCategoryPgReadEnabled() {
    return isPgReadEnabled('expensecategory');
}

async function withExpensePgFallback(pgFn, mongoFn, label) {
    if (isExpensePgReadEnabled()) {
        try {
            return await pgFn();
        } catch (err) {
            console.warn(`[accountingLedger] PG expense read failed (${label}), Mongo fallback:`, err.message);
        }
    }
    return mongoFn();
}

function buildEmptyExpensesByCategory(catalogSlugs = DEFAULT_EXPENSE_SLUGS) {
    const expensesByCategory = {};
    catalogSlugs.forEach((cat) => { expensesByCategory[cat] = 0; });
    return expensesByCategory;
}

/**
 * Accounts overview metrics from normalized order rows + expense/PO totals.
 * @param {object} options
 * @param {Date} options.startOfMonth — calendar month slice for inflowThisMonth (all-time mode)
 * @param {Date|null} [options.dateFrom] — when set with dateTo, scopes order-based metrics
 * @param {Date|null} [options.dateTo]
 */
function computeAccountsSummaryFromOrders(orders, {
    startOfMonth,
    expensesTotal,
    supplierPayable,
    dateFrom = null,
    dateTo = null,
    posDrawerCash = 0,
    customerWalletLiability = 0
}) {
    const rangeActive = Boolean(dateFrom && dateTo);
    const scopedOrders = rangeActive
        ? (orders || []).filter((o) => isOrderInDateRange(o, dateFrom, dateTo))
        : (orders || []);

    const activeOrders = scopedOrders.filter((o) => !isCancelledOrder(o));
    const paidOrders = activeOrders.filter(isPaidOrder);

    const cashInflow = paidOrders.reduce((sum, o) => sum + getOrderTotal(o), 0);
    const cashInflowThisMonth = rangeActive
        ? cashInflow
        : paidOrders
            .filter((o) => {
                const created = getOrderCreatedAt(o);
                return created && created >= startOfMonth;
            })
            .reduce((sum, o) => sum + getOrderTotal(o), 0);

    const cashOutflow = toNumber(expensesTotal, 0) + toNumber(supplierPayable, 0);
    const netLiquidity = roundMoney(cashInflow - cashOutflow);

    const codCash = paidOrders
        .filter((o) => paymentCode(o) === 'cod')
        .reduce((sum, o) => sum + getOrderTotal(o), 0);
    const cashInHand = codCash + toNumber(posDrawerCash, 0);

    const bankAccountsBalance = paidOrders
        .filter((o) => {
            const code = paymentCode(o);
            return code === 'bank-transfer' || code.includes('bank');
        })
        .reduce((sum, o) => sum + getOrderTotal(o), 0);

    const accountsReceivable = activeOrders
        .filter((o) => RECEIVABLE_PAYMENT_STATUSES.includes(paymentStatus(o)))
        .reduce((sum, o) => sum + getOrderTotal(o), 0);

    let cashFlowStatus = 'neutral';
    if (netLiquidity > 0) cashFlowStatus = 'positive';
    else if (netLiquidity < 0) cashFlowStatus = 'negative';

    return {
        cashFlow: {
            inflow: roundMoney(cashInflow),
            inflowThisMonth: roundMoney(cashInflowThisMonth),
            outflow: roundMoney(cashOutflow),
            expensesTotal: roundMoney(expensesTotal),
            supplierPayments: roundMoney(supplierPayable),
            netLiquidity,
            status: cashFlowStatus
        },
        balances: {
            cashInHand: roundMoney(cashInHand),
            codCashInHand: roundMoney(codCash),
            posDrawerCash: roundMoney(posDrawerCash),
            bankAccountsBalance: roundMoney(bankAccountsBalance),
            accountsReceivable: roundMoney(accountsReceivable),
            accountsPayable: roundMoney(supplierPayable),
            customerWalletLiability: roundMoney(customerWalletLiability),
            totalLiabilities: roundMoney(supplierPayable + toNumber(customerWalletLiability, 0))
        }
    };
}

async function loadExpenseCategoryCatalog() {
    if (isExpenseCategoryPgReadEnabled()) {
        try {
            const rows = await expenseCategoryRepository.listExpenseCategoriesFromPG();
            if (rows && rows.length) return rows;
        } catch (err) {
            console.warn('[accountingLedger] PG category catalog failed, Mongo fallback:', err.message);
        }
    }
    return ExpenseCategory.find({}).sort({ isSystemDefault: -1, name: 1 }).lean();
}

async function getAccountsSummaryExpenseTotal(dateRange) {
    if (dateRange?.mode === 'range') {
        return getTotalExpensesBetween(dateRange.dateFrom, dateRange.dateTo);
    }
    return getTotalExpensesAll();
}

function buildOpenPurchaseOrderMatch(openStatuses, dateRange) {
    const match = { status: { $in: openStatuses } };
    if (dateRange?.mode === 'range') {
        match.createdAt = { $gte: dateRange.dateFrom, $lte: dateRange.dateTo };
    }
    return match;
}

async function getAccountsSummarySupplierPayable(openStatuses, dateRange) {
    const pgRange = dateRange?.mode === 'range'
        ? { dateFrom: dateRange.dateFrom, dateTo: dateRange.dateTo }
        : null;

    if (isPgReadEnabled('purchaseorder')) {
        return sumOpenPurchaseOrderTotalFromPG(openStatuses, pgRange);
    }

    const poAgg = await PurchaseOrder.aggregate([
        { $match: buildOpenPurchaseOrderMatch(openStatuses, dateRange) },
        { $group: { _id: null, total: { $sum: '$totalCost' } } }
    ]);
    return poAgg[0]?.total || 0;
}

async function getTotalExpensesAll() {
    return withExpensePgFallback(
        () => expenseRepo.getTotalExpensesAllFromPGStrict(),
        async () => {
            const rows = await Expense.aggregate([
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            return rows[0]?.total || 0;
        },
        'total-all'
    );
}

async function getTotalExpensesBetween(start, end) {
    return withExpensePgFallback(
        () => expenseRepo.getTotalExpensesByDateRangeStrict(start, end),
        async () => {
            const rows = await Expense.aggregate([
                { $match: { date: { $gte: start, $lte: end } } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]);
            return rows[0]?.total || 0;
        },
        'total-range'
    );
}

/**
 * P&L / finance expense rollup for a period (category slugs + mongo-shaped rows).
 */
async function loadExpenseBreakdownForPeriod(start, end) {
    const catalog = await loadExpenseCategoryCatalog();
    const catalogSlugs = (catalog || []).map((row) => row.slug).filter(Boolean);

    const breakdown = await withExpensePgFallback(
        async () => {
            const rows = await expenseRepo.getCategoryBreakdownFromPGStrict(start, end);
            return rows.map((row) => ({ _id: row.category, total: row.total }));
        },
        async () => Expense.aggregate([
            { $match: { date: { $gte: start, $lte: end } } },
            { $group: { _id: '$category', total: { $sum: '$amount' } } }
        ]),
        'breakdown-period'
    );

    return {
        catalogSlugs: catalogSlugs.length ? catalogSlugs : [...DEFAULT_EXPENSE_SLUGS],
        expenseRows: breakdown || []
    };
}

function mongoDateRangeFilter(dateRange) {
    if (!dateRange) return {};
    return { date: dateRange };
}

function pgFiltersFromMongoFilter(mongoFilter) {
    const filters = {};
    if (mongoFilter.date?.$gte) filters.dateFrom = mongoFilter.date.$gte;
    if (mongoFilter.date?.$lte) filters.dateTo = mongoFilter.date.$lte;
    if (mongoFilter.category) filters.category = mongoFilter.category;
    return filters;
}

/**
 * Paginated expense list + filtered total (API shape preserved).
 */
async function listExpensesPaginated({ mongoFilter, skip, limit }) {
    const pgFilters = pgFiltersFromMongoFilter(mongoFilter);

    return withExpensePgFallback(
        async () => {
            const [total, expenses, totalAmount] = await Promise.all([
                expenseRepo.countExpensesFromPGStrict(pgFilters),
                expenseRepo.listExpensesPaginatedFromPGStrict(pgFilters, skip, limit),
                expenseRepo.sumExpensesMatchingFiltersStrict(pgFilters)
            ]);
            return { total, expenses, totalAmount };
        },
        async () => {
            const [total, expenses, totalAgg] = await Promise.all([
                Expense.countDocuments(mongoFilter),
                Expense.find(mongoFilter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
                Expense.aggregate([
                    { $match: mongoFilter },
                    { $group: { _id: null, total: { $sum: '$amount' } } }
                ])
            ]);
            return {
                total,
                expenses,
                totalAmount: totalAgg[0]?.total || 0
            };
        },
        'list-paginated'
    );
}

function monthBounds(year, monthIndex) {
    const start = new Date(year, monthIndex, 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    return { start, end };
}

function formatMonthKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function formatMonthLabel(date) {
    return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Dashboard summary payload for GET /api/admin/expenses/summary.
 */
async function buildExpenseSummaryDashboard({ dateRangeFilter, now = new Date() }) {
    const filter = mongoDateRangeFilter(dateRangeFilter);
    const thisMonth = monthBounds(now.getFullYear(), now.getMonth());
    const lastMonth = monthBounds(now.getFullYear(), now.getMonth() - 1);
    const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    trendStart.setHours(0, 0, 0, 0);

    const catalog = await loadExpenseCategoryCatalog();
    const catalogSlugs = catalog.map((row) => row.slug);

    const loadCategoryRows = (rangeFilter) => withExpensePgFallback(
        async () => {
            let dateFrom;
            let dateTo;
            if (rangeFilter) {
                const f = pgFiltersFromMongoFilter(mongoDateRangeFilter(rangeFilter));
                dateFrom = f.dateFrom;
                dateTo = f.dateTo;
            }
            const rows = await expenseRepo.getCategoryBreakdownFromPGStrict(dateFrom, dateTo);
            return rows
                .map((row) => ({ _id: row.category, total: row.total, count: row.count }))
                .sort((a, b) => b.total - a.total);
        },
        () => Expense.aggregate([
            { $match: mongoDateRangeFilter(rangeFilter) },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { total: -1 } }
        ]),
        'summary-by-category'
    );

    const [rows, thisMonthTotal, lastMonthTotal, monthlyTrendRows] = await Promise.all([
        loadCategoryRows(dateRangeFilter),
        getTotalExpensesBetween(thisMonth.start, thisMonth.end),
        getTotalExpensesBetween(lastMonth.start, lastMonth.end),
        withExpensePgFallback(
            async () => {
                const points = await expenseRepo.getMonthlyExpenseTotalsFromPGStrict(
                    trendStart,
                    thisMonth.end
                );
                return points.map((p) => ({
                    _id: { year: p.year, month: p.month },
                    total: p.total
                }));
            },
            () => Expense.aggregate([
                { $match: { date: { $gte: trendStart, $lte: thisMonth.end } } },
                {
                    $group: {
                        _id: { year: { $year: '$date' }, month: { $month: '$date' } },
                        total: { $sum: '$amount' }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]),
            'monthly-trend'
        )
    ]);

    const byCategory = {};
    catalogSlugs.forEach((slug) => { byCategory[slug] = { total: 0, count: 0 }; });

    let grandTotal = 0;
    (rows || []).forEach((row) => {
        if (!byCategory[row._id]) {
            byCategory[row._id] = { total: 0, count: 0 };
        }
        byCategory[row._id] = { total: row.total, count: row.count || 0 };
        grandTotal += row.total;
    });

    const thisMonthRows = await loadCategoryRows({
        $gte: thisMonth.start,
        $lte: thisMonth.end
    });
    const topCategory = thisMonthRows[0]?._id || null;
    const topCategoryTotal = thisMonthRows[0]?.total || 0;

    const vsLastMonth = lastMonthTotal > 0
        ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 1000) / 10
        : (thisMonthTotal > 0 ? 100 : 0);

    const monthlyTrend = [];
    for (let i = 5; i >= 0; i -= 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const keyYear = d.getFullYear();
        const keyMonth = d.getMonth() + 1;
        const match = (monthlyTrendRows || []).find(
            (row) => row._id.year === keyYear && row._id.month === keyMonth
        );
        monthlyTrend.push({
            month: formatMonthKey(d),
            label: formatMonthLabel(d),
            total: match?.total || 0
        });
    }

    const categoryKeys = [...new Set([...catalogSlugs, ...Object.keys(byCategory)])];

    return {
        byCategory,
        categories: categoryKeys.map((cat) => ({
            category: cat,
            total: byCategory[cat]?.total || 0,
            count: byCategory[cat]?.count || 0
        })),
        grandTotal,
        stats: {
            thisMonthTotal,
            lastMonthTotal,
            vsLastMonth,
            topCategory,
            topCategoryTotal
        },
        monthlyTrend
    };
}

function mapPgOrderForSummary(row) {
    return {
        status: fromOrderStatusEnum(row.status),
        grandTotal: row.grandTotal != null ? Number(row.grandTotal) : null,
        totalAmount: row.totalAmount != null ? Number(row.totalAmount) : null,
        paymentMethod: row.paymentMethod,
        createdAt: row.createdAt,
        payment: row.payment
            ? {
                code: row.payment.code,
                status: fromOrderPaymentStatusEnum(row.payment.status)
            }
            : null
    };
}

const PG_ORDER_SUMMARY_SELECT = {
    status: true,
    grandTotal: true,
    totalAmount: true,
    paymentMethod: true,
    createdAt: true,
    payment: { select: { code: true, status: true } }
};

function buildPgOrderWhere(dateRange) {
    const where = { legacyId: { not: null } };
    if (dateRange?.mode === 'range') {
        where.createdAt = {
            gte: dateRange.dateFrom,
            lte: dateRange.dateTo
        };
    }
    return where;
}

function buildMongoOrderQuery(dateRange) {
    if (dateRange?.mode !== 'range') return {};
    return {
        createdAt: {
            $gte: dateRange.dateFrom,
            $lte: dateRange.dateTo
        }
    };
}

async function fetchPgOrdersForSummaryBatched(dateRange) {
    const orders = [];
    const where = buildPgOrderWhere(dateRange);
    let cursorId = null;

    for (;;) {
        const query = {
            where,
            select: PG_ORDER_SUMMARY_SELECT,
            take: ACCOUNTS_SUMMARY_PG_BATCH,
            orderBy: { id: 'asc' }
        };
        if (cursorId) {
            query.cursor = { id: cursorId };
            query.skip = 1;
        }

        const batch = await prisma.order.findMany(query);
        if (!batch.length) break;

        for (const row of batch) {
            orders.push(mapPgOrderForSummary(row));
        }

        cursorId = batch[batch.length - 1].id;
        if (batch.length < ACCOUNTS_SUMMARY_PG_BATCH) break;
    }

    return orders;
}

async function loadAccountsSummaryDataFromPG(dateRange) {
    const orders = await fetchPgOrdersForSummaryBatched(dateRange);
    const [expensesTotal, supplierPayable] = await Promise.all([
        getAccountsSummaryExpenseTotal(dateRange),
        getAccountsSummarySupplierPayable(OPEN_PO_STATUSES, dateRange)
    ]);
    return { orders, expensesTotal, supplierPayable };
}

async function loadAccountsSummaryDataFromMongo(dateRange) {
    const orderQuery = buildMongoOrderQuery(dateRange);
    const [orders, expensesTotal, supplierPayable] = await Promise.all([
        Order.find(orderQuery)
            .select('status grandTotal totalAmount payment paymentMethod createdAt')
            .lean(),
        getAccountsSummaryExpenseTotal(dateRange),
        getAccountsSummarySupplierPayable(OPEN_PO_STATUSES, dateRange)
    ]);
    return { orders, expensesTotal, supplierPayable };
}

/** Shared order + expense context for accounts overview and chart of accounts. */
async function loadAccountsSummaryContext(dateRange) {
    if (isPgReadEnabled('accountssummary')) {
        try {
            return await loadAccountsSummaryDataFromPG(dateRange);
        } catch (pgErr) {
            console.warn('[accountingLedger] PG accounts load failed, Mongo fallback:', pgErr.message);
            try {
                return await loadAccountsSummaryDataFromMongo(dateRange);
            } catch (mongoErr) {
                console.error('[accountingLedger] Mongo accounts load failed:', mongoErr.message);
                return { ...ZERO_SUMMARY_DATA };
            }
        }
    }

    try {
        return await loadAccountsSummaryDataFromMongo(dateRange);
    } catch (mongoErr) {
        console.error('[accountingLedger] Mongo accounts load failed:', mongoErr.message);
        return { ...ZERO_SUMMARY_DATA };
    }
}

function formatQueryDateOnly(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Builds accounts overview payload (API-ready `data` object). */
async function loadPosAndWalletLiquidity() {
    const [posDrawers, customerWalletLiability] = await Promise.all([
        getAggregatePosDrawerCashBalance().catch(() => ({
            openDrawerCash: 0,
            closedDrawerCash: 0,
            totalDrawerCash: 0
        })),
        getOutstandingCustomerWalletLiability().catch(() => 0)
    ]);

    return {
        posDrawerCash: posDrawers?.totalDrawerCash || 0,
        posDrawerDetail: posDrawers,
        customerWalletLiability: customerWalletLiability || 0
    };
}

async function buildAccountsSummaryPayload(query = {}) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const dateRange = parseAccountsSummaryDateRange(query);
    const [{ orders, expensesTotal, supplierPayable }, liquidity] = await Promise.all([
        loadAccountsSummaryContext(dateRange),
        loadPosAndWalletLiquidity()
    ]);

    const computeOpts = {
        startOfMonth,
        expensesTotal,
        supplierPayable,
        posDrawerCash: liquidity.posDrawerCash,
        customerWalletLiability: liquidity.customerWalletLiability
    };
    if (dateRange.mode === 'range') {
        computeOpts.dateFrom = dateRange.dateFrom;
        computeOpts.dateTo = dateRange.dateTo;
    }

    const data = computeAccountsSummaryFromOrders(orders, computeOpts);
    if (liquidity.posDrawerDetail) {
        data.liquidity = {
            posDrawer: liquidity.posDrawerDetail
        };
    }

    return {
        dateRange,
        data
    };
}

module.exports = {
    CANCELLED_ORDER_STATUSES,
    DELIVERED_STATUSES,
    RETURNED_STATUSES,
    RECEIVABLE_PAYMENT_STATUSES,
    DEFAULT_EXPENSE_SLUGS,
    toNumber,
    roundMoney,
    startOfDay,
    endOfDay,
    parseAccountsSummaryDateRange,
    isOrderInDateRange,
    getOrderTotal,
    resolveOrderRevenue,
    resolveOrderBuyingCost,
    isCancelledOrder,
    isDeliveredOrder,
    isReturnedOrder,
    isPaidOrder,
    paymentCode,
    paymentStatus,
    buildEmptyExpensesByCategory,
    computeAccountsSummaryFromOrders,
    getAccountsSummaryExpenseTotal,
    getAccountsSummarySupplierPayable,
    getTotalExpensesAll,
    getTotalExpensesBetween,
    loadExpenseBreakdownForPeriod,
    loadExpenseCategoryCatalog,
    listExpensesPaginated,
    buildExpenseSummaryDashboard,
    isExpensePgReadEnabled,
    loadAccountsSummaryContext,
    buildAccountsSummaryPayload,
    formatQueryDateOnly,
    OPEN_PO_STATUSES
};
