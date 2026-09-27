/********************************************************************
 * Project: EonlineBazar — ERP Finance
 * File: profitLossController.js
 * Location: controllers/admin/profitLossController.js
 * Author: Abdul Karim Sheikh
 * Description: Advanced Profit & Loss engine. Combines delivered-order
 * revenue, product buying cost (COGS), courier charges, return losses,
 * operating expenses (Expense ledger), cashback, and discounts into a
 * single period breakdown with top/worst product rankings and a
 * revenue-vs-cost time series for charting. The computeProfitLoss()
 * helper is reused by the PDF/CSV export controller.
 ********************************************************************/

const Order = require('../../models/order');
const { isPgReadEnabled } = require('../../config/readCutoverFlags');
const orderRepository = require('../../repositories/orderRepository');
const accountingLedger = require('../../services/accountingLedgerService');

const {
    DEFAULT_EXPENSE_SLUGS,
    toNumber,
    roundMoney,
    resolveOrderRevenue,
    resolveOrderBuyingCost,
    isDeliveredOrder,
    isReturnedOrder,
    buildEmptyExpensesByCategory,
    loadExpenseBreakdownForPeriod
} = accountingLedger;

function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function resolveOrderDate(order) {
    if (order.createdAt) {
        const d = new Date(order.createdAt);
        if (!Number.isNaN(d.getTime())) return d;
    }
    if (order.deliveredAt) {
        const d = new Date(order.deliveredAt);
        if (!Number.isNaN(d.getTime())) return d;
    }
    if (order._id && typeof order._id.getTimestamp === 'function') {
        return order._id.getTimestamp();
    }
    return null;
}

/** Parse startDate/endDate (YYYY-MM-DD); default to the current month. */
function parseRange(query = {}) {
    const now = new Date();
    const parse = (str) => {
        if (!str) return null;
        const m = String(str).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        const d = new Date(str);
        return Number.isNaN(d.getTime()) ? null : d;
    };

    let start = parse(query.startDate);
    let end = parse(query.endDate);

    if (!start) start = new Date(now.getFullYear(), now.getMonth(), 1);
    if (!end) end = now;

    start = startOfDay(start);
    end = endOfDay(end);

    if (start > end) {
        const tmp = start;
        start = startOfDay(end);
        end = endOfDay(tmp);
    }
    return { start, end };
}

function resolveGroupBy(query, start, end) {
    const requested = String(query.groupBy || '').trim().toLowerCase();
    if (['day', 'week', 'month'].includes(requested)) return requested;
    const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
    if (days <= 31) return 'day';
    if (days <= 120) return 'week';
    return 'month';
}

/** ISO week number, used only for stable week bucket keys. */
function getIsoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return { year: d.getUTCFullYear(), week };
}

function getBucketKey(date, groupBy) {
    if (!date) return null;
    if (groupBy === 'day') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    if (groupBy === 'week') {
        const { year, week } = getIsoWeek(date);
        return `${year}-W${String(week).padStart(2, '0')}`;
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatBucketLabel(key, groupBy) {
    if (!key) return '';
    if (groupBy === 'day') {
        const [y, m, d] = key.split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    if (groupBy === 'week') {
        return key.replace('-', ' ');
    }
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

/** Zero-safe P&L payload preserving the public API shape. */
function buildEmptyProfitLossReport(start, end, groupBy, catalogSlugs = DEFAULT_EXPENSE_SLUGS) {
    const expensesByCategory = buildEmptyExpensesByCategory(catalogSlugs);
    return {
        period: {
            start: start.toISOString(),
            end: end.toISOString(),
            groupBy
        },
        currency: 'BDT',
        revenue: {
            gross: 0,
            returns: 0,
            net: 0
        },
        costs: {
            buying: 0,
            courier: 0,
            returnLoss: 0,
            expenses: expensesByCategory,
            expensesTotal: 0,
            cashback: 0,
            discounts: 0,
            total: 0
        },
        profit: {
            gross: 0,
            net: 0,
            marginPercent: 0
        },
        orders: {
            delivered: 0
        },
        topProducts: [],
        worstProducts: [],
        series: [],
        trend: []
    };
}

async function loadOrdersForProfitLoss(start, end) {
    if (isPgReadEnabled('profitloss')) {
        try {
            return await orderRepository.findAll({ dateFrom: start, dateTo: end });
        } catch (err) {
            console.warn('⚠️ P&L PG order query failed, falling back to Mongo:', err.message);
        }
    }

    try {
        return await Order.find({
            createdAt: { $gte: start, $lte: end }
        }).lean();
    } catch (err) {
        console.error('🔴 P&L Mongo order query failed:', err.message);
        return [];
    }
}

/**
 * Core P&L computation shared by the JSON report and the PDF/CSV exports.
 * @param {object} query - { startDate, endDate, groupBy }
 * @returns {Promise<object>} full breakdown payload
 */
async function computeProfitLoss(query = {}) {
    let start;
    let end;
    let groupBy;

    try {
        ({ start, end } = parseRange(query));
        groupBy = resolveGroupBy(query, start, end);
    } catch (err) {
        console.warn('⚠️ P&L date range parse failed, using current month:', err.message);
        const now = new Date();
        start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
        end = endOfDay(now);
        groupBy = 'month';
    }

    try {
    let orders = [];
    try {
        orders = await loadOrdersForProfitLoss(start, end);
        if (!Array.isArray(orders)) orders = [];
    } catch (err) {
        console.error('🔴 P&L order load failed:', err.message);
        orders = [];
    }

    let grossRevenue = 0;
    let returnsAmount = 0;
    let buyingCost = 0;
    let returnLoss = 0;
    let cashback = 0;
    let discounts = 0;
    let deliveredCount = 0;

    const productStats = new Map(); // name → { name, revenue, buyingCost, profit, qty }
    const buckets = new Map();      // key → { key, label, revenue, cost, profit }

    const ensureBucket = (date) => {
        const key = getBucketKey(date, groupBy);
        if (!key) return null;
        if (!buckets.has(key)) {
            buckets.set(key, { key, label: formatBucketLabel(key, groupBy), revenue: 0, cost: 0, profit: 0 });
        }
        return buckets.get(key);
    };

    for (const order of orders) {
        const orderDate = resolveOrderDate(order);

        if (isDeliveredOrder(order)) {
            const revenue = resolveOrderRevenue(order);
            const cogs = resolveOrderBuyingCost(order);

            grossRevenue += revenue;
            buyingCost += cogs;
            cashback += toNumber(order.rewardsCashbackAmount, 0);
            discounts += toNumber(order.discountAmount, 0);
            deliveredCount += 1;

            // Per-product profit ranking (delivered items only).
            const items = Array.isArray(order.items) ? order.items : [];
            for (const item of items) {
                if (!item) continue;
                const name = String(item.name || 'Unknown product').trim();
                const qty = Math.max(1, toNumber(item.quantity, 1));
                const lineRevenue = toNumber(item.price, 0) * qty;
                const lineCost = toNumber(item.buyingPrice, 0) * qty;
                const prev = productStats.get(name) || { name, revenue: 0, buyingCost: 0, profit: 0, qty: 0 };
                prev.revenue += lineRevenue;
                prev.buyingCost += lineCost;
                prev.profit += (lineRevenue - lineCost);
                prev.qty += qty;
                productStats.set(name, prev);
            }

            const bucket = ensureBucket(orderDate);
            if (bucket) {
                bucket.revenue += revenue;
                bucket.cost += cogs;
                bucket.profit += (revenue - cogs);
            }
        } else if (isReturnedOrder(order)) {
            const returnedRevenue = resolveOrderRevenue(order);
            returnsAmount += returnedRevenue;
            // The buying cost of returned goods is a real loss (already paid).
            returnLoss += resolveOrderBuyingCost(order);
        }
    }

    // Operating expenses for the period, grouped by category (incl. courier_charges).
    const { catalogSlugs, expenseRows } = await loadExpenseBreakdownForPeriod(start, end);
    const expensesByCategory = buildEmptyExpensesByCategory(
        catalogSlugs.length ? catalogSlugs : DEFAULT_EXPENSE_SLUGS
    );
    let expensesTotal = 0;
    expenseRows.forEach((row) => {
        if (expensesByCategory[row._id] === undefined) {
            expensesByCategory[row._id] = 0;
        }
        expensesByCategory[row._id] = roundMoney(row.total);
        expensesTotal += row.total;
    });
    expensesTotal = roundMoney(expensesTotal);
    const courierCharges = roundMoney(expensesByCategory.courier_charges || 0);

    grossRevenue = roundMoney(grossRevenue);
    returnsAmount = roundMoney(returnsAmount);
    buyingCost = roundMoney(buyingCost);
    returnLoss = roundMoney(returnLoss);
    cashback = roundMoney(cashback);
    discounts = roundMoney(discounts);

    const netRevenue = roundMoney(grossRevenue - returnsAmount);
    const grossProfit = roundMoney(netRevenue - buyingCost);
    // Courier is sourced from the expense ledger (courier_charges) and included in expensesTotal.
    const netProfit = roundMoney(
        grossProfit - expensesTotal - cashback - discounts - returnLoss
    );
    const marginPercent = netRevenue > 0 ? roundMoney((netProfit / netRevenue) * 100) : 0;

    const totalCosts = roundMoney(
        buyingCost + returnLoss + expensesTotal + cashback + discounts
    );

    const rankedProducts = [...productStats.values()].map((p) => ({
        name: p.name,
        revenue: roundMoney(p.revenue),
        buyingCost: roundMoney(p.buyingCost),
        profit: roundMoney(p.profit),
        qty: p.qty
    }));

    const topProducts = [...rankedProducts]
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 10);

    const worstProducts = [...rankedProducts]
        .sort((a, b) => a.profit - b.profit)
        .slice(0, 5)
        .map((p) => ({
            name: p.name,
            revenue: p.revenue,
            buyingCost: p.buyingCost,
            loss: p.profit < 0 ? roundMoney(Math.abs(p.profit)) : 0,
            profit: p.profit
        }));

    const series = [...buckets.values()]
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        .map((b) => ({
            label: b.label,
            key: b.key,
            revenue: roundMoney(b.revenue),
            cost: roundMoney(b.cost),
            profit: roundMoney(b.profit)
        }));

    const trend = series.map((b) => ({
        period: b.label,
        revenue: b.revenue,
        cost: b.cost,
        profit: b.profit
    }));

    return {
        period: {
            start: start.toISOString(),
            end: end.toISOString(),
            groupBy
        },
        currency: 'BDT',
        revenue: {
            gross: grossRevenue,
            returns: returnsAmount,
            net: netRevenue
        },
        costs: {
            buying: buyingCost,
            courier: courierCharges,
            returnLoss,
            expenses: expensesByCategory,
            expensesTotal,
            cashback,
            discounts,
            total: totalCosts
        },
        profit: {
            gross: grossProfit,
            net: netProfit,
            marginPercent
        },
        orders: {
            delivered: deliveredCount
        },
        topProducts,
        worstProducts,
        series,
        trend
    };
    } catch (err) {
        console.error('🔴 computeProfitLoss failed:', err.message);
        return buildEmptyProfitLossReport(start, end, groupBy);
    }
}

/**
 * GET /api/admin/finance/profit-loss
 */
const getProfitLossReport = async (req, res) => {
    try {
        const report = await computeProfitLoss(req.query);
        return res.status(200).json({ success: true, data: report });
    } catch (err) {
        console.error('🔴 Profit & Loss report error:', err);
        let start;
        let end;
        let groupBy = 'month';
        try {
            ({ start, end } = parseRange(req.query));
            groupBy = resolveGroupBy(req.query, start, end);
        } catch {
            const now = new Date();
            start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
            end = endOfDay(now);
        }
        const report = buildEmptyProfitLossReport(start, end, groupBy);
        return res.status(200).json({ success: true, data: report });
    }
};

module.exports = {
    computeProfitLoss,
    getProfitLossReport
};
