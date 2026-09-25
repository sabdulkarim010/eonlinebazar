/********************************************************************
 * Project: EonlineBazar
 * File: newsletterSubscriberHelpers.js
 * Description: Double opt-in eligibility helpers for newsletter subscribers.
 ********************************************************************/

'use strict';

/**
 * Legacy subscribers (no isConfirmed field) are treated as confirmed when active.
 */
function isSubscriberConfirmed(subscriber) {
    if (!subscriber || subscriber.isActive === false) return false;
    if (subscriber.isConfirmed === false) return false;
    return true;
}

/** Mongo query for campaign-eligible newsletter subscribers. */
function buildConfirmedSubscriberQuery(extra = {}) {
    return {
        ...extra,
        isActive: true,
        $or: [
            { isConfirmed: true },
            { isConfirmed: { $exists: false } }
        ]
    };
}

module.exports = {
    isSubscriberConfirmed,
    buildConfirmedSubscriberQuery
};
