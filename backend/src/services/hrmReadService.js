/********************************************************************
 * Project: EonlineBazar — Database Migration Stage 4
 * File: hrmReadService.js
 * Description: Routed reads for Employee, Attendance, Payroll, Leave.
 *   Polymorphic staff rows resolve adminId/employeeId → Mongo legacy staffId.
 ********************************************************************/

'use strict';

const mongoose = require('mongoose');
const Admin = require('../models/admin');
const Employee = require('../models/employee');
const Attendance = require('../models/attendance');
const { iteratePlatformDateKeys } = require('../utils/attendanceDate');
const Payroll = require('../models/payroll');
const Leave = require('../models/leave');
const Shift = require('../models/shift');
const { routedRead } = require('./readRouter');
const {
  buildHrmStaffLegacyMaps,
  legacyStaffIdFromRow,
  employeeToMongoShape,
  mapEmployeesToMongo,
  mapAttendanceToMongo,
  mapPayrollsToMongo,
  mapLeavesToMongo,
  leaveToMongoShape
} = require('./readShapeHelpers');
const {
  parseStaffSelector,
  resolveHrmSubject,
  findAdmin
} = require('../utils/hrmStaffResolver');

const { LEAVE_ALLOWANCES, LEAVE_TYPES } = Leave;

function getPgStaffResolver() {
  return require('../repositories/hrmStaffResolver');
}

function getEmployeeRepository() {
  return require('../repositories/employeeRepository');
}

function getAttendanceRepository() {
  return require('../repositories/attendanceRepository');
}

function getPayrollRepository() {
  return require('../repositories/payrollRepository');
}

function getLeaveRepository() {
  return require('../repositories/leaveRepository');
}

async function loadStaffLegacyMaps(rows = []) {
  const prisma = require('../config/prismaClient');
  const adminIds = new Set();
  const employeeIds = new Set();
  rows.forEach((row) => {
    if (row.adminId) adminIds.add(row.adminId);
    if (row.employeeId) employeeIds.add(row.employeeId);
  });

  const [adminRows, employeeRows] = await Promise.all([
    adminIds.size
      ? prisma.admin.findMany({
        where: { id: { in: [...adminIds] } },
        select: { id: true, legacyId: true }
      })
      : [],
    employeeIds.size
      ? prisma.employee.findMany({
        where: { id: { in: [...employeeIds] } },
        select: { id: true, legacyId: true }
      })
      : []
  ]);

  return buildHrmStaffLegacyMaps(adminRows, employeeRows);
}

async function buildPolymorphicStaffOr(mongoStaffId, staffType) {
  if (!mongoStaffId) return null;
  const clauses = [{ staffId: String(mongoStaffId) }];
  const subject = await getPgStaffResolver().resolveStaffSubject({
    staffType: staffType || 'admin',
    staffId: mongoStaffId
  });
  if (subject) {
    if (subject.staffId && !clauses.some((c) => c.staffId === subject.staffId)) {
      clauses.push({ staffId: subject.staffId });
    }
    if (subject.adminId) clauses.push({ adminId: subject.adminId });
    if (subject.employeeId) clauses.push({ employeeId: subject.employeeId });
  }
  return clauses;
}

/** Mirrors leaveController.findStaff — admin accounts only (Mongo path). */
async function resolveMongoAdminStaffId(staffSelector) {
  const account = await findAdmin(staffSelector);
  return account ? String(account._id) : '__no_match__';
}

/** Exclude soft-deleted employees from operational lists. */
function buildNotDeletedMongoClause() {
  return { isDeleted: { $ne: true } };
}

function parseIncludeTerminatedFlag(query = {}) {
  return String(query.includeTerminated || '').trim().toLowerCase() === 'true';
}

/**
 * Default employee list visibility — mirrors Mongo soft-delete + terminated handling.
 * Terminated rows are hidden unless `includeTerminated=true` or status=terminated.
 */
function appendOperationalEmployeeMongoClauses(mongoClauses, filters = {}) {
  if (filters.includeTerminated) {
    return;
  }
  if (filters.status === 'terminated') {
    mongoClauses.push({ status: 'terminated' });
    return;
  }
  mongoClauses.push(buildNotDeletedMongoClause());
  mongoClauses.push({ status: { $ne: 'terminated' } });
}

function buildEmployeeListFilters(query = {}) {
  const filters = {};
  const status = String(query.status || '').trim().toLowerCase();
  if (Employee.EMPLOYEE_STATUSES.includes(status)) filters.status = status;

  if (parseIncludeTerminatedFlag(query)) {
    filters.includeTerminated = true;
  }

  const department = String(query.department || '').trim();
  if (department) filters.department = department;

  const designation = String(query.designation || '').trim();
  if (designation) filters.designation = designation;

  const employeeType = String(query.employeeType || '').trim().toLowerCase();
  if (Employee.EMPLOYEE_TYPES.includes(employeeType)) filters.employeeType = employeeType;

  const search = String(query.search || '').trim();
  if (search) filters.search = search;

  const hasAccess = String(query.hasAccess || '').trim().toLowerCase();
  if (hasAccess === 'true') filters.hasAccess = true;
  else if (hasAccess === 'false') filters.hasAccess = false;

  return filters;
}

/** When PG linkedAdminId is null, check Mongo employeeRef / linkedAdminId before listing as unlinked. */
async function resolveLinkedAdminIdForEmployeeShape(employee) {
  if (!employee || employee.linkedAdminId) return employee;

  const mongoEmp = await Employee.findById(employee._id).select('linkedAdminId').lean();
  if (mongoEmp?.linkedAdminId) {
    employee.linkedAdminId = String(mongoEmp.linkedAdminId);
    return employee;
  }

  const admin = await Admin.findOne({ employeeRef: String(employee._id) }).select('_id').lean();
  if (admin) {
    employee.linkedAdminId = String(admin._id);
  }
  return employee;
}

async function filterEmployeesWithoutLinkedAccess(employees, { assignableOnly = false } = {}) {
  if (assignableOnly) {
    return (employees || []).filter((row) => !row.linkedAdminId);
  }
  const resolved = await Promise.all(
    (employees || []).map((row) => resolveLinkedAdminIdForEmployeeShape({ ...row }))
  );
  return resolved.filter((row) => !row.linkedAdminId);
}

async function fetchEmployeesPage({ query, skip, limit }) {
  const filters = buildEmployeeListFilters(query);
  filters.page = Math.floor(skip / limit) + 1;
  filters.limit = limit;

  return routedRead(
    'employee',
    async () => {
      const mongoClauses = [];
      appendOperationalEmployeeMongoClauses(mongoClauses, filters);
      const mongoFilter = {};
      if (filters.status && filters.status !== 'terminated') mongoFilter.status = filters.status;
      if (filters.department) mongoFilter.department = filters.department;
      if (filters.designation) mongoFilter.designation = filters.designation;
      if (filters.employeeType) mongoFilter.employeeType = filters.employeeType;
      if (filters.search) {
        const re = new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        mongoFilter.$or = [
          { fullName: re }, { phone: re }, { employeeId: re }, { role: re }, { designation: re }
        ];
      }
      const noLinkedAdminClause = {
        $or: [{ linkedAdminId: null }, { linkedAdminId: '' }, { linkedAdminId: { $exists: false } }]
      };
      if (filters.hasAccess === false) {
        if (mongoFilter.$or) {
          const searchClause = { $or: mongoFilter.$or };
          delete mongoFilter.$or;
          mongoFilter.$and = [searchClause, noLinkedAdminClause];
        } else {
          Object.assign(mongoFilter, noLinkedAdminClause);
        }
      } else if (filters.hasAccess === true) {
        mongoFilter.linkedAdminId = { $nin: [null, ''] };
      }

      mongoClauses.push(mongoFilter);
      const listFilter = mongoClauses.length === 1 ? mongoClauses[0] : { $and: mongoClauses };

      const [employees, total] = await Promise.all([
        Employee.find(listFilter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Employee.countDocuments(listFilter)
      ]);
      return { employees, total };
    },
    async () => {
      const repo = getEmployeeRepository();
      const pgFilters = { ...filters, includeNested: true };
      const [rows, total] = await Promise.all([
        repo.findAll(pgFilters),
        repo.count(filters)
      ]);
      let employees = mapEmployeesToMongo(rows);
      let totalCount = total;
      if (filters.hasAccess === false) {
        employees = await filterEmployeesWithoutLinkedAccess(employees);
        totalCount = employees.length;
      }
      return { employees, total: totalCount };
    }
  );
}

async function fetchAllActiveEmployees(query = {}) {
  const filters = buildEmployeeListFilters(query);
  filters.status = 'active';
  filters.orderByFullName = true;
  const assignableOnly = String(query.assignable || '').toLowerCase() === 'true'
    || (filters.hasAccess === false && String(query.all || '').toLowerCase() === 'true');
  const excludeSuperAdmin = String(query.all || '').toLowerCase() === 'true'
    && String(query.includeSuperAdmin || '').toLowerCase() !== 'true';

  return routedRead(
    'employee',
    async () => {
      const clauses = [{ status: 'active' }];
      if (!filters.includeTerminated) {
        clauses.push(buildNotDeletedMongoClause());
      }
      if (excludeSuperAdmin) {
        const { getSuperAdminLinkedEmployeeLegacyIds, buildMongoExcludeSuperAdminClause } = require('../utils/superAdminEmployee');
        const excludeClause = buildMongoExcludeSuperAdminClause(await getSuperAdminLinkedEmployeeLegacyIds());
        if (excludeClause) clauses.push(excludeClause);
      }
      if (filters.department) clauses.push({ department: filters.department });
      if (filters.designation) clauses.push({ designation: filters.designation });
      if (filters.employeeType) clauses.push({ employeeType: filters.employeeType });
      if (filters.search) {
        const re = new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        clauses.push({
          $or: [
            { fullName: re }, { phone: re }, { employeeId: re }, { role: re }, { designation: re }
          ]
        });
      }
      if (filters.hasAccess === false) {
        clauses.push({
          $or: [{ linkedAdminId: null }, { linkedAdminId: '' }, { linkedAdminId: { $exists: false } }]
        });
      } else if (filters.hasAccess === true) {
        clauses.push({ linkedAdminId: { $nin: [null, ''] } });
      }
      const mongoFilter = clauses.length === 1 ? clauses[0] : { $and: clauses };
      return Employee.find(mongoFilter).sort({ fullName: 1 }).lean();
    },
    async () => {
      const rows = await getEmployeeRepository().findAll({ ...filters, includeNested: true });
      let employees = mapEmployeesToMongo(rows);
      if (filters.hasAccess === false) {
        employees = await filterEmployeesWithoutLinkedAccess(employees, { assignableOnly });
      }
      if (excludeSuperAdmin) {
        const { getSuperAdminLinkedEmployeeLegacyIds } = require('../utils/superAdminEmployee');
        const excludeIds = new Set(await getSuperAdminLinkedEmployeeLegacyIds());
        employees = employees.filter((row) => !excludeIds.has(String(row._id)));
      }
      return employees;
    }
  );
}

async function fetchEmployeeStats() {
  return routedRead(
    'employee',
    async () => {
      const operationalMatch = {
        $match: {
          $and: [
            buildNotDeletedMongoClause(),
            { status: { $ne: 'terminated' } }
          ]
        }
      };
      const [totals, byDepartment, byDesignation] = await Promise.all([
        Employee.aggregate([operationalMatch, { $group: { _id: '$status', count: { $sum: 1 } } }]),
        Employee.aggregate([
          operationalMatch,
          { $match: { status: 'active' } },
          { $group: { _id: '$department', count: { $sum: 1 } } },
          { $sort: { _id: 1 } }
        ]),
        Employee.aggregate([
          operationalMatch,
          { $match: { status: 'active' } },
          { $group: { _id: '$designation', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } }
        ])
      ]);
      return { totals, byDepartment, byDesignation };
    },
    async () => {
      const { statusGroups, deptGroups, desGroups } = await getEmployeeRepository().aggregateStats();
      return {
        totals: statusGroups.map((row) => ({
          _id: row.status ? String(row.status).toLowerCase() : null,
          count: row._count._all
        })),
        byDepartment: deptGroups.map((row) => ({
          _id: row.department,
          count: row._count._all
        })),
        byDesignation: desGroups.map((row) => ({
          _id: row.designation,
          count: row._count._all
        }))
      };
    }
  );
}

async function fetchEmployeesForExport(query = {}, limit = 10000) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10000, 1), 10000);
  const { employees } = await fetchEmployeesPage({ query, skip: 0, limit: safeLimit });
  return employees;
}

async function fetchPayrollsForExport(query = {}, limit = 10000) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10000, 1), 10000);
  const { records } = await fetchPayrollsPage({ query, skip: 0, limit: safeLimit });
  return records;
}

async function fetchEmployeeByIdentifier(id) {
  return routedRead(
    'employee',
    async () => {
      const { findEmployeeRecord } = require('../utils/hrmStaffResolver');
      const doc = await findEmployeeRecord(id);
      return doc ? (doc.toObject ? doc.toObject() : doc) : null;
    },
    async () => {
      const row = await getEmployeeRepository().findDetailed(id);
      return row ? employeeToMongoShape(row) : null;
    }
  );
}

async function fetchEmployeeProfileBundle(mongoStaffId) {
  const staffId = String(mongoStaffId);
  const now = new Date();
  const year = now.getFullYear();
  const monthStart = new Date(year, now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, now.getMonth() + 1, 0, 23, 59, 59, 999);
  const yearStart = new Date(year, 0, 1, 0, 0, 0, 0);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  const [attendanceRows, payrollRows, leaveRows] = await Promise.all([
    routedRead(
      'attendance',
      () => Attendance.find({ staffId, date: { $gte: monthStart, $lte: monthEnd } }).lean(),
      async () => {
        const staffOr = await buildPolymorphicStaffOr(staffId, 'employee');
        const rows = await getAttendanceRepository().findAll({
          staffOr,
          from: monthStart,
          to: monthEnd
        });
        const maps = await loadStaffLegacyMaps(rows);
        return mapAttendanceToMongo(rows, maps);
      }
    ),
    routedRead(
      'payroll',
      () => Payroll.find({ staffId }).sort({ year: -1, month: -1 }).limit(6).lean(),
      async () => {
        const staffOr = await buildPolymorphicStaffOr(staffId, 'employee');
        const rows = await getPayrollRepository().findAll({ staffOr, limit: 6 });
        const maps = await loadStaffLegacyMaps(rows);
        return mapPayrollsToMongo(rows, maps);
      }
    ),
    routedRead(
      'leave',
      () => Leave.find({ staffId, startDate: { $gte: yearStart, $lte: yearEnd } }).lean(),
      async () => {
        const staffOr = await buildPolymorphicStaffOr(staffId, 'employee');
        const rows = await getLeaveRepository().findAll({
          staffOr,
          year
        });
        const maps = await loadStaffLegacyMaps(rows);
        return mapLeavesToMongo(rows, maps);
      }
    )
  ]);

  return { attendanceRows, payrollRows, leaveRows };
}

async function fetchAttendancePage({ query, skip, limit }) {
  const staff = String(query.staff || '').trim();

  const status = String(query.status || '').trim().toLowerCase();
  const statusFilter = Attendance.ATTENDANCE_STATUSES.includes(status) ? status : undefined;

  const single = Attendance.normalizeDate(query.date);
  let from;
  let to;
  let date;
  if (query.date && single) {
    date = single;
  } else {
    from = Attendance.normalizeDate(query.from);
    to = Attendance.normalizeDate(query.to);
  }

  return routedRead(
    'attendance',
    async () => {
      const mongoFilter = {};
      if (staff) {
        const subject = await resolveHrmSubject(parseStaffSelector(staff));
        mongoFilter.staffId = subject ? subject.staffId : '__no_match__';
      }
      if (statusFilter) mongoFilter.status = statusFilter;
      if (date) mongoFilter.date = date;
      else if (from || to) {
        mongoFilter.date = {};
        if (from) mongoFilter.date.$gte = from;
        if (to) mongoFilter.date.$lte = to;
      }

      const [records, total] = await Promise.all([
        Attendance.find(mongoFilter).sort({ date: -1, staffUsername: 1 }).skip(skip).limit(limit).lean(),
        Attendance.countDocuments(mongoFilter)
      ]);
      return { records, total };
    },
    async () => {
      const repo = getAttendanceRepository();
      let staffOr = null;
      if (staff) {
        const subject = await resolveHrmSubject(parseStaffSelector(staff));
        staffOr = subject
          ? await buildPolymorphicStaffOr(subject.staffId, subject.staffType)
          : [{ staffId: '__no_match__' }];
      }
      const pgFilters = {
        staffOr,
        status: statusFilter,
        date,
        from,
        to,
        page: Math.floor(skip / limit) + 1,
        limit
      };
      const [rows, total] = await Promise.all([
        repo.findAll(pgFilters),
        repo.count(pgFilters)
      ]);
      const maps = await loadStaffLegacyMaps(rows);
      return { records: mapAttendanceToMongo(rows, maps), total };
    }
  );
}

async function fetchTodayAttendanceStats() {
  return routedRead(
    'attendance',
    async () => {
      const today = Attendance.normalizeDate(new Date());
      const [present, absent, late, activeShifts] = await Promise.all([
        Attendance.countDocuments({ date: today, status: { $in: ['present', 'half-day'] } }),
        Attendance.countDocuments({ date: today, status: 'absent' }),
        Attendance.countDocuments({ date: today, isLate: true }),
        Shift.countDocuments({})
      ]);
      return { present, absent, late, activeShifts };
    },
    async () => {
      const counts = await getAttendanceRepository().countTodayStats();
      const activeShifts = await Shift.countDocuments({});
      return { ...counts, activeShifts };
    }
  );
}

async function fetchAttendanceSummary({ month, year, staff }) {
  const now = new Date();
  const m = Math.min(Math.max(parseInt(month, 10) || now.getMonth() + 1, 1), 12);
  const y = parseInt(year, 10) || now.getFullYear();
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 0, 0, 0, 0);

  const staffTrim = String(staff || '').trim();

  return routedRead(
    'attendance',
    async () => {
      const match = { date: { $gte: start, $lte: end } };
      if (staffTrim) {
        match.staffId = await resolveMongoAdminStaffId(staffTrim);
      }

      const rows = await Attendance.aggregate([
        { $match: match },
        {
          $group: {
            _id: { staffId: '$staffId', staffUsername: '$staffUsername' },
            present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
            late: { $sum: { $cond: ['$isLate', 1, 0] } },
            halfDay: { $sum: { $cond: [{ $eq: ['$status', 'half-day'] }, 1, 0] } },
            holiday: { $sum: { $cond: [{ $eq: ['$status', 'holiday'] }, 1, 0] } },
            totalHours: { $sum: '$hoursWorked' },
            recorded: { $sum: 1 }
          }
        },
        { $sort: { '_id.staffUsername': 1 } }
      ]);

      return rows.map((row) => ({
        staffId: row._id.staffId,
        staffUsername: row._id.staffUsername,
        present: row.present,
        absent: row.absent,
        late: row.late,
        halfDay: row.halfDay,
        holiday: row.holiday,
        totalHours: Math.round((row.totalHours || 0) * 100) / 100,
        recorded: row.recorded
      }));
    },
    async () => {
      let staffOr = null;
      if (staffTrim) {
        const account = await getPgStaffResolver().findAdminRecord(staffTrim);
        staffOr = account
          ? await buildPolymorphicStaffOr(account.legacyId || account.id, 'admin')
          : [{ staffId: '__no_match__' }];
      }
      const grouped = await getAttendanceRepository().aggregateMonthlySummary(m, y, staffOr);
      const maps = await loadStaffLegacyMaps(grouped);
      return grouped.map((row) => ({
        staffId: legacyStaffIdFromRow(row, maps),
        staffUsername: row.staffUsername,
        present: row.present,
        absent: row.absent,
        late: row.late,
        halfDay: row.halfDay,
        holiday: row.holiday,
        totalHours: row.totalHours,
        recorded: row.recorded
      }));
    }
  );
}

async function fetchPayrollsPage({ query, skip, limit }) {
  const filters = {};
  const month = parseInt(query.month, 10);
  if (month >= 1 && month <= 12) filters.month = month;
  const year = parseInt(query.year, 10);
  if (year) filters.year = year;
  const status = String(query.status || '').trim().toLowerCase();
  if (Payroll.PAYROLL_STATUSES.includes(status)) filters.status = status;

  const staff = String(query.staff || '').trim();

  filters.page = Math.floor(skip / limit) + 1;
  filters.limit = limit;

  return routedRead(
    'payroll',
    async () => {
      const mongoFilter = {};
      if (filters.month) mongoFilter.month = filters.month;
      if (filters.year) mongoFilter.year = filters.year;
      if (filters.status) mongoFilter.status = filters.status;
      if (staff) {
        const subject = await resolveHrmSubject(parseStaffSelector(staff));
        mongoFilter.staffId = subject ? subject.staffId : '__no_match__';
      }

      const [records, total, totals] = await Promise.all([
        Payroll.find(mongoFilter).sort({ year: -1, month: -1, staffUsername: 1 }).skip(skip).limit(limit).lean(),
        Payroll.countDocuments(mongoFilter),
        Payroll.aggregate([
          { $match: mongoFilter },
          {
            $group: {
              _id: null,
              totalAmount: { $sum: '$totalSalary' },
              paidCount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
              pendingCount: { $sum: { $cond: [{ $ne: ['$status', 'paid'] }, 1, 0] } }
            }
          }
        ])
      ]);

      const rollup = totals[0] || { totalAmount: 0, paidCount: 0, pendingCount: 0 };
      return { records, total, rollup };
    },
    async () => {
      const repo = getPayrollRepository();
      const pgFilters = { ...filters };
      if (staff) {
        const subject = await resolveHrmSubject(parseStaffSelector(staff));
        pgFilters.staffOr = subject
          ? await buildPolymorphicStaffOr(subject.staffId, subject.staffType)
          : [{ staffId: '__no_match__' }];
      }
      const [rows, total, rollup] = await Promise.all([
        repo.findAll(pgFilters),
        repo.count(pgFilters),
        repo.aggregateRollup(pgFilters)
      ]);
      const maps = await loadStaffLegacyMaps(rows);
      return {
        records: mapPayrollsToMongo(rows, maps),
        total,
        rollup: {
          totalAmount: rollup.totalAmount,
          paidCount: rollup.paidCount,
          pendingCount: rollup.pendingCount
        }
      };
    }
  );
}

async function decoratePayrollDesignations(records) {
  const employeeIds = records
    .filter((r) => r.staffType === 'employee')
    .map((r) => r.staffId)
    .filter((id) => mongoose.Types.ObjectId.isValid(id));

  if (!employeeIds.length) {
    return records.map((r) => ({ ...r, designation: '' }));
  }

  const employees = await Employee.find({ _id: { $in: employeeIds } })
    .select('_id designation department')
    .lean();
  const designationMap = {};
  employees.forEach((e) => {
    designationMap[String(e._id)] = e.designation || e.department || '';
  });

  return records.map((r) => ({
    ...r,
    designation: r.staffType === 'employee'
      ? (designationMap[String(r.staffId)] || '')
      : ''
  }));
}

async function fetchLeavesPage({ query, skip, limit }) {
  const filters = {};
  const status = String(query.status || '').trim().toLowerCase();
  if (Leave.LEAVE_STATUSES.includes(status)) filters.status = status;
  const leaveType = String(query.leaveType || '').trim().toLowerCase();
  if (Leave.LEAVE_TYPES.includes(leaveType)) filters.leaveType = leaveType;

  const staff = String(query.staff || '').trim();

  const year = parseInt(query.year, 10);
  if (year) filters.year = year;

  filters.page = Math.floor(skip / limit) + 1;
  filters.limit = limit;

  return routedRead(
    'leave',
    async () => {
      const mongoFilter = {};
      if (filters.status) mongoFilter.status = filters.status;
      if (filters.leaveType) mongoFilter.leaveType = filters.leaveType;
      if (staff) {
        mongoFilter.staffId = await resolveMongoAdminStaffId(staff);
      }
      if (year) {
        mongoFilter.startDate = {
          $gte: new Date(year, 0, 1, 0, 0, 0, 0),
          $lte: new Date(year, 11, 31, 23, 59, 59, 999)
        };
      }

      const [records, total, pendingCount] = await Promise.all([
        Leave.find(mongoFilter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Leave.countDocuments(mongoFilter),
        Leave.countDocuments({ status: 'pending' })
      ]);
      return { records, total, pendingCount };
    },
    async () => {
      const repo = getLeaveRepository();
      const pgFilters = { ...filters };
      if (staff) {
        const account = await getPgStaffResolver().findAdminRecord(staff);
        pgFilters.staffOr = account
          ? await buildPolymorphicStaffOr(account.legacyId || account.id, 'admin')
          : [{ staffId: '__no_match__' }];
      }
      const [rows, total, pendingCount] = await Promise.all([
        repo.findAll(pgFilters),
        repo.count(pgFilters),
        repo.countPending()
      ]);
      const maps = await loadStaffLegacyMaps(rows);
      return {
        records: mapLeavesToMongo(rows, maps),
        total,
        pendingCount
      };
    }
  );
}

async function fetchLeaveBalance({ year, staff }) {
  const y = parseInt(year, 10) || new Date().getFullYear();
  const staffTrim = String(staff || '').trim();

  return routedRead(
    'leave',
    async () => {
      const match = {
        startDate: {
          $gte: new Date(y, 0, 1, 0, 0, 0, 0),
          $lte: new Date(y, 11, 31, 23, 59, 59, 999)
        }
      };
      if (staffTrim) {
        match.staffId = await resolveMongoAdminStaffId(staffTrim);
      }

      const rows = await Leave.aggregate([
        { $match: match },
        {
          $group: {
            _id: { staffId: '$staffId', staffUsername: '$staffUsername', leaveType: '$leaveType' },
            approvedDays: {
              $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$totalDays', 0] }
            },
            pendingDays: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$totalDays', 0] }
            }
          }
        }
      ]);

      const byStaff = new Map();
      rows.forEach((row) => {
        const key = row._id.staffId;
        if (!byStaff.has(key)) {
          byStaff.set(key, {
            staffId: key,
            staffUsername: row._id.staffUsername,
            balances: LEAVE_TYPES.map((type) => ({
              leaveType: type,
              allowed: LEAVE_ALLOWANCES[type] || 0,
              used: 0,
              pending: 0,
              remaining: LEAVE_ALLOWANCES[type] || 0
            }))
          });
        }
        const entry = byStaff.get(key).balances.find((b) => b.leaveType === row._id.leaveType);
        if (entry) {
          entry.used = row.approvedDays || 0;
          entry.pending = row.pendingDays || 0;
          entry.remaining = Math.max(0, entry.allowed - entry.used);
        }
      });

      return [...byStaff.values()].sort((a, b) => a.staffUsername.localeCompare(b.staffUsername));
    },
    async () => {
      let groups = await getLeaveRepository().aggregateBalanceByStaff(y);
      if (staffTrim) {
        const account = await getPgStaffResolver().findAdminRecord(staffTrim);
        const staffOr = account
          ? await buildPolymorphicStaffOr(account.legacyId || account.id, 'admin')
          : [{ staffId: '__no_match__' }];
        groups = groups.filter((g) => staffOr.some((clause) => (
          (clause.staffId && g.staffId === clause.staffId)
          || (clause.adminId && g.adminId === clause.adminId)
          || (clause.employeeId && g.employeeId === clause.employeeId)
        )));
      }

      const maps = await loadStaffLegacyMaps(groups.flatMap((g) => g.rows));
      return groups.map((group) => {
        const balances = LEAVE_TYPES.map((type) => ({
          leaveType: type,
          allowed: LEAVE_ALLOWANCES[type] || 0,
          used: 0,
          pending: 0,
          remaining: LEAVE_ALLOWANCES[type] || 0
        }));

        group.rows.forEach((leave) => {
          const type = String(leave.leaveType || '').toLowerCase();
          const entry = balances.find((b) => b.leaveType === type);
          if (!entry) return;
          if (leave.status === 'APPROVED') entry.used += leave.totalDays;
          else if (leave.status === 'PENDING') entry.pending += leave.totalDays;
          entry.remaining = Math.max(0, entry.allowed - entry.used);
        });

        return {
          staffId: legacyStaffIdFromRow(group, maps),
          staffUsername: group.staffUsername,
          balances
        };
      }).sort((a, b) => a.staffUsername.localeCompare(b.staffUsername));
    }
  );
}

async function fetchLeaveCalendar({ month, year, statusQuery }) {
  const now = new Date();
  const m = Math.min(Math.max(parseInt(month, 10) || now.getMonth() + 1, 1), 12);
  const y = parseInt(year, 10) || now.getFullYear();
  const monthStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);

  const statuses = String(statusQuery || '').trim().toLowerCase() === 'approved'
    ? ['approved']
    : ['approved', 'pending'];

  return routedRead(
    'leave',
    async () => {
      const leaves = await Leave.find({
        status: { $in: statuses },
        startDate: { $lte: monthEnd },
        endDate: { $gte: monthStart }
      }).lean();

      const monthStartKey = `${y}-${String(m).padStart(2, '0')}-01`;
      const monthEndKey = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
      const days = {};
      leaves.forEach((leave) => {
        iteratePlatformDateKeys(leave.startDate, leave.endDate).forEach((key) => {
          if (key < monthStartKey || key > monthEndKey) return;
          if (!days[key]) days[key] = [];
          days[key].push({
            leaveId: String(leave._id),
            staffUsername: leave.staffUsername,
            staffName: leave.staffName || leave.staffUsername,
            leaveType: leave.leaveType,
            status: leave.status
          });
        });
      });
      return days;
    },
    async () => {
      const upperStatuses = statuses.map((s) => s.toUpperCase());
      const leaves = await getLeaveRepository().findCalendarLeaves(m, y, upperStatuses);
      const maps = await loadStaffLegacyMaps(leaves);
      const shaped = mapLeavesToMongo(leaves, maps);

      const monthStartKey = `${y}-${String(m).padStart(2, '0')}-01`;
      const monthEndKey = `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
      const days = {};
      shaped.forEach((leave) => {
        iteratePlatformDateKeys(leave.startDate, leave.endDate).forEach((key) => {
          if (key < monthStartKey || key > monthEndKey) return;
          if (!days[key]) days[key] = [];
          days[key].push({
            leaveId: String(leave._id),
            staffUsername: leave.staffUsername,
            staffName: leave.staffName || leave.staffUsername,
            leaveType: leave.leaveType,
            status: leave.status
          });
        });
      });
      return days;
    }
  );
}

module.exports = {
  fetchEmployeesPage,
  fetchEmployeesForExport,
  fetchAllActiveEmployees,
  fetchEmployeeStats,
  fetchEmployeeByIdentifier,
  fetchEmployeeProfileBundle,
  fetchAttendancePage,
  fetchTodayAttendanceStats,
  fetchAttendanceSummary,
  fetchPayrollsPage,
  fetchPayrollsForExport,
  decoratePayrollDesignations,
  fetchLeavesPage,
  fetchLeaveBalance,
  fetchLeaveCalendar,
  loadStaffLegacyMaps,
  legacyStaffIdFromRow
};
