/********************************************************************
 * Project: EonlineBazar — HRM Leave
 * File: leaveRecordResolver.js
 * Description: Resolve route :id to a Mongo Leave document (ObjectId,
 * legacyId, or Postgres UUID → legacyId).
 ********************************************************************/

'use strict';

const mongoose = require('mongoose');
const Leave = require('../models/leave');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getLeaveRepository() {
    return require('../repositories/leaveRepository');
}

function isMongoObjectIdString(value) {
    const raw = String(value || '').trim();
    if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return false;
    return String(new mongoose.Types.ObjectId(raw)) === raw;
}

/**
 * @param {string} routeId — value from PATCH /hrm/leaves/:id/*
 * @returns {Promise<{ leave: import('mongoose').Document, mongoId: string, routeId: string } | { error: { status: number, message: string, code?: string } }>}
 */
async function resolveLeaveRouteTarget(routeId) {
    const raw = String(routeId || '').trim();
    if (!raw) {
        return { error: { status: 400, message: 'Leave id is required.', code: 'MISSING_ID' } };
    }

    if (isMongoObjectIdString(raw)) {
        const leave = await Leave.findById(raw);
        if (leave) {
            return { leave, mongoId: String(leave._id), routeId: raw };
        }
    }

    try {
        const repo = getLeaveRepository();
        let pgRow = null;
        if (UUID_PATTERN.test(raw)) {
            pgRow = await repo.findById(raw);
        }
        if (!pgRow) {
            pgRow = await repo.findByLegacyId(raw);
        }
        if (pgRow?.legacyId && isMongoObjectIdString(pgRow.legacyId)) {
            const leave = await Leave.findById(pgRow.legacyId);
            if (leave) {
                return {
                    leave,
                    mongoId: String(leave._id),
                    routeId: raw,
                    pgId: pgRow.id || pgRow._id
                };
            }
        }
    } catch (err) {
        console.warn('[resolveLeaveRouteTarget] Postgres lookup failed:', raw, err.message);
    }

    return {
        error: {
            status: 404,
            message: 'Leave application not found.',
            code: 'NOT_FOUND'
        }
    };
}

module.exports = {
    UUID_PATTERN,
    isMongoObjectIdString,
    resolveLeaveRouteTarget
};
