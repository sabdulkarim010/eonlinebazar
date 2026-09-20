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

async function countLowStockProductsFromPG() {
    const rows = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS count
        FROM products
        WHERE "stockQuantity" <= 0
           OR ("lowStockThreshold" > 0 AND "stockQuantity" <= "lowStockThreshold")
    `;
    return Number(rows[0]?.count || 0);
}

async function loadEnterpriseSummaryFromPG(todayStart, abandonCutoff, securitySince, currentMonth, currentYear) {
    const attendanceTodayPromise = attendanceRepository.countTodayStats();

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
        prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
        countLowStockProductsFromPG(),
        countOpenPurchaseOrdersFromPG(OPEN_PO_STATUSES),
        prisma.cart.count({
            where: {
                lastActivityAt: { lt: abandonCutoff },
                items: { some: {} }
            }
        }),
        prisma.contactMessage.count({
            where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }
        }),
        prisma.user.count({
            where: { createdAt: { gte: todayStart }, isDeleted: false }
        }),
        prisma.admin.count({
            where: {
                role: { in: ['STAFF', 'SUPERADMIN'] },
                status: { not: 'BLOCKED' }
            }
        }),
        employeeRepository.count({ status: 'active' }),
        securityLogRepository.count({ dateFrom: securitySince }),
        attendanceTodayPromise,
        leaveRepository.countPending(),
        payrollRepository.count({ month: currentMonth, year: currentYear, status: 'paid' }),
        prisma.payroll.count({
            where: {
                month: currentMonth,
                year: currentYear,
                status: { not: 'PAID' }
            }
        }),
        prisma.user.count({ where: { loyaltyTier: 'SILVER', isDeleted: false } }),
        prisma.user.count({ where: { loyaltyTier: 'GOLD', isDeleted: false } }),
        prisma.user.count({ where: { loyaltyTier: 'PLATINUM', isDeleted: false } })
    ]);

    const presentToday = attendanceToday.present;
    const absentToday = attendanceToday.absent;
    const lateToday = attendanceToday.late;

    return {
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
    };
}

async function loadEnterpriseSummaryFromMongo(todayStart, abandonCutoff, securitySince, currentMonth, currentYear) {
    const { countSecurityLogs } = require('../../services/securityAuditReadService');

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
        Order.countDocuments({ createdAt: { $gte: todayStart } }),
        Product.countDocuments({
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
        }),
        PurchaseOrder.countDocuments({ status: { $in: OPEN_PO_STATUSES } }),
        Cart.countDocuments({
            lastActivityAt: { $lt: abandonCutoff },
            'items.0': { $exists: true }
        }),
        ContactMessage.countDocuments({ status: { $in: OPEN_TICKET_STATUSES } }),
        User.countDocuments({ createdAt: { $gte: todayStart } }),
        Admin.countDocuments({ role: { $in: ['staff', 'superadmin'] }, status: { $ne: 'blocked' } }),
        Employee.countDocuments({ status: 'active' }),
        countSecurityLogs({ dateFrom: securitySince }),
        Attendance.countDocuments({ date: todayStart, status: { $in: ['present', 'half-day'] } }),
        Attendance.countDocuments({ date: todayStart, status: 'absent' }),
        Attendance.countDocuments({ date: todayStart, isLate: true }),
        Leave.countDocuments({ status: 'pending' }),
        Payroll.countDocuments({ month: currentMonth, year: currentYear, status: 'paid' }),
        Payroll.countDocuments({ month: currentMonth, year: currentYear, status: { $ne: 'paid' } }),
        User.countDocuments({ loyaltyTier: 'silver', isDeleted: { $ne: true } }),
        User.countDocuments({ loyaltyTier: 'gold', isDeleted: { $ne: true } }),
        User.countDocuments({ loyaltyTier: 'platinum', isDeleted: { $ne: true } })
    ]);

    return {
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

        const stats = isPgReadEnabled('enterprisesummary')
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

        res.status(200).json({
            success: true,
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
