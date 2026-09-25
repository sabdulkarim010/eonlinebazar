/********************************************************************
 * Project: EonlineBazar — Scheduled Campaign Auto-Dispatch
 * File: scheduledCampaignJob.js
 * Description: Polls for due scheduled campaigns and enqueues them.
 ********************************************************************/

'use strict';

const cron = require('node-cron');
const EmailCampaign = require('../models/emailCampaign');
const { enqueueCampaignSend } = require('../queues/emailCampaignQueue');
const { prepareCampaignForDispatch } = require('../services/emailCampaignDispatchService');

const DEFAULT_CRON = '*/3 * * * *';

async function dispatchDueScheduledCampaigns() {
    const now = new Date();
    const dueCampaigns = await EmailCampaign.find({
        status: 'scheduled',
        scheduledAt: { $lte: now }
    }).select('_id title scheduledAt');

    if (!dueCampaigns.length) {
        return { dispatched: 0 };
    }

    let dispatched = 0;
    for (const campaign of dueCampaigns) {
        try {
            const prep = await prepareCampaignForDispatch(String(campaign._id));
            if (!prep.ok || prep.scheduled) {
                continue;
            }
            // eslint-disable-next-line no-await-in-loop
            await enqueueCampaignSend(String(campaign._id));
            dispatched += 1;
            console.log(`[ScheduledCampaign] Dispatched campaign ${campaign._id} (${campaign.title || 'untitled'})`);
        } catch (err) {
            console.error('[ScheduledCampaign] Failed to dispatch:', String(campaign._id), err.message);
        }
    }

    return { dispatched, candidates: dueCampaigns.length };
}

let cronTask = null;

function startScheduledCampaignCron() {
    if (process.env.SCHEDULED_CAMPAIGN_ENABLED === 'false') {
        console.log('[ScheduledCampaign] Cron disabled (SCHEDULED_CAMPAIGN_ENABLED=false)');
        return;
    }

    const schedule = String(process.env.SCHEDULED_CAMPAIGN_CRON || DEFAULT_CRON).trim() || DEFAULT_CRON;
    const expression = cron.validate(schedule) ? schedule : DEFAULT_CRON;

    if (!cron.validate(schedule)) {
        console.warn(`[ScheduledCampaign] Invalid cron "${schedule}" — using default ${DEFAULT_CRON}`);
    }

    if (cronTask) {
        cronTask.stop();
    }

    cronTask = cron.schedule(expression, () => {
        dispatchDueScheduledCampaigns().catch((err) => {
            console.error('[ScheduledCampaign] Cron error:', err.message);
        });
    });

    console.log(`[ScheduledCampaign] Cron scheduled: "${expression}"`);
}

module.exports = {
    startScheduledCampaignCron,
    dispatchDueScheduledCampaigns
};
