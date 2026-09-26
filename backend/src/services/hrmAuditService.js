/********************************************************************
 * Project: EonlineBazar — HRM granular audit
 * File: hrmAuditService.js
 * Description: Structured SecurityLog events for salary, status,
 * payroll release, and leave transitions.
 ********************************************************************/

'use strict';

const { logSecurityEvent, getClientIp } = require('../utils/securityLogger');

const HRM_ACTION_TYPES = Object.freeze({
    SALARY_MODIFIED: 'salary_modified',
    EMPLOYEE_STATUS: 'employee_status',
    PAYROLL_RELEASE: 'payroll_release',
    PAYROLL_BATCH: 'payroll_batch',
    LEAVE_STATUS: 'leave_status'
});

function serializeAuditValue(value) {
    if (value === undefined) return null;
    if (value === null) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            return String(value);
        }
    }
    return value;
}

function buildHrmDetailsPayload({
    summary,
    actorId,
    actorName,
    targetStaffId,
    hrmActionType,
    previousValue,
    newValue
}) {
    return JSON.stringify({
        summary: summary || '',
        actorId: actorId || null,
        actorName: actorName || null,
        targetStaffId: targetStaffId || null,
        hrmActionType: hrmActionType || null,
        previousValue: serializeAuditValue(previousValue),
        newValue: serializeAuditValue(newValue)
    });
}

function parseHrmDetails(details) {
    if (!details || typeof details !== 'string') return null;
    const trimmed = details.trim();
    if (!trimmed.startsWith('{')) return null;
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && ('hrmActionType' in parsed || 'targetStaffId' in parsed)) {
            return parsed;
        }
    } catch {
        return null;
    }
    return null;
}

function resolveActorContext(req) {
    const account = req?.adminAccount || req?.admin;
    const actorName = account?.username || account?.name || 'admin';
    const actorId = account?._id ? String(account._id) : account?.id ? String(account.id) : null;
    return { actorName, actorId, ipAddress: getClientIp(req) };
}

/**
 * @param {object} opts
 * @param {import('express').Request} [opts.req]
 * @param {string} opts.action — human-readable label stored in SecurityLog.action
 * @param {string} opts.actionType — HRM_ACTION_TYPES value for filtering
 * @param {string} [opts.targetStaffId]
 * @param {string} opts.resourceType — employee | payroll | leave
 * @param {string} [opts.resourceId]
 * @param {*} [opts.previousValue]
 * @param {*} [opts.newValue]
 * @param {string} [opts.summary] — short plain-text summary for legacy UIs
 */
async function logHrmAuditEvent({
    req,
    action,
    actionType,
    targetStaffId,
    resourceType,
    resourceId,
    previousValue,
    newValue,
    summary
}) {
    const { actorName, actorId, ipAddress } = resolveActorContext(req);
    const details = buildHrmDetailsPayload({
        summary: summary || action,
        actorId,
        actorName,
        targetStaffId: targetStaffId != null ? String(targetStaffId) : null,
        hrmActionType: actionType,
        previousValue,
        newValue
    });

    await logSecurityEvent({
        action,
        actor: actorName,
        actorType: 'admin',
        ipAddress,
        details,
        resourceType,
        resourceId: resourceId != null ? String(resourceId) : null,
        actorId,
        targetStaffId: targetStaffId != null ? String(targetStaffId) : null,
        hrmActionType: actionType,
        previousValue: serializeAuditValue(previousValue),
        newValue: serializeAuditValue(newValue)
    });
}

function shapeHrmAuditLogRow(log) {
    const parsed = parseHrmDetails(log.details);
    const actorId = log.actorId || parsed?.actorId || null;
    const actorName = parsed?.actorName || log.actor || null;
    const targetStaffId = log.targetStaffId || parsed?.targetStaffId || null;
    const actionType = log.hrmActionType || parsed?.hrmActionType || null;
    const previousValue = log.previousValue !== undefined ? log.previousValue : parsed?.previousValue ?? null;
    const newValue = log.newValue !== undefined ? log.newValue : parsed?.newValue ?? null;
    const summary = parsed?.summary || (parsed ? '' : log.details);

    return {
        _id: log._id,
        action: log.action,
        actionType,
        actorId,
        actorName,
        targetStaffId,
        previousValue,
        newValue,
        ipAddress: log.ipAddress,
        resourceType: log.resourceType || null,
        resourceId: log.resourceId || null,
        summary,
        timestamp: log.createdAt
    };
}

module.exports = {
    HRM_ACTION_TYPES,
    logHrmAuditEvent,
    parseHrmDetails,
    shapeHrmAuditLogRow,
    buildHrmDetailsPayload
};
