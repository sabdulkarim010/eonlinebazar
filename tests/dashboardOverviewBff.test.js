/********************************************************************
 * Dashboard overview BFF — Prisma aggregate helpers
 ********************************************************************/

jest.mock('../backend/src/config/prismaClient', () => ({
    order: { count: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
    user: { count: jest.fn() },
    product: { count: jest.fn() },
    contactMessage: { count: jest.fn() },
    $queryRaw: jest.fn()
}));

jest.mock('../backend/src/utils/redisClient', () => ({
    get: jest.fn(),
    set: jest.fn(),
    isRedisAvailable: jest.fn()
}));

const prisma = require('../backend/src/config/prismaClient');
const redisClient = require('../backend/src/utils/redisClient');
const { isRedisAvailable } = redisClient;

const {
    computeDashboardOverviewMetrics,
    getTodayBounds,
    loadDashboardOverviewCached,
    buildRegistrationTrendFromRows,
    buildDailyValueTrendFromRows,
    buildSalesTrendDailySeries,
    buildOrderFunnelFromPipeline,
    mapRegistrationTrendSeries,
    buildPaymentSplitFromGroups,
    buildOrderPipelineFromGroups,
    buildRepeatPurchaseMetrics,
    mapInventoryAlertRow,
    calcGrowthDelta,
    parseDashboardOverviewQuery,
    buildOverviewCacheScope,
    buildPriorWindow,
    applyDashboardFinancialMask,
    canViewDashboardFinancials,
    OVERVIEW_CACHE_TTL_SECONDS,
    REGISTRATION_TREND_DAYS
} = require('../backend/src/controllers/admin/dashboardOverviewBffController');

describe('dashboardOverviewBffController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('getTodayBounds returns half-open local calendar day', () => {
        const now = new Date(2026, 8, 28, 15, 30, 0);
        const { startOfDay, endOfDay } = getTodayBounds(now);
        expect(startOfDay.getFullYear()).toBe(2026);
        expect(startOfDay.getMonth()).toBe(8);
        expect(startOfDay.getDate()).toBe(28);
        expect(startOfDay.getHours()).toBe(0);
        expect(endOfDay.getTime() - startOfDay.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    test('calcGrowthDelta handles zero prior and rounding', () => {
        expect(calcGrowthDelta(0, 0)).toBe(0);
        expect(calcGrowthDelta(50, 0)).toBe(100);
        expect(calcGrowthDelta(15, 10)).toBe(50);
        expect(calcGrowthDelta(9, 10)).toBe(-10);
    });

    test('parseDashboardOverviewQuery builds prior window for 7d', () => {
        const now = new Date(2026, 8, 28, 14, 0, 0);
        const window = parseDashboardOverviewQuery({ period: '7d' }, now);
        expect(window.period).toBe('7d');
        const duration = window.currentEnd.getTime() - window.currentStart.getTime();
        const priorDuration = window.priorEnd.getTime() - window.priorStart.getTime();
        expect(priorDuration).toBe(duration);
        expect(window.priorEnd.getTime()).toBe(window.currentStart.getTime());
        expect(window.scope).toMatch(/^7d:\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/);
    });

    test('parseDashboardOverviewQuery supports yesterday full prior day', () => {
        const now = new Date(2026, 8, 28, 15, 0, 0);
        const window = parseDashboardOverviewQuery({ period: 'yesterday' }, now);
        expect(window.period).toBe('yesterday');
        expect(window.currentStart.getDate()).toBe(27);
        expect(window.currentEnd.getDate()).toBe(28);
        expect(window.currentEnd.getHours()).toBe(0);
        const duration = window.currentEnd.getTime() - window.currentStart.getTime();
        expect(window.priorEnd.getTime() - window.priorStart.getTime()).toBe(duration);
        expect(window.scope).toBe('yesterday:2026-09-27:2026-09-27');
    });

    test('parseDashboardOverviewQuery custom from/to uses matching prior window', () => {
        const window = parseDashboardOverviewQuery({
            period: 'custom',
            from: '2026-09-10',
            to: '2026-09-15'
        }, new Date(2026, 8, 28, 12, 0, 0));

        expect(window.period).toBe('custom');
        expect(window.scope).toBe('custom:2026-09-10:2026-09-15');
        const duration = window.currentEnd.getTime() - window.currentStart.getTime();
        expect(window.priorEnd.getTime()).toBe(window.currentStart.getTime());
        expect(window.priorEnd.getTime() - window.priorStart.getTime()).toBe(duration);
    });

    test('applyDashboardFinancialMask strips revenue fields when not allowed', () => {
        const raw = {
            meta: { period: '30d' },
            sales: {
                totalRevenue: 5000,
                periodRevenue: 200,
                revenueGrowth: { deltaPercent: 10 },
                revenueTrend: [{ date: '2026-09-28', value: 100 }]
            },
            financials: {
                gmv: 9000,
                netRevenue: 8000,
                aov: 250,
                gmvGrowth: { deltaPercent: 5 },
                paymentSplit: { cod: { count: 1, total: 50 }, digital: { count: 2, total: 80 }, byMethod: [] },
                gmvTrend: [{ date: '2026-09-28', value: 90 }]
            },
            charts: {
                salesTrend: [{ date: '2026-09-28', revenue: 100, ordersCount: 4 }],
                topProducts: [{ name: 'A', quantity: 3, revenue: 300 }]
            }
        };

        const masked = applyDashboardFinancialMask(JSON.parse(JSON.stringify(raw)), false);

        expect(masked.meta.maskedZones).toEqual(['financials']);
        expect(masked.permissions.canViewFinancials).toBe(false);
        expect(masked.sales.totalRevenue).toBeNull();
        expect(masked.financials.gmv).toBeNull();
        expect(masked.financials.aov).toBeNull();
        expect(masked.charts.salesTrend[0].revenue).toBe(0);
        expect(masked.charts.topProducts[0].revenue).toBe(0);
    });

    test('canViewDashboardFinancials respects view_financial_reports permission', () => {
        expect(canViewDashboardFinancials({
            permissions: ['view_analytics'],
            isSuperAdmin: () => false
        })).toBe(false);

        expect(canViewDashboardFinancials({
            permissions: ['view_analytics', 'view_financial_reports'],
            isSuperAdmin: () => false
        })).toBe(true);
    });

    test('buildOverviewCacheScope formats period:from:to segment', () => {
        const start = new Date(2026, 8, 1, 0, 0, 0);
        const end = new Date(2026, 8, 16, 0, 0, 0);
        expect(buildOverviewCacheScope('custom', start, end)).toBe('custom:2026-09-01:2026-09-15');
    });

    test('buildDailyValueTrendFromRows fills period window with zero gaps', () => {
        const window = parseDashboardOverviewQuery({ period: '7d' }, new Date(2026, 8, 28, 12, 0, 0));
        const series = buildDailyValueTrendFromRows(
            [{ day: new Date(2026, 8, 27), total: 150.5 }],
            window,
            (row) => Number(row.total) || 0
        );
        expect(series).toHaveLength(7);
        expect(series[6]).toEqual({ date: '2026-09-28', value: 0 });
        expect(series[5]).toEqual({ date: '2026-09-27', value: 150.5 });
    });

    test('buildSalesTrendDailySeries merges revenue and orders by date', () => {
        const window = parseDashboardOverviewQuery({ period: '7d' }, new Date(2026, 8, 28, 12, 0, 0));
        const series = buildSalesTrendDailySeries(
            [{ day: new Date(2026, 8, 27), total: 100 }],
            [{ day: new Date(2026, 8, 27), count: 4 }],
            window
        );
        expect(series).toHaveLength(7);
        expect(series[5]).toEqual({ date: '2026-09-27', revenue: 100, ordersCount: 4 });
    });

    test('buildOrderFunnelFromPipeline includes conversion metrics', () => {
        const funnel = buildOrderFunnelFromPipeline({
            pending: 100,
            processing: 60,
            shipped: 40,
            delivered: 30,
            cancelled: 10
        });
        expect(funnel).toHaveLength(5);
        expect(funnel[1].conversionFromPrevious).toBe(60);
        expect(funnel[1].dropOffFromPrevious).toBe(40);
    });

    test('mapRegistrationTrendSeries adds count alias for chart consumers', () => {
        expect(mapRegistrationTrendSeries([{ date: '2026-09-28', value: 3 }])).toEqual([
            { date: '2026-09-28', value: 3, count: 3 }
        ]);
    });

    test('buildRegistrationTrendFromRows fills missing days with zero', () => {
        const now = new Date(2026, 8, 28, 12, 0, 0);
        const series = buildRegistrationTrendFromRows(
            [{ day: new Date(2026, 8, 27), count: 4 }],
            now,
            3
        );
        expect(series).toHaveLength(3);
        expect(series[0]).toEqual({ date: '2026-09-26', count: 0 });
        expect(series[1]).toEqual({ date: '2026-09-27', count: 4 });
        expect(series[2]).toEqual({ date: '2026-09-28', count: 0 });
    });

    test('buildOrderPipelineFromGroups maps lifecycle counts', () => {
        const pipeline = buildOrderPipelineFromGroups([
            { status: 'PENDING', _count: { _all: 3 } },
            { status: 'PROCESSING', _count: { _all: 2 } },
            { status: 'SHIPPED', _count: { _all: 4 } },
            { status: 'DELIVERED', _count: { _all: 10 } },
            { status: 'CANCELLED', _count: { _all: 1 } },
            { status: 'REFUNDED', _count: { _all: 2 } }
        ]);
        expect(pipeline.pending).toBe(3);
        expect(pipeline.totalInPipeline).toBe(9);
        expect(pipeline.delivered).toBe(10);
    });

    test('buildRepeatPurchaseMetrics computes percentage with zero fallback', () => {
        expect(buildRepeatPurchaseMetrics({ total_purchasing: 0, repeat_customers: 0 })).toEqual({
            repeatPurchaseRate: 0,
            repeatCustomerCount: 0,
            totalPurchasingCustomers: 0
        });
        expect(buildRepeatPurchaseMetrics({ total_purchasing: 10, repeat_customers: 4 }).repeatPurchaseRate).toBe(40);
    });

    test('buildPaymentSplitFromGroups buckets COD vs digital', () => {
        const split = buildPaymentSplitFromGroups([
            {
                paymentMethod: 'COD',
                _count: { _all: 4 },
                _sum: { grandTotal: 1200 }
            },
            {
                paymentMethod: 'SSLCommerz',
                _count: { _all: 2 },
                _sum: { grandTotal: 800 }
            }
        ]);
        expect(split.cod).toEqual({ count: 4, total: 1200 });
        expect(split.digital).toEqual({ count: 2, total: 800 });
        expect(split.byMethod).toHaveLength(2);
    });

    test('mapInventoryAlertRow maps PG row for dashboard UI', () => {
        const mapped = mapInventoryAlertRow({
            id: 'uuid-1',
            legacyId: 'mongo-id-1',
            productId: 'SKU-001',
            name: 'Test Product',
            stockQuantity: 0,
            categoryName: 'Gadgets',
            image: 'https://img.test/p.jpg',
            icon: '📱',
            lowStockThreshold: 10
        });
        expect(mapped.alertType).toBe('out');
        expect(mapped._id).toBe('mongo-id-1');
        expect(mapped.stock).toBe(0);
        expect(mapped.category).toBe('Gadgets');
    });

    test('computeDashboardOverviewMetrics maps Prisma counts to payload shape', async () => {
        const fixedNow = new Date(2026, 8, 28, 12, 0, 0);
        const mockPrisma = {
            order: {
                count: jest.fn().mockImplementation((args) => {
                    if (args?.where?.status === 'PENDING') {
                        return Promise.resolve(12);
                    }
                    const range = args?.where?.createdAt;
                    if (range?.gte && range?.lt) {
                        const spanMs = range.lt.getTime() - range.gte.getTime();
                        const oneDayMs = 24 * 60 * 60 * 1000;
                        if (spanMs <= oneDayMs + 1000) {
                            return Promise.resolve(7);
                        }
                        return Promise.resolve(120);
                    }
                    return Promise.resolve(100);
                }),
                aggregate: jest.fn().mockImplementation((args) => {
                    const status = args?.where?.status;
                    if (args?.where?.createdAt) {
                        if (status === 'DELIVERED') {
                            return Promise.resolve({ _sum: { grandTotal: 1500 } });
                        }
                        if (status?.notIn) {
                            return Promise.resolve({ _sum: { grandTotal: 1800 } });
                        }
                    }
                    if (status === 'DELIVERED') {
                        if (args._count) {
                            return Promise.resolve({
                                _sum: { grandTotal: 50000, discountAmount: 500 },
                                _count: { _all: 200 }
                            });
                        }
                        return Promise.resolve({ _sum: { grandTotal: 42500.5 } });
                    }
                    if (status?.notIn) {
                        return Promise.resolve({ _sum: { grandTotal: 60000 } });
                    }
                    if (status === 'REFUNDED') {
                        return Promise.resolve({ _sum: { grandTotal: 1000 } });
                    }
                    return Promise.resolve({ _sum: { grandTotal: 0 } });
                }),
                groupBy: jest.fn().mockImplementation((args) => {
                    if (args?.by?.includes('status')) {
                        return Promise.resolve([
                            { status: 'PENDING', _count: { _all: 3 } },
                            { status: 'PROCESSING', _count: { _all: 2 } },
                            { status: 'DELIVERED', _count: { _all: 10 } }
                        ]);
                    }
                    return Promise.resolve([
                        { paymentMethod: 'COD', _count: { _all: 10 }, _sum: { grandTotal: 3000 } },
                        { paymentMethod: 'bKash', _count: { _all: 5 }, _sum: { grandTotal: 2500 } }
                    ]);
                })
            },
            contactMessage: {
                count: jest.fn().mockResolvedValue(6)
            },
            user: {
                count: jest.fn().mockImplementation((args) => {
                    if (args?.where?.isVerified === true) {
                        return Promise.resolve(400);
                    }
                    if (args?.where?.isVerified === false) {
                        return Promise.resolve(100);
                    }
                    if (args?.where?.accountStatus === 'BLOCKED') {
                        return Promise.resolve(5);
                    }
                    const range = args?.where?.createdAt;
                    if (range?.gte && range?.lt) {
                        const spanMs = range.lt.getTime() - range.gte.getTime();
                        const oneDayMs = 24 * 60 * 60 * 1000;
                        if (spanMs <= oneDayMs + 1000) {
                            return Promise.resolve(3);
                        }
                        return Promise.resolve(25);
                    }
                    return Promise.resolve(500);
                })
            },
            product: {
                count: jest.fn().mockResolvedValue(2)
            },
            $queryRaw: jest.fn().mockImplementation((strings) => {
                const sql = Array.isArray(strings) ? strings.join('') : String(strings);
                if (sql.includes('lowStockThreshold') && sql.includes('COUNT(*)::int')) {
                    return Promise.resolve([{ count: 7 }]);
                }
                if (sql.includes('order_items')) {
                    return Promise.resolve([
                        {
                            product_key: 'prod-1',
                            name: 'Best Seller',
                            units: 12,
                            revenue: 2400
                        }
                    ]);
                }
                if (sql.includes('DATE("createdAt")')) {
                    return Promise.resolve([{ day: new Date(2026, 8, 28), count: 2, total: 500 }]);
                }
                if (sql.includes('LIMIT')) {
                    return Promise.resolve([
                        {
                            id: 'p1',
                            legacyId: 'leg1',
                            productId: 'PID-1',
                            name: 'Low item',
                            stockQuantity: 2,
                            categoryName: 'General',
                            image: '',
                            icon: '📦',
                            lowStockThreshold: 5
                        }
                    ]);
                }
                if (sql.includes('total_purchasing')) {
                    return Promise.resolve([{ total_purchasing: 20, repeat_customers: 5 }]);
                }
                if (sql.includes('contact_messages')) {
                    return Promise.resolve([{
                        response_samples: 2,
                        resolution_samples: 1,
                        avg_response_minutes: 15.5,
                        avg_resolution_minutes: 120
                    }]);
                }
                return Promise.resolve([]);
            })
        };

        const data = await computeDashboardOverviewMetrics(mockPrisma, fixedNow);

        expect(data.sales.totalRevenue).toBe(42500.5);
        expect(data.sales.ordersToday).toBe(7);
        expect(data.sales.pendingOrders).toBe(12);
        expect(data.sales.totalOrders).toBe(100);
        expect(data.customers.totalCustomers).toBe(500);
        expect(data.customers.newCustomersToday).toBe(3);
        expect(data.customers.verifiedCount).toBe(400);
        expect(data.customers.unverifiedCount).toBe(100);
        expect(data.customers.blockedCount).toBe(5);
        expect(data.customers.registrationTrend).toHaveLength(REGISTRATION_TREND_DAYS);
        expect(data.customers.registrationTrend[0]).toMatchObject({
            date: expect.any(String),
            value: expect.any(Number),
            count: expect.any(Number)
        });
        expect(data.sales.revenueTrend).toHaveLength(REGISTRATION_TREND_DAYS);
        expect(data.sales.ordersTrend).toHaveLength(REGISTRATION_TREND_DAYS);
        expect(data.financials.gmvTrend).toHaveLength(REGISTRATION_TREND_DAYS);
        expect(data.sales.revenueTrend[0]).toMatchObject({
            date: expect.any(String),
            value: expect.any(Number)
        });
        expect(data.inventory.lowStockItems).toBe(9);
        expect(data.inventory.alertsList).toHaveLength(1);
        expect(data.inventory.alertsList[0].alertType).toBe('low');
        expect(data.financials.gmv).toBe(60000);
        expect(data.financials.netRevenue).toBe(48500);
        expect(data.financials.aov).toBe(250);
        expect(data.financials.paymentSplit.cod.count).toBe(10);
        expect(data.financials.paymentSplit.digital.count).toBe(5);
        expect(data.sales.periodRevenue).toBe(1500);
        expect(data.sales.revenueGrowth.deltaPercent).toBe(0);
        expect(data.sales.periodOrders).toBe(120);
        expect(data.customers.periodCustomers).toBe(25);
        expect(data.financials.periodGmv).toBe(1800);
        expect(data.meta.period).toBe('30d');
        expect(data.orderPipeline.pending).toBe(3);
        expect(data.orderPipeline.totalInPipeline).toBe(5);
        expect(data.crm.repeatPurchaseRate).toBe(25);
        expect(data.crm.openSupportTickets).toBe(6);
        expect(data.crm.supportSla.avgFirstResponseMinutes).toBe(15.5);
        expect(data.charts.salesTrend).toHaveLength(REGISTRATION_TREND_DAYS);
        expect(data.charts.salesTrend[0]).toMatchObject({
            date: expect.any(String),
            revenue: expect.any(Number),
            ordersCount: expect.any(Number)
        });
        expect(data.charts.orderFunnel).toHaveLength(5);
        expect(data.charts.topProducts[0]).toMatchObject({
            name: 'Best Seller',
            quantity: 12,
            revenue: 2400
        });
        expect(data.sales.salesTrend).toHaveLength(REGISTRATION_TREND_DAYS);
        expect(data.timestamp).toBe(fixedNow.toISOString());
    });

    test('loadDashboardOverviewCached returns cache hit without Prisma', async () => {
        isRedisAvailable.mockReturnValue(true);
        const cachedPayload = {
            sales: { totalRevenue: 1, ordersToday: 2, pendingOrders: 3, totalOrders: 4 },
            customers: { totalCustomers: 5, newCustomersToday: 6, registrationTrend: [] },
            inventory: { lowStockItems: 7, alertsList: [] },
            timestamp: '2026-09-28T00:00:00.000Z'
        };
        redisClient.get.mockResolvedValue(JSON.stringify(cachedPayload));

        const result = await loadDashboardOverviewCached();

        expect(result.source).toBe('cache');
        expect(result.data).toEqual(cachedPayload);
        expect(prisma.order.count).not.toHaveBeenCalled();
    });

    test('loadDashboardOverviewCached falls back to Prisma when Redis GET fails', async () => {
        isRedisAvailable.mockReturnValue(true);
        redisClient.get.mockRejectedValue(new Error('connection refused'));
        redisClient.set.mockResolvedValue('OK');

        prisma.order.count
            .mockResolvedValueOnce(10)
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(2);
        prisma.order.aggregate.mockImplementation((args) => {
            if (args?.where?.status === 'DELIVERED' && args._count) {
                return Promise.resolve({
                    _sum: { grandTotal: 100, discountAmount: 0 },
                    _count: { _all: 2 }
                });
            }
            if (args?.where?.status === 'DELIVERED') {
                return Promise.resolve({ _sum: { grandTotal: 100 } });
            }
            if (args?.where?.status?.notIn) {
                return Promise.resolve({ _sum: { grandTotal: 100 } });
            }
            if (args?.where?.status === 'REFUNDED') {
                return Promise.resolve({ _sum: { grandTotal: 0 } });
            }
            return Promise.resolve({ _sum: { grandTotal: 0 } });
        });
        prisma.order.groupBy.mockImplementation((args) => {
            if (args?.by?.includes('status')) {
                return Promise.resolve([]);
            }
            return Promise.resolve([]);
        });
        prisma.contactMessage = { count: jest.fn().mockResolvedValue(0) };
        prisma.user.count
            .mockResolvedValueOnce(20)
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(15)
            .mockResolvedValueOnce(5)
            .mockResolvedValueOnce(0);
        prisma.product.count.mockResolvedValue(1);
        prisma.$queryRaw.mockImplementation((strings) => {
            const sql = Array.isArray(strings) ? strings.join('') : String(strings);
            if (sql.includes('lowStockThreshold') && sql.includes('COUNT(*)::int')) {
                return Promise.resolve([{ count: 2 }]);
            }
            if (sql.includes('DATE("createdAt")')) {
                return Promise.resolve([]);
            }
            if (sql.includes('LIMIT')) {
                return Promise.resolve([]);
            }
            return Promise.resolve([]);
        });

        const result = await loadDashboardOverviewCached();

        expect(result.source).toBe('db');
        expect(result.data.sales.totalOrders).toBe(10);
        expect(redisClient.set).toHaveBeenCalledWith(
            expect.stringMatching(/^admin:dashboard:overview:/),
            expect.any(String),
            'EX',
            OVERVIEW_CACHE_TTL_SECONDS
        );
    });
});
