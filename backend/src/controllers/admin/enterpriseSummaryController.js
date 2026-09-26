/********************************************************************
 * Project: EonlineBazar — Phase 4 Enterprise Dashboard
 * File: enterpriseSummaryController.js
 * Description: Single-call ERP + CRM + HRM summary stats for the
 * admin overview enterprise widgets.
 ********************************************************************/

const Order = require('../../models/order');
const Product = require('../../models/product');
const PurchaseOrder = require('../../models/purchaseOrder');
const Cart = require('../../models/cart');
const ContactMessage = require('../../models/ContactMessage');
const User = require('../../models/user');
const Admin = require('../../models/admin');
const {
    fetchHrmDashboardMetricsMongo,
    fetchHrmDashboardMetricsPg,
    getCachedHrmDashboardMetrics
} = require('../../services/hrmDashboardMetricsService');
const { ABANDON_THRESHOLD_MS } = require('../../jobs/abandonedCartJob');
const { isPgReadEnabled } = require('../../config/readCutoverFlags');
const prisma = require('../../config/prismaClient');
const { countOpenPurchaseOrdersFromPG } = require('../../repositories/purchaseOrderRepository');
const securityLogRepository = require('../../repositories/securityLogRepository');
const { normalizeAttendanceDate } = require('../../utils/attendanceDate');
const {
    isNeonTimeoutError,
    logPgFallback
} = require('../../config/neonRetry');
const {
    shouldBypassPg,
    recordPgSuccess,
    recordPgTimeout,
    recordPgNonTimeoutFailure
} = require('../../config/pgCircuitBreaker');

const OPEN_PO_STATUSES = ['draft', 'sent', 'partial'];
const OPEN_TICKET_STATUSES = ['open', 'in_progress', 'pending'];

function startOfToday() {
    return normalizeAttendanceDate();
}

async function safeMetric(label, fn, fallback = 0) {
    try {
        const value = await fn();
        if (String(label).includes('(pg)')) recordPgSuccess();
        return { value, error: null };
    } catch (err) {
        if (String(label).includes('(pg)')) {
            if (isNeonTimeoutError(err)) recordPgTimeout();
            else recordPgNonTimeoutFailure();
            logPgFallback(label.replace('(pg)', ''), err);
        } else {
            console.warn(`[PG-FALLBACK] enterprise-summary ${label} failed -> using default`);
        }
        return { value: fallback, error: err.message };
    }
}

/**
 * Try Postgres first when enabled; on query failure fall back to Mongo so
 * dashboard widgets stay accurate during PG cold starts or sync gaps.
 */
async function collectMetric(label, pgFn, mongoFn, fallback = 0, errors = [], { preferPg = true } = {}) {
    if (preferPg && pgFn) {
        if (shouldBypassPg()) {
            console.warn(`[PG-FALLBACK] ${label} circuit open -> served via Mongo`);
            if (mongoFn) {
                const mongoResult = await safeMetric(`${label}(mongo-fallback)`, mongoFn, fallback);
                if (mongoResult.error) {
                    errors.push({ section: label, message: mongoResult.error });
                }
                return mongoResult.value;
            }
            return fallback;
        }

        const pgResult = await safeMetric(`${label}(pg)`, pgFn, fallback);
        if (!pgResult.error) return pgResult.value;

        if (mongoFn) {
            const mongoResult = await safeMetric(`${label}(mongo-fallback)`, mongoFn, fallback);
            if (mongoResult.error) {
                errors.push({
                    section: label,
                    message: `PG: ${pgResult.error}; Mongo: ${mongoResult.error}`
                });
            } else {
                errors.push({ section: label, message: `PG fallback: ${pgResult.error}` });
            }
            return mongoResult.value;
        }

        errors.push({ section: label, message: pgResult.error });
        return pgResult.value;
    }

    const mongoResult = await safeMetric(`${label}(mongo)`, mongoFn, fallback);
    if (mongoResult.error) errors.push({ section: label, message: mongoResult.error });
    return mongoResult.value;
}

async function countLowStockProductsFromPG() {
    const zeroOrLess = await prisma.product.count({
        where: { stockQuantity: { lte: 0 } }
    });

    const thresholdRows = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS count
        FROM "products"
        WHERE "lowStockThreshold" > 0
          AND "stockQuantity" > 0
          AND "stockQuantity" <= "lowStockThreshold"
    `;

    const thresholdLow = Number(thresholdRows[0]?.count || 0);
    return zeroOrLess + thresholdLow;
}

async function loadEnterpriseSummaryMetrics(todayStart, abandonCutoff, securitySince, currentMonth, currentYear, preferPg) {
    const { countSecurityLogs } = require('../../services/securityAuditReadService');
    const errors = [];

    const pgOrdersToday = () => prisma.order.count({ where: { createdAt: { gte: todayStart } } });
    const mongoOrdersToday = () => Order.countDocuments({ createdAt: { $gte: todayStart } });

    const pgLowStock = () => countLowStockProductsFromPG();
    const mongoLowStock = () => Product.countDocuments({
        $or: [
            { stockQuantity: { $lte: 0 } },
            {
                $expr: {
                    $and: [
                        { $gt: ['$lowStockThreshold', 0] },
                        { $lte: ['$stockQuantity', '$lowStockThreshold'] }
                    ]
                }
            }
        ]
    });

    const pgPendingPo = () => countOpenPurchaseOrdersFromPG(OPEN_PO_STATUSES);
    const mongoPendingPo = () => PurchaseOrder.countDocuments({ status: { $in: OPEN_PO_STATUSES } });

    const pgAbandonedCarts = () => prisma.cart.count({
        where: { lastActivityAt: { lt: abandonCutoff }, items: { some: {} } }
    });
    const mongoAbandonedCarts = () => Cart.countDocuments({
        lastActivityAt: { $lt: abandonCutoff },
        'items.0': { $exists: true }
    });

    const pgOpenTickets = () => prisma.contactMessage.count({
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }
    });
    const mongoOpenTickets = () => ContactMessage.countDocuments({ status: { $in: OPEN_TICKET_STATUSES } });

    const pgNewCustomers = () => prisma.user.count({
        where: { createdAt: { gte: todayStart }, isDeleted: false }
    });
    const mongoNewCustomers = () => User.countDocuments({ createdAt: { $gte: todayStart } });

    const pgStaffCount = () => prisma.admin.count({
        where: { role: { in: ['STAFF', 'SUPERADMIN'] }, status: { not: 'BLOCKED' } }
    });
    const mongoStaffCount = () => Admin.countDocuments({
        role: { $in: ['staff', 'superadmin'] },
        status: { $ne: 'blocked' }
    });

    const pgSecurityEvents = () => securityLogRepository.count({ dateFrom: securitySince });
    const mongoSecurityEvents = () => countSecurityLogs({ dateFrom: securitySince });

    const pgHrmDashboard = () => getCachedHrmDashboardMetrics({
        currentMonth,
        currentYear,
        preferPg: true,
        fetchFn: fetchHrmDashboardMetricsPg
    });
    const mongoHrmDashboard = () => getCachedHrmDashboardMetrics({
        currentMonth,
        currentYear,
        preferPg: false,
        fetchFn: fetchHrmDashboardMetricsMongo
    });

    const pgSilver = () => prisma.user.count({ where: { loyaltyTier: 'SILVER', isDeleted: false } });
    const mongoSilver = () => User.countDocuments({ loyaltyTier: 'silver', isDeleted: { $ne: true } });

    const pgGold = () => prisma.user.count({ where: { loyaltyTier: 'GOLD', isDeleted: false } });
    const mongoGold = () => User.countDocuments({ loyaltyTier: 'gold', isDeleted: { $ne: true } });

    const pgPlatinum = () => prisma.user.count({ where: { loyaltyTier: 'PLATINUM', isDeleted: false } });
    const mongoPlatinum = () => User.countDocuments({ loyaltyTier: 'platinum', isDeleted: { $ne: true } });

    const [
        ordersToday,
        lowStockCount,
        pendingPoCount,
        abandonedCartCount,
        openTicketCount,
        newCustomersToday,
        staffCount,
        hrmDashboard,
        recentSecurityEvents,
        silverCount,
        goldCount,
        platinumCount
    ] = await Promise.all([
        collectMetric('ordersToday', pgOrdersToday, mongoOrdersToday, 0, errors, { preferPg }),
        collectMetric('lowStockCount', pgLowStock, mongoLowStock, 0, errors, { preferPg }),
        collectMetric('pendingPoCount', pgPendingPo, mongoPendingPo, 0, errors, { preferPg }),
        collectMetric('abandonedCartCount', pgAbandonedCarts, mongoAbandonedCarts, 0, errors, { preferPg }),
        collectMetric('openTicketCount', pgOpenTickets, mongoOpenTickets, 0, errors, { preferPg }),
        collectMetric('newCustomersToday', pgNewCustomers, mongoNewCustomers, 0, errors, { preferPg }),
        collectMetric('staffCount', pgStaffCount, mongoStaffCount, 0, errors, { preferPg }),
        collectMetric(
            'hrmDashboard',
            pgHrmDashboard,
            mongoHrmDashboard,
            {
                employeeCount: 0,
                pendingLeaveCount: 0,
                presentToday: 0,
                absentToday: 0,
                lateToday: 0,
                payrollPaidThisMonth: 0,
                payrollPendingThisMonth: 0,
                estimatedPayrollCostThisMonth: 0
            },
            errors,
            { preferPg }
        ),
        collectMetric('recentSecurityEvents', pgSecurityEvents, mongoSecurityEvents, 0, errors, { preferPg }),
        collectMetric('silverCount', pgSilver, mongoSilver, 0, errors, { preferPg }),
        collectMetric('goldCount', pgGold, mongoGold, 0, errors, { preferPg }),
        collectMetric('platinumCount', pgPlatinum, mongoPlatinum, 0, errors, { preferPg })
    ]);

    const employeeCount = Number(hrmDashboard?.employeeCount) || 0;
    const presentToday = Number(hrmDashboard?.presentToday) || 0;
    const absentToday = Number(hrmDashboard?.absentToday) || 0;
    const lateToday = Number(hrmDashboard?.lateToday) || 0;
    const pendingLeaveCount = Number(hrmDashboard?.pendingLeaveCount) || 0;
    const payrollPaidThisMonth = Number(hrmDashboard?.payrollPaidThisMonth) || 0;
    const payrollPendingThisMonth = Number(hrmDashboard?.payrollPendingThisMonth) || 0;
    const estimatedPayrollCostThisMonth = Number(hrmDashboard?.estimatedPayrollCostThisMonth) || 0;

    return {
        stats: {
            ordersToday,
            lowStockCount,
            pendingPoCount,
            abandonedCartCount,
            openTicketCount,
            newCustomersToday,
            staffCount,
            employeeCount,
            recentSecurityEvents,
            presentToday,
            absentToday,
            lateToday,
            pendingLeaveCount,
            payrollPaidThisMonth,
            payrollPendingThisMonth,
            estimatedPayrollCostThisMonth,
            silverCount,
            goldCount,
            platinumCount
        },
        errors
    };
}

/**
 * GET /api/admin/enterprise-summary
 * Returns consolidated ERP, CRM, and HRM KPIs for the dashboard widgets.
 */
exports.getEnterpriseSummary = async (req, res) => {
    try {
        const todayStart = startOfToday();
        const abandonCutoff = new Date(Date.now() - ABANDON_THRESHOLD_MS);
        const securitySince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        let stats;
        let partialErrors = [];

        try {
            const preferPg = isPgReadEnabled('enterprisesummary');
            const loaded = await loadEnterpriseSummaryMetrics(
                todayStart,
                abandonCutoff,
                securitySince,
                currentMonth,
                currentYear,
                preferPg
            );
            stats = loaded.stats;
            partialErrors = loaded.errors || [];
            if (partialErrors.length) {
                console.warn('[enterprise-summary] partial errors:', partialErrors);
            }
        } catch (err) {
            logPgFallback('enterprise-summary', err);
            stats = {
                ordersToday: 0,
                lowStockCount: 0,
                pendingPoCount: 0,
                abandonedCartCount: 0,
                openTicketCount: 0,
                newCustomersToday: 0,
                staffCount: 0,
                employeeCount: 0,
                recentSecurityEvents: 0,
                presentToday: 0,
                absentToday: 0,
                lateToday: 0,
                pendingLeaveCount: 0,
                payrollPaidThisMonth: 0,
                payrollPendingThisMonth: 0,
                estimatedPayrollCostThisMonth: 0,
                silverCount: 0,
                goldCount: 0,
                platinumCount: 0
            };
            partialErrors = [{ section: 'enterprise-summary', message: err.message }];
        }

        res.status(200).json({
            success: true,
            partial: partialErrors.length > 0,
            errors: partialErrors.length > 0 ? partialErrors : undefined,
            data: {
                erp: {
                    ordersToday: stats.ordersToday,
                    lowStockCount: stats.lowStockCount,
                    pendingPoCount: stats.pendingPoCount
                },
                crm: {
                    abandonedCartCount: stats.abandonedCartCount,
                    openTicketCount: stats.openTicketCount,
                    newCustomersToday: stats.newCustomersToday,
                    silverCount: stats.silverCount,
                    goldCount: stats.goldCount,
                    platinumCount: stats.platinumCount
                },
                hrm: {
                    staffCount: stats.staffCount,
                    employeeCount: stats.employeeCount,
                    recentSecurityEvents: stats.recentSecurityEvents,
                    presentToday: stats.presentToday,
                    absentToday: stats.absentToday,
                    lateToday: stats.lateToday,
                    pendingLeaveCount: stats.pendingLeaveCount,
                    payrollPaidThisMonth: stats.payrollPaidThisMonth,
                    payrollPendingThisMonth: stats.payrollPendingThisMonth,
                    estimatedPayrollCostThisMonth: stats.estimatedPayrollCostThisMonth
                }
            }
        });
    } catch (error) {
        console.error('getEnterpriseSummary Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load enterprise summary.' });
    }
};
