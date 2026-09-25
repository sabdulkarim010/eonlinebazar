/********************************************************************
 * Project: EonlineBazar
 * File: loyaltyPointExpiryJob.js
 * Description: Daily cron — expire loyalty points past LOYALTY_POINT_EXPIRY_DAYS.
 ********************************************************************/

'use strict';

const cron = require('node-cron');
const { LoyaltyLedger } = require('../models/loyaltyLedger');
const {
    debitLoyaltyPoints,
    DEFAULT_EXPIRY_DAYS
} = require('../services/loyaltyLedgerService');

const DEFAULT_CRON = '0 2 * * *';
const BATCH_SIZE = 50;

async function processExpiredLoyaltyPoints() {
    if (DEFAULT_EXPIRY_DAYS <= 0) {
        return { processed: 0, expiredPoints: 0, skipped: true, reason: 'expiry_disabled' };
    }

    const now = new Date();
    let processed = 0;
    let expiredPoints = 0;
    let lastId = null;

    for (;;) {
        const query = {
            type: 'earned',
            expiresAt: { $lte: now, $ne: null }
        };
        if (lastId) query._id = { $gt: lastId };

        const earnedBatch = await LoyaltyLedger.find(query)
            .sort({ _id: 1 })
            .limit(BATCH_SIZE)
            .lean();

        if (!earnedBatch.length) break;

        for (const entry of earnedBatch) {
            const earnId = String(entry._id);
            const alreadyExpired = await LoyaltyLedger.exists({
                type: 'expired',
                referenceId: earnId
            });
            if (alreadyExpired) continue;

            const pointsToExpire = Math.max(0, Number(entry.points) || 0);
            if (pointsToExpire <= 0) continue;

            const debited = await debitLoyaltyPoints(entry.userId, pointsToExpire, {
                type: 'expired',
                referenceId: earnId,
                description: `Points expired (${DEFAULT_EXPIRY_DAYS}-day policy)`
            });

            if (debited) {
                processed += 1;
                expiredPoints += pointsToExpire;
            }
        }

        lastId = earnedBatch[earnedBatch.length - 1]._id;
        if (earnedBatch.length < BATCH_SIZE) break;
    }

    console.log(
        `[LoyaltyExpiryJob] Complete — batches processed=${processed}, points expired=${expiredPoints}`
    );

    return { processed, expiredPoints };
}

let cronTask = null;

function startLoyaltyPointExpiryCron() {
    if (process.env.LOYALTY_EXPIRY_CRON_ENABLED === 'false') {
        console.log('[LoyaltyExpiryJob] Cron disabled (LOYALTY_EXPIRY_CRON_ENABLED=false)');
        return;
    }

    if (DEFAULT_EXPIRY_DAYS <= 0) {
        console.log('[LoyaltyExpiryJob] Skipped — LOYALTY_POINT_EXPIRY_DAYS <= 0');
        return;
    }

    const schedule = String(process.env.LOYALTY_EXPIRY_CRON || DEFAULT_CRON).trim() || DEFAULT_CRON;
    const expression = cron.validate(schedule) ? schedule : DEFAULT_CRON;

    if (!cron.validate(schedule)) {
        console.warn(`[LoyaltyExpiryJob] Invalid cron "${schedule}" — using default ${DEFAULT_CRON}`);
    }

    if (cronTask) cronTask.stop();

    cronTask = cron.schedule(expression, () => {
        processExpiredLoyaltyPoints().catch((err) => {
            console.error('[LoyaltyExpiryJob] Cron error:', err.message);
        });
    });

    console.log(`[LoyaltyExpiryJob] Cron scheduled: "${expression}" (${DEFAULT_EXPIRY_DAYS}-day expiry)`);
}

module.exports = {
    processExpiredLoyaltyPoints,
    startLoyaltyPointExpiryCron
};
