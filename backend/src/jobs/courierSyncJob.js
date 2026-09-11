/********************************************************************
 * Project: EonlineBazar — ERP Logistics
 * File: courierSyncJob.js
 * Location: backend/src/jobs/courierSyncJob.js
 * Description: Every 2 hours, poll the courier tracking status for all
 * in-flight parcels (Shipped / Out for Delivery with a tracking id) and
 * reconcile the order status via courierSyncService.autoSyncCourierStatus.
 * Each run is summarised to SecurityLog with resourceType 'order'.
 * Mirrors the cron pattern in jobs/abandonedCartJob.js.
 ********************************************************************/

const cron = require('node-cron');
const Order = require('../models/order');
const { autoSyncCourierStatus } = require('../services/courierSyncService');
const { logSecurityEvent } = require('../utils/securityLogger');

// Every 2 hours on the hour.
const DEFAULT_CRON = '0 */2 * * *';
const IN_FLIGHT_STATUSES = ['Shipped', 'Out for Delivery'];
const MAX_ORDERS_PER_RUN = 300;

async function processCourierSync() {
    try {
        const orders = await Order.find({
            status: { $in: IN_FLIGHT_STATUSES },
            courierTrackingId: { $exists: true, $nin: ['', null] }
        })
            .select('_id orderId status courierProvider courierTrackingId courierConsignmentId courierStatus')
            .limit(MAX_ORDERS_PER_RUN)
            .lean();

        let checked = 0;
        let updated = 0;
        let delivered = 0;
        const transitions = [];

        for (const order of orders) {
            // eslint-disable-next-line no-await-in-loop
            const result = await autoSyncCourierStatus(order._id);
            checked += 1;
            if (result.changed) {
                updated += 1;
                if (result.to === 'Delivered') delivered += 1;
                transitions.push(`#${result.orderNumber || order.orderId || order._id}: ${result.from} → ${result.to}`);
            }
        }

        const summary = `Courier sync: checked ${checked}, updated ${updated} (${delivered} delivered)`;
        console.log(`[CourierSync] ${summary}${transitions.length ? ` — ${transitions.join('; ')}` : ''}`);

        // Audit trail — one row per run, tagged as an order-resource event.
        if (checked > 0) {
            await logSecurityEvent({
                action: 'Courier Auto-Sync Run',
                actor: 'system',
                actorType: 'system',
                details: `${summary}${transitions.length ? ` — ${transitions.slice(0, 20).join('; ')}` : ''}`,
                resourceType: 'order'
            });
        }

        return { checked, updated, delivered, transitions };
    } catch (err) {
        console.error('[CourierSync] Job failed:', err.message);
        return { checked: 0, updated: 0, delivered: 0, error: err.message };
    }
}

let cronTask = null;

function startCourierSyncCron() {
    if (process.env.COURIER_SYNC_ENABLED === 'false') {
        console.log('[CourierSync] Cron disabled (COURIER_SYNC_ENABLED=false)');
        return;
    }

    const schedule = String(process.env.COURIER_SYNC_CRON || DEFAULT_CRON).trim() || DEFAULT_CRON;
    const expression = cron.validate(schedule) ? schedule : DEFAULT_CRON;

    if (!cron.validate(schedule)) {
        console.warn(`[CourierSync] Invalid cron "${schedule}" — using default ${DEFAULT_CRON}`);
    }

    if (cronTask) cronTask.stop();

    cronTask = cron.schedule(expression, () => {
        processCourierSync().catch((err) => {
            console.error('[CourierSync] Cron error:', err.message);
        });
    });

    console.log(`[CourierSync] Cron scheduled: "${expression}"`);
}

module.exports = {
    processCourierSync,
    startCourierSyncCron
};
