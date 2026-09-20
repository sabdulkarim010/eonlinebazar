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
const Attendance = require('../../models/attendance');
const Payroll = require('../../models/payroll');
const Leave = require('../../models/leave');
const Employee = require('../../models/employee');
const { ABANDON_THRESHOLD_MS } = require('../../jobs/abandonedCartJob');
const { isPgReadEnabled } = require('../../config/readCutoverFlags');
const prisma = require('../../config/prismaClient');
const { countOpenPurchaseOrdersFromPG } = require('../../repositories/purchaseOrderRepository');
const attendanceRepository = require('../../repositories/attendanceRepository');
const payrollRepository = require('../../repositories/payrollRepository');
const leaveRepository = require('../../repositories/leaveRepository');
const employeeRepository = require('../../repositories/employeeRepository');
const securityLogRepository = require('../../repositories/securityLogRepository');

const OPEN_PO_STATUSES = ['draft', 'sent', 'partial'];
const OPEN_TICKET_STATUSES = ['open', 'in_progress', 'pending'];

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

async function safeMetric(label, fn, fallback = 0) {
    try {
        return { value: await fn(), error: null };
    } catch (err) {
        console.error(`[enterprise-summary] ${label} failed:`, err.message);
        return { value: fallback, error: err.message };
    }
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

async function loadEnterpriseSummaryFromPG(todayStart, abandonCutoff, securitySince, currentMonth, currentYear) {
    const errors = [];

    const collect = async (label, fn, fallback = 0) => {
        const result = await safeMetric(label, fn, fallback);
        if (result.error) errors.push({ section: label, message: result.error });
        return result.value;
    };

    const [
        ordersToday,
        lowStockCount,
        pendingPoCount,
        abandonedCartCount,
        openTicketCount,
        newCustomersToday,
        staffCount,
        employeeCount,
        recentSecurityEvents,
        attendanceToday,
        pendingLeaveCount,
        payrollPaidThisMonth,
        payrollPendingThisMonth,
        silverCount,
        goldCount,
        platinumCount
    ] = await Promise.all([
        collect('ordersToday', () => prisma.order.count({ where: { createdAt: { gte: todayStart } } })),
        collect('lowStockCount', () => countLowStockProductsFromPG()),
        collect('pendingPoCount', () => countOpenPurchaseOrdersFromPG(OPEN_PO_STATUSES)),
        collect('abandonedCartCount', () => prisma.cart.count({
            where: {
                lastActivityAt: { lt: abandonCutoff },
                items: { some: {} }
            }
        })),
        collect('openTicketCount', () => prisma.contactMessage.count({
            where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }
        })),
        collect('newCustomersToday', () => prisma.user.count({
            where: { createdAt: { gte: todayStart }, isDeleted: false }
        })),
        collect('staffCount', () => prisma.admin.count({
            where: {
                role: { in: ['STAFF', 'SUPERADMIN'] },
                status: { not: 'BLOCKED' }
            }
        })),
        collect('employeeCount', () => employeeRepository.count({ status: 'active' })),
        collect('recentSecurityEvents', () => securityLogRepository.count({ dateFrom: securitySince })),
        collect('attendanceToday', () => attendanceRepository.countTodayStats(), { present: 0, absent: 0, late: 0 }),
        collect('pendingLeaveCount', () => leaveRepository.countPending()),
        collect('payrollPaidThisMonth', () => payrollRepository.count({
            month: currentMonth,
            year: currentYear,
            status: 'paid'
        })),
        collect('payrollPendingThisMonth', () => prisma.payroll.count({
            where: {
                month: currentMonth,
                year: currentYear,
                status: { not: 'PAID' }
            }
        })),
        collect('silverCount', () => prisma.user.count({ where: { loyaltyTier: 'SILVER', isDeleted: false } })),
        collect('goldCount', () => prisma.user.count({ where: { loyaltyTier: 'GOLD', isDeleted: false } })),
        collect('platinumCount', () => prisma.user.count({ where: { loyaltyTier: 'PLATINUM', isDeleted: false } }))
    ]);

    const presentToday = Number(attendanceToday?.present) || 0;
    const absentToday = Number(attendanceToday?.absent) || 0;
    const lateToday = Number(attendanceToday?.late) || 0;

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
            silverCount,
            goldCount,
            platinumCount
        },
        errors
    };
}

async function loadEnterpriseSummaryFromMongo(todayStart, abandonCutoff, securitySince, currentMonth, currentYear) {
    const { countSecurityLogs } = require('../../services/securityAuditReadService');
    const errors = [];

    const collect = async (label, fn, fallback = 0) => {
        const result = await safeMetric(label, fn, fallback);
        if (result.error) errors.push({ section: label, message: result.error });
        return result.value;
    };

    const [
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
        silverCount,
        goldCount,
        platinumCount
    ] = await Promise.all([
        collect('ordersToday', () => Order.countDocuments({ createdAt: { $gte: todayStart } })),
        collect('lowStockCount', () => Product.countDocuments({
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
        })),
        collect('pendingPoCount', () => PurchaseOrder.countDocuments({ status: { $in: OPEN_PO_STATUSES } })),
        collect('abandonedCartCount', () => Cart.countDocuments({
            lastActivityAt: { $lt: abandonCutoff },
            'items.0': { $exists: true }
        })),
        collect('openTicketCount', () => ContactMessage.countDocuments({ status: { $in: OPEN_TICKET_STATUSES } })),
        collect('newCustomersToday', () => User.countDocuments({ createdAt: { $gte: todayStart } })),
        collect('staffCount', () => Admin.countDocuments({ role: { $in: ['staff', 'superadmin'] }, status: { $ne: 'blocked' } })),
        collect('employeeCount', () => Employee.countDocuments({ status: 'active' })),
        collect('recentSecurityEvents', () => countSecurityLogs({ dateFrom: securitySince })),
        collect('presentToday', () => Attendance.countDocuments({ date: todayStart, status: { $in: ['present', 'half-day'] } })),
        collect('absentToday', () => Attendance.countDocuments({ date: todayStart, status: 'absent' })),
        collect('lateToday', () => Attendance.countDocuments({ date: todayStart, isLate: true })),
        collect('pendingLeaveCount', () => Leave.countDocuments({ status: 'pending' })),
        collect('payrollPaidThisMonth', () => Payroll.countDocuments({ month: currentMonth, year: currentYear, status: 'paid' })),
        collect('payrollPendingThisMonth', () => Payroll.countDocuments({ month: currentMonth, year: currentYear, status: { $ne: 'paid' } })),
        collect('silverCount', () => User.countDocuments({ loyaltyTier: 'silver', isDeleted: { $ne: true } })),
        collect('goldCount', () => User.countDocuments({ loyaltyTier: 'gold', isDeleted: { $ne: true } })),
        collect('platinumCount', () => User.countDocuments({ loyaltyTier: 'platinum', isDeleted: { $ne: true } }))
    ]);

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
            const loaded = isPgReadEnabled('enterprisesummary')
                ? await loadEnterpriseSummaryFromPG(
                    todayStart,
                    abandonCutoff,
                    securitySince,
                    currentMonth,
                    currentYear
                )
                : await loadEnterpriseSummaryFromMongo(
                    todayStart,
                    abandonCutoff,
                    securitySince,
                    currentMonth,
                    currentYear
                );
            stats = loaded.stats;
            partialErrors = loaded.errors || [];
        } catch (err) {
            console.error('getEnterpriseSummary load failed:', err);
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
                    payrollPendingThisMonth: stats.payrollPendingThisMonth
                }
            }
        });
    } catch (error) {
        console.error('getEnterpriseSummary Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load enterprise summary.' });
    }
};
