/********************************************************************
 * Project: EonlineBazar — Phase 4 Enterprise Dashboard
 * File: enterpriseSummaryController.js
 * Description: Single-call ERP + CRM + HRM summary stats for the
 * admin overview enterprise widgets.
 ********************************************************************/

const mongoose = require('mongoose');
const Order = require('../../models/order');
const Product = require('../../models/product');
const PurchaseOrder = require('../../models/purchaseOrder');
const Cart = require('../../models/cart');
const ContactMessage = require('../../models/ContactMessage');
const User = require('../../models/user');
const Admin = require('../../models/admin');
const SecurityLog = require('../../models/securityLog');
const Attendance = require('../../models/attendance');
const Payroll = require('../../models/payroll');
const Leave = require('../../models/leave');
const { ABANDON_THRESHOLD_MS } = require('../../jobs/abandonedCartJob');

const OPEN_PO_STATUSES = ['draft', 'sent', 'partial'];
const OPEN_TICKET_STATUSES = ['open', 'in_progress', 'pending'];

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
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

        const [
            ordersToday,
            lowStockCount,
            pendingPoCount,
            abandonedCartCount,
            openTicketCount,
            newCustomersToday,
            staffCount,
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
            SecurityLog.countDocuments({ createdAt: { $gte: securitySince } }),
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

        res.status(200).json({
            success: true,
            data: {
                erp: {
                    ordersToday,
                    lowStockCount,
                    pendingPoCount
                },
                crm: {
                    abandonedCartCount,
                    openTicketCount,
                    newCustomersToday,
                    silverCount,
                    goldCount,
                    platinumCount
                },
                hrm: {
                    staffCount,
                    recentSecurityEvents,
                    presentToday,
                    absentToday,
                    lateToday,
                    pendingLeaveCount,
                    payrollPaidThisMonth,
                    payrollPendingThisMonth
                }
            }
        });
    } catch (error) {
        console.error('getEnterpriseSummary Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load enterprise summary.' });
    }
};
