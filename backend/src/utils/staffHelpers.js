/********************************************************************
 * Project: EonlineBazar — HRM / staff utilities (no DB imports)
 * File: staffHelpers.js
 * Description: Pure helpers for staff selector parsing and payload
 * sanitization. Shared by hrmStaffResolver, hrmPayloadSanitizer, and
 * Prisma repository staff resolution — avoids circular requires.
 ********************************************************************/

'use strict';

function stripStaffTypePrefix(value) {
    const s = String(value ?? '').trim();
    if (!s) return s;
    const lower = s.toLowerCase();
    if (lower.startsWith('employee:')) {
        return s.slice('employee:'.length).trim();
    }
    if (lower.startsWith('admin:')) {
        return s.slice('admin:'.length).trim();
    }
    return s;
}

/**
 * Parse a combined staff selector value such as "admin:jdoe" or
 * "employee:EMP 002", or a legacy plain admin username.
 */
function parseStaffSelector(raw) {
    const value = String(raw || '').trim();
    if (!value) return { staffType: 'admin' };

    if (value.includes(':')) {
        const idx = value.indexOf(':');
        const staffTypeRaw = value.slice(0, idx).trim().toLowerCase();
        const id = value.slice(idx + 1).trim();
        const staffType = staffTypeRaw === 'employee' ? 'employee' : 'admin';
        return {
            staffType,
            staffId: id,
            staffUsername: staffType === 'admin' ? id : undefined,
            employeeId: staffType === 'employee' ? id : undefined
        };
    }

    return { staffType: 'admin', staffUsername: value };
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown>}
 */
function sanitizeStaffPayload(payload = {}) {
    const out = { ...(payload || {}) };

    ['staffUsername', 'staffId', 'employeeId'].forEach((key) => {
        if (out[key] != null && out[key] !== '') {
            out[key] = stripStaffTypePrefix(out[key]);
        }
    });

    const selectorRaw = payload.staff
        || payload.staffUsername
        || payload.staffId
        || payload.employeeId;

    if (selectorRaw && String(selectorRaw).includes(':')) {
        const parsed = parseStaffSelector(String(selectorRaw).trim());
        if (parsed.staffType) out.staffType = parsed.staffType;
        if (parsed.staffId) out.staffId = parsed.staffId;
        if (parsed.staffUsername) out.staffUsername = parsed.staffUsername;
        if (parsed.employeeId) out.employeeId = parsed.employeeId;
    }

    if (out.staff) {
        const parsed = parseStaffSelector(String(out.staff).trim());
        if (parsed.staffType) out.staffType = parsed.staffType;
        if (parsed.staffId) out.staffId = parsed.staffId;
        if (parsed.staffUsername) out.staffUsername = parsed.staffUsername;
        if (parsed.employeeId) out.employeeId = parsed.employeeId;
        delete out.staff;
    }

    return out;
}

function sanitizeHrmRequestBody(req) {
    if (!req || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return req?.body;
    }
    req.body = sanitizeStaffPayload(req.body);
    return req.body;
}

function staffSelectorFromParsedSubject(subject) {
    if (!subject) return '';
    if (subject.staffType === 'employee') {
        return `employee:${subject.staffId}`;
    }
    return subject.staffUsername || subject.staffId || '';
}

module.exports = {
    stripStaffTypePrefix,
    parseStaffSelector,
    sanitizeStaffPayload,
    sanitizeHrmRequestBody,
    staffSelectorFromParsedSubject
};
