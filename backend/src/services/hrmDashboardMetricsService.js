/********************************************************************
 * Project: EonlineBazar — HRM dashboard KPI aggregation
 * File: hrmDashboardMetricsService.js
 * Description: Batched Mongo aggregations / Prisma groupBy for
 * enterprise summary HRM widgets (avoids N+1 count fan-out).
 ********************************************************************/

'use strict';

const Attendance = require('../models/attendance');
const Payroll = require('../models/payroll');
const Leave = require('../models/leave');
const Employee = require('../models/employee');
const prisma = require('../config/prismaClient');
const employeeRepository = require('../repositories/employeeRepository');
const { getPlatformDayBounds } = require('../utils/attendanceDate');
const { getOrSet, CACHE_KEYS } = require('./cacheService');

const HRM_SUMMARY_TTL = Number(process.env.HRM_SUMMARY_CACHE_TTL_SECONDS) || 30;

async function aggregateAttendanceTodayMongo() {
    const { start, end } = getPlatformDayBounds(new Date());
    const [row] = await Attendance.aggregate([
        { $match: { date: { $gte: start, $lt: end } } },
        {
            $group: {
                _id: null,
                present: {
                    $sum: {
                        $cond: [{ $in: ['$status', ['present', 'half-day']] }, 1, 0]
                    }
                },
                absent: {
                    $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] }
                },
                late: { $sum: { $cond: [{ $eq: ['$isLate', true] }, 1, 0] } }
            }
        }
    ]);
    return {
        present: row?.present || 0,
        absent: row?.absent || 0,
        late: row?.late || 0
    };
}

async function aggregatePayrollMonthMongo(month, year) {
    const [row] = await Payroll.aggregate([
        { $match: { month, year } },
        {
            $group: {
                _id: null,
                paidCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
                },
                pendingCount: {
                    $sum: { $cond: [{ $ne: ['$status', 'paid'] }, 1, 0] }
                },
                estimatedPayrollCost: {
                    $sum: {
                        $cond: [
                            { $ne: ['$status', 'paid'] },
                            { $ifNull: ['$totalSalary', 0] },
                            0
                        ]
                    }
                }
            }
        }
    ]);
    return {
        paidCount: row?.paidCount || 0,
        pendingCount: row?.pendingCount || 0,
        estimatedPayrollCost: Math.round((row?.estimatedPayrollCost || 0) * 100) / 100
    };
}

async function fetchHrmDashboardMetricsMongo({ currentMonth, currentYear }) {
    const [employeeCount, pendingLeaveCount, attendanceToday, payrollMonth] = await Promise.all([
        Employee.countDocuments({ status: 'active' }),
        Leave.countDocuments({ status: 'pending' }),
        aggregateAttendanceTodayMongo(),
        aggregatePayrollMonthMongo(currentMonth, currentYear)
    ]);

    return {
        employeeCount,
        pendingLeaveCount,
        presentToday: attendanceToday.present,
        absentToday: attendanceToday.absent,
        lateToday: attendanceToday.late,
        payrollPaidThisMonth: payrollMonth.paidCount,
        payrollPendingThisMonth: payrollMonth.pendingCount,
        estimatedPayrollCostThisMonth: payrollMonth.estimatedPayrollCost
    };
}

async function aggregateAttendanceTodayPg() {
    const { start, end } = getPlatformDayBounds(new Date());
    const dayWhere = { date: { gte: start, lt: end } };
    const rows = await prisma.$queryRaw`
        SELECT
            COUNT(*) FILTER (WHERE status IN ('PRESENT', 'HALF_DAY'))::int AS present,
            COUNT(*) FILTER (WHERE status = 'ABSENT')::int AS absent,
            COUNT(*) FILTER (WHERE "isLate" = true)::int AS late
        FROM "attendance"
        WHERE date >= ${start} AND date < ${end}
    `;
    const row = rows[0] || {};
    return {
        present: Number(row.present) || 0,
        absent: Number(row.absent) || 0,
        late: Number(row.late) || 0
    };
}

async function aggregatePayrollMonthPg(month, year) {
    const groups = await prisma.payroll.groupBy({
        by: ['status'],
        where: { month, year },
        _count: { _all: true },
        _sum: { totalSalary: true }
    });

    let paidCount = 0;
    let pendingCount = 0;
    let estimatedPayrollCost = 0;

    for (const g of groups) {
        const count = g._count._all || 0;
        const sum = Number(g._sum.totalSalary) || 0;
        if (String(g.status).toUpperCase() === 'PAID') {
            paidCount += count;
        } else {
            pendingCount += count;
            estimatedPayrollCost += sum;
        }
    }

    return {
        paidCount,
        pendingCount,
        estimatedPayrollCost: Math.round(estimatedPayrollCost * 100) / 100
    };
}

async function fetchHrmDashboardMetricsPg({ currentMonth, currentYear }) {
    const [employeeCount, pendingLeaveCount, attendanceToday, payrollMonth] = await Promise.all([
        employeeRepository.count({ status: 'active' }),
        prisma.leave.count({ where: { status: 'PENDING' } }),
        aggregateAttendanceTodayPg(),
        aggregatePayrollMonthPg(currentMonth, currentYear)
    ]);

    return {
        employeeCount,
        pendingLeaveCount,
        presentToday: attendanceToday.present,
        absentToday: attendanceToday.absent,
        lateToday: attendanceToday.late,
        payrollPaidThisMonth: payrollMonth.paidCount,
        payrollPendingThisMonth: payrollMonth.pendingCount,
        estimatedPayrollCostThisMonth: payrollMonth.estimatedPayrollCost
    };
}

async function getCachedHrmDashboardMetrics({ currentMonth, currentYear, preferPg, fetchFn }) {
    const { startKey } = getPlatformDayBounds(new Date());
    const cacheKey = CACHE_KEYS.HRM_ENTERPRISE_SUMMARY(currentYear, currentMonth, startKey, preferPg ? 'pg' : 'mongo');
    return getOrSet(cacheKey, () => fetchFn({ currentMonth, currentYear }), HRM_SUMMARY_TTL);
}

module.exports = {
    fetchHrmDashboardMetricsMongo,
    fetchHrmDashboardMetricsPg,
    getCachedHrmDashboardMetrics,
    aggregateAttendanceTodayMongo,
    aggregatePayrollMonthMongo
};
