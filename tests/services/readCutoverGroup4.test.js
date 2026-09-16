/********************************************************************
 * Stage 4 Step 4 — HRM read parity (mocked Postgres repositories)
 ********************************************************************/

jest.mock('../../backend/src/repositories/employeeRepository', () => ({
  findAll: jest.fn(),
  count: jest.fn(),
  aggregateStats: jest.fn(),
  findDetailed: jest.fn()
}));

jest.mock('../../backend/src/repositories/attendanceRepository', () => ({
  findAll: jest.fn(),
  count: jest.fn(),
  countTodayStats: jest.fn(),
  aggregateMonthlySummary: jest.fn()
}));

jest.mock('../../backend/src/repositories/payrollRepository', () => ({
  findAll: jest.fn(),
  count: jest.fn(),
  aggregateRollup: jest.fn()
}));

jest.mock('../../backend/src/repositories/leaveRepository', () => ({
  findAll: jest.fn(),
  count: jest.fn(),
  countPending: jest.fn(),
  aggregateBalanceByStaff: jest.fn(),
  findCalendarLeaves: jest.fn(),
  LEAVE_ALLOWANCES: { casual: 12, sick: 12, annual: 20, unpaid: 0 },
  LEAVE_TYPES: ['casual', 'sick', 'annual', 'unpaid']
}));

jest.mock('../../backend/src/config/prismaClient', () => ({
  admin: { findMany: jest.fn().mockResolvedValue([]) },
  employee: { findMany: jest.fn().mockResolvedValue([]) }
}));

const employeeRepo = require('../../backend/src/repositories/employeeRepository');
const attendanceRepo = require('../../backend/src/repositories/attendanceRepository');
const payrollRepo = require('../../backend/src/repositories/payrollRepository');
const leaveRepo = require('../../backend/src/repositories/leaveRepository');
const {
  employeeToMongoShape,
  attendanceToMongoShape,
  payrollToMongoShape,
  leaveToMongoShape,
  buildHrmStaffLegacyMaps,
  legacyStaffIdFromRow
} = require('../../backend/src/services/readShapeHelpers');
const { fetchEmployeeByIdentifier, fetchAttendanceSummary } = require('../../backend/src/services/hrmReadService');

const LEGACY = '507f1f77bcf86cd799439011';
const ADMIN_LEGACY = '507f1f77bcf86cd799439012';
const EMPLOYEE_LEGACY = '507f1f77bcf86cd799439013';

describe('read cutover group 4 — HRM shape parity (mocked)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  test('employeeToMongoShape resolves linkedAdminId to Mongo legacy id', () => {
    const shape = employeeToMongoShape({
      id: 'pg-emp',
      legacyId: LEGACY,
      employeeId: 'EMP-001',
      fullName: 'Karim',
      phone: '01700000000',
      department: 'Operations',
      designation: 'Driver',
      role: 'Driver',
      employeeType: 'PERMANENT',
      baseSalary: 15000,
      salaryType: 'MONTHLY',
      status: 'ACTIVE',
      linkedAdmin: { id: 'pg-admin', legacyId: ADMIN_LEGACY },
      documents: [{
        id: 'pg-doc',
        legacyId: '507f1f77bcf86cd799439099',
        title: 'NID',
        fileUrl: 'https://example.com/nid.pdf',
        fileType: 'pdf',
        publicId: 'nid',
        uploadedAt: new Date('2024-01-01')
      }],
      references: [{ name: 'Ref', phone: '01', relation: 'Friend', address: '' }],
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02')
    });

    expect(shape._id).toBe(LEGACY);
    expect(shape.linkedAdminId).toBe(ADMIN_LEGACY);
    expect(shape.documents[0]._id).toBe('507f1f77bcf86cd799439099');
    expect(shape.references[0].name).toBe('Ref');
    expect(shape.__v).toBe(0);
  });

  test('polymorphic attendance resolves employee staffId via legacy map', () => {
    const maps = buildHrmStaffLegacyMaps([], [{ id: 'pg-employee', legacyId: EMPLOYEE_LEGACY }]);
    const shape = attendanceToMongoShape({
      id: 'pg-att',
      legacyId: LEGACY,
      staffId: 'pg-employee',
      staffType: 'EMPLOYEE',
      employeeId: 'pg-employee',
      staffUsername: 'EMP-001',
      date: new Date('2024-06-01'),
      status: 'PRESENT',
      shift: 'MORNING',
      hoursWorked: 8,
      isLate: false,
      lateMinutes: 0,
      createdAt: new Date('2024-06-01'),
      updatedAt: new Date('2024-06-01')
    }, maps);

    expect(shape.staffId).toBe(EMPLOYEE_LEGACY);
    expect(shape.staffType).toBe('employee');
  });

  test('polymorphic payroll resolves admin staffId via legacy map', () => {
    const maps = buildHrmStaffLegacyMaps([{ id: 'pg-admin', legacyId: ADMIN_LEGACY }], []);
    const shape = payrollToMongoShape({
      id: 'pg-pay',
      legacyId: LEGACY,
      staffId: 'pg-admin',
      staffType: 'ADMIN',
      adminId: 'pg-admin',
      staffUsername: 'jdoe',
      staffName: 'John',
      month: 6,
      year: 2024,
      baseSalary: 20000,
      bonus: 0,
      overtime: 0,
      overtimeRate: 0,
      overtimeAmount: 0,
      deductions: 0,
      totalSalary: 20000,
      workingDays: 22,
      presentDays: 22,
      absentDays: 0,
      lateDays: 0,
      status: 'DRAFT',
      paySlipGenerated: false,
      createdAt: new Date('2024-06-01'),
      updatedAt: new Date('2024-06-01')
    }, maps);

    expect(shape.staffId).toBe(ADMIN_LEGACY);
    expect(shape.staffType).toBe('admin');
  });

  test('leaveToMongoShape preserves pending status and totalDays', () => {
    const shape = leaveToMongoShape({
      id: 'pg-leave',
      legacyId: LEGACY,
      staffId: ADMIN_LEGACY,
      staffType: 'ADMIN',
      adminId: 'pg-admin',
      staffUsername: 'jdoe',
      staffName: 'John',
      leaveType: 'CASUAL',
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-03'),
      totalDays: 3,
      reason: 'Family',
      status: 'PENDING',
      createdAt: new Date('2024-05-20'),
      updatedAt: new Date('2024-05-20')
    });

    expect(shape.status).toBe('pending');
    expect(shape.totalDays).toBe(3);
    expect(shape.leaveType).toBe('casual');
  });

  test('fetchEmployeeByIdentifier uses Postgres path when READ_PG_EMPLOYEE=true', async () => {
    process.env.READ_PG_EMPLOYEE = 'true';
    employeeRepo.findDetailed.mockResolvedValue({
      id: 'pg-emp',
      legacyId: LEGACY,
      employeeId: 'EMP-001',
      fullName: 'Karim',
      phone: '01700000000',
      department: 'Operations',
      designation: 'Driver',
      role: 'Driver',
      employeeType: 'PERMANENT',
      baseSalary: 15000,
      salaryType: 'MONTHLY',
      status: 'ACTIVE',
      documents: [],
      references: [],
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02')
    });

    const row = await fetchEmployeeByIdentifier(LEGACY);
    expect(row._id).toBe(LEGACY);
    expect(employeeRepo.findDetailed).toHaveBeenCalledWith(LEGACY);
  });

  test('fetchAttendanceSummary maps grouped Postgres rows with legacy staff ids', async () => {
    process.env.READ_PG_ATTENDANCE = 'true';
    attendanceRepo.aggregateMonthlySummary.mockResolvedValue([
      {
        staffId: 'pg-admin',
        staffUsername: 'jdoe',
        staffType: 'ADMIN',
        adminId: 'pg-admin',
        present: 20,
        absent: 1,
        late: 2,
        halfDay: 0,
        holiday: 1,
        totalHours: 160,
        recorded: 22
      },
      {
        staffId: 'pg-employee',
        staffUsername: 'EMP-001',
        staffType: 'EMPLOYEE',
        employeeId: 'pg-employee',
        present: 18,
        absent: 2,
        late: 0,
        halfDay: 1,
        holiday: 0,
        totalHours: 144,
        recorded: 21
      }
    ]);

    const prisma = require('../../backend/src/config/prismaClient');
    prisma.admin.findMany.mockResolvedValue([{ id: 'pg-admin', legacyId: ADMIN_LEGACY }]);
    prisma.employee.findMany.mockResolvedValue([{ id: 'pg-employee', legacyId: EMPLOYEE_LEGACY }]);

    const data = await fetchAttendanceSummary({ month: 6, year: 2024 });
    expect(data).toHaveLength(2);
    expect(data.find((r) => r.staffUsername === 'jdoe').staffId).toBe(ADMIN_LEGACY);
    expect(data.find((r) => r.staffUsername === 'EMP-001').staffId).toBe(EMPLOYEE_LEGACY);
  });

  test('legacyStaffIdFromRow falls back to stored ObjectId staffId', () => {
    expect(legacyStaffIdFromRow({
      staffType: 'admin',
      staffId: ADMIN_LEGACY
    })).toBe(ADMIN_LEGACY);
  });
});
