/********************************************************************
 * Project: EonlineBazar
 * File: orderMongoLookup.js
 * Description: Safe Mongo order lookups for PG read cutover fallbacks.
 *   Avoids CastError when the route id is a business orderId (e.g. __test_ord_*)
 *   or a Postgres UUID rather than a 24-char Mongo ObjectId.
 ********************************************************************/

'use strict';

const mongoose = require('mongoose');

function isStrictMongoObjectId(value) {
    const str = String(value ?? '').trim();
    if (!str || str.length !== 24 || !mongoose.Types.ObjectId.isValid(str)) {
        return false;
    }
    return new mongoose.Types.ObjectId(str).toString() === str;
}

/**
 * Find an order by Mongo _id or business orderId without throwing CastError.
 * @param {string} ref - Route param, legacyId, or orderId string
 * @param {{ lean?: boolean, select?: string|null }} options
 */
async function findOrderByRef(ref, options = {}) {
    const Order = require('../models/order');
    const value = String(ref ?? '').trim();
    if (!value) return null;

    let query = isStrictMongoObjectId(value)
        ? Order.findById(value)
        : Order.findOne({ orderId: value });

    if (options.select) query = query.select(options.select);
    if (options.lean) query = query.lean();

    return query;
}

module.exports = {
    isStrictMongoObjectId,
    findOrderByRef
};
