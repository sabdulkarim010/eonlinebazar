/********************************************************************
 * Project: EonlineBazar — Outbox Dispatcher
 * File: outboxDispatcherJob.js
 * Description: Polls pending outbox rows and dispatches them reliably.
 ********************************************************************/

'use strict';

const cron = require('node-cron');
const { dispatchPendingOutboxEvents } = require('../services/outboxService');
const { scheduleCronHandler } = require('../utils/cronJobRunner');

const DEFAULT_CRON = '*/30 * * * * *';
let cronTask = null;

function startOutboxDispatcher() {
    if (process.env.OUTBOX_DISPATCH_ENABLED === 'false') {
        console.log('[OutboxDispatcher] Disabled (OUTBOX_DISPATCH_ENABLED=false)');
        return;
    }

    const schedule = String(process.env.OUTBOX_DISPATCH_CRON || DEFAULT_CRON).trim() || DEFAULT_CRON;
    const expression = cron.validate(schedule) ? schedule : DEFAULT_CRON;

    if (cronTask) cronTask.stop();

    cronTask = cron.schedule(
        expression,
        scheduleCronHandler(
            'OutboxDispatcher.dispatchPendingOutboxEvents',
            async () => {
                const summary = await dispatchPendingOutboxEvents();
                if (summary.processed || summary.failed) {
                    console.log(`[OutboxDispatcher] processed=${summary.processed} failed=${summary.failed}`);
                }
            },
            { requirePostgres: false }
        )
    );

    console.log(`[OutboxDispatcher] Scheduled: "${expression}"`);
}

module.exports = { startOutboxDispatcher };
