const Employee = require('../../backend/src/models/employee');
const Attendance = require('../../backend/src/models/attendance');
const {
    processBulkAttendanceImport,
    processSingleImportRow
} = require('../../backend/src/services/bulkAttendanceService');

describe('bulkAttendanceService', () => {
    test('rejects row with invalid date', async () => {
        const employee = await Employee.create({
            fullName: 'Import Row Test',
            phone: `017${Date.now().toString().slice(-8)}`,
            role: 'Labour',
            employeeId: `EMP-T${Date.now().toString().slice(-4)}`
        });

        const result = await processSingleImportRow({
            staffId: String(employee._id),
            date: 'not-a-date',
            status: 'present'
        }, 2);

        expect(result.ok).toBe(false);
        expect(result.error.message).toMatch(/date/i);

        await Employee.findByIdAndDelete(employee._id);
    });

    test('upserts valid row for employee', async () => {
        const employee = await Employee.create({
            fullName: 'Import Upsert',
            phone: `017${(Date.now() + 1).toString().slice(-8)}`,
            role: 'Labour',
            employeeId: `EMP-U${Date.now().toString().slice(-4)}`
        });

        const dateKey = '2026-06-10';
        const summary = await processBulkAttendanceImport([
            {
                staffId: String(employee._id),
                date: dateKey,
                status: 'present',
                clockIn: '09:00',
                clockOut: '18:00'
            }
        ], { markedBy: 'test-import' });

        expect(summary.totalProcessed).toBe(1);
        expect(summary.successCount).toBe(1);
        expect(summary.errorCount).toBe(0);

        const stored = await Attendance.findOne({
            staffId: String(employee._id),
            date: Attendance.normalizeDate(dateKey)
        });
        expect(stored).toBeTruthy();
        expect(stored.status).toBe('present');

        await Attendance.deleteMany({ staffId: String(employee._id) });
        await Employee.findByIdAndDelete(employee._id);
    });
});
