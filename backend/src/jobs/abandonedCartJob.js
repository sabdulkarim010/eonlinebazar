/********************************************************************
 * Project: EonlineBazar — CRM Automation
 * File: abandonedCartJob.js
 * Location: backend/src/jobs/abandonedCartJob.js
 * Description: Daily abandoned-cart recovery. Finds carts idle for 24h+
 * that still hold items and have never been notified, then dispatches a
 * recovery email + SMS and stamps abandonedNotifiedAt so we never repeat.
 * Mirrors the cron pattern in jobs/reviewReminderJob.js.
 ********************************************************************/

const cron = require('node-cron');
const { processMultiStageAbandonedCarts, HOUR_MS } = require('../services/abandonedCartService');

// Every hour — multi-stage recovery checks 1h / 24h / 48h idle thresholds.
const DEFAULT_CRON = '0 * * * *';
const ABANDON_THRESHOLD_MS = 24 * HOUR_MS;

async function processAbandonedCarts() {
    const result = await processMultiStageAbandonedCarts();
    console.log(
        `[AbandonedCart] Multi-stage processed ${result.processed || 0} cart(s)`
        + ` — stage1=${result.stage1 || 0}, stage2=${result.stage2 || 0}, stage3=${result.stage3 || 0}`
    );
    return {
        notified: result.processed || 0,
        emailsSent: result.stage2 || 0,
        smsSent: (result.stage1 || 0) + (result.stage3 || 0),
        candidates: result.candidates || 0,
        ...result
    };
}

let cronTask = null;

function startAbandonedCartCron() {
    if (process.env.ABANDONED_CART_ENABLED === 'false') {
        console.log('[AbandonedCart] Cron disabled (ABANDONED_CART_ENABLED=false)');
        return;
    }

    const schedule = String(process.env.ABANDONED_CART_CRON || DEFAULT_CRON).trim() || DEFAULT_CRON;
    const expression = cron.validate(schedule) ? schedule : DEFAULT_CRON;

    if (!cron.validate(schedule)) {
        console.warn(`[AbandonedCart] Invalid cron "${schedule}" — using default ${DEFAULT_CRON}`);
    }

    if (cronTask) {
        cronTask.stop();
    }

    cronTask = cron.schedule(expression, () => {
        processAbandonedCarts().catch((err) => {
            console.error('[AbandonedCart] Cron error:', err.message);
        });
    });

    console.log(`[AbandonedCart] Cron scheduled: "${expression}"`);
}

module.exports = {
    processAbandonedCarts,
    startAbandonedCartCron,
    ABANDON_THRESHOLD_MS
};
