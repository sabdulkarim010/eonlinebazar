/********************************************************************
 * HRM staff payload sanitization
 ********************************************************************/

const {
  sanitizeStaffPayload,
  stripStaffTypePrefix,
  parseStaffSelector
} = require('../../backend/src/utils/staffHelpers');

describe('hrmPayloadSanitizer', () => {
    test('stripStaffTypePrefix removes employee prefix', () => {
        expect(stripStaffTypePrefix('employee:EMP 002')).toBe('EMP 002');
        expect(stripStaffTypePrefix('admin:jdoe')).toBe('jdoe');
    });

    test('sanitizeStaffPayload parses combined selector in staffUsername', () => {
        const out = sanitizeStaffPayload({ staffUsername: 'employee:EMP 002' });
        expect(out.staffType).toBe('employee');
        expect(out.employeeId).toBe('EMP 002');
        expect(out.staffId).toBe('EMP 002');
    });

    test('parseStaffSelector keeps spaces in employee codes', () => {
        const parsed = parseStaffSelector('employee:EMP 002');
        expect(parsed.staffType).toBe('employee');
        expect(parsed.employeeId).toBe('EMP 002');
    });
});
