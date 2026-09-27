/********************************************************************
 * Project: EonlineBazar — HRM Leave Workflow
 * File: leaveWorkflowService.js
 * Description: Fast HTTP paths for leave submit/approve/reject — critical
 *   writes in Mongo transactions; notifications, audit, and attendance
 *   stamping run asynchronously (sync in test for determinism).
 ********************************************************************/

'use strict';

const mongoose = require('mongoose');
const Leave = require('../models/leave');
const Attendance = require('../models/attendance');
const { iteratePlatformDateKeys, normalizeAttendanceDate } = require('../utils/attendanceDate');
const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');
const { logHrmAuditEvent, HRM_ACTION_TYPES } = require('./hrmAuditService');
const { dualWrite } = require('./dualWriteService');
const { notifyAdminsWithPermission } = require('./notificationService');

const {
    LEAVE_TYPES,
    LEAVE_ALLOWANCES,
    countLeaveDays
} = Leave;

function getLeaveRepository() {
    return require('../repositories/leaveRepository');
}

function mirrorAttendanceDoc(saved) {
    return require('../utils/hrmDualWriteHelpers').mirrorAttendanceDoc(saved);
}

function mirrorLeaveApply(saved) {
    return require('../utils/hrmDualWriteHelpers').mirrorLeaveApply(saved);
}

function shouldRunLeaveSideEffectsSync() {
    return process.env.LEAVE_WORKFLOW_SYNC === '1'
        || process.env.NODE_ENV === 'test';
}

function shouldFallbackFromTransaction(err) {
    const message = String(err?.message || err || '');
    return /transaction|replica set|retryable writes/i.test(message);
}

async function withLeaveTransaction(workFn) {
    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await workFn(session);
        });
        return result;
    } catch (err) {
        if (shouldFallbackFromTransaction(err)) {
            return workFn(null);
        }
        throw err;
    } finally {
        session.endSession();
    }
}

/**
 * @param {() => Promise<void>} fn
 * @returns {Promise<void>}
 */
async function scheduleLeaveSideEffect(fn) {
    if (shouldRunLeaveSideEffectsSync()) {
        await fn();
        return;
    }
    setImmediate(() => {
        fn().catch((err) => {
            console.warn('[LeaveWorkflow] Side effect failed:', err?.message || err);
        });
    });
}

async function assertLeaveApplicationAllowed({ staffId, leaveType, startDate, endDate }) {
    const overlap = await Leave.findOverlappingApplication(staffId, startDate, endDate);
    if (overlap) {
        return {
            status: 400,
            message: 'A leave application already exists within the selected date range'
        };
    }

    const allowed = LEAVE_ALLOWANCES[leaveType] || 0;
    if (leaveType === 'unpaid' || allowed <= 0) {
        return null;
    }

    const requestedDays = countLeaveDays(startDate, endDate);
    const year = startDate.getFullYear();
    const { approvedDays, pendingDays } = await Leave.getCommittedDaysForType(staffId, leaveType, year);

    if (approvedDays + pendingDays + requestedDays > allowed) {
        return {
            status: 400,
            message: 'Insufficient leave balance for the requested leave type'
        };
    }

    return null;
}

async function mirrorLeaveToPostgres(saved, { approve = false, reject = false } = {}) {
    const repo = getLeaveRepository();
    const pgRow = await repo.findByLegacyId(String(saved._id));
    if (!pgRow) return;
    if (approve) {
        await repo.approve(pgRow.id, saved.approvedBy);
        return;
    }
    if (reject) {
        await repo.reject(pgRow.id, saved.approvedBy, saved.rejectionReason);
    }
}

/**
 * Critical path: create pending leave (Mongo transaction + PG mirror).
 */
async function submitLeaveApplication(subject, fields) {
    const blocked = await assertLeaveApplicationAllowed({
        staffId: subject.staffId,
        leaveType: fields.leaveType,
        startDate: fields.startDate,
        endDate: fields.endDate
    });
    if (blocked) {
        const err = new Error(blocked.message);
        err.status = blocked.status;
        throw err;
    }

    const leave = await withLeaveTransaction(async (session) => {
        const payload = {
            staffId: subject.staffId,
            staffType: subject.staffType || 'admin',
            staffUsername: subject.staffUsername,
            staffName: subject.staffName || subject.staffUsername,
            leaveType: fields.leaveType,
            startDate: fields.startDate,
            endDate: fields.endDate,
            reason: fields.reason,
            attachmentUrl: fields.attachmentUrl
        };
        if (session) {
            const [created] = await Leave.create([payload], { session });
            return created;
        }
        return Leave.create(payload);
    });

    await dualWrite(
        async () => leave,
        async (saved) => { await mirrorLeaveApply(saved); },
        {
            model: 'Leave',
            operation: 'create',
            mongoId: (saved) => String(saved._id)
        }
    );

    return leave;
}

function attendanceDateKey(date) {
    return normalizeAttendanceDate(date).getTime();
}

async function stampLeaveOnAttendance(leave) {
    const dateKeys = iteratePlatformDateKeys(leave.startDate, leave.endDate);
    if (!dateKeys.length) return 0;

    const staffId = String(leave.staffId);
    const dates = dateKeys.map((dateKey) => normalizeAttendanceDate(dateKey));

    const existingRows = await Attendance.find({
        staffId,
        date: { $in: dates }
    });

    const byDateKey = new Map();
    existingRows.forEach((row) => {
        byDateKey.set(attendanceDateKey(row.date), row);
    });

    const applyHolidayFields = (record) => {
        record.staffUsername = leave.staffUsername;
        record.status = 'holiday';
        record.isLate = false;
        record.lateMinutes = 0;
        record.notes = `${leave.leaveType} leave`;
        record.markedBy = leave.approvedBy || 'system';
        return record;
    };

    await Promise.all(dates.map(async (date) => {
        const key = attendanceDateKey(date);
        let record = byDateKey.get(key);
        if (!record) {
            record = new Attendance({ staffId, date });
        }
        applyHolidayFields(record);

        await dualWrite(
            () => record.save(),
            async (saved) => { await mirrorAttendanceDoc(saved); },
            {
                model: 'Attendance',
                operation: 'create',
                mongoId: (saved) => String(saved._id)
            }
        );
    }));

    return dates.length;
}

async function runPostSubmitSideEffects({ leave, req, securityAction, subjectLabel }) {
    await scheduleLeaveSideEffect(async () => {
        await logSecurityEvent({
            action: securityAction,
            actor: req.adminAccount?.username || req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${subjectLabel} — ${leave.leaveType}, ${leave.totalDays} day(s)`,
            resourceType: 'leave',
            resourceId: String(leave._id)
        });

        await notifyAdminsWithPermission(
            'manage_staff',
            'leave',
            'Leave application submitted',
            `${subjectLabel} applied for ${leave.leaveType} leave (${leave.totalDays} day(s))`,
            'view-hrm-leaves'
        );
    });
}

/**
 * Critical path: pending → approved (transaction + PG mirror).
 */
async function approveLeaveApplication(mongoId, approvedBy, note) {
    let leave;
    try {
        leave = await withLeaveTransaction(async (session) => {
            const queryOpts = session ? { session, returnDocument: 'after', runValidators: true } : { returnDocument: 'after', runValidators: true };
            const updated = await Leave.findOneAndUpdate(
                { _id: mongoId, status: 'pending' },
                {
                    $set: {
                        status: 'approved',
                        approvedBy,
                        approvedAt: new Date(),
                        rejectionReason: ''
                    }
                },
                queryOpts
            );
            if (!updated) {
                const err = new Error('Leave request has already been processed');
                err.status = 400;
                err.code = 'ALREADY_PROCESSED';
                throw err;
            }
            if (note) {
                updated.reason = `${updated.reason} — ${note}`.trim();
                await updated.save(session ? { session } : undefined);
            }
            return updated;
        });

        await dualWrite(
            async () => leave,
            async (saved) => { await mirrorLeaveToPostgres(saved, { approve: true }); },
            {
                model: 'Leave',
                operation: 'update',
                mongoId: (saved) => String(saved._id)
            }
        );
    } catch (error) {
        if (error.status === 400 || error.code === 'ALREADY_PROCESSED') {
            throw error;
        }
        throw error;
    }

    return leave;
}

/**
 * @returns {Promise<{ attendanceDaysMarked: number, attendanceProcessing: boolean }>}
 */
async function runPostApproveSideEffects({ leave, req }) {
    const meta = { attendanceDaysMarked: 0, attendanceProcessing: !shouldRunLeaveSideEffectsSync() };

    const work = async () => {
        const stamped = await stampLeaveOnAttendance(leave);
        meta.attendanceDaysMarked = stamped;

        await logHrmAuditEvent({
            req,
            action: 'Leave Approved',
            actionType: HRM_ACTION_TYPES.LEAVE_STATUS,
            targetStaffId: leave.staffId,
            resourceType: 'leave',
            resourceId: String(leave._id),
            previousValue: { status: 'pending' },
            newValue: { status: 'approved', leaveType: leave.leaveType },
            summary: `${leave.staffUsername} — ${leave.leaveType}, ${leave.totalDays} day(s)`
        });

        await logSecurityEvent({
            action: 'Leave Approved',
            actor: req.adminAccount?.username || req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${leave.staffUsername} — ${leave.leaveType}, ${leave.totalDays} day(s)`,
            resourceType: 'leave',
            resourceId: String(leave._id)
        });
    };

    if (shouldRunLeaveSideEffectsSync()) {
        await work();
        meta.attendanceProcessing = false;
    } else {
        await scheduleLeaveSideEffect(work);
    }

    return meta;
}

async function rejectLeaveApplication(mongoId, approvedBy, reason) {
    const leave = await withLeaveTransaction(async (session) => {
        const queryOpts = session ? { session, returnDocument: 'after', runValidators: true } : { returnDocument: 'after', runValidators: true };
        const updated = await Leave.findOneAndUpdate(
            { _id: mongoId, status: 'pending' },
            {
                $set: {
                    status: 'rejected',
                    rejectionReason: reason,
                    approvedBy,
                    approvedAt: new Date()
                }
            },
            queryOpts
        );
        if (!updated) {
            const err = new Error('Leave request has already been processed');
            err.status = 400;
            err.code = 'ALREADY_PROCESSED';
            throw err;
        }
        return updated;
    });

    await dualWrite(
        async () => leave,
        async (saved) => { await mirrorLeaveToPostgres(saved, { reject: true }); },
        {
            model: 'Leave',
            operation: 'update',
            mongoId: (saved) => String(saved._id)
        }
    );

    return leave;
}

async function runPostRejectSideEffects({ leave, req, reason }) {
    await scheduleLeaveSideEffect(async () => {
        await logHrmAuditEvent({
            req,
            action: 'Leave Rejected',
            actionType: HRM_ACTION_TYPES.LEAVE_STATUS,
            targetStaffId: leave.staffId,
            resourceType: 'leave',
            resourceId: String(leave._id),
            previousValue: { status: 'pending' },
            newValue: { status: 'rejected', reason },
            summary: `${leave.staffUsername} — ${leave.leaveType}: ${reason}`
        });

        await logSecurityEvent({
            action: 'Leave Rejected',
            actor: req.adminAccount?.username || req.admin?.username || 'admin',
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `${leave.staffUsername} — ${leave.leaveType}: ${reason}`,
            resourceType: 'leave',
            resourceId: String(leave._id)
        });
    });
}

module.exports = {
    LEAVE_TYPES,
    assertLeaveApplicationAllowed,
    submitLeaveApplication,
    approveLeaveApplication,
    rejectLeaveApplication,
    runPostSubmitSideEffects,
    runPostApproveSideEffects,
    runPostRejectSideEffects,
    stampLeaveOnAttendance,
    shouldRunLeaveSideEffectsSync,
    scheduleLeaveSideEffect
};
