/********************************************************************
 * Project: EonlineBazar — Admin Dashboard BFF (Phase 1.1+)
 * File: dashboardOverviewBffController.js
 * Description: Unified PostgreSQL/Prisma overview metrics for the admin
 * dashboard. Runs alongside legacy Mongo dashboard-analytics until cutover.
 ********************************************************************/

'use strict';

const prisma = require('../../config/prismaClient');
const { accountHasPermission } = require('../../config/permissions');

/** Granular finance KPI access (not granted by `view_analytics` alone). */
const DASHBOARD_FINANCIAL_PERMISSIONS = ['view_financial_reports', 'view_accounts'];
const { getApplicationNow } = require('../../utils/applicationTime');
const { CACHE_KEYS } = require('../../services/cacheService');
const redisClient = require('../../utils/redisClient');
const { isRedisAvailable } = require('../../utils/redisClient');

const OVERVIEW_CACHE_TTL_SECONDS = 60;
const REGISTRATION_TREND_DAYS = 30;
const INVENTORY_ALERTS_LIMIT = 15;
const TOP_PRODUCTS_CHART_LIMIT = 5;
const DEFAULT_OVERVIEW_PERIOD = '30d';
const VALID_OVERVIEW_PERIODS = new Set([
    'today',
    'yesterday',
    '7d',
    '30d',
    'this_month',
    'custom'
]);

const ORDER_PIPELINE_STATUSES = [
    'PENDING',
    'PROCESSING',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'REFUNDED'
];

const OPEN_SUPPORT_TICKET_STATUSES = ['OPEN', 'IN_PROGRESS'];

/** Orders excluded from GMV / payment mix denominators. */
const GMV_EXCLUDED_STATUSES = ['CANCELLED', 'REFUNDED'];

function decimalToNumber(value) {
    if (value == null) return 0;
    return Number(value);
}

function parseDateOnlyInput(value) {
    const raw = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const d = new Date(`${raw}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {number} currentVal
 * @param {number} priorVal
 * @returns {number}
 */
function calcGrowthDelta(currentVal, priorVal) {
    const current = Number(currentVal) || 0;
    const prior = Number(priorVal) || 0;
    if (prior === 0) {
        if (current === 0) return 0;
        return 100;
    }
    return Math.round((((current - prior) / prior) * 100) * 10) / 10;
}

function buildGrowthMetric(currentVal, priorVal) {
    const current = Number(currentVal) || 0;
    const prior = Number(priorVal) || 0;
    const deltaPercent = calcGrowthDelta(current, prior);
    return {
        prior,
        deltaPercent,
        isPositive: deltaPercent >= 0
    };
}

/**
 * @param {object} query
 * @param {Date} [now]
 */
/**
 * Redis cache segment: `admin:dashboard:overview:${period}:${from}:${to}` (inclusive end date).
 */
function buildOverviewCacheScope(period, currentStart, currentEnd) {
    const from = formatLocalDateKey(currentStart);
    const endInclusiveMs = Math.max(currentStart.getTime(), currentEnd.getTime() - 1);
    const to = formatLocalDateKey(new Date(endInclusiveMs));
    return `${period}:${from}:${to}`;
}

function buildPriorWindow(currentStart, currentEnd) {
    const durationMs = Math.max(0, currentEnd.getTime() - currentStart.getTime());
    const priorEnd = new Date(currentStart.getTime());
    const priorStart = new Date(priorEnd.getTime() - durationMs);
    return { priorStart, priorEnd };
}

function parseDashboardOverviewQuery(query = {}, now = getApplicationNow()) {
    const periodRaw = String(query.period || DEFAULT_OVERVIEW_PERIOD).trim().toLowerCase();
    const from = parseDateOnlyInput(query.from);
    const to = parseDateOnlyInput(query.to);

    if (from && to && from <= to) {
        const currentEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1, 0, 0, 0, 0);
        const currentStart = from;
        const { priorStart, priorEnd } = buildPriorWindow(currentStart, currentEnd);
        return {
            period: 'custom',
            scope: buildOverviewCacheScope('custom', currentStart, currentEnd),
            currentStart,
            currentEnd,
            priorStart,
            priorEnd
        };
    }

    const period = VALID_OVERVIEW_PERIODS.has(periodRaw) ? periodRaw : DEFAULT_OVERVIEW_PERIOD;
    const { startOfDay, endOfDay } = getTodayBounds(now);

    if (period === 'custom') {
        return parseDashboardOverviewQuery({ period: DEFAULT_OVERVIEW_PERIOD }, now);
    }

    if (period === 'today') {
        const currentStart = startOfDay;
        const currentEnd = now.getTime() > startOfDay.getTime() ? now : endOfDay;
        const { priorStart, priorEnd } = buildPriorWindow(currentStart, currentEnd);
        return {
            period: 'today',
            scope: buildOverviewCacheScope('today', currentStart, currentEnd),
            currentStart,
            currentEnd,
            priorStart,
            priorEnd
        };
    }

    if (period === 'yesterday') {
        const currentEnd = startOfDay;
        const currentStart = new Date(startOfDay);
        currentStart.setDate(currentStart.getDate() - 1);
        const { priorStart, priorEnd } = buildPriorWindow(currentStart, currentEnd);
        return {
            period: 'yesterday',
            scope: buildOverviewCacheScope('yesterday', currentStart, currentEnd),
            currentStart,
            currentEnd,
            priorStart,
            priorEnd
        };
    }

    if (period === 'this_month') {
        const currentStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const currentEnd = now.getTime() > currentStart.getTime() ? now : endOfDay;
        const { priorStart, priorEnd } = buildPriorWindow(currentStart, currentEnd);
        return {
            period: 'this_month',
            scope: buildOverviewCacheScope('this_month', currentStart, currentEnd),
            currentStart,
            currentEnd,
            priorStart,
            priorEnd
        };
    }

    const dayCount = period === '7d' ? 7 : 30;
    const currentEnd = endOfDay;
    const currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dayCount - 1), 0, 0, 0, 0);
    const { priorStart, priorEnd } = buildPriorWindow(currentStart, currentEnd);

    return {
        period,
        scope: buildOverviewCacheScope(period, currentStart, currentEnd),
        currentStart,
        currentEnd,
        priorStart,
        priorEnd
    };
}

function createdAtWindow(start, end) {
    return { gte: start, lt: end };
}

async function fetchWindowComparisonMetrics(client, start, end) {
    const createdAt = createdAtWindow(start, end);
    const [revenueAgg, orders, customers, gmvAgg] = await Promise.all([
        client.order.aggregate({
            where: { status: 'DELIVERED', createdAt },
            _sum: { grandTotal: true }
        }),
        client.order.count({ where: { createdAt } }),
        client.user.count({
            where: { isDeleted: false, createdAt }
        }),
        client.order.aggregate({
            where: {
                status: { notIn: GMV_EXCLUDED_STATUSES },
                createdAt
            },
            _sum: { grandTotal: true }
        })
    ]);

    return {
        revenue: decimalToNumber(revenueAgg._sum?.grandTotal),
        orders: Number(orders) || 0,
        customers: Number(customers) || 0,
        gmv: decimalToNumber(gmvAgg._sum?.grandTotal)
    };
}

/**
 * Daily series for the selected overview period (missing days → value 0).
 * @param {Array<object>} rows
 * @param {{ currentStart: Date, currentEnd: Date }} periodWindow
 * @param {(row: object) => number} [pickValue]
 * @returns {Array<{ date: string, value: number }>}
 */
function buildDailyValueTrendFromRows(rows, periodWindow, pickValue) {
    const valueByDay = new Map();
    for (const row of rows || []) {
        const rawDay = row.day ?? row.date;
        const key = rawDay instanceof Date
            ? formatLocalDateKey(rawDay)
            : String(rawDay).slice(0, 10);
        const rawVal = pickValue
            ? pickValue(row)
            : Number(row.value ?? row.count ?? row.total) || 0;
        valueByDay.set(key, Number(rawVal) || 0);
    }

    const series = [];
    const cursor = new Date(periodWindow.currentStart.getTime());
    const end = periodWindow.currentEnd;

    while (cursor < end) {
        const date = formatLocalDateKey(cursor);
        const value = Math.round((valueByDay.get(date) ?? 0) * 100) / 100;
        series.push({ date, value });
        cursor.setDate(cursor.getDate() + 1);
    }

    return series;
}

/** `{ date, value, count }` — chart code may still read `count`. */
function mapRegistrationTrendSeries(dailySeries) {
    return (dailySeries || []).map(({ date, value }) => ({
        date,
        value,
        count: value
    }));
}

/**
 * Combined daily sales trend for dual-axis charting.
 * @param {Array<object>} revenueRows
 * @param {Array<object>} ordersRows
 * @param {{ currentStart: Date, currentEnd: Date }} periodWindow
 * @returns {Array<{ date: string, revenue: number, ordersCount: number }>}
 */
function buildSalesTrendDailySeries(revenueRows, ordersRows, periodWindow) {
    const revenueTrend = buildDailyValueTrendFromRows(
        revenueRows,
        periodWindow,
        (row) => decimalToNumber(row.total)
    );
    const ordersTrend = buildDailyValueTrendFromRows(
        ordersRows,
        periodWindow,
        (row) => Number(row.count) || 0
    );

    return revenueTrend.map((row, index) => ({
        date: row.date,
        revenue: row.value,
        ordersCount: ordersTrend[index]?.value ?? 0
    }));
}

/**
 * Lifecycle funnel snapshot with stage-to-stage conversion metrics.
 * @param {{ pending?: number, processing?: number, shipped?: number, delivered?: number, cancelled?: number }} pipeline
 */
function buildOrderFunnelFromPipeline(pipeline = {}) {
    const stages = [
        { key: 'pending', label: 'Pending', count: Number(pipeline.pending) || 0 },
        { key: 'processing', label: 'Processing', count: Number(pipeline.processing) || 0 },
        { key: 'shipped', label: 'Shipped', count: Number(pipeline.shipped) || 0 },
        { key: 'delivered', label: 'Delivered', count: Number(pipeline.delivered) || 0 },
        { key: 'cancelled', label: 'Cancelled', count: Number(pipeline.cancelled) || 0 }
    ];

    const entryCount = stages[0].count || 0;

    return stages.map((stage, index) => {
        const previousCount = index > 0 ? stages[index - 1].count : null;
        let conversionFromPrevious = null;
        let dropOffFromPrevious = null;

        if (index > 0 && previousCount > 0) {
            conversionFromPrevious = Math.round((stage.count / previousCount) * 1000) / 10;
            dropOffFromPrevious = Math.round(((previousCount - stage.count) / previousCount) * 1000) / 10;
        }

        const shareOfEntry = entryCount > 0
            ? Math.round((stage.count / entryCount) * 1000) / 10
            : 0;

        return {
            ...stage,
            conversionFromPrevious,
            dropOffFromPrevious,
            shareOfEntry
        };
    });
}

function mapTopProductChartRows(rows) {
    return (rows || []).map((row, index) => ({
        rank: index + 1,
        productId: row.product_key ? String(row.product_key) : null,
        name: row.name || 'Unknown Product',
        quantity: Number(row.units) || 0,
        revenue: Math.round(decimalToNumber(row.revenue) * 100) / 100
    }));
}

async function fetchTopProductsForPeriod(client, periodWindow, limit = TOP_PRODUCTS_CHART_LIMIT) {
    const { currentStart, currentEnd } = periodWindow;

    const rows = await client.$queryRaw`
        SELECT
            COALESCE(oi."productId", oi."legacyProductId", oi.name) AS product_key,
            MAX(oi.name) AS name,
            SUM(oi.quantity)::int AS units,
            COALESCE(SUM(oi.price * oi.quantity), 0)::float AS revenue
        FROM order_items oi
        INNER JOIN orders o ON o.id = oi."orderId"
        WHERE o.status = 'DELIVERED'
          AND o."createdAt" >= ${currentStart}
          AND o."createdAt" < ${currentEnd}
        GROUP BY product_key
        ORDER BY revenue DESC, units DESC
        LIMIT ${limit}
    `;

    return rows || [];
}

async function fetchPeriodDailyTrendRows(client, periodWindow) {
    const { currentStart, currentEnd } = periodWindow;

    return Promise.all([
        client.$queryRaw`
            SELECT DATE("createdAt") AS day,
                   COALESCE(SUM("grandTotal"), 0)::float AS total
            FROM orders
            WHERE status = 'DELIVERED'
              AND "createdAt" >= ${currentStart}
              AND "createdAt" < ${currentEnd}
            GROUP BY DATE("createdAt")
            ORDER BY day ASC
        `,
        client.$queryRaw`
            SELECT DATE("createdAt") AS day,
                   COUNT(*)::int AS count
            FROM orders
            WHERE "createdAt" >= ${currentStart}
              AND "createdAt" < ${currentEnd}
            GROUP BY DATE("createdAt")
            ORDER BY day ASC
        `,
        client.$queryRaw`
            SELECT DATE("createdAt") AS day,
                   COALESCE(SUM("grandTotal"), 0)::float AS total
            FROM orders
            WHERE status NOT IN ('CANCELLED', 'REFUNDED')
              AND "createdAt" >= ${currentStart}
              AND "createdAt" < ${currentEnd}
            GROUP BY DATE("createdAt")
            ORDER BY day ASC
        `,
        client.$queryRaw`
            SELECT DATE("createdAt") AS day,
                   COUNT(*)::int AS count
            FROM users
            WHERE "isDeleted" = false
              AND "createdAt" >= ${currentStart}
              AND "createdAt" < ${currentEnd}
            GROUP BY DATE("createdAt")
            ORDER BY day ASC
        `
    ]);
}

async function attachPeriodGrowthMetrics(client, payload, periodWindow) {
    const [
        current,
        prior,
        [revenueRows, ordersRows, gmvRows, registrationRows],
        topProductRows
    ] = await Promise.all([
        fetchWindowComparisonMetrics(
            client,
            periodWindow.currentStart,
            periodWindow.currentEnd
        ),
        fetchWindowComparisonMetrics(
            client,
            periodWindow.priorStart,
            periodWindow.priorEnd
        ),
        fetchPeriodDailyTrendRows(client, periodWindow),
        fetchTopProductsForPeriod(client, periodWindow, TOP_PRODUCTS_CHART_LIMIT)
    ]);

    payload.meta = {
        period: periodWindow.period,
        currentStart: periodWindow.currentStart.toISOString(),
        currentEnd: periodWindow.currentEnd.toISOString(),
        priorStart: periodWindow.priorStart.toISOString(),
        priorEnd: periodWindow.priorEnd.toISOString()
    };

    payload.sales.periodRevenue = current.revenue;
    payload.sales.revenueGrowth = buildGrowthMetric(current.revenue, prior.revenue);
    payload.sales.periodOrders = current.orders;
    payload.sales.ordersGrowth = buildGrowthMetric(current.orders, prior.orders);
    payload.sales.revenueTrend = buildDailyValueTrendFromRows(
        revenueRows,
        periodWindow,
        (row) => decimalToNumber(row.total)
    );
    payload.sales.ordersTrend = buildDailyValueTrendFromRows(
        ordersRows,
        periodWindow,
        (row) => Number(row.count) || 0
    );

    payload.customers.periodCustomers = current.customers;
    payload.customers.customersGrowth = buildGrowthMetric(current.customers, prior.customers);
    payload.customers.registrationTrend = mapRegistrationTrendSeries(
        buildDailyValueTrendFromRows(
            registrationRows,
            periodWindow,
            (row) => Number(row.count) || 0
        )
    );

    payload.financials.periodGmv = current.gmv;
    payload.financials.gmvGrowth = buildGrowthMetric(current.gmv, prior.gmv);
    payload.financials.gmvTrend = buildDailyValueTrendFromRows(
        gmvRows,
        periodWindow,
        (row) => decimalToNumber(row.total)
    );

    const salesTrend = buildSalesTrendDailySeries(revenueRows, ordersRows, periodWindow);

    payload.charts = {
        salesTrend,
        orderFunnel: buildOrderFunnelFromPipeline(payload.orderPipeline),
        topProducts: mapTopProductChartRows(topProductRows)
    };

    payload.sales.salesTrend = salesTrend;
}

function normalizePaymentMethodLabel(method) {
    const raw = String(method || 'COD').trim();
    return raw || 'COD';
}

function isCodPaymentMethod(method) {
    const key = normalizePaymentMethodLabel(method).toLowerCase();
    return key === 'cod'
        || key.includes('cash on delivery')
        || key === 'cash_on_delivery';
}

/**
 * @param {Array<{ paymentMethod: string, _count: { _all: number }, _sum: { grandTotal: unknown } }>} groups
 */
function buildPaymentSplitFromGroups(groups) {
    const byMethod = (groups || [])
        .map((row) => ({
            method: normalizePaymentMethodLabel(row.paymentMethod),
            count: Number(row._count?._all ?? row._count ?? 0),
            total: decimalToNumber(row._sum?.grandTotal)
        }))
        .sort((a, b) => b.total - a.total);

    const paymentSplit = {
        cod: { count: 0, total: 0 },
        digital: { count: 0, total: 0 },
        byMethod
    };

    for (const row of byMethod) {
        const bucket = isCodPaymentMethod(row.method) ? paymentSplit.cod : paymentSplit.digital;
        bucket.count += row.count;
        bucket.total += row.total;
    }

    paymentSplit.cod.total = Math.round(paymentSplit.cod.total * 100) / 100;
    paymentSplit.digital.total = Math.round(paymentSplit.digital.total * 100) / 100;

    return paymentSplit;
}

async function fetchDashboardFinancials(client) {
    const validOrderWhere = {
        status: { notIn: GMV_EXCLUDED_STATUSES }
    };

    const [gmvAgg, deliveredAgg, refundedAgg, paymentGroups] = await Promise.all([
        client.order.aggregate({
            where: validOrderWhere,
            _sum: { grandTotal: true }
        }),
        client.order.aggregate({
            where: { status: 'DELIVERED' },
            _sum: { grandTotal: true, discountAmount: true },
            _count: { _all: true }
        }),
        client.order.aggregate({
            where: { status: 'REFUNDED' },
            _sum: { grandTotal: true }
        }),
        client.order.groupBy({
            by: ['paymentMethod'],
            where: validOrderWhere,
            _count: { _all: true },
            _sum: { grandTotal: true }
        })
    ]);

    const gmv = decimalToNumber(gmvAgg._sum?.grandTotal);
    const deliveredRevenue = decimalToNumber(deliveredAgg._sum?.grandTotal);
    const deliveredDiscounts = decimalToNumber(deliveredAgg._sum?.discountAmount);
    const refundedAmount = decimalToNumber(refundedAgg._sum?.grandTotal);
    const deliveredOrdersCount = Number(deliveredAgg._count?._all ?? 0);

    const netRevenue = Math.max(
        0,
        Math.round((deliveredRevenue - refundedAmount - deliveredDiscounts) * 100) / 100
    );
    const aov = deliveredOrdersCount > 0
        ? Math.round((deliveredRevenue / deliveredOrdersCount) * 100) / 100
        : 0;

    return {
        gmv,
        netRevenue,
        aov,
        deliveredOrdersCount,
        paymentSplit: buildPaymentSplitFromGroups(paymentGroups)
    };
}

/** @returns {{ startOfDay: Date, endOfDay: Date }} Half-open window [start, end). */
function getTodayBounds(referenceDate = getApplicationNow()) {
    const d = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
        ? referenceDate
        : getApplicationNow();
    const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    return { startOfDay, endOfDay };
}

function formatLocalDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Fill a fixed-length daily series (missing days → count 0).
 * @param {Array<{ day: Date|string, count: number }>} rows
 * @param {Date} now
 * @param {number} days
 * @returns {Array<{ date: string, count: number }>}
 */
function buildRegistrationTrendFromRows(rows, now, days = REGISTRATION_TREND_DAYS) {
    const countByDay = new Map();
    for (const row of rows || []) {
        const rawDay = row.day ?? row.date;
        const key = rawDay instanceof Date
            ? formatLocalDateKey(rawDay)
            : String(rawDay).slice(0, 10);
        countByDay.set(key, Number(row.count) || 0);
    }

    const series = [];
    const anchor = now instanceof Date && !Number.isNaN(now.getTime()) ? now : getApplicationNow();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - i, 0, 0, 0, 0);
        const date = formatLocalDateKey(d);
        series.push({ date, count: countByDay.get(date) ?? 0 });
    }
    return series;
}

function getRegistrationTrendStart(now, days = REGISTRATION_TREND_DAYS) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1), 0, 0, 0, 0);
}

async function fetchRegistrationTrend(client, now) {
    const start = getRegistrationTrendStart(now);
    const rows = await client.$queryRaw`
        SELECT DATE("createdAt") AS day, COUNT(*)::int AS count
        FROM users
        WHERE "isDeleted" = false
          AND "createdAt" >= ${start}
        GROUP BY DATE("createdAt")
        ORDER BY day ASC
    `;
    return buildRegistrationTrendFromRows(rows, now, REGISTRATION_TREND_DAYS);
}

/** Matches enterprise summary low-stock semantics (out of stock + per-product threshold). */
async function countLowStockProducts(client) {
    const zeroOrLess = await client.product.count({
        where: { stockQuantity: { lte: 0 } }
    });

    const thresholdRows = await client.$queryRaw`
        SELECT COUNT(*)::int AS count
        FROM products
        WHERE "lowStockThreshold" > 0
          AND "stockQuantity" > 0
          AND "stockQuantity" <= "lowStockThreshold"
    `;

    return zeroOrLess + Number(thresholdRows[0]?.count || 0);
}

function mapInventoryAlertRow(row) {
    const stockQuantity = Number(row.stockQuantity) || 0;
    const legacyId = row.legacyId ? String(row.legacyId) : null;
    const pgId = row.id ? String(row.id) : null;
    const stockKey = legacyId || pgId || '';

    return {
        id: pgId,
        legacyId,
        _id: stockKey,
        productId: row.productId || '',
        sku: row.productId || '',
        name: row.name || 'Unnamed Product',
        stockQuantity,
        stock: stockQuantity,
        category: row.categoryName || 'General',
        image: row.image || '',
        icon: row.icon || '📦',
        lowStockThreshold: Number(row.lowStockThreshold) || 0,
        alertType: stockQuantity <= 0 ? 'out' : 'low'
    };
}

/**
 * @param {Array<{ status: string, _count: { _all: number } }>} groups
 */
function buildOrderPipelineFromGroups(groups) {
    const pipeline = {
        pending: 0,
        processing: 0,
        shipped: 0,
        delivered: 0,
        cancelled: 0,
        refunded: 0,
        totalInPipeline: 0
    };

    for (const row of groups || []) {
        const count = Number(row._count?._all ?? row._count ?? 0);
        switch (row.status) {
            case 'PENDING':
                pipeline.pending = count;
                break;
            case 'PROCESSING':
                pipeline.processing = count;
                break;
            case 'SHIPPED':
                pipeline.shipped = count;
                break;
            case 'DELIVERED':
                pipeline.delivered = count;
                break;
            case 'CANCELLED':
                pipeline.cancelled = count;
                break;
            case 'REFUNDED':
            case 'REFUND_PENDING':
                pipeline.refunded += count;
                break;
            default:
                break;
        }
    }

    pipeline.totalInPipeline = pipeline.pending + pipeline.processing + pipeline.shipped;
    return pipeline;
}

async function fetchOrderPipelineMetrics(client) {
    const groups = await client.order.groupBy({
        by: ['status'],
        _count: { _all: true }
    });
    return buildOrderPipelineFromGroups(groups);
}

function buildRepeatPurchaseMetrics(row) {
    const totalPurchasingCustomers = Number(row?.total_purchasing ?? row?.totalPurchasing ?? 0);
    const repeatCustomerCount = Number(row?.repeat_customers ?? row?.repeatCustomers ?? 0);
    const repeatPurchaseRate = totalPurchasingCustomers > 0
        ? Math.round(((repeatCustomerCount / totalPurchasingCustomers) * 100) * 10) / 10
        : 0;

    return {
        repeatPurchaseRate,
        repeatCustomerCount,
        totalPurchasingCustomers
    };
}

async function fetchRepeatPurchaseMetrics(client) {
    const [row] = await client.$queryRaw`
        WITH purchasing AS (
            SELECT
                COALESCE(
                    NULLIF("userId", ''),
                    NULLIF("customerPhone", '')
                ) AS purchaser_key,
                COUNT(*)::int AS order_count
            FROM orders
            WHERE status NOT IN ('CANCELLED', 'REFUNDED')
              AND COALESCE("userId"::text, NULLIF("customerPhone", '')) IS NOT NULL
            GROUP BY 1
        )
        SELECT
            COUNT(*)::int AS total_purchasing,
            COUNT(*) FILTER (WHERE order_count > 1)::int AS repeat_customers
        FROM purchasing
    `;

    return buildRepeatPurchaseMetrics(row);
}

async function fetchSupportTicketMetrics(client) {
    const openSupportTickets = await client.contactMessage.count({
        where: { status: { in: OPEN_SUPPORT_TICKET_STATUSES } }
    });

    let supportSla = {
        avgFirstResponseMinutes: null,
        avgResolutionMinutes: null,
        sampledTickets: 0
    };

    try {
        const [slaRow] = await client.$queryRaw`
            SELECT
                COUNT(*) FILTER (WHERE "firstResponseAt" IS NOT NULL)::int AS response_samples,
                COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL)::int AS resolution_samples,
                AVG(
                    EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")) / 60.0
                ) FILTER (WHERE "firstResponseAt" IS NOT NULL) AS avg_response_minutes,
                AVG(
                    EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 60.0
                ) FILTER (WHERE "resolvedAt" IS NOT NULL) AS avg_resolution_minutes
            FROM contact_messages
        `;

        if (slaRow) {
            supportSla = {
                avgFirstResponseMinutes: slaRow.avg_response_minutes != null
                    ? Math.round(Number(slaRow.avg_response_minutes) * 10) / 10
                    : null,
                avgResolutionMinutes: slaRow.avg_resolution_minutes != null
                    ? Math.round(Number(slaRow.avg_resolution_minutes) * 10) / 10
                    : null,
                sampledTickets: Number(slaRow.response_samples || 0) + Number(slaRow.resolution_samples || 0)
            };
        }
    } catch (err) {
        if (process.env.NODE_ENV !== 'test') {
            console.warn('[dashboard-overview] support SLA aggregate skipped:', err.message);
        }
    }

    return {
        openSupportTickets: Number(openSupportTickets) || 0,
        supportSla
    };
}

async function fetchCrmRetentionMetrics(client) {
    const [repeatMetrics, supportMetrics] = await Promise.all([
        fetchRepeatPurchaseMetrics(client),
        fetchSupportTicketMetrics(client)
    ]);

    return {
        ...repeatMetrics,
        openSupportTickets: supportMetrics.openSupportTickets,
        supportSla: supportMetrics.supportSla
    };
}

async function fetchInventoryAlertsList(client) {
    const rows = await client.$queryRaw`
        SELECT
            id,
            "legacyId",
            "productId",
            name,
            "stockQuantity",
            "categoryName",
            image,
            icon,
            "lowStockThreshold"
        FROM products
        WHERE "stockQuantity" <= 0
           OR (
                "lowStockThreshold" > 0
                AND "stockQuantity" > 0
                AND "stockQuantity" <= "lowStockThreshold"
           )
        ORDER BY "stockQuantity" ASC, name ASC NULLS LAST
        LIMIT ${INVENTORY_ALERTS_LIMIT}
    `;

    return (rows || []).map(mapInventoryAlertRow);
}

/**
 * Prisma-only dashboard overview aggregates (no Mongoose).
 * @param {import('../../../generated/prisma/client.mts').PrismaClient} [client]
 * @param {Date} [now]
 * @param {object} [periodWindow]
 */
async function computeDashboardOverviewMetrics(
    client = prisma,
    now = getApplicationNow(),
    periodWindow = parseDashboardOverviewQuery({}, now)
) {
    const { startOfDay, endOfDay } = getTodayBounds(now);

    const [
        totalOrders,
        ordersToday,
        pendingOrders,
        revenueAgg,
        totalCustomers,
        newCustomersToday,
        verifiedCount,
        unverifiedCount,
        blockedCount,
        lowStockItems,
        alertsList,
        financials,
        orderPipeline,
        crm
    ] = await Promise.all([
        client.order.count(),
        client.order.count({
            where: {
                createdAt: { gte: startOfDay, lt: endOfDay }
            }
        }),
        client.order.count({
            where: { status: 'PENDING' }
        }),
        client.order.aggregate({
            where: { status: 'DELIVERED' },
            _sum: { grandTotal: true }
        }),
        client.user.count({
            where: { isDeleted: false }
        }),
        client.user.count({
            where: {
                isDeleted: false,
                createdAt: { gte: startOfDay, lt: endOfDay }
            }
        }),
        client.user.count({
            where: { isDeleted: false, isVerified: true }
        }),
        client.user.count({
            where: { isDeleted: false, isVerified: false }
        }),
        client.user.count({
            where: { isDeleted: false, accountStatus: 'BLOCKED' }
        }),
        countLowStockProducts(client),
        fetchInventoryAlertsList(client),
        fetchDashboardFinancials(client),
        fetchOrderPipelineMetrics(client),
        fetchCrmRetentionMetrics(client)
    ]);

    const totalRevenue = decimalToNumber(revenueAgg._sum?.grandTotal);

    const payload = {
        sales: {
            totalRevenue,
            ordersToday,
            pendingOrders,
            totalOrders
        },
        financials: {
            gmv: financials.gmv,
            netRevenue: financials.netRevenue,
            aov: financials.aov,
            paymentSplit: financials.paymentSplit
        },
        customers: {
            totalCustomers,
            newCustomersToday,
            verifiedCount,
            unverifiedCount,
            blockedCount
        },
        inventory: {
            lowStockItems,
            alertsList
        },
        orderPipeline,
        crm,
        timestamp: now.toISOString()
    };

    await attachPeriodGrowthMetrics(client, payload, periodWindow);
    return payload;
}

/**
 * Redis-backed load with graceful fallback to Prisma when cache is unavailable.
 * @returns {Promise<{ data: object, source: 'cache' | 'db' }>}
 */
async function loadDashboardOverviewCached(periodWindow) {
    const resolvedWindow = periodWindow || parseDashboardOverviewQuery({}, getApplicationNow());
    const cacheKey = CACHE_KEYS.ADMIN_DASHBOARD_OVERVIEW(resolvedWindow.scope);

    if (isRedisAvailable()) {
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached !== null) {
                return { data: JSON.parse(cached), source: 'cache' };
            }
        } catch (err) {
            if (process.env.NODE_ENV !== 'test') {
                console.warn('[dashboard-overview] Redis GET failed — falling back to Prisma:', err.message);
            }
        }
    }

    const data = await computeDashboardOverviewMetrics(prisma, getApplicationNow(), resolvedWindow);

    if (isRedisAvailable()) {
        try {
            await redisClient.set(
                cacheKey,
                JSON.stringify(data),
                'EX',
                OVERVIEW_CACHE_TTL_SECONDS
            );
        } catch (err) {
            if (process.env.NODE_ENV !== 'test') {
                console.warn('[dashboard-overview] Redis SET failed — response still served from DB:', err.message);
            }
        }
    }

    return { data, source: 'db' };
}

function canViewDashboardFinancials(account) {
    if (!account) return false;
    return DASHBOARD_FINANCIAL_PERMISSIONS.some((key) => accountHasPermission(account, key));
}

/**
 * Strip revenue/GMV fields for admins with analytics-only access (applied per request after cache).
 * @param {object} payload
 * @param {boolean} canViewFinancials
 */
function applyDashboardFinancialMask(payload, canViewFinancials) {
    const data = payload || {};
    data.meta = data.meta || {};
    data.permissions = {
        canViewFinancials: canViewFinancials === true
    };

    if (canViewFinancials) {
        if (!Array.isArray(data.meta.maskedZones)) {
            data.meta.maskedZones = [];
        }
        return data;
    }

    data.meta.maskedZones = ['financials'];

    if (data.sales) {
        data.sales.totalRevenue = null;
        data.sales.periodRevenue = null;
        data.sales.revenueGrowth = null;
        if (Array.isArray(data.sales.revenueTrend)) {
            data.sales.revenueTrend = data.sales.revenueTrend.map((row) => ({
                ...row,
                value: 0
            }));
        }
        if (Array.isArray(data.sales.salesTrend)) {
            data.sales.salesTrend = data.sales.salesTrend.map((row) => ({
                ...row,
                revenue: 0
            }));
        }
    }

    if (data.financials) {
        data.financials.gmv = null;
        data.financials.netRevenue = null;
        data.financials.aov = null;
        data.financials.periodGmv = null;
        data.financials.gmvGrowth = null;
        data.financials.paymentSplit = {
            cod: { count: 0, total: 0 },
            digital: { count: 0, total: 0 },
            byMethod: []
        };
        if (Array.isArray(data.financials.gmvTrend)) {
            data.financials.gmvTrend = data.financials.gmvTrend.map((row) => ({
                ...row,
                value: 0
            }));
        }
    }

    if (data.charts) {
        if (Array.isArray(data.charts.salesTrend)) {
            data.charts.salesTrend = data.charts.salesTrend.map((row) => ({
                ...row,
                revenue: 0
            }));
        }
        if (Array.isArray(data.charts.topProducts)) {
            data.charts.topProducts = data.charts.topProducts.map((row) => ({
                ...row,
                revenue: 0
            }));
        }
    }

    return data;
}

/**
 * GET /api/admin/dashboard/overview
 */
async function getDashboardOverview(req, res) {
    try {
        const now = getApplicationNow();
        const periodWindow = parseDashboardOverviewQuery(req.query || {}, now);
        const { data, source } = await loadDashboardOverviewCached(periodWindow);
        const account = req.adminAccount || req.account;
        const canViewFinancials = canViewDashboardFinancials(account);
        const scopedData = applyDashboardFinancialMask(
            JSON.parse(JSON.stringify(data)),
            canViewFinancials
        );
        const payload = { success: true, data: scopedData };
        if (source === 'cache') {
            payload.source = 'cache';
        }
        res.status(200).json(payload);
    } catch (error) {
        console.error('getDashboardOverview Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load dashboard overview.'
        });
    }
}

module.exports = {
    getDashboardOverview,
    canViewDashboardFinancials,
    applyDashboardFinancialMask,
    DASHBOARD_FINANCIAL_PERMISSIONS,
    computeDashboardOverviewMetrics,
    loadDashboardOverviewCached,
    getTodayBounds,
    buildRegistrationTrendFromRows,
    buildDailyValueTrendFromRows,
    buildSalesTrendDailySeries,
    buildOrderFunnelFromPipeline,
    mapTopProductChartRows,
    mapRegistrationTrendSeries,
    fetchTopProductsForPeriod,
    TOP_PRODUCTS_CHART_LIMIT,
    mapInventoryAlertRow,
    countLowStockProducts,
    buildPaymentSplitFromGroups,
    fetchDashboardFinancials,
    parseDashboardOverviewQuery,
    buildOverviewCacheScope,
    buildPriorWindow,
    calcGrowthDelta,
    buildGrowthMetric,
    fetchWindowComparisonMetrics,
    attachPeriodGrowthMetrics,
    buildOrderPipelineFromGroups,
    buildRepeatPurchaseMetrics,
    fetchOrderPipelineMetrics,
    fetchCrmRetentionMetrics,
    fetchRepeatPurchaseMetrics,
    fetchSupportTicketMetrics,
    isCodPaymentMethod,
    GMV_EXCLUDED_STATUSES,
    ORDER_PIPELINE_STATUSES,
    OPEN_SUPPORT_TICKET_STATUSES,
    DEFAULT_OVERVIEW_PERIOD,
    REGISTRATION_TREND_DAYS,
    INVENTORY_ALERTS_LIMIT,
    OVERVIEW_CACHE_TTL_SECONDS
};
