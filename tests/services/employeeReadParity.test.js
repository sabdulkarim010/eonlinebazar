/**
 * Employee operational visibility — Mongo/PG filter parity helpers.
 */
const employeeRepo = require('../../backend/src/repositories/employeeRepository');

describe('employeeRepository operational filters', () => {
    test('mergeOperationalEmployeeWhere excludes TERMINATED by default', () => {
        const where = employeeRepo.mergeOperationalEmployeeWhere(
            { department: 'Warehouse' },
            {}
        );
        expect(where.AND).toBeDefined();
        expect(where.AND[0]).toEqual({ department: 'Warehouse' });
        expect(where.AND[1]).toEqual({ status: { not: 'TERMINATED' } });
    });

    test('includeTerminated skips TERMINATED exclusion', () => {
        const where = employeeRepo.mergeOperationalEmployeeWhere(
            {},
            { includeTerminated: true }
        );
        expect(where).toEqual({});
    });

    test('status=terminated allows terminated rows only', () => {
        const where = employeeRepo.mergeOperationalEmployeeWhere(
            { status: 'TERMINATED' },
            { status: 'terminated' }
        );
        expect(where).toEqual({ status: 'TERMINATED' });
    });
});
