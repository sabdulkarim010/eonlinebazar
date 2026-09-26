'use strict';

function isMongoDuplicateKeyError(err) {
    return Boolean(err && (err.code === 11000 || err.code === 11001));
}

function isPrismaUniqueViolation(err) {
    return Boolean(err && err.code === 'P2002');
}

function isAttendanceDuplicateError(err) {
    return isMongoDuplicateKeyError(err) || isPrismaUniqueViolation(err);
}

function duplicateAttendanceError(message = 'Attendance already exists for this staff member on this date.') {
    const err = new Error(message);
    err.code = 'DUPLICATE_ATTENDANCE';
    err.httpStatus = 409;
    return err;
}

module.exports = {
    isMongoDuplicateKeyError,
    isPrismaUniqueViolation,
    isAttendanceDuplicateError,
    duplicateAttendanceError
};
