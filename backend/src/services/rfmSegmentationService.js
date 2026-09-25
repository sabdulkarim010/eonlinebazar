/********************************************************************
 * RFM customer segmentation — Recency, Frequency, Monetary scoring.
 ********************************************************************/

'use strict';

const mongoose = require('mongoose');
const Order = require('../models/order');
const User = require('../models/user');
const { roundMoney } = require('./deliveryChargeService');

const RFM_SEGMENTS = ['CHAMPION', 'LOYAL', 'AT_RISK', 'LOST', 'NEW', 'STANDARD'];
const COMPLETED_STATUSES = ['Delivered'];
const EXCLUDED_STATUSES = ['Cancelled', 'Canceled', 'Refunded'];

const DEFAULT_MONETARY_HIGH = Number(process.env.RFM_MONETARY_HIGH_THRESHOLD) || 10000;

function daysSince(date) {
    if (!date) return Number.POSITIVE_INFINITY;
    const ts = new Date(date).getTime();
    if (Number.isNaN(ts)) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)));
}

function resolveRfmSegment({ recencyDays, frequency, monetary }, monetaryHigh = DEFAULT_MONETARY_HIGH) {
    const recency = Number(recencyDays);
    const freq = Number(frequency) || 0;
    const spend = roundMoney(monetary);

    if (freq === 1 && recency <= 30) return 'NEW';
    if (recency <= 30 && freq >= 5 && spend >= monetaryHigh) return 'CHAMPION';
    if (recency <= 60 && freq >= 3) return 'LOYAL';
    if (recency > 60 && recency <= 120 && freq >= 2) return 'AT_RISK';
    if (recency > 120) return 'LOST';
    return 'STANDARD';
}

async function aggregateCompletedOrderStatsByUser() {
    const rows = await Order.aggregate([
        {
            $match: {
                user: { $ne: null },
                status: { $in: COMPLETED_STATUSES },
                isDelivered: { $ne: false }
            }
        },
        {
            $group: {
                _id: '$user',
                frequency: { $sum: 1 },
                monetary: {
                    $sum: {
                        $add: [
                            { $ifNull: ['$grandTotal', 0] },
                            { $ifNull: ['$walletApplied', 0] }
                        ]
                    }
                },
                lastOrderAt: { $max: '$createdAt' }
            }
        }
    ]);

    return rows.map((row) => ({
        userId: row._id,
        frequency: row.frequency || 0,
        monetary: roundMoney(row.monetary),
        recencyDays: daysSince(row.lastOrderAt)
    }));
}

function buildSegmentCounts(segments = []) {
    const counts = RFM_SEGMENTS.reduce((acc, key) => {
        acc[key] = 0;
        return acc;
    }, {});

    segments.forEach((segment) => {
        const key = RFM_SEGMENTS.includes(segment) ? segment : 'STANDARD';
        counts[key] += 1;
    });

    return counts;
}

async function calculateCustomerRfm(userId, monetaryHigh = DEFAULT_MONETARY_HIGH) {
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
        return null;
    }

    const stats = await Order.aggregate([
        {
            $match: {
                user: new mongoose.Types.ObjectId(String(userId)),
                status: { $in: COMPLETED_STATUSES },
                isDelivered: { $ne: false }
            }
        },
        {
            $group: {
                _id: null,
                frequency: { $sum: 1 },
                monetary: {
                    $sum: {
                        $add: [
                            { $ifNull: ['$grandTotal', 0] },
                            { $ifNull: ['$walletApplied', 0] }
                        ]
                    }
                },
                lastOrderAt: { $max: '$createdAt' }
            }
        }
    ]);

    const row = stats[0];
    if (!row) {
        return {
            userId: String(userId),
            recencyDays: null,
            frequency: 0,
            monetary: 0,
            segment: null
        };
    }

    const recencyDays = daysSince(row.lastOrderAt);
    const frequency = row.frequency || 0;
    const monetary = roundMoney(row.monetary);
    const segment = resolveRfmSegment({ recencyDays, frequency, monetary }, monetaryHigh);

    return {
        userId: String(userId),
        recencyDays,
        frequency,
        monetary,
        segment
    };
}

async function getRfmSegmentDistribution(monetaryHigh = DEFAULT_MONETARY_HIGH) {
    const statsRows = await aggregateCompletedOrderStatsByUser();
    const segments = statsRows.map((row) =>
        resolveRfmSegment(row, monetaryHigh)
    );

    return {
        monetaryHighThreshold: monetaryHigh,
        totalCustomers: segments.length,
        segments: buildSegmentCounts(segments)
    };
}

async function recalculateAllCustomerRfm({ monetaryHigh = DEFAULT_MONETARY_HIGH } = {}) {
    const statsRows = await aggregateCompletedOrderStatsByUser();
    const now = new Date();
    let updated = 0;

    for (const row of statsRows) {
        const segment = resolveRfmSegment(row, monetaryHigh);
        await User.updateOne(
            { _id: row.userId },
            {
                $set: {
                    rfmSegment: segment,
                    rfmUpdatedAt: now,
                    rfmRecencyDays: row.recencyDays,
                    rfmFrequency: row.frequency,
                    rfmMonetary: row.monetary
                }
            }
        );
        updated += 1;
    }

    await User.updateMany(
        {
            _id: { $nin: statsRows.map((row) => row.userId) },
            rfmSegment: { $ne: null }
        },
        {
            $set: {
                rfmSegment: null,
                rfmUpdatedAt: now,
                rfmRecencyDays: null,
                rfmFrequency: 0,
                rfmMonetary: 0
            }
        }
    );

    const distribution = await getRfmSegmentDistribution(monetaryHigh);
    return {
        updated,
        ...distribution
    };
}

module.exports = {
    RFM_SEGMENTS,
    DEFAULT_MONETARY_HIGH,
    resolveRfmSegment,
    calculateCustomerRfm,
    getRfmSegmentDistribution,
    recalculateAllCustomerRfm,
    aggregateCompletedOrderStatsByUser,
    daysSince
};
