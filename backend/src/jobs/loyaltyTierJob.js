/********************************************************************
 * Project: EonlineBazar — CRM Loyalty Tiers
 * File: loyaltyTierJob.js
 * Description: Monthly recalculation of lifetime spend and loyalty tiers.
 ********************************************************************/

const cron = require('node-cron');
const User = require('../models/user');
const { upgradeTierIfNeeded, TIER_RANK } = require('../services/loyaltyTierService');

const DEFAULT_CRON = '0 3 1 * *';
const BATCH_SIZE = 100;

function compareTierChange(oldTier, newTier) {
    const oldRank = TIER_RANK[oldTier] || 0;
    const newRank = TIER_RANK[newTier] || 0;
    if (newRank > oldRank) return 'upgraded';
    if (newRank < oldRank) return 'downgraded';
    return 'unchanged';
}

async function recalculateAllLoyaltyTiers() {
    const summary = { upgraded: 0, downgraded: 0, unchanged: 0, processed: 0, errors: 0 };
    let lastId = null;

    try {
        for (;;) {
            const query = {
                isDeleted: { $ne: true },
                accountStatus: { $ne: 'blocked' }
            };
            if (lastId) query._id = { $gt: lastId };

            const users = await User.find(query)
                .select('_id')
                .sort({ _id: 1 })
                .limit(BATCH_SIZE)
                .lean();

            if (!users.length) break;

            for (const row of users) {
                try {
                    const result = await upgradeTierIfNeeded(row._id);
                    summary.processed += 1;
                    const outcome = result.changed
                        ? compareTierChange(result.oldTier, result.newTier)
                        : 'unchanged';
                    summary[outcome] += 1;
                } catch (err) {
                    summary.errors += 1;
                    console.warn(`[LoyaltyTierJob] User ${row._id} failed:`, err.message);
                }
            }

            lastId = users[users.length - 1]._id;
            if (users.length < BATCH_SIZE) break;
        }

        console.log(
            `[LoyaltyTierJob] Complete — processed ${summary.processed}: `
            + `${summary.upgraded} upgraded, ${summary.downgraded} downgraded, `
            + `${summary.unchanged} unchanged${summary.errors ? `, ${summary.errors} errors` : ''}`
        );
        return summary;
    } catch (err) {
        console.error('[LoyaltyTierJob] Job failed:', err.message);
        return { ...summary, error: err.message };
    }
}

let cronTask = null;

function startLoyaltyTierCron() {
    if (process.env.LOYALTY_TIER_CRON_ENABLED === 'false') {
        console.log('[LoyaltyTierJob] Cron disabled (LOYALTY_TIER_CRON_ENABLED=false)');
        return;
    }

    const schedule = String(process.env.LOYALTY_TIER_CRON || DEFAULT_CRON).trim() || DEFAULT_CRON;
    const expression = cron.validate(schedule) ? schedule : DEFAULT_CRON;

    if (!cron.validate(schedule)) {
        console.warn(`[LoyaltyTierJob] Invalid cron "${schedule}" — using default ${DEFAULT_CRON}`);
    }

    if (cronTask) cronTask.stop();

    cronTask = cron.schedule(expression, () => {
        recalculateAllLoyaltyTiers().catch((err) => {
            console.error('[LoyaltyTierJob] Cron error:', err.message);
        });
    });

    console.log(`[LoyaltyTierJob] Cron scheduled: "${expression}"`);
}

module.exports = {
    recalculateAllLoyaltyTiers,
    startLoyaltyTierCron
};
