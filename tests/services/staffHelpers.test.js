/********************************************************************
 * staffHelpers — no circular dependency with hrmStaffResolver
 ********************************************************************/

const staffHelpers = require('../../backend/src/utils/staffHelpers');
const hrmStaffResolver = require('../../backend/src/utils/hrmStaffResolver');

describe('staffHelpers module boundary', () => {
  test('parseStaffSelector is exported from staffHelpers and hrmStaffResolver', () => {
    expect(typeof staffHelpers.parseStaffSelector).toBe('function');
    expect(typeof hrmStaffResolver.parseStaffSelector).toBe('function');
    expect(hrmStaffResolver.parseStaffSelector('employee:EMP 002')).toEqual({
      staffType: 'employee',
      staffId: 'EMP 002',
      employeeId: 'EMP 002'
    });
  });
});
