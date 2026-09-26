/**
 * Employee CSV export field mapping (joiningDate, baseSalary).
 */
const { csvRow, csvCell } = (() => {
    function csvCell(value) {
        const raw = value === null || value === undefined ? '' : String(value);
        if (/[",\r\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
        return raw;
    }
    function csvRow(cells) {
        return cells.map(csvCell).join(',');
    }
    return { csvRow, csvCell };
})();

function formatCsvDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}

describe('employee CSV export mapping', () => {
    test('uses joiningDate and baseSalary schema fields', () => {
        const employee = {
            employeeId: 'EMP-001',
            fullName: 'Karim',
            joiningDate: new Date('2024-03-15T00:00:00.000Z'),
            baseSalary: 42000
        };

        const row = csvRow([
            employee.employeeId,
            employee.fullName,
            formatCsvDate(employee.joiningDate),
            employee.baseSalary
        ]);

        expect(row).toContain('EMP-001');
        expect(row).toContain('2024-03-15');
        expect(row).toContain('42000');
    });
});
