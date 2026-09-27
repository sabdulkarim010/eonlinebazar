/********************************************************************
 * Project: EonlineBazar — User identity
 * File: userRecordResolver.js
 * Description: Resolve customer refs (Mongo ObjectId or Postgres UUID)
 *   without CastError on User.findById.
 ********************************************************************/

'use strict';

const mongoose = require('mongoose');
const User = require('../models/user');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getUserRepository() {
    return require('../repositories/userRepository');
}

function isMongoObjectIdString(value) {
    const raw = String(value || '').trim();
    if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return false;
    return String(new mongoose.Types.ObjectId(raw)) === raw;
}

/**
 * @param {string} ref — route param, JWT id, or legacy Mongo _id
 * @returns {Promise<{ mongoId: string|null, pgUserId: string|null }>}
 */
async function resolveUserLookupIds(ref) {
    const raw = String(ref || '').trim();
    if (!raw) return { mongoId: null, pgUserId: null };

    if (isMongoObjectIdString(raw)) {
        let pgUserId = null;
        try {
            pgUserId = await getUserRepository().resolvePostgresUserId(raw);
        } catch (err) {
            console.warn('[resolveUserLookupIds] PG resolve failed:', raw, err.message);
        }
        return { mongoId: raw, pgUserId };
    }

    if (UUID_PATTERN.test(raw)) {
        try {
            const pg = await getUserRepository().findById(raw);
            const legacy = pg?.legacyId ? String(pg.legacyId) : null;
            const mongoId = legacy && isMongoObjectIdString(legacy) ? legacy : null;
            return { mongoId, pgUserId: raw };
        } catch (err) {
            console.warn('[resolveUserLookupIds] PG findById failed:', raw, err.message);
            return { mongoId: null, pgUserId: raw };
        }
    }

    return { mongoId: null, pgUserId: null };
}

/**
 * Auth gate fields — works for Mongo _id or PG UUID tokens.
 */
async function fetchUserAuthSnapshot(userRef) {
    const { mongoId, pgUserId } = await resolveUserLookupIds(userRef);

    if (mongoId) {
        const doc = await User.findById(mongoId).select('isDeleted accountStatus').lean();
        if (doc) return doc;
    }

    if (pgUserId) {
        const pg = await getUserRepository().findById(pgUserId);
        if (pg) {
            return {
                isDeleted: Boolean(pg.isDeleted),
                accountStatus: pg.accountStatus || 'active'
            };
        }
    }

    return null;
}

/**
 * Safe Mongo user load by ObjectId or PG UUID (via legacyId).
 * @param {string} ref
 * @param {string} [select]
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function findMongoUserByRef(ref, select) {
    const { mongoId } = await resolveUserLookupIds(ref);
    if (!mongoId) return null;
    let query = User.findById(mongoId);
    if (select) query = query.select(select);
    return query;
}

function pickMongoUserIdFromRequest(req) {
    const user = req?.user;
    if (!user) return null;
    const explicit = user.mongoId != null ? String(user.mongoId).trim() : '';
    if (explicit && isMongoObjectIdString(explicit)) return explicit;
    const id = String(user.id || user._id || user.userId || '').trim();
    if (isMongoObjectIdString(id)) return id;
    return null;
}

module.exports = {
    UUID_PATTERN,
    isMongoObjectIdString,
    resolveUserLookupIds,
    fetchUserAuthSnapshot,
    findMongoUserByRef,
    pickMongoUserIdFromRequest
};
