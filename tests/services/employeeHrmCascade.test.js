const Attendance = require('../../backend/src/models/attendance');
const Payroll = require('../../backend/src/models/payroll');
const Employee = require('../../backend/src/models/employee');
const { cascadeMongoEmployeeHrm } = require('../../backend/src/services/employeeHrmCascadeService');

describe('employee HRM cascade cleanup', () => {
    test('cascadeMongoEmployeeHrm removes attendance and draft payroll only', async () => {
        const employee = await Employee.create({
            fullName: 'Cascade Test',
            phone: `017${Date.now().toString().slice(-8)}`,
            role: 'Labour'
        });
        const staffId = String(employee._id);
        const date = Attendance.normalizeDate(new Date());

        await Attendance.create({
            staffId,
            staffType: 'employee',
            date,
            status: 'present'
        });
        const year = date.getFullYear();
        await Payroll.create({
            staffId,
            staffType: 'employee',
            month: 3,
            year,
            status: 'draft',
            baseSalary: 1000
        });
        await Payroll.create({
            staffId,
            staffType: 'employee',
            month: 4,
            year,
            status: 'approved',
            baseSalary: 2000
        });

        const result = await cascadeMongoEmployeeHrm(staffId, { draftsOnlyPayroll: true });

        expect(result.attendanceDeleted).toBe(1);
        expect(result.payrollDeleted).toBe(1);
        expect(await Attendance.countDocuments({ staffId })).toBe(0);
        expect(await Payroll.countDocuments({ staffId, status: 'draft' })).toBe(0);
        expect(await Payroll.countDocuments({ staffId, status: 'approved' })).toBe(1);

        await Payroll.deleteMany({ staffId });
        await Employee.findByIdAndDelete(employee._id);
    });
});
